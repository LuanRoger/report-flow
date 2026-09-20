# RFC 0001: Streaming analysis execution

- **Status:** Proposed
- **Authors:** Report Flow team
- **Created:** 2026-09-19
- **Target:** `apps/analysis`
- **Related evaluation:** `apps/evaluation`

## Summary

Replace the current materialized measurement analysis pipeline with an ordered,
streaming scorer that computes the existing deterministic score incrementally.
Add bounded concurrency, in-flight request deduplication, and a data-aware result
cache after the streaming implementation is proven equivalent to the current
scorer and independent evaluation oracle.

The proposal preserves the scoring contract, including duration weighting,
continuity-gap handling, half-open windows, coverage, duplicate detection, raw
and normalized statistics, and merged unfavorable intervals.

## Motivation

The current analysis path loads every matching measurement into JavaScript and
then creates several additional arrays while normalizing, grouping, sorting,
and calculating statistics. This is manageable for seven-day windows but causes
high memory use, garbage-collection pressure, request queueing, and timeouts for
larger windows and concurrent requests.

Observed evaluation results include:

| Profile | Measurements per successful request | Median HTTP duration | p95 HTTP duration | Result |
| --- | ---: | ---: | ---: | --- |
| 7 days at 1 RPS | 241,920 | ~519 ms | ~828 ms | Stable |
| 30 days at 1 RPS | 1,036,800 | ~25.5 s | ~30 s | Saturated |

The 30-day run dropped 214 iterations and timed out requests while the analysis
process approached approximately 2 GB of memory. The PostgreSQL query plan is
not the primary bottleneck: the application pays for transferring, decoding,
materializing, copying, sorting, and scoring every row, often for several
concurrent requests.

## Goals

1. Preserve the current deterministic score and response contract.
2. Reduce analysis memory from proportional to all measurements to proportional
   to a bounded database batch plus emitted unfavorable intervals.
3. Avoid repeated arrays and JavaScript sorting for already ordered database
   rows.
4. Keep the analysis service responsive under concurrent large-window requests.
5. Avoid computing an identical pond/window analysis more than once
   concurrently.
6. Reuse valid historical results without returning stale scores.
7. Retain independent-oracle verification and existing timing telemetry.
8. Introduce the changes incrementally with measurable rollback points.

## Non-goals

1. Changing normalization functions, parameter weights, critical thresholds, or
   score formulas.
2. Changing the half-open `[start, end)` window convention.
3. Approximating duration-weighted scores with simple hourly or daily averages.
4. Removing unfavorable intervals from the response contract.
5. Making AI summaries or embeddings part of deterministic performance tests.
6. Replacing PostgreSQL or TimescaleDB.
7. Optimizing MQTT ingestion.

## Current architecture

The pond analysis path currently performs these steps:

1. Validate that the pond exists.
2. Load all measurements in the requested window with `findMany()`.
3. Copy full measurement objects into minimal measurement objects.
4. Normalize all measurements into per-parameter arrays.
5. Filter, map, and sort those arrays while calculating statistics and temporal
   metrics.
6. Build and persist the result.
7. Optionally generate an AI summary and embedding.

For one million rows, the process may simultaneously retain:

- full Drizzle measurement objects;
- minimal measurement objects;
- normalized score objects;
- per-parameter filtered arrays;
- numeric arrays used for statistics;
- sorted temporal arrays;
- persisted result structures.

Concurrent requests multiply this allocation and increase garbage-collection
cost.

## Scoring invariants

The implementation must preserve these rules exactly:

- Four scoring parameters: `temperature`, `ph`, `salinity`, and
  `dissolvedOxygen`.
- Measurements belong to the half-open interval `[requestedStart,
  requestedEnd)`.
- A reading represents time until the earliest of the next same-parameter
  reading, the requested end, or the maximum continuity gap.
- Time beyond the continuity gap is missing, not represented by the previous
  reading.
- Duplicate timestamps for the same parameter are rejected.
- A normalized score strictly below the critical threshold is unfavorable.
- Adjacent unfavorable intervals are merged.
- Raw and normalized count, minimum, maximum, and arithmetic mean are retained.
- Weighted mean score, covered duration, missing duration, unfavorable duration,
  `pLow`, temporal score, coverage, and final score remain unchanged.
- Every required parameter must be present.
- The response preserves actual and requested date ranges and measurement
  counts.

## Proposed design

### 1. Minimal measurement projection

The analysis query should select only fields required by deterministic scoring:

