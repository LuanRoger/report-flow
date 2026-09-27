# Validation and Test Implementation Handoff

## 1. Purpose of this document

This document transfers the context needed to implement, seed, execute, and report the validation of the reference implementation associated with this undergraduate thesis.

The thesis proposes a generic software architecture. Consequently, the experiments described here must be applied to the **reference implementation developed for this study**, not to the conceptual architecture in isolation. Performance, retrieval, generation, and resource-consumption results depend on the implementation choices, configuration, infrastructure, datasets, external providers, and model versions used during the experiments.

Passing the tests provides evidence about the evaluated implementation under the recorded conditions. It does not prove that every implementation of the architecture will obtain equivalent results. Likewise, a failed target may identify a limitation in the implementation or test environment rather than invalidate the conceptual architecture.

This handoff complements `AGENTS.md`, which contains the broader academic and architectural history of the study.

---

## 2. Study overview

### 2.1 Topic

The study proposes an Artificial Intelligence-based architecture to support decision-making in shrimp farming, specifically for the cultivation of *Litopenaeus vannamei* in Northeastern Brazil.

The principal target users are small and medium-sized shrimp producers.

### 2.2 Problem

Production and water-quality information is frequently fragmented across:

- handwritten records;
- isolated spreadsheets;
- sensor platforms;
- disconnected management systems.

This fragmentation makes it difficult to preserve historical information, identify trends, detect unfavorable conditions, and make timely operational decisions.

### 2.3 Research question

The current research question is equivalent to:

> How can a modular architecture based on Artificial Intelligence integrate heterogeneous shrimp-farming data and transform historical water-quality data into contextualized information to support decision-making by small and medium-sized producers?

### 2.4 Research methodology

The study is applied research conducted through **Design Science Research (DSR)**. The artifact is the modular decision-support architecture and its associated analytical model. TCC I focuses mainly on specification and modeling. TCC II materializes the architecture through a reference implementation and evaluates that implementation.

The TCC I work is predominantly qualitative. TCC II adds quantitative evaluation through numerical-correctness tests, controlled synthetic scenarios, load testing, resource measurements, and RAG evaluation.

### 2.5 Validation claim boundary

The score is a **proposed decision-support model**, not a biologically validated shrimp-health index.

The tests can establish that:

- the implementation follows the specified equations;
- ingestion and persistence work as designed;
- temporal calculations are internally consistent;
- synthetic scenarios produce the expected ordering;
- retrieval and generated answers match a labeled test set;
- the implementation has measurable performance under a documented environment.

The tests cannot establish, without field evidence and specialist review, that the score accurately measures shrimp health or production outcomes.

---

## 3. Intended architecture

The high-level flow is:

```text
Sensors / MQTT
Manual HTTP input
Spreadsheets or other systems
        |
        v
Ingestion service
        |
        v
Validation and standardization
        |
        v
TimescaleDB / PostgreSQL
        |
        v
Analysis service
        |
        +--> temporal aggregation
        +--> water-quality score
        +--> anomaly identification
        +--> AI-generated interpretation
        |
        v
Analysis results
        |
        +--> relational storage
        +--> embeddings stored with pgvector
        |
        v
Knowledge base / RAG
        |
        v
Reports and conversational interface
```

Technologies discussed or selected for the reference implementation include:

- Bun as the JavaScript/TypeScript runtime;
- Elysia for HTTP services;
- MQTT for sensor communication;
- EMQX as the selected MQTT broker, without making the architecture conceptually dependent on EMQX;
- Zod or another Standard Schema-compatible validator;
- Drizzle ORM as the PostgreSQL access layer;
- TimescaleDB for time-series storage;
- pgvector for vector storage and similarity search;
- an embedding model for analytical contexts;
- a language model for contextualized responses;
- Next.js for the conversational interface;
- `k6` for HTTP load tests;
- ESP32 for demonstration of the sensor-to-MQTT flow.

The implementation agent must inspect the actual implementation before assuming that all these choices are already present.

---

## 4. Normalized measurement model

The measurement table shape discussed in the project is:

```sql
id SERIAL,
farm_id TEXT NOT NULL,
pond_id TEXT NOT NULL,
cycle_id TEXT NOT NULL,
recorded_at TIMESTAMPTZ NOT NULL,
parameter_code parameter_code NOT NULL,
value NUMERIC(12, 4) NOT NULL,
unit TEXT NOT NULL DEFAULT '',
source_type TEXT NOT NULL,
source_file TEXT,
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
PRIMARY KEY (id, recorded_at)
```

The four parameters included in the current score are:

```text
temperature
ph
salinity
dissolved_oxygen
```

A normalized input record should contain the equivalent of:

```ts
interface MeasurementInput {
  farmId: string;
  pondId: string;
  cycleId: string;
  recordedAt: string;
  parameterCode:
    | "temperature"
    | "ph"
    | "salinity"
    | "dissolved_oxygen";
  value: number;
  unit: string;
  sourceType: "manual" | "sensor" | string;
}
```

The exact runtime schema and accepted `sourceType` values must be obtained from the implementation.

Important distinction:

- a **collection instant** may contain values for all four parameters;
- the current relational shape stores each parameter measurement as an individual row;
- one combined MQTT or HTTP message may therefore become four database records;
- request rate, message rate, and persisted-row rate must not be treated as interchangeable unless the implementation sends one parameter per request.

---

## 5. Current water-quality references

| Parameter | Reference condition | Unit |
|---|---:|---|
| Temperature | 28–32 | °C |
| pH | 7.5–8.5 | dimensionless |
| Salinity | 15–25 | ppt |
| Dissolved oxygen | greater than or equal to approximately 5 | mg/L |

Removed from the final score:

- ammonia;
- nitrite;
- turbidity.

Do not reintroduce those parameters into the score unless the model is intentionally redesigned. In the current reference implementation, turbidity and its `NTU` unit are removed from the accepted measurement contract rather than retained as an independently monitored parameter.

---

## 6. Scoring model

The architecture does not constrain every monitored parameter to a single normalization function. The function must be selected according to the expected behavior of each variable, while preserving a common output scale for aggregation.

### 6.1 Score range

Each raw measurement is transformed into a score in the range:

```text
1 <= S(x) <= 100
```

### 6.2 Gaussian normalization

Temperature, pH, and salinity currently use:

