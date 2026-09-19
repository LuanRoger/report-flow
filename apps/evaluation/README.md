# Report Flow evaluation

This workspace implements the reproducible, non-MQTT evaluation described in the root `EVALUATION.md` and `SPECIFICATIONS.md`.

Use [`RUNBOOK.md`](RUNBOOK.md) for the complete, copy-ready execution sequence. This README documents the individual components and contracts.

The independent numerical oracle deliberately does **not** import scoring code or constants from `apps/analysis`. Duplication of equations in `config/model.json` is intentional: expected results must remain independent of the implementation under test.

## Implemented components

- frozen four-parameter scoring contract and independent oracle;
- deterministic C1 through C6-B measurement fixtures and C7 invalid cases;
- six seeded 1/10/50-pond and 7/30-day dataset plans;
- Park-Miller deterministic generator and byte-level checksums;
- immutable per-run artifact directories;
- sanitized environment manifests and read-only database preflight;
- explicit schema checks for enums, summary separation, ownership, identity, and the TimescaleDB hypertable;
- non-destructive HTTP ingestion validation with persisted-field reconciliation;
- analysis response comparison with MAE and maximum absolute error;
- missing-parameter, coverage, continuity-gap, and disabled-AI-artifact checks;
- guarded, bounded direct database preload;
- five-warm-up/thirty-sample sequential analysis benchmark;
- JSON `EXPLAIN (ANALYZE, BUFFERS)` and TimescaleDB metadata capture;
- guarded k6 ingestion, 7-day analysis, and 30-day analysis profiles with a Bun `.env` launcher;
- a guarded nine-context RAG knowledge-base preparation workflow;
- authenticated live retrieval telemetry and 120-trial retrieval capture;
- isolated 120-trial streamed answer capture and an unreviewed judgment template;
- validation of the 40-case RAG gold set;
- artifact-based Recall@5, fact, groundedness, abstention, and latency scoring;
- artifact-only Markdown and JSON report generation.

MQTT is deferred. Human/model-assisted RAG judgments, k6 repetitions, resource monitoring, and large database runs must still be executed explicitly and remain `not-executed` until artifacts exist.

## Frozen scoring contract

| Component | Value |
| --- | --- |
| Temperature | Gaussian, `mu=30`, `sigma=3` |
| pH | Gaussian, `mu=8`, `sigma=0.75` |
| Salinity | Gaussian, `mu=20`, `sigma=7.5` |
| Dissolved oxygen | Symmetric triangle centered at `5 mg/L`, half-width `2 mg/L` |
| Unfavorable threshold | Strictly `score < 50` |
| Temporal score | `(durationWeightedMean + (100 - 99 * pLow)) / 2` |
| Default continuity cap | `20 seconds` |
| C6-A continuity cap | `90 seconds` |
| Coverage requirement | Every parameter has at least `70%` coverage |
| Weights | oxygen `0.33`, temperature `0.28`, pH `0.22`, salinity `0.17` |
| Window | Half-open `[start,end)` in UTC |
| Measurement identity | `(pondId, parameterCode, recordedAt)` |

Low coverage does not erase a score calculated from covered time. A final score is unavailable only when a required parameter is absent or has no covered duration.

## Prerequisites

- Bun compatible with the repository lockfile;
- PostgreSQL with TimescaleDB and pgvector;
- the current initial migration applied;
- ingest and analysis services for HTTP stages;
- k6 installed separately for concurrent load stages.

Install workspace dependencies from the repository root:

```bash
bun install
```

Run package gates from `apps/evaluation`:

```bash
bun run test
bun run typecheck
bun run check
```

## Environment

Operational commands read these variables:

| Variable | Used by | Notes |
| --- | --- | --- |
| `EVALUATION_DATABASE_URL` | all database stages | Required; never falls back to `DATABASE_URL` |
| `INGEST_API_URL` | preflight and ingestion | Defaults to `http://localhost:3000` |
| `INGEST_API_KEY` | ingestion | Required and never persisted |
| `ANALYSIS_API_URL` | preflight, analysis, sequential, RAG | Defaults to `http://localhost:3001` |
| `ANALYSIS_API_KEY` | analysis, sequential, RAG | Required and never persisted |
| `OPENAI_API_KEY` | `prepare:rag` | Required only for the explicitly authorized nine-embedding preparation stage |