```sql
SELECT
  parameter_code,
  recorded_at,
  value
FROM measurements
WHERE pond_id = $1
  AND recorded_at >= $2
  AND recorded_at < $3
ORDER BY recorded_at ASC, parameter_code ASC, id ASC;
```

The final `id` tie-breaker guarantees deterministic row order. Duplicate
same-parameter timestamps are still rejected by the scorer rather than silently
resolved by this ordering.

Removing unused columns reduces database transfer, driver decoding, object size,
and allocation.

### 2. Cursor-based row consumption

Use a server-side cursor or the supported Bun SQL batch iterator so the driver
does not materialize the complete result before application processing.

Initial batch-size recommendation:

```text
10,000 rows
```

The batch size should be configurable within a safe range and measured under the
7-day and 30-day profiles. A reasonable experimental range is 5,000 to 20,000
rows.

The cursor must remain on one database connection for its lifetime. Cancellation
or client disconnect must close the cursor and release the connection.

If a reliable cursor API cannot be integrated immediately, use keyset pagination
as a temporary implementation:

```sql
AND (recorded_at, parameter_code, id) > ($lastTime, $lastParameter, $lastId)
ORDER BY recorded_at, parameter_code, id
LIMIT $batchSize;
```

Large `OFFSET` pagination is explicitly rejected because later pages become more
expensive.

### 3. Streaming accumulator

Maintain one accumulator for each scoring parameter and a small global state.

```ts
interface PendingNormalizedReading {
  recordedAtMilliseconds: number;
  score: number;
}

interface RunningNumericStats {
  count: number;
  maximum: number;
  minimum: number;
  sum: number;
}

interface ParameterAnalysisAccumulator {
  coveredDurationMilliseconds: number;
  normalized: RunningNumericStats;
  previousReading: PendingNormalizedReading | null;
  raw: RunningNumericStats;
  unfavorableDurationMilliseconds: number;
  unfavorableIntervals: UnfavorableInterval[];
  weightedScoreTotal: number;
}

interface PondAnalysisAccumulator {
  actualEndMilliseconds: number | null;
  actualStartMilliseconds: number | null;
  parameters: Record<ParameterCode, ParameterAnalysisAccumulator>;
  totalMeasurements: number;
}
```

The production implementation should use existing project types where possible.
The names above describe required state, not a frozen public interface.

### 4. Incremental processing algorithm

For each ordered row:

1. Validate the parameter code and numeric value.
2. Update global actual start and end timestamps.
3. Normalize the raw value with the existing normalization function.
4. Read the previous same-parameter reading from its accumulator.
5. If a previous reading exists, finalize its represented interval using the
   current timestamp as `nextReadingTime`.
6. Reject the row if its timestamp duplicates or precedes the previous
   same-parameter timestamp.
7. Update raw and normalized running statistics.
8. Store the current normalized reading as the new pending reading.
9. Increment per-parameter and total counts.

The interval end remains:

```ts
const intervalEnd = Math.min(
  nextReadingTime ?? windowEnd,
  windowEnd,
  readingTime + maximumGapMilliseconds
);
```

After the cursor is exhausted, finalize the pending reading for each parameter
with `windowEnd` as the absent next-reading boundary.

The algorithm is mathematically equivalent to the current array implementation
because only the next same-parameter timestamp is needed to finalize a reading's
represented duration.

### 5. Running statistics

Replace arrays used solely for statistics with running values:

```ts
stats.count += 1;
stats.sum += value;
stats.minimum = Math.min(stats.minimum, value);
stats.maximum = Math.max(stats.maximum, value);
```

Finalize the mean with:

```ts
const mean = stats.count === 0 ? null : stats.sum / stats.count;
```

This applies independently to raw values and normalized scores.

Floating-point operation order can affect the final low-order bits. Validation
must use the existing score tolerances and compare against the independent
oracle. If exact operation order is required, compensated summation can be
considered, but it must not be introduced without oracle comparison.

### 6. Temporal aggregation

For each finalized interval:

```ts
coveredDurationMilliseconds += intervalDuration;
weightedScoreTotal += score * intervalDuration;
```

When the score is below the critical threshold:

```ts
unfavorableDurationMilliseconds += intervalDuration;
```

The existing adjacent-interval merge behavior must be retained. If the latest
unfavorable interval ends exactly where the new one begins, extend it; otherwise,
append a new interval.

At completion:

```ts
weightedMeanScore =
  weightedScoreTotal / coveredDurationMilliseconds;

pLow =
  unfavorableDurationMilliseconds / coveredDurationMilliseconds;
```

Coverage, missing duration, temporal scores, parameter scores, and final pond
score are then built through the existing formulas.

### 7. Memory behavior