```text
S(x) = 1 + 99 * exp(-((x - mu)^2) / (2 * sigma^2))
```

Parameters:

| Parameter | `mu` | `sigma` |
|---|---:|---:|
| Temperature | 30 | 3 |
| pH | 8.0 | 0.75 |
| Salinity | 20 | 7.5 |

Academic interpretation:

- the literature provides the adequate/reference ranges;
- `mu` is the midpoint of the corresponding range;
- `sigma` is defined by the project as 75% of the full range width;
- equivalently, `sigma` is 1.5 times the half-width of the range;
- this wider `sigma` keeps the adequate-range boundaries at approximately 80.27 points;
- the literature does not directly establish these `sigma` values;
- they are a configurable modeling transformation adopted by the study.

Useful expected values for temperature:

| Temperature | Expected score, approximately |
|---:|---:|
| 30 | 100.00 |
| 29 | 94.65 |
| 28 | 80.27 |
| 26 | 41.70 |
| 24 | 14.40 |

Gaussian invariants:

```text
S(mu) = 100
S(mu - d) = S(mu + d)
If abs(x1 - mu) < abs(x2 - mu), then S(x1) > S(x2)
1 <= S(x) <= 100
```

### 6.3 Dissolved-oxygen normalization

The thesis currently presents a symmetric triangular function:

```text
S(x) = 1 + 99 * max(0, 1 - abs(x - x_ref) / w)

x_ref = 5 mg/L
w = 2 mg/L
```

Expected values under that function:

| Dissolved oxygen | Expected score |
|---:|---:|
| 5 | 100.0 |
| 4 | 50.5 |
| 3 | 1.0 |
| 2 | 1.0 |
| 6 | 50.5 |
| 7 | 1.0 |

#### Adopted thesis decision and limitation

The symmetric triangular function is the authoritative dissolved-oxygen normalization for the TCC reference implementation and its tests. It intentionally produces `S(5) = 100`, `S(4) = S(6) = 50.5`, and `S(x) = 1` for `x <= 3` or `x >= 7`.

This function penalizes dissolved oxygen above 5 mg/L even though 5 mg/L is commonly interpreted as a recommended minimum rather than a unique optimum. That limitation must remain explicit in the implementation metadata and evaluation report. A one-sided ramp with a plateau may be investigated in future work, but it is not part of the current validated model.

### 6.4 Proportion of time in unfavorable condition

The adopted definition uses only covered time so that an unknown interval is not implicitly classified as favorable:

```text
P_low,i = unfavorable covered duration / covered duration
```

Formally, over the set of covered intervals `C_i`:

```text
P_low,i = (1 / T_covered,i) * integral over C_i of I(S_i(t) < theta) dt
```

When the requested window is fully covered, `T_covered,i` equals the total window duration. For evenly spaced, fully covered samples, sample counting and duration weighting produce the same value:

```text
P_low = number of unfavorable samples / total samples
```

For irregular timestamps, sample counting is incorrect because it measures sample frequency rather than elapsed time. The implementation must calculate the duration represented by each reading.

The adopted convention for irregular time series is:

1. order readings by timestamp;
2. treat reading `j` as valid over `[t_j, t_(j+1))`;
3. clamp intervals to the requested half-open analysis window;
4. cap every represented interval, including the final reading, at the configured maximum continuity gap;
5. use a default maximum continuity gap of 20 seconds, twice the intended 10-second collection interval;
6. do not treat a gap before the first available reading as measured time;
7. classify time beyond the continuity cap as missing;
8. exclude missing time from both the weighted-mean and `P_low` denominators;
9. report coverage separately from the score;
10. never inject a zero or minimum score solely because a reading is missing.

Per-parameter coverage is `covered_duration_i / requested_window_duration`. Overall coverage is the arithmetic mean of the four parameter coverages. The operational minimum is 70% for every required parameter; a result is marked as having sufficient coverage only when all four parameters meet that threshold. The threshold and maximum continuity gap are model configuration values and must be recorded in result metadata.

The current thesis states:

```text
theta = 50
```

However, the scientific justification for a universal threshold of 50 is still weak. A possible future improvement is a parameter-specific threshold derived by applying each normalization function to a literature-backed raw limit.

Tests may use `theta = 50` to verify the current implementation, but reports must identify it as a model configuration rather than a biologically validated universal threshold.

### 6.5 Temporal aggregation

The current methodology explicitly removes the minimum component and the old `alpha`, `beta`, and `gamma` coefficients.

For regularly spaced measurements, the mean is defined as the arithmetic mean of the `N` normalized measurements:

```text
mean(S_i) = (1 / N) * sum from j=1 to N of S_i(t_j)
```

For irregularly spaced measurements, the model uses a duration-weighted temporal mean:

```text
weighted_mean(S_i) =
    sum from j=1 to N of (S_i(t_j) * delta_t_j)
    / sum from j=1 to N of delta_t_j
```

`delta_t_j` is the covered duration represented by measurement `j`, clamped to the analysis window. Intervals classified as missing are excluded from the denominator and reported through coverage metadata; they are not assigned a zero score. When every interval has the same duration, the weighted mean equals the arithmetic mean.

The current temporal score is:

```text
S_hat_i = (mean(S_i) + (100 - 99 * P_low,i)) / 2
```

Interpretation:

- the arithmetic mean captures general normalized behavior for regular series, while the duration-weighted mean is used for irregular series;
- `100 - 99 * P_low` maps no unfavorable time to 100 and fully unfavorable time to 1;
- using 99 instead of 100 preserves the model's `[1,100]` lower bound for the time component;
- both components receive equal weight through an arithmetic mean;
- the old minimum and `alpha`/`beta`/`gamma` model is discarded and is no longer present in the current methodology.

The score oracle and implementation must use the same interval and coverage conventions for the weighted mean and `P_low`. The test report must state how the last reading, analysis-window boundaries, missing intervals, and maximum accepted gap are handled.

### 6.6 Final pond score

```text
Score_pond = sum(weight_i * S_hat_i)
```

Constraint:

```text
sum(weight_i) = 1
```

Current thesis weights:

| Parameter | Weight |
|---|---:|
| Dissolved oxygen | 0.33 |
| Temperature | 0.28 |
| pH | 0.22 |
| Salinity | 0.17 |

