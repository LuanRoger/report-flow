# k6 load profiles

These scripts implement the manual-ingestion, seven-day analysis, and thirty-day analysis profiles from `EVALUATION.md` and `SPECIFICATIONS.md`.

`k6` is an external executable and is **not installed in this repository or in the current development environment**. Package scripts invoke that external executable but do not install it. Install a compatible k6 release separately before execution.

## Safety gates

Every profile aborts in `setup()` before sending HTTP requests unless all of the following are true:

- `K6_ALLOW_LOAD_TEST=true` is set explicitly;
- `K6_RUN_ID` is non-empty;
- the profile-specific bearer key is set;
- non-loopback URLs additionally have `K6_ALLOW_REMOTE_TARGET=true`.

Analysis has two additional gates: `K6_TARGET_HONORS_EMBEDDING_OPT_OUT=true` and one independent-oracle value per pond in `K6_EXPECTED_FINAL_SCORES`. Set the opt-out attestation only after verifying that the deployed analysis service honors `generateEmbedding: false`. Every analysis request sends both `generateAiSummary: false` and `generateEmbedding: false`.

Do not infer that external calls are disabled merely because the request contains the flag. Verify the exact deployed service version and its artifact-control tests before setting the attestation; the guard protects against running these profiles against an older or differently configured target.

Use only disposable evaluation ponds/cycles and document or reset database state between repetitions. The scripts never perform a database reset.

## Profile defaults

Defaults reflect the planned primary load levels while the gates above prevent accidental execution:

| Setting | Ingestion | Analysis |
|---|---:|---:|
| Measured target | 50 RPS | 10 RPS |
| Warm-up | 1 minute at the target rate | 1 minute at the target rate |
| Measured duration | 5 minutes | 5 minutes |
| p95 threshold | 500 ms | 2,000 ms |
| Repetitions | one invocation; run three documented invocations | one invocation; run three documented invocations |

The full planned matrix is `10`, `50`, and `100` RPS for ingestion and `1`, `5`, and `10` RPS for each analysis window. Override `K6_TARGET_RPS` for each level and set `K6_REPETITION` to `1`, `2`, or `3` for artifact tagging.

Warm-up and measurement are separate `constant-arrival-rate` scenarios. Thresholds are evaluated on measurement samples; dropped iterations from either phase fail the run.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `K6_ALLOW_LOAD_TEST` | unset | Must equal `true` to send requests |
| `K6_ALLOW_REMOTE_TARGET` | unset | Must equal `true` for a non-loopback base URL |
| `K6_RUN_ID` | unset | Required immutable evaluation run identifier |
| `K6_REPETITION` | `1` | Repetition tag |
| `K6_TARGET_RPS` | profile default | Measured constant arrival rate |
| `K6_WARMUP_RPS` | measured target | Warm-up constant arrival rate |
| `K6_DURATION` | `5m` | Measured duration |
| `K6_WARMUP_DURATION` | `1m` | Warm-up duration |
| `K6_REQUEST_TIMEOUT` | `30s` | Per-request timeout |
| `K6_PRE_ALLOCATED_VUS` | `50` ingest / `20` analysis | Initial arrival-rate VUs |
| `K6_MAX_VUS` | `200` ingest / `100` analysis | Maximum arrival-rate VUs |
| `K6_P95_TARGET_MS` | `500` ingest / `2000` analysis | Measurement p95 threshold |
| `K6_POND_IDS` | `1` | Comma-separated positive fixture pond IDs; selection is deterministic |
| `K6_CYCLE_IDS` | `1` | Ingestion-only comma-separated cycle IDs, paired positionally with pond IDs |
| `K6_EXPECTED_FINAL_SCORES` | unset | Analysis-only oracle scores, paired positionally with pond IDs; required to execute |
| `K6_SCORE_TOLERANCE` | `0.05` | Maximum absolute final-score error for analysis |
| `K6_START_DATE` | profile fixture date | Canonical UTC start (`.000Z` required) |
| `K6_END_DATE` | profile fixture date | Canonical UTC exclusive end (`.000Z` required) |
| `INGEST_BASE_URL` | `http://localhost:3000` | Ingestion service base URL |
| `INGEST_API_KEY` | unset | Ingestion bearer key; required and never logged |
| `ANALYSIS_BASE_URL` | `http://localhost:3001` | Analysis service base URL |
| `ANALYSIS_API_KEY` | unset | Analysis bearer key; required and never logged |
| `K6_TARGET_HONORS_EMBEDDING_OPT_OUT` | unset | Required analysis safety attestation |