Both services must use the same database selected by `EVALUATION_DATABASE_URL`. Configure their own `DATABASE_URL` and `API_KEY` values through the repository's Varlock setup before starting them. Live RAG also requires `OPENAI_API_KEY` in the analysis service process; preparation requires it in the evaluator process.

Bun package scripts load an untracked `apps/evaluation/.env`. The k6 package scripts now use a Bun launcher and inherit that environment. Direct `k6 run` still does not parse `.env`.

Start services in separate terminals:

```bash
cd apps/ingest
bun run dev
```

```bash
cd apps/analysis
bun run dev
```

Do not put credentials in tracked files, result artifacts, shell history intended for publication, or screenshots.

## Database safety

Read-only preflight may inspect any explicitly supplied database. Destructive preload is different:

1. only `EVALUATION_DATABASE_URL` is accepted;
2. the database name must start with `report_flow_eval`;
3. production-like hostnames are rejected;
4. `--confirm-reset` is mandatory;
5. the reset is recorded in the manifest;
6. the generic `postgres` database is always refused for preload.

The preload truncates all application data tables before inserting a selected dataset. It does not drop the schema or reapply migrations.

A URL ending in `/postgres` is suitable for read-only migration preflight, but not for preload. Create a dedicated database such as `report_flow_evaluation`, apply the initial migration there, and point both services and the evaluator to it before functional or performance execution.

## Run and artifact lifecycle

Every run starts with preflight and uses a unique run ID:

```text
YYYYMMDD-HHMMSSZ-<short-commit>-<profile>
```

Artifacts are written under:

```text
results/<run-id>/
  manifest.json
  preflight.json
  seeds/
  correctness/
  ingestion/
  performance/
    sequential/
    k6/
    resources/
    query-plans/
  rag/
    preparation/
    retrieval/
    answers/
    judgments/
  reports/
```

Preflight creates a run directory once. Stage artifacts use exclusive writes and a command fails instead of replacing them; `manifest.json` is the only currently mutable evaluator artifact. Raw result directories are ignored by Git and should be archived externally for official runs.

An official preflight requires a clean Git tree and reachable services. Exploratory database-only setup may explicitly skip service probes:

```bash
bun run preflight -- \
  --run-id <run-id> \
  --run-class exploratory \
  --skip-service-checks
```

Do not use that skip flag for an official run.

## Correctness workflow

### 1. Preflight

```bash
bun run preflight -- --run-id <run-id> --run-class exploratory
```

Preflight records host resources, Git state, Bun/k6 availability, configuration checksums, models, sanitized targets, PostgreSQL settings, extensions, indexes, constraints, row counts, Timescale dimensions, and service reachability.

### 2. Independent expected results

```bash
bun run oracle -- --scenarios all --run-id <run-id>
```

A subset may be selected with a comma-separated list such as `C1,C2,C6-B`.

### 3. HTTP ingestion and C7

```bash
bun run validate:ingestion -- --scenarios all --run-id <run-id>
```

This command:

- creates only missing pond/cycle prerequisites directly;
- refuses scenario windows that already contain measurements;
- sends scoring records one at a time through `POST /ingest/manual`;
- saves one raw NDJSON record per request;
- reconciles every persisted identity and field;
- verifies cycle ownership and invalid relationships;
- verifies duplicate identity rejection;
- calculates valid persistence and invalid rejection rates.

Use `--skip-c7` only for a deliberately scoped exploratory run. A non-loopback service requires `--allow-remote-target`.

### 4. Analysis correctness

```bash
bun run validate:analysis -- \
  --scenarios C1,C2,C3-25,C3-50,C4,C5,C6-A,C6-B \
  --run-id <run-id>
```

Every request sends:

```json
{
  "window": "custom",
  "generateAiSummary": false,
  "generateEmbedding": false,
  "maximumContinuityGapSeconds": 20
}
```