These sum to 1.00.

Important academic limitation: these exact values should not be described as directly published by Carbajal-Hernández et al. unless their derivation is demonstrated. They are an adaptation inspired by an AHP hierarchy.

A related 2012 paper reports these AHP priorities:

| Parameter | Published priority |
|---|---:|
| Dissolved oxygen | 0.28012 |
| pH | 0.27005 |
| Temperature | 0.23958 |
| Salinity | 0.21023 |

The implementation tests must use the weights actually configured by the reference implementation. The validation report must print those weights and verify that they sum to 1 within a small floating-point tolerance.

### 6.7 Score invariants

Tests should verify:

```text
1 <= every normalized score <= 100
1 <= every temporal score <= 100
1 <= final pond score <= 100
all configured weights are nonnegative
sum(weights) is approximately 1
```

The final range assumes normalized, nonnegative weights that sum to 1.

---

## 7. Ten-second collection interval

The project owner has selected a **10-second collection interval**, replacing the 15-minute interval currently written in the methodology chapter.

The manuscript still needs to be synchronized with this decision.

### 7.1 General formula

For one row per parameter measurement and a half-open interval `[start, end)`:

```text
collection_instants = duration_seconds / interval_seconds
records = collection_instants * parameter_count * pond_count
```

For this study:

```text
interval_seconds = 10
parameter_count = 4
```

Therefore:

```text
records = (duration_seconds / 10) * 4 * pond_count
```

If both the initial and final timestamps are included, add one collection instant per parameter and pond. The half-open convention is recommended because adjacent windows do not duplicate their shared boundary.

### 7.2 Records per pond

| Period | Instants per parameter | Records for four parameters |
|---|---:|---:|
| 1 minute | 6 | 24 |
| 1 hour | 360 | 1,440 |
| 1 day | 8,640 | 34,560 |
| 7 days | 60,480 | 241,920 |
| 30 days | 259,200 | 1,036,800 |

Calculations:

```text
7 days:
(7 * 24 * 60 * 60 / 10) * 4 = 241,920 records per pond

30 days:
(30 * 24 * 60 * 60 / 10) * 4 = 1,036,800 records per pond
```

### 7.3 Records for multiple ponds

| Ponds | 7 days | 30 days |
|---:|---:|---:|
| 1 | 241,920 | 1,036,800 |
| 10 | 2,419,200 | 10,368,000 |
| 50 | 12,096,000 | 51,840,000 |

### 7.4 Natural streaming rate

Each pond produces four parameter rows every ten seconds:

```text
4 / 10 = 0.4 persisted rows per second per pond
```

Examples:

| Ponds | Persisted rows per second |
|---:|---:|
| 1 | 0.4 |
| 10 | 4 |
| 50 | 20 |

If one combined message contains all four parameters:

```text
message_rate_per_pond = 1 / 10 = 0.1 message per second
```

For 50 ponds:

```text
5 combined messages per second
20 persisted parameter rows per second
```

If one request or MQTT message contains only one parameter, the request/message rate equals the row rate. Record which format the implementation uses before interpreting RPS results.

---

## 8. Deterministic seed requirements

The seed generator should be deterministic and should not rely only on random noise.

### 8.1 Required generator inputs

At minimum:

```ts
interface SeedConfig {
  seed: number;
  farmCount: number;
  pondsPerFarm: number;
  cyclesPerPond: number;
  start: string;
  end: string;
  intervalSeconds: 10;
  scenarioId: string;
  sourceType: "manual" | "sensor";
  batchSize?: number;
}
```

The actual shape may follow the existing codebase.

### 8.2 Reproducibility requirements

The generator should record:

- random seed;
- generator version or Git commit;
- scenario identifier;
- start and end timestamps;
- timezone, preferably UTC;
- half-open or closed interval convention;
- collection interval;
- number of farms, ponds, cycles, and parameters;
- expected number of records;
- generated number of records;
- parameter units;
- scenario transition timestamps;
- expected unfavorable duration per parameter;
- expected coverage;
- expected score calculated by the independent oracle.

Use stable identifiers such as:

```text
farm-001
pond-001
cycle-001
```

Avoid generating new random identifiers on every run when the objective is reproducibility.

### 8.3 Time-series generation requirements

- Generate timestamps in increasing order.
- Persist timezone-aware timestamps.
- Prefer UTC in the seed and convert only for display.
- Use `[start, end)` to avoid duplicate boundary records.
- Do not use floating-point accumulation to advance time; calculate each timestamp from `start + index * interval`.
- Generate expected record counts before writing data.
- Fail the seed process if the generated count differs from the expected count.
- Insert in batches appropriate to the database and runtime.
- Keep the functional ingestion seed separate from the large performance preload.

### 8.4 Ingestion seed versus performance preload

Two different operations are needed:

1. **Functional ingestion seed**: send records through HTTP or MQTT to validate the complete ingestion path.
2. **Performance preload**: prepare millions of historical rows before analysis benchmarks.

Sending 51.84 million rows through a single-record HTTP endpoint may be unnecessarily slow for test preparation. If the performance preload uses database bulk insertion or a dedicated batch path, document that choice. Do not report the preload as proof that the normal ingestion API processed those rows.

---

## 9. Synthetic validation scenarios

Use the following scenario identifiers consistently in seed files, tests, reports, and RAG contexts.

### C1 — Reference condition

Purpose:

- verify maximum or near-maximum normalization;
- verify stable temporal aggregation;
- establish a baseline for scenario comparison.

Suggested deterministic values:

```text
temperature = 30 °C
ph = 8.0
salinity = 20 ppt
dissolved_oxygen = 5 mg/L
```

Expected under the current functions:

```text
all per-reading scores = 100
P_low = 0
all temporal scores = 100
final pond score = 100
```

### C2 — Moderate deviations

Purpose:

- verify gradual Gaussian decay;
- verify a score below C1 but above clearly unfavorable scenarios.

Suggested values:

```text
temperature = 29 °C
ph = 7.75
salinity = 17.5 ppt
dissolved_oxygen = 4.5 mg/L
```

For the three Gaussian parameters, these values are one-third `sigma` from the center and produce approximately 94.65. Under the current triangular oxygen function, 4.5 mg/L produces approximately 75.25.

Expected ordering:

```text
Score(C1) > Score(C2) > Score(C5)
```