Duration values intentionally accept one positive integer plus `ms`, `s`, `m`, or `h`, such as `30s`, `1m`, or `5m`.

The seven-day and thirty-day scripts require the configured dates to span exactly 7 or 30 days. Ingestion defaults to a seven-day range, accepts any positive range, and fails during initialization if the requested load would exhaust that range.

## Determinism and rate interpretation

`ingestion.js` uses `k6/execution`'s scenario-global row index. It selects the parameter, positional pond/cycle pair, and timestamp deterministically. For `target_count` pond/cycle pairs, timestamps follow:

```text
collection_index = floor(row_index / 4)
timestamp_index = floor(collection_index / target_count)
timestamp = start_epoch_ms + timestamp_index * 10_000
```

No script uses `Math.random()`. The four C1 values are emitted in runtime parameter-code order, and all four rows in a collection instant share a timestamp.

The manual endpoint accepts one parameter per request, so:

```text
attempted request rate = submitted parameter-row rate
successful request rate = HTTP persistence-confirmed row rate
```

At the natural ten-second cadence, one pond produces `0.4` parameter rows/requests per second. The planned `10`, `50`, and `100` RPS levels are controlled stress rates, not a claim about one pond's natural traffic.

The `201` counter records persistence confirmation from the API; post-run database integrity checks must still verify actual row counts and uniqueness.

An analysis request creates one analysis-result row after a successful response, but it reads many measurement rows. Therefore analysis request RPS, result-row persistence rate, and represented-measurement rate are separate metrics. `analysis_*_measurements_represented` is populated from `metadata.executionStats.totalMeasurements` when present.

## Commands

Run from `apps/evaluation/k6`. These examples use shell-style environment assignment; adapt them to PowerShell if needed. Do not put keys in tracked command files or artifacts.

Manual ingestion at the default 50 RPS:

```bash
K6_ALLOW_LOAD_TEST=true \
K6_RUN_ID=20260914-120000Z-local-ingest-r1 \
K6_REPETITION=1 \
K6_POND_IDS=1 \
K6_CYCLE_IDS=1 \
INGEST_API_KEY='<bearer-key>' \
k6 run ingestion.js
```

Seven-day deterministic analysis at 5 RPS against a target already verified to disable embeddings:

```bash
K6_ALLOW_LOAD_TEST=true \
K6_TARGET_HONORS_EMBEDDING_OPT_OUT=true \
K6_RUN_ID=20260914-120000Z-local-analysis-7d-r1 \
K6_REPETITION=1 \
K6_TARGET_RPS=5 \
K6_POND_IDS=1 \
K6_EXPECTED_FINAL_SCORES=100 \
K6_START_DATE=2026-01-01T00:00:00.000Z \
K6_END_DATE=2026-01-08T00:00:00.000Z \
ANALYSIS_API_KEY='<bearer-key>' \
k6 run analysis-7d.js
```

Thirty-day deterministic analysis at the planned primary 10 RPS:

```bash
K6_ALLOW_LOAD_TEST=true \
K6_TARGET_HONORS_EMBEDDING_OPT_OUT=true \
K6_RUN_ID=20260914-120000Z-local-analysis-30d-r1 \
K6_REPETITION=1 \
K6_TARGET_RPS=10 \
K6_POND_IDS=1 \
K6_EXPECTED_FINAL_SCORES=100 \
K6_START_DATE=2026-01-01T00:00:00.000Z \
K6_END_DATE=2026-01-31T00:00:00.000Z \
ANALYSIS_API_KEY='<bearer-key>' \
k6 run analysis-30d.js
```

For a remote target, set the applicable base URL and `K6_ALLOW_REMOTE_TARGET=true` explicitly. Use k6 output options such as `--summary-export` or an approved metrics backend to preserve each repetition independently under the evaluation run directory.

## Emitted metrics and checks

In addition to standard k6 HTTP metrics, ingestion emits counters/rates/trends for attempted requests, submitted rows, API persistence confirmations, rejected rows, status distribution, failure rate, and persistence-confirmation latency.

Analysis emits attempted requests, API-confirmed result rows, represented measurement counts, status distribution, request, response-contract, and oracle-mismatch rates, total latency, final score, and coverage. Checks validate status, pond, exact requested period, half-open window metadata, score range, independent-oracle tolerance, and absence of an AI summary.

Service/database/host phase metrics (`T_db`, `T_score`, pool wait, CPU, memory, disk, and locks) require synchronized server-side instrumentation and are not inferred from client HTTP timings.