The desired complexity is:

```text
O(cursor batch size + unfavorable interval count)
```

The number of raw measurements must not determine retained application memory.

The unfavorable interval array remains potentially unbounded because the API
returns every merged interval. A pathological series alternating favorable and
unfavorable at each reading can still produce many intervals. This is an output
contract limitation rather than a streaming limitation. Any future interval cap
or pagination requires a separate API-contract RFC.

### 8. Transaction and consistency

The analysis must observe a consistent measurement set for the complete cursor
lifetime. Options include:

- a read-only transaction with an appropriate isolation level;
- a stable upper measurement/version boundary captured before streaming;
- a documented acceptance of read-committed behavior if concurrent backfills
  cannot affect an already ordered cursor.

The selected behavior must be explicit and tested. Cursor transactions should
be short enough not to interfere with TimescaleDB maintenance or ingestion.

## Concurrency control

### Bounded analysis concurrency

Introduce a per-process semaphore around deterministic analysis execution.
Start with:

```text
maximum concurrent large analyses: 2
```

The value should be configurable and tuned with production CPU, database pool,
and memory telemetry.

The queue must be bounded. When capacity is exhausted, either:

- return `429 Too Many Requests` with `Retry-After`; or
- return `503 Service Unavailable` with `Retry-After`.

An unbounded in-memory queue is not acceptable because it only moves the memory
and timeout problem.

A later refinement may assign different weights to short and long windows so a
30-day request consumes more capacity than a 7-day request.

### Client cancellation

If the HTTP client disconnects or aborts:

1. stop reading cursor batches;
2. cancel or close the database operation;
3. release the cursor connection;
4. release semaphore capacity;
5. avoid persisting an incomplete result.

## In-flight request deduplication

Concurrent requests with the same deterministic inputs should share one scoring
computation.

The key must include at least:

```text
pondId
requestedStart
requestedEnd
maximumContinuityGapSeconds
scoringModelVersion
measurement data version or stable upper boundary
```

Maintain a map from this key to the active computation promise. A later caller
awaits the same promise rather than opening a second cursor.

The entry must be removed in `finally` after success, failure, or cancellation.
One client disconnect must not cancel shared work while other clients still
await it; shared cancellation needs reference counting or an independent
operation lifetime.

Persistence semantics must be decided explicitly:

- persist one canonical analysis result for the shared computation; or
- reuse the computed score but persist one request-specific result per caller.

The preferred default is one canonical deterministic result when the schema and
product behavior allow it.

## Result caching

### Cache key

A completed deterministic result can be cached only when the key proves the
underlying measurement set is unchanged. Include:

```text
pondId
requestedStart
requestedEnd
maximumContinuityGapSeconds
scoringModelVersion
measurement data version
```

Do not cache solely by pond and date range. Late measurements, corrections, or
backfills would make that cache stale.

### Measurement version options

Possible invalidation signals, in preferred order:

1. A maintained per-pond measurement revision incremented on insert, update, and
   delete.
2. A deterministic watermark including latest modification time and count.
3. Explicit invalidation events emitted by ingestion and administrative
   correction paths.

`MAX(recorded_at)` alone is insufficient because an older measurement may be
inserted, updated, or deleted without changing the maximum timestamp.

### Cache tiers

Potential implementations:

- process-local bounded LRU for immediate repeated requests;
- shared Redis cache for multiple analysis instances;
- canonical persisted analysis lookup for historical windows.

Start with a small process-local cache only after invalidation correctness is
implemented. Add a shared cache only when horizontal scaling requires it.

Cache entries should contain deterministic results only. AI summaries and
embeddings have separate generation, freshness, and cost semantics.

## Persistence behavior

Deterministic computation and result persistence should remain separately timed.
The implementation should avoid holding a database cursor transaction open while
persisting the final result.

Suggested sequence:

1. stream and score within the read operation;
2. close the cursor and read transaction;
3. validate the completed score result;
4. persist the result in a short write transaction;
5. optionally generate external AI artifacts according to request flags.

If cached or deduplicated results are reused, persistence behavior must not create
unbounded duplicate analysis rows.

## Observability

Extend execution telemetry with:

- `databaseCursorMs`;
- `databaseBatches`;
- `databaseRowsRead`;
- `databaseBatchSize`;
- `deterministicScoreMs` or combined streaming duration;
- `analysisQueueWaitMs`;
- `analysisConcurrencyActive`;
- `analysisConcurrencyQueued`;
- `analysisDeduplicated`;
- `analysisCacheHit`;
- `analysisCacheMiss`;
- cursor cancellation and failure counts;
- process heap, resident memory, and garbage-collection duration.