### C3 — Prolonged unfavorable condition

Purpose:

- verify `P_low`;
- verify that a longer unfavorable duration reduces the temporal score more strongly.

Create two variants:

```text
C3-25: one parameter unfavorable for exactly 25% of the window
C3-50: the same parameter unfavorable for exactly 50% of the window
```

Suggested parameter:

```text
temperature = 26 °C during the unfavorable interval
temperature = 30 °C otherwise
other parameters remain at C1 values
```

Expected:

```text
P_low(C3-25) = 0.25
P_low(C3-50) = 0.50
Score(C3-50) < Score(C3-25) < Score(C1)
```

Use exact time boundaries so the unfavorable duration is deterministic.

### C4 — Temporary critical event

Purpose:

- verify that a good overall period does not completely hide a critical event;
- verify the impact of the dissolved-oxygen drop on its normalized mean;
- verify the impact of the event duration on `P_low`;
- verify the resulting reduction in the dissolved-oxygen temporal score;
- do not assert `S_min`, because the minimum component has been removed from the current temporal model.

Suggested values:

```text
dissolved_oxygen = 5 mg/L normally
dissolved_oxygen = 2.5 mg/L for exactly 6 hours
other parameters remain at C1 values
```

At a 10-second cadence, six hours contain:

```text
6 * 60 * 60 / 10 = 2,160 dissolved-oxygen readings
```

Expected:

```text
normalized oxygen mean in C4 < normalized oxygen mean in C1
P_low for oxygen = 6 hours / total window duration
oxygen temporal score in C4 < oxygen temporal score in C1
Score(C4) < Score(C1)
```

The six-hour collapse changes the normalized mean because all 2,160 low-oxygen measurements participate in the mean. Its duration also changes `P_low`. These are the two explicit mechanisms by which C4 affects the current temporal score.

For a seven-day window:

```text
P_low = 6 / (7 * 24) = 0.0357142857 approximately
```

For a thirty-day window:

```text
P_low = 6 / (30 * 24) = 0.0083333333 approximately
```

### C5 — Simultaneous unfavorable parameters

Purpose:

- verify weighted combination of multiple temporal scores;
- verify that several unfavorable parameters reduce the pond score more than an equivalent single-parameter event.

Suggested unfavorable values:

```text
temperature = 26 °C
ph = 7.0
salinity = 30 ppt
dissolved_oxygen = 3 mg/L
```

Expected:

```text
Score(C5) < Score(C2) < Score(C1)
```

### C6 — Irregular and missing data

Purpose:

- distinguish duration weighting from simple sample counting;
- verify the duration-weighted normalized mean for irregular series;
- verify duration-weighted `P_low`;
- verify data-coverage metadata;
- ensure missing readings are not converted to zero scores.

Create at least two variants.

#### C6-A — Irregular intervals

Use an explicit short window whose result can be calculated manually. For example, for dissolved oxygen over `[0,100)` seconds:

```text
t = 0 s:  dissolved_oxygen = 5 mg/L -> score 100, valid for 10 s
t = 10 s: dissolved_oxygen = 3 mg/L -> score 1, valid for 90 s
```

The simple sample mean would be:

```text
(100 + 1) / 2 = 50.5
```

The required duration-weighted mean is:

```text
(100 * 10 + 1 * 90) / 100 = 10.9
```

With `theta = 50`, the unfavorable-time proportion is:

```text
P_low = 90 / 100 = 0.9
```

The temporal score is therefore:

```text
S_hat = (10.9 + (100 - 99 * 0.9)) / 2
      = (10.9 + 10.9) / 2
      = 10.9
```

This variant must fail if the implementation uses the unweighted sample mean for irregular intervals. Because the reference implementation defaults to a 20-second maximum continuity gap, this isolated scenario must explicitly configure a continuity gap of at least 90 seconds so that it tests duration weighting rather than missing-period classification.

#### C6-B — Missing period

- include a deliberately uncovered interval;
- verify that the uncovered duration reduces the reported coverage;
- verify that the missing interval is excluded from the weighted-mean denominator;
- verify that the missing interval is not assigned a zero score;
- calculate the expected covered duration, weighted mean, and `P_low` with the independent oracle;
- verify how the implementation treats the first gap, last reading, analysis-window boundaries, and gaps larger than the accepted continuity interval.

The implementation uses an operational 70% minimum for every required parameter and a default 20-second maximum continuity gap. These values are configurable model assumptions, not scientifically calibrated biological requirements, and must be included in stored metadata and evaluation reports.

### C7 — Invalid inputs

Purpose:

- verify validation before persistence;
- verify error reporting and MQTT rejection behavior.

Include at least:

- missing `farmId`;
- missing `pondId`;
- missing `cycleId`;
- missing or malformed `recordedAt`;
- unsupported `parameterCode`;
- nonnumeric `value`;
- `NaN` or infinite values if the transport can represent them;
- missing `sourceType`;
- incompatible field types;
- malformed JSON for HTTP and MQTT payloads.

Important: a biologically unusual but numerically valid measurement should normally be stored and analyzed, not rejected merely because it is outside the recommended cultivation range. Confirm the implementation’s distinction between schema validation and domain anomaly detection.

Expected:

```text
HTTP invalid input -> 400-class response according to the API contract
MQTT invalid input -> not persisted and logged/recorded according to the implementation
valid records -> persisted exactly once according to the implementation contract
```

Do not add duplicate/idempotency assertions unless the API defines an idempotency or deduplication rule.

---

## 10. Unit and property tests

### 10.1 Gaussian unit tests

For each Gaussian parameter:

- center produces 100;
- symmetric distances produce equal scores;
- scores decrease as absolute distance from the center increases;
- outputs remain between 1 and 100;
- extreme finite values do not produce `NaN` or infinity;
- invalid nonfinite inputs are rejected before calculation.

Use numerical tolerances rather than exact floating-point equality.

Suggested tolerance for individual expected examples:

```text
absolute error <= 0.01 score point
```

### 10.2 Dissolved-oxygen unit tests

The selected authoritative function is the symmetric triangular function:

```text
S(5) = 100
S(4) = 50.5
S(3) = 1
S(6) = 50.5
S(7) = 1
```

These tests validate fidelity to the current thesis function, not biological correctness. The high-oxygen penalty must remain documented as a modeling limitation.