C6-A overrides the continuity cap to `90`. The evaluator compares final and parameter scores, weighted means, `pLow`, durations, coverage, weights, threshold, dates, phase flags, and continuity metadata. It verifies one persisted result and zero summary/embedding rows per deterministic request. Selecting C6-B also executes a subwindow that must fail with missing dissolved oxygen and must not persist a result.

Acceptance is:

```text
MAE <= 0.01
maximum absolute error <= 0.05
```

## Dataset generation and preload

Regenerate compact tracked summaries:

```bash
bun run oracle:generate
bun run seed:summarize
```

Generate an optional NDJSON file without touching the database:

```bash
bun run seed:generate -- \
  --config config/datasets/1-pond-7-days.json \
  --output <external-output>/1-pond-7-days.ndjson
```

Preload one tracked profile into a dedicated evaluation database:

```bash
bun run preload -- \
  --dataset 1-pond-30-days \
  --run-id <run-id> \
  --confirm-reset
```

Equivalent matrix selection is available:

```bash
bun run preload -- \
  --ponds 10 \
  --days 7 \
  --run-id <run-id> \
  --confirm-reset
```

The seed is frozen in each dataset configuration. The command streams generator output into batches capped at 7,500 rows/60,000 bindings, hashes every canonical row, and verifies totals, per-parameter counts, first/last timestamps, and duplicate identities.

The `50-ponds-30-days` profile contains `51,840,000` rows. Estimate time and disk from smaller runs before executing it.

## Sequential benchmark

A 30-day preload supports both primary windows:

```bash
bun run benchmark:sequential -- \
  --matrix primary \
  --pond-id 1 \
  --run-id <run-id>
```

Defaults are five unrecorded warm-ups and thirty sequential measured requests per window. Override only for an exploratory run with `--warmup-samples` or `--measured-samples`.

The command computes the independent expected score from the selected database rows, checks every response, and reports min, mean, median, p95, p99, and maximum for HTTP, query, score, persistence, overhead, summary, embedding, and total timings. Summary and embedding must remain excluded.

## TimescaleDB plans

```bash
bun run benchmark:plans -- \
  --windows 7d,30d \
  --pond-id 1 \
  --run-id <run-id>
```

Each window preserves the complete JSON plan plus extracted planning/execution time, nodes, rows, loops, indexes, relations, buffers, temporary blocks, and sort methods. A summary also records chunks, dimensions, hypertable state, table/index sizes, jobs, and continuous aggregates where available.

## k6 load profiles

k6 is an external executable. Install it separately, then follow `k6/README.md` and the matrix instructions in `RUNBOOK.md`.

Package entry points are:

```bash
bun run benchmark:k6:ingestion
bun run benchmark:k6:analysis:7d
bun run benchmark:k6:analysis:30d
```

The scripts refuse execution unless `K6_ALLOW_LOAD_TEST=true`, a run ID and API key are supplied, and remote targets are separately authorized. Analysis additionally requires an explicit attestation that embedding opt-out is honored and one oracle score per target pond.

The package commands run k6 through Bun, so evaluation `.env` values are inherited. Forward export options after `--`, for example `bun run benchmark:k6:ingestion -- --summary-export=<path> --out json=<path>`.

Run every load level three times and preserve each result with k6 `--summary-export` plus raw JSON/CSV metrics or an approved metrics backend. The scripts never reset the database. Dates and `K6_EXPECTED_FINAL_SCORES` must match the active preload; derive each score from the sequential benchmark rather than assuming `100`.

## RAG evaluation

`gold/rag-cases.json` contains exactly 40 cases: 10 direct, 10 same-pond comparisons, 10 event/action, and 10 insufficient-information cases. Use a dedicated RAG run and database state; unrelated analyses would contaminate recency retrieval.

Detailed setup, artifact, and review instructions are in `RUNBOOK.md`.

### 1. Prepare the controlled knowledge base

```bash
bun run prepare:rag -- \
  --run-id <rag-run-id> \
  --confirm-reset \
  --allow-paid-embeddings
```