The existing `databaseQueryMs` field may be retained for compatibility, but its
meaning must be documented if it now includes cursor iteration and incremental
scoring. A schema-versioned timing breakdown is preferable to silently changing
semantics.

Database telemetry should include:

- active connections;
- connection-pool wait;
- cursor transaction duration;
- rows returned;
- database CPU and memory;
- lock waits;
- Timescale chunk access.

## Alternatives considered

### Add more indexes

The existing warm-cache query plan prunes TimescaleDB chunks, uses timestamp
indexes, avoids disk reads, and executes quickly inside PostgreSQL. Additional
indexes do not remove row transfer, object materialization, normalization, or
scoring costs.

A composite `(pond_id, recorded_at)` index should still be evaluated for
multi-pond production data, but it is not the primary solution to application
memory use.

### Increase request timeout

A longer timeout permits requests to wait longer but does not increase capacity.
It can worsen memory pressure by keeping more requests alive. Timeouts should be
adjusted only after capacity is improved.

### Cache only

Caching can make repeated benchmark requests fast but does not solve the first
uncached request, arbitrary windows, or memory exhaustion. Streaming must precede
or accompany caching.

### Full SQL scoring

PostgreSQL can use `LEAD(recorded_at)` partitioned by parameter and aggregate
coverage, weighted scores, and unfavorable duration. This can reduce transfer
further, but it duplicates normalization and scoring formulas in SQL and
TypeScript and complicates unfavorable-interval merging.

Full SQL scoring may be reconsidered after the streaming scorer is established
as a correctness reference.

### Timescale continuous aggregates

Simple hourly or daily averages are insufficient because the score depends on
exact represented durations, maximum continuity gaps, threshold classification,
and interval boundaries.

A future continuous aggregate would need mergeable state containing:

- raw and normalized count, sum, minimum, and maximum;
- covered and unfavorable duration;
- weighted score total;
- first and last reading state for bucket boundaries;
- unfavorable interval boundary state;
- data revision information.

This is a later optimization, not the initial fix.

### Scale out analysis instances

Horizontal scaling increases capacity but multiplies database transfer and does
not correct per-request memory amplification. It should follow streaming,
bounded concurrency, and shared-cache design.

## Testing strategy

### Unit tests

Test the streaming accumulator for:

- one reading per parameter;
- regular intervals;
- irregular intervals;
- exact maximum continuity gaps;
- gaps longer than the maximum;
- readings exactly at the requested start;
- exclusion of readings at the requested end;
- duplicate same-parameter timestamps;
- interleaved parameter rows;
- missing parameters;
- adjacent unfavorable interval merging;
- alternating favorable and unfavorable readings;
- raw and normalized running statistics;
- empty windows;
- final-reading flush behavior.

### Differential tests

During migration, run the current array scorer and streaming scorer over the same
bounded fixture data and compare their complete deterministic results.

The comparison must include:

- parameter scores;
- final score;
- raw and normalized statistics;
- coverage;
- represented and missing duration;
- `pLow`;
- unfavorable duration and intervals;
- actual and requested ranges;
- measurement counts.

### Independent oracle

Retain the evaluation oracle as an independent implementation. Verify C1 through
C7 and all existing correctness scenarios without importing production scoring
code into the oracle.

### Performance tests

Run, with new run IDs and preserved artifacts:

1. sequential 7-day analysis;
2. sequential 30-day analysis;
3. k6 7-day at 1, 2, 5, and 10 RPS;
4. k6 30-day at progressively safe rates;
5. identical concurrent requests to verify deduplication;
6. distinct concurrent windows to verify bounded concurrency;
7. client-aborted requests to verify cursor cleanup.

Record CPU, resident memory, heap, garbage collection, database connections, and
pool wait alongside k6 metrics.

## Acceptance criteria

### Correctness

- All existing analysis and evaluation tests pass.
- The streaming scorer matches the independent oracle within existing
  tolerances.
- The response contract remains unchanged unless separately versioned.
- Duplicate and missing-parameter behavior remains unchanged.

### Memory

- Peak memory for one 30-day request no longer scales with approximately one
  million retained measurement objects.
- Memory remains bounded by configured cursor batch size and result output.
- Concurrent large requests cannot push the process beyond the configured
  concurrency budget.

A numeric resident-memory target should be established on the reference test
machine after a prototype establishes the driver's cursor baseline.

### Performance

Initial targets on the reference environment:

- 7-day `p95 < 2,000 ms` at 1 RPS remains satisfied.
- 30-day requests complete without 30-second timeout saturation at the selected
  supported arrival rate.