### 10.3 `P_low` tests

Include:

- no unfavorable interval -> `0`;
- full unfavorable interval -> `1`;
- exactly 25% unfavorable -> `0.25`;
- exactly 50% unfavorable -> `0.50`;
- regular cadence calculation;
- irregular cadence calculation;
- readings exactly at `theta` are not unfavorable because the current equation uses `< theta`, not `<= theta`;
- clamping to the requested analysis window;
- deterministic treatment of the final sample;
- empty input and zero-duration window behavior according to the API contract.

### 10.4 Temporal-score tests

For the intended two-component model:

```text
S_hat = (mean_score + (100 - 99 * P_low)) / 2
```

Example:

```text
mean_score = 80
P_low = 0.30
favorable-time component = 70.3
S_hat = 75.15
```

Test:

- expected examples;
- arithmetic mean for regular equal intervals;
- duration-weighted mean for irregular intervals;
- equality between arithmetic and weighted means when every interval has the same duration;
- exclusion of explicitly missing intervals from the weighted-mean denominator;
- range invariant;
- increasing `P_low` with fixed mean cannot increase `S_hat`;
- increasing mean with fixed `P_low` cannot decrease `S_hat`;
- no old minimum or `alpha`/`beta`/`gamma` component is included.

### 10.5 Final-score tests

- verify the configured weight sum;
- verify a hand-calculated weighted example;
- verify score range;
- verify that increasing one parameter score while all others and weights are fixed cannot reduce the final score;
- verify missing-parameter behavior according to the implementation contract;
- never silently inject zero for a missing parameter.

### 10.6 Property-based tests

If the codebase already uses a property-testing library, useful generated properties include:

- Gaussian symmetry around `mu`;
- Gaussian monotonic decay by absolute distance;
- score range for broad finite input domains;
- weighted final-score range for random nonnegative normalized weights;
- temporal-score range for random means in `[1,100]` and `P_low` in `[0,1]`.

Do not add a new dependency solely for property tests unless it is justified and accepted by the project.

---

## 11. Independent score oracle

The numerical oracle must not import or call the production scoring functions. Otherwise, the test may reproduce the same implementation defect and report a false pass.

The oracle should:

1. read explicit model configuration;
2. implement the equations independently;
3. use high-precision or stable numeric operations where practical;
4. calculate per-reading scores;
5. calculate expected unfavorable durations;
6. calculate temporal scores;
7. calculate the final weighted score;
8. emit expected values in a machine-readable file;
9. identify the oxygen function, threshold, temporal formula, weights, and missing-data convention used.

For every compared value, calculate:

```text
absolute_error = abs(actual - expected)
MAE = sum(absolute_error) / number_of_values
maximum_absolute_error = max(absolute_error)
```

Initial acceptance criteria from the methodology:

```text
MAE <= 0.01 score point
maximum absolute error <= 0.05 score point
```

These tolerances assess numerical implementation fidelity, not biological accuracy.

---

## 12. Functional ingestion validation

Execute both paths:

### HTTP/manual path

```text
seed generator
    -> HTTP request
    -> request validation
    -> normalization to internal shape
    -> repository
    -> TimescaleDB/PostgreSQL
```

Use:

```text
sourceType = manual
```

Collect:

- sent count;
- HTTP status distribution;
- accepted count;
- rejected count;
- persisted count;
- duplicate count if the contract defines deduplication;
- field-by-field comparison of a sample or all records for small datasets;
- time from request receipt to persistence confirmation.

### MQTT/sensor path

```text
ESP32 or deterministic MQTT publisher
    -> MQTT broker
    -> ingestion subscriber
    -> message validation
    -> repository
    -> TimescaleDB/PostgreSQL
```

Use:

```text
sourceType = sensor
```

Collect:

- published count;
- consumed count;
- rejected count;
- persisted count;
- end-to-end latency if timestamps permit;
- reconnect and delivery behavior according to the configured MQTT QoS.

The ESP32 demonstrates the sensor path. It must not be used as the load generator because its limitations would distort service-performance results.

Initial acceptance criteria:

```text
valid-record persistence rate = 100% for the controlled functional runs
invalid-record rejection rate = 100% for C7
```

If MQTT QoS or asynchronous processing makes completion delayed, wait for a documented settling interval and poll persistence until a documented timeout.

---

## 13. RAG evaluation

### 13.1 Knowledge representation

The knowledge base should be formed primarily from interpreted analysis artifacts, not raw sensor points.

Intended flow:

```text
raw time-series measurements
    -> deterministic analysis and scores
    -> structured analytical summary
    -> textual context plus metadata
    -> embedding
    -> pgvector storage
    -> semantic retrieval
    -> language-model response
```

Each context should include, when available:

- farm, pond, and cycle relationship metadata;
- requested analysis period;
- actual covered period;
- measurement count;
- data coverage;
- monitored parameters;
- overall score;
- parameter temporal scores;
- `P_low` values;
- threshold configuration;
- parameter weights;
- detected unfavorable intervals;
- generated interpretation or recommendation;
- source analysis identifier.

Do not include the discarded `alpha`, `beta`, `gamma`, or minimum-score components if the intended current temporal model is used.

### 13.2 Labeled question set

Create 40 questions divided equally into four categories:

1. 10 direct questions about a pond, period, parameter, or score;
2. 10 comparisons between ponds or periods;
3. 10 questions about unfavorable events and supported actions;
4. 10 questions for which the stored knowledge is insufficient.

For every question, define:

```ts
interface RagGoldCase {
  id: string;
  category: "direct" | "comparison" | "event" | "insufficient";
  question: string;
  expectedContextIds: string[];
  expectedFacts: Array<{
    field: string;
    expectedValue: string | number;
    tolerance?: number;
  }>;
  mustAbstain: boolean;
  forbiddenUnsupportedClaims?: string[];
}
```

Each question should be executed three times because generation may remain nondeterministic even with fixed settings.

Keep fixed and record:

- conversational model provider and exact model identifier;
- model version if exposed;
- embedding provider and model identifier;
- embedding dimensions;
- prompt/system-instruction version;
- temperature and other generation parameters;
- context segmentation/chunking strategy;
- metadata filters;
- similarity metric;
- `topK`, currently evaluated at 5;
- reranker and its version, if used;
- database/index configuration;
- network environment as far as practical.