Preparation resets all application tables and directly streams `2,488,387` deterministic measurements. It then creates nine production analyses, verifies them against the independent oracle, and makes nine paid `text-embedding-3-small` calls for approved 1,024-dimensional context embeddings.

The resulting `controlled-kb.json` and `context-map.json` under `results/<rag-run-id>/rag/preparation/` are required by live capture. Do not hand-edit the generated map.

### 2. Capture and score retrieval

```bash
bun run capture:rag:retrieval -- \
  --run-id <rag-run-id> \
  --allow-paid-models
```

This runs all 40 cases sequentially for trials `1`, `2`, and `3`, making 120 paid query-embedding calls through the production retriever. It preserves raw NDJSON, writes the complete capture, and calculates Recall@5 immediately:

```text
rag/retrieval/raw-capture.ndjson
rag/retrieval/live-capture.json
rag/retrieval/score-live-capture.json
```

An official retrieval capture is complete only when all 120 executions are present and every execution uses `topK = 5`. Mean Recall@5 uses the 90 answerable executions; insufficient-information cases are evaluated during answer review.

The generic scorer remains available for a compatible externally produced capture:

```bash
bun run evaluate:rag:retrieval -- \
  --input <retrieval-capture.json> \
  --run-id <rag-run-id>
```

### 3. Capture live answers

```bash
bun run capture:rag:answers -- \
  --run-id <rag-run-id> \
  --allow-paid-models
```

This clears the controlled pond chat before each trial, then runs 120 sequential production chat turns. The stage makes 120 query-embedding calls and 120 `gpt-5.6-luna` chat completions. It preserves raw SSE events, response text, sources, citations, provider errors, TTFT, and completion time:

```text
rag/answers/raw-capture.ndjson
rag/answers/answer-review-template.json
```

The generated template is deliberately marked `UNREVIEWED`; capture does not invent observed facts, claim support, or abstention decisions.

### 4. Review and score answers

Review every execution against its retrieved approved contexts. Populate only facts actually present in the response, classify verifiable claims and their support, identify source context IDs, and set `explicitAbstention`. Use either documented human review or a clearly labeled model-assisted procedure; an LLM judgment is not objective ground truth.

After saving the reviewed file, run:

```bash
bun run evaluate:rag:answers -- \
  --input results/<rag-run-id>/rag/answers/answer-reviewed.json \
  --run-id <rag-run-id>
```

The scorer requires exactly trials `1`, `2`, and `3` for every case and reports deterministic fact checks, forbidden claims, claim-level groundedness, correct abstention, p95 TTFT, p95 completion, checksums, and completeness. Preserve the review procedure, judge identity or model, prompt checksum, raw judgments, retries, and limitations with the official evidence.

## Reports

Generate reports without rerunning experiments:

```bash
bun run report -- --run-id <run-id>
```

Outputs:

```text
reports/validation-summary.json
reports/validation-summary.md
reports/limitations.md
```

Every acceptance item is `pass`, `fail`, or `not-executed`. Missing artifacts are never converted into a passing result, failed samples are not deleted, MQTT remains explicit, and numerical fidelity is never described as biological validation.

## Key fixture expectations

| Scenario | Expected result |
| --- | --- |
| C1 | All normalized, temporal, and final scores are `100` |
| C2 | Gaussian reading scores `94.649987...`; oxygen `75.25`; final `94.123995...` |
| C3-25 | Temperature `pLow=0.25`; final `94.494504...` |
| C3-50 | Temperature `pLow=0.50`; final `88.989008...` |
| C4 | Oxygen unfavorable for exactly `21,600s`; oxygen temporal `75.25` |
| C5 | Simultaneous unfavorable values; final `14.634539...` |
| C6-A | 90-second cap; oxygen mean `10.9`, `pLow=0.9`, temporal `10.9` |
| C6-B | Oxygen coverage `0.6`, overall `0.9`, insufficient coverage, final `100` |

## Interpretation boundary

This workspace verifies implementation fidelity to the configured thesis model. It does not prove that the model is biologically valid, universally calibrated, or predictive of production outcomes. The symmetric oxygen function, Gaussian widths, threshold, weights, continuity cap, and coverage threshold remain explicit scientific limitations.