- No dropped iterations at the documented supported profile.
- Request failure rate remains below 1% at the documented supported profile.

Streaming is primarily a memory fix; it may not by itself make uncached 30-day
analysis satisfy a 2-second latency target. Cache and aggregate phases should be
measured separately rather than attributing all gains to streaming.

## Rollout plan

### Phase 0: instrumentation

- Add process and pool telemetry.
- Confirm current memory, GC, query-transfer, scoring, and persistence baselines.
- Preserve current evaluation artifacts.

### Phase 1: minimal projection

- Select only parameter code, timestamp, and value.
- Retain the existing array scorer.
- Measure transfer, decoding, latency, and memory improvements.

### Phase 2: shadow streaming scorer

- Implement the accumulator behind an internal feature flag.
- For bounded non-production requests, run both scorers and compare results.
- Do not duplicate paid AI operations or persistence.

### Phase 3: production streaming path

- Make streaming the default after differential and oracle validation.
- Retain a temporary rollback flag for the array path.
- Monitor memory, latency, cursor cleanup, and result mismatches.

### Phase 4: bounded concurrency

- Introduce the semaphore and bounded queue.
- Establish overload status and `Retry-After` behavior.
- Tune capacity using distinct-window load tests.

### Phase 5: in-flight deduplication

- Coalesce identical deterministic computations.
- Validate cancellation and persistence semantics.
- Add deduplication telemetry.

### Phase 6: data-aware cache

- Implement the measurement revision or equivalent invalidation mechanism.
- Add a bounded local cache.
- Evaluate a shared cache only if multiple service instances require it.

### Phase 7: optional database aggregation

- Profile the completed system.
- Prototype SQL or Timescale aggregate state only if arbitrary uncached windows
  still miss product latency targets.

## Migration and compatibility

The streaming implementation should not require a public API change. Internal
repository and scoring APIs will change from returning arrays to consuming an
async row source or cursor.

A temporary adapter can preserve the existing scorer for tests and rollback:

```ts
type MeasurementSource = AsyncIterable<MinimalMeasurement>;
```

Cycle-based analysis should either use the same streaming repository path or be
explicitly retained on the array implementation until equivalent cycle boundary
semantics are implemented.

Any cache-version or measurement-revision schema change requires a migration and
must be applied explicitly to existing databases.

## Risks and mitigations

### Cursor API buffers unexpectedly

**Risk:** The selected driver API may still materialize the complete result.

**Mitigation:** Measure heap during one 30-day request and verify batch-level row
consumption before enabling production traffic.

### Floating-point differences

**Risk:** Incremental operation order may introduce very small differences.

**Mitigation:** Differential tests and independent-oracle tolerances; consider
compensated summation only if necessary.

### Cursor connection exhaustion

**Risk:** Long-running cursors retain pool connections.

**Mitigation:** Bounded analysis concurrency, cancellation cleanup, pool metrics,
and cursor-duration alerts.

### Stale cache entries

**Risk:** Backfilled or corrected measurements are not reflected.

**Mitigation:** Require a real measurement revision in the key; do not ship cache
reuse based only on timestamps.

### Deduplicated cancellation

**Risk:** One disconnected caller cancels computation needed by others.

**Mitigation:** Decouple shared computation lifetime from individual requests or
use waiter reference counting.

### Unbounded unfavorable intervals

**Risk:** Alternating threshold states still create a large result.

**Mitigation:** Monitor interval counts and propose a separate response-contract
change if production data demonstrates the pathological case.

### Benchmark-only optimization

**Risk:** Identical-request caching can hide poor arbitrary-window performance.

**Mitigation:** Report cold, warm, deduplicated, and cached performance
separately.

## Open questions

1. Which Bun SQL cursor or batch iteration API is stable for the project's
   deployed Bun version?
2. What isolation or measurement watermark semantics are required during
   concurrent ingestion and backfill?
3. Should overload return `429` or `503`?
4. Should one deduplicated computation persist one canonical result or one result
   per caller?
5. What database-backed measurement revision design covers inserts, updates, and
   deletes with acceptable ingestion overhead?
6. Should cycle analysis migrate in the first streaming phase or a later phase?
7. What reference-hardware memory and latency targets should become release
   gates?
8. Does the public response need every unfavorable interval for very long
   windows?

## Decision

Pending review.

The recommended decision is to approve Phases 0 through 4 immediately:
measurement, minimal projection, exact streaming scoring, and bounded
concurrency. In-flight deduplication and caching should follow only after their
persistence, cancellation, and invalidation semantics are explicitly resolved.