Never record API secrets.

### 13.3 RAG metrics

#### Recall@5

For each answerable question:

```text
recall_at_5 =
    expected relevant contexts found in top 5
    / total expected relevant contexts
```

Report the mean across answerable questions.

Initial target:

```text
Recall@5 >= 90%
```

#### Factual accuracy

A response is factually correct when its expected values, pond, period, and parameter references match the gold case within stated numeric tolerances.

```text
factual_accuracy = correct answer executions / answerable executions
```

Initial target:

```text
factual accuracy >= 90%
```

#### Groundedness/fidelity

Break each answer into verifiable factual claims. Label a claim supported only when it follows from one or more retrieved contexts.

```text
groundedness = supported verifiable claims / total verifiable claims
```

Initial target:

```text
groundedness >= 90%
```

Record both macro results per question and the total claim-level result if possible.

#### Correct abstention

For questions deliberately lacking sufficient information:

```text
correct_abstention_rate =
    responses that explicitly report insufficient information
    / total insufficient-information executions
```

Initial target:

```text
correct abstention rate = 100%
```

A generic answer or an unsupported recommendation does not count as a correct abstention.

#### Conversational response time

Measure separately:

- time to first streamed response segment;
- total time until response completion;
- retrieval time;
- embedding-query time;
- model-generation time, if the provider exposes it.

Initial targets in the methodology:

```text
p95 time to first segment <= 3 seconds
p95 total response time <= 10 seconds
```

These results are strongly provider- and network-dependent. They characterize only the recorded implementation and test environment.

---

## 14. Performance evaluation

### 14.1 Test tool and execution profile

The methodology currently proposes `k6` for HTTP load tests.

Use different load levels for ingestion and analysis because their processing costs and expected request frequencies are different.

For ingestion:

1. warm up for 1 minute;
2. run constant levels of 10, 50, and 100 RPS for 5 minutes each;
3. execute each level three times.

For analysis:

1. warm up for 1 minute;
2. run constant levels of 1, 5, and 10 RPS for 5 minutes each;
3. execute each level three times.

For all runs, reset or document the database state between repetitions and avoid unrelated workloads on the test host.

Apply the HTTP tests to:

- manual ingestion;
- analysis of a seven-day window;
- analysis of a thirty-day window;
- retrieval/result endpoints if relevant.

Test database sizes:

```text
1 pond
10 ponds
50 ponds
```

At a 10-second cadence, the 50-pond, 30-day dataset contains 51,840,000 measurement rows. Confirm available disk space, insertion time, index size, and TimescaleDB configuration before generating it.

### 14.2 Required environment manifest

Record:

- date and time;
- Git commit of every tested service;
- operating system;
- physical or virtual environment;
- CPU model and core count;
- RAM;
- disk type and capacity;
- network topology;
- runtime and version;
- application dependencies and versions;
- PostgreSQL version;
- TimescaleDB version;
- pgvector version;
- MQTT broker and version;
- database indexes;
- TimescaleDB hypertable/chunk configuration;
- connection-pool settings;
- service concurrency settings;
- AI and embedding model identifiers;
- test dataset and seed version.

Without this manifest, performance results are not reproducible or comparable.

### 14.3 Performance metrics

For each endpoint and load level, collect:

- requested RPS;
- achieved RPS;
- successful request count;
- failed request count;
- error rate;
- minimum, mean, median, p95, p99, and maximum response time;
- database read latency;
- database write latency;
- CPU mean and maximum;
- memory mean and maximum;
- disk read/write operations or throughput;
- network bytes sent and received.

Prefer percentile-based interpretation over mean response time because the mean can hide slow tail requests.

### 14.4 Timing boundaries

Manual ingestion latency:

```text
request accepted by service
    -> validation
    -> persistence
    -> persistence confirmation returned
```

Analysis latency:

```text
analysis request accepted
    -> measurement query
    -> normalization
    -> temporal aggregation
    -> final score
    -> response or result persistence completed
```

State whether AI generation and embedding creation are included in the analysis endpoint timing. If they are asynchronous, measure them separately.

### 14.5 Initial acceptance targets

These are engineering targets for the reference prototype, not universal production requirements:

```text
Ingestion at 50 RPS:
    p95 <= 500 ms
    error rate < 1%

Thirty-day analysis at 10 RPS:
    p95 <= 2 seconds
    error rate < 1%

Resources at 50 RPS:
    average CPU < 85%
    post-warm-up memory variation < 10%
```

If the implementation uses batch requests, report both requests per second and parameter records per second.

### 14.6 Dedicated TimescaleDB aggregation and score benchmark

#### Objective

This benchmark must determine how the reference implementation performs when it queries time-series measurements from TimescaleDB, aggregates them over a selected period, and calculates the parameter and pond scores.

It must separate database cost from application computation instead of reporting only the total HTTP response time.

#### Dataset matrix

Use the deterministic 10-second datasets defined in this handoff:

| Stored ponds | Seven-day rows | Thirty-day rows |
|---:|---:|---:|
| 1 | 241,920 | 1,036,800 |
| 10 | 2,419,200 | 10,368,000 |
| 50 | 12,096,000 | 51,840,000 |

For each database size:

1. request an analysis for one selected pond to measure whether increasing background data affects indexed query selectivity;
2. if the API supports batch analysis, request analyses for 10 and 50 ponds to measure batch scaling;
3. test both seven-day and thirty-day windows;
4. use the same parameter values and expected scores across comparable configurations.

#### Instrumented timing phases

Add timing instrumentation around the actual implementation path:

```text
T_total:
HTTP analysis request received
    -> response/result persistence completed

T_db:
database query dispatched
    -> all rows or aggregates consumed by the application

T_score:
input data available to score module
    -> normalized, temporal, and pond scores completed

T_overhead = T_total - T_db - T_score
```

If normalization or score calculation is pushed into SQL, include that work in `T_db`, report `T_score` as not applicable or only the remaining application work, and document the boundary. Do not pretend database computation is application computation or vice versa.

If the analysis endpoint also invokes an embedding or conversational model, exclude those calls from this dedicated benchmark or time them as separate phases. The objective here is the deterministic aggregation and score path.

#### Sequential microbenchmark

For every combination of database size, requested pond count, and analysis window:

1. execute five unrecorded warm-up analyses;
2. execute 30 measured analyses sequentially;
3. verify every returned score against the independent oracle;
4. record p50, p95, and p99 for `T_db`, `T_score`, `T_overhead`, and `T_total`;
5. record rows examined, rows returned, and parameter measurements represented by the result;
6. calculate database rows examined per second and measurements scored per second;
7. run the cases in a documented order or randomize the order with a recorded seed to reduce ordering bias.

Suggested derived metrics:

```text
database_scan_rate = rows_examined / T_db_seconds
score_processing_rate = measurements_scored / T_score_seconds

window_scaling_factor = median_T_total_30_days / median_T_total_7_days
background_scaling_factor =
    median_T_total_database_50_ponds
    / median_T_total_database_1_pond
```

The background scaling factor should be calculated for a query that requests the same single pond in both databases. It helps identify whether indexes and chunk exclusion preserve query selectivity as unrelated data grows.

#### Concurrent analysis benchmark

After the sequential benchmark, run the analysis endpoint at constant levels of 1, 5, and 10 RPS for five minutes, with one minute of warm-up and three repetitions. Use the thirty-day window for the primary stress case and the seven-day window as a comparison.

Collect:

- requested and achieved RPS;
- successful and failed analyses;
- p50, p95, and p99 total latency;
- p50, p95, and p99 `T_db` and `T_score` when tracing supports them;
- database connection-pool wait time;
- active database connections;
- CPU, memory, disk I/O, and network use for the application and database;
- lock waits, temporary-file use, and query cancellations;
- score-oracle mismatches.

#### TimescaleDB query-plan inspection

Run representative score-input queries separately with:

```sql
EXPLAIN (ANALYZE, BUFFERS)
```

Do not enable `EXPLAIN ANALYZE` inside normal load-test requests because its instrumentation changes execution cost.

Preserve the complete plans and extract:

- planning time;
- execution time;
- actual versus estimated rows;
- loops;
- shared-buffer hits and reads;
- temporary blocks read and written;
- sort method and disk spilling;
- indexes used;
- hypertable chunks accessed;
- hypertable chunks excluded by the time predicate;
- filters applied for farm, pond, cycle, parameter, and time window.

Also record:

- hypertable name;
- chunk interval;
- number and size of chunks;
- indexes and their sizes;
- compression configuration and compressed-chunk status;
- continuous-aggregate definitions and refresh policies, if present;
- PostgreSQL, TimescaleDB, and pgvector versions;
- relevant memory, parallelism, and connection settings.

For the seven-day query against a database containing thirty days, verify that chunks entirely outside the requested interval are not scanned. A query may still use a sequential scan inside an individual selected chunk; do not classify that as an error without considering chunk size, row count, and the complete plan.

#### Warm-cache and cold-cache measurements

The primary repeated results should use a warmed system after the five warm-up executions. Label these as warm-cache measurements.

A cold-cache test is optional and must be executed only in an isolated environment. If performed, restart PostgreSQL/TimescaleDB or use another controlled method between measurements and document the procedure. Do not combine cold-cache and warm-cache samples in one percentile distribution. Do not clear operating-system caches on a shared or production machine.

#### Controlled comparison

To estimate the effect of the selected TimescaleDB storage strategy, a complementary comparison may use:

1. a standard PostgreSQL table;
2. a TimescaleDB hypertable;
3. the hypertable plus a continuous aggregate, if continuous aggregates are part of the implementation or evaluation.

Use equivalent schemas, data, indexes, predicates, hardware, and result semantics. If SQL must differ, document the difference. For continuous aggregates, report not only query latency but also:

- materialized storage size;
- initial materialization time;
- refresh duration;
- refresh frequency;
- data-freshness lag;
- effect of late-arriving measurements.

This comparison evaluates the tested storage configurations. It does not establish that TimescaleDB is universally faster than PostgreSQL for every workload.

#### Correctness requirement during optimization

Every performance execution must retain score correctness. Compare the result with the independent oracle and fail the correctness assertion when:

```text
MAE > 0.01 score point
or
maximum absolute error > 0.05 score point
```

A faster query that changes `P_low`, coverage, temporal scores, weights, or the final score is not a successful optimization.

The existing initial end-to-end target remains:

```text
Thirty-day analysis of the reference implementation at 10 RPS:
    p95 T_total <= 2 seconds
    error rate < 1%
```

If that target is not reached, report the measured `T_db`, `T_score`, and `T_overhead` values rather than hiding the failure. These values identify whether the bottleneck is TimescaleDB access, score computation, connection waiting, serialization, or another implementation stage.

---

## 15. Evaluation criteria summary

| Indicator | Calculation | Initial acceptance target |
|---|---|---|
| Ingestion integrity | valid records persisted / valid records sent | 100% for controlled HTTP and MQTT functional runs |
| Invalid-input rejection | invalid records rejected / invalid records sent | 100% for C7 |
| Score numerical precision | MAE and maximum absolute error against independent oracle | MAE ≤ 0.01 and maximum error ≤ 0.05 score point |
| Score consistency | range and scenario-ordering assertions | 100% of defined assertions |
| RAG retrieval | mean Recall@5 on answerable questions | ≥ 90% |
| RAG factual accuracy | correct answer executions / answerable executions | ≥ 90% |
| RAG groundedness | supported claims / verifiable claims | ≥ 90% |
| RAG correct abstention | correct abstentions / insufficient-data executions | 100% |
| Ingestion latency | p95 at 50 RPS | ≤ 500 ms and error rate < 1% |
| Analysis latency | p95 for 30-day analysis at 10 RPS | ≤ 2 s and error rate < 1% |
| Aggregation and score phases | p50, p95, and p99 of `T_db`, `T_score`, `T_overhead`, and `T_total`; rows and measurements processed per second | Returned scores remain within oracle tolerances and `T_total` remains within the analysis target |
| TimescaleDB temporal plan | `EXPLAIN (ANALYZE, BUFFERS)` for seven- and thirty-day queries | Time and pond filters are applied; chunks entirely outside the requested interval are excluded |
| Conversational first response | p95 time to first segment | ≤ 3 s |
| Conversational complete response | p95 total completion time | ≤ 10 s |
| Resource usage | CPU and memory at 50 RPS | average CPU < 85%; post-warm-up memory variation < 10% |

If a target is missed, preserve the result. Do not change or delete meaningful implementation behavior merely to make the benchmark pass. Diagnose whether the cause is the implementation, configuration, infrastructure, data volume, or an unrealistic initial target.

---

## 16. Recommended execution order

The implementation agent should proceed in this order:

1. Inspect the implementation repository and identify services, packages, scripts, test framework, migrations, and environment configuration.
2. Locate the implemented scoring equations and configuration.
3. Confirm that the implementation matches the current scoring specification and explicitly record any mismatch:
   - Gaussian parameters `sigma = 3`, `0.75`, and `7.5`;
   - duration-weighted temporal mean and component `100 - 99 * P_low`;
   - authoritative symmetric triangular oxygen function;
   - global `theta = 50`;
   - adapted parameter weights `0.33`, `0.28`, `0.22`, and `0.17`.
4. Identify the exact input schemas and HTTP/MQTT contracts.
5. Implement isolated normalization and aggregation unit tests.
6. Implement the independent scoring oracle without importing production scoring code.
7. Implement deterministic 10-second seed generation.
8. Implement small functional seeds for HTTP and MQTT.
9. Implement C1–C7 integration scenarios.
10. Generate analytical contexts and implement the 40-case RAG gold dataset.
11. Execute RAG retrieval and answer evaluation three times per question.
12. Prepare the 1-, 10-, and 50-pond performance datasets.
13. Add phase-level instrumentation for `T_db`, `T_score`, `T_overhead`, and `T_total`.
14. Execute the sequential TimescaleDB aggregation and score microbenchmark.
15. Capture representative `EXPLAIN (ANALYZE, BUFFERS)` plans outside the load run.
16. Execute `k6` profiles with three repetitions.
17. Collect application, database, broker, host, and external-model metrics.
18. Produce machine-readable raw results before creating summaries or charts.
19. Compare results with the initial acceptance criteria.
20. Document failures, limitations, and implementation-dependent factors.
21. Update the thesis only with results that were actually observed.

Do not invent package-manager commands. Read the implementation’s `package.json`, workspace configuration, README, and existing test scripts first.

---

## 17. Suggested output artifacts

Names may be adapted to the implementation repository:

```text
validation/
  README.md
  manifest.json
  seeds/
    config/
      c1-reference.json
      c2-moderate.json
      c3-25-prolonged.json
      c3-50-prolonged.json
      c4-critical-event.json
      c5-simultaneous.json
      c6-irregular.json
      c7-invalid.json
    expected/
      score-oracle-results.json
    summaries/
      seed-counts.json
  tests/
    unit/
    integration/
    rag/
  rag/
    gold-cases.json
    runs/
    metrics.json
  load/
    k6/
    raw-results/
    summaries/
    timescaledb/
      plans/
      phase-timings/
      warm-cache/
      cold-cache/
      comparisons/
  reports/
    validation-summary.md
    limitations.md
```

The exact paths should follow the existing repository conventions.

### Minimum manifest example

```json
{
  "implementationCommit": "record-at-runtime",
  "seed": 20260907,
  "intervalSeconds": 10,
  "windowConvention": "[start,end)",
  "parameters": [
    "temperature",
    "ph",
    "salinity",
    "dissolved_oxygen"
  ],
  "oxygenFunction": "symmetric triangular: 1 + 99 * max(0, 1 - abs(x - 5) / 2)",
  "theta": 50,
  "temporalFormula": "(duration_weighted_mean + (100 - 99 * P_low)) / 2",
  "weights": {
    "dissolved_oxygen": 0.33,
    "temperature": 0.28,
    "ph": 0.22,
    "salinity": 0.17
  },
  "runtime": "record-at-runtime",
  "database": "record-at-runtime",
  "embeddingModel": "record-at-runtime",
  "conversationModel": "record-at-runtime",
  "topK": 5
}
```

Do not leave placeholder values in the final executed manifest.

---

## 18. Data safety and privacy

The primary validation plan uses synthetic data.

If data obtained from producer partnerships is later used:

- obtain the required authorization;
- remove or pseudonymize farm, pond, producer, and location identifiers;
- do not include private operational data in prompts sent to external model providers without authorization;
- document which data leaves the local environment;
- avoid committing secrets, API keys, credentials, or private datasets;
- separate real-data validation from synthetic implementation verification.

---

## 19. Known issues that must remain visible

1. **Oxygen symmetry**: the authoritative TCC model uses the symmetric triangular function and therefore penalizes values above 5 mg/L; this is a known modeling limitation, not an implementation defect.
2. **Sigma calibration**: the current `sigma` values are 75% of each full adequate-range width and keep the range boundaries near 80.27; this is a configurable project choice, not a value directly supplied by the literature.
3. **Threshold justification**: `theta = 50` is operationally defined but not strongly justified as a universal biological limit.
4. **Weight provenance**: the exact 0.33/0.28/0.22/0.17 values are adapted, not demonstrated as direct values from the cited AHP study.
5. **Irregular-series convention**: irregular series use a duration-weighted mean and duration-weighted `P_low` over covered time; the reference implementation defaults to a 20-second maximum continuity gap and records the half-open boundary convention.
6. **Coverage threshold**: the implementation requires an operational 70% coverage for every parameter to mark coverage as sufficient, but this threshold is not biologically calibrated.
7. **No biological validation claim**: numerical precision against the equations is not biological accuracy.
8. **Implementation dependence**: performance and RAG metrics belong to the tested reference implementation and environment.
9. **Collection interval**: the validation specification uses a 10-second interval; seeds, implementation configuration, benchmarks, and thesis results must remain synchronized with it.
10. **External AI variability**: model versions, provider behavior, rate limits, latency, and nondeterminism can change results.

Tests should expose these issues rather than hide them.

---

## 20. Final instruction to the implementation agent

Treat this document as a validation specification and context handoff, not as proof that the current implementation already follows every decision described here.

Before changing code:

- inspect the implementation;
- identify mismatches between code, thesis, and this handoff;
- preserve existing user work;
- make tests deterministic where possible;
- keep the score oracle independent;
- report exact commands and observed results;
- distinguish passed tests from tests that were not executed;
- distinguish implementation verification from domain validation;
- never present adapted or heuristic values as if they were directly established by scientific literature.
