# Evaluation execution runbook

This runbook turns the evaluation design in the repository-level `EVALUATION.md` into executable workflows. Run commands from `apps/evaluation` unless a different directory is shown.

## 1. What can be evaluated

| Area | Main commands | External cost | Destructive |
| --- | --- | --- | --- |
| Scoring oracle | `oracle` | No | No |
| HTTP ingestion and C7 | `validate:ingestion` | No | No |
| Analysis correctness | `validate:analysis` | No when AI controls are disabled | No |
| Performance preload | `preload` | No | Yes |
| Sequential timing | `benchmark:sequential` | No when AI controls are disabled | No |
| TimescaleDB plans | `benchmark:plans` | No | No |
| Concurrent HTTP load | `benchmark:k6:*` | No when analysis AI controls are disabled | Writes measurements/results |
| RAG knowledge base | `prepare:rag` | Nine embedding calls | Yes |
| RAG retrieval | `capture:rag:retrieval` | 120 query-embedding calls | No |
| RAG answers | `capture:rag:answers` | 120 query embeddings and 120 chat completions | Clears evaluation chat history |
| RAG scoring | `evaluate:rag:*` | No | No |
| Report generation | `report` | No | No |

MQTT remains deferred and must be reported as `not-executed`.

## 2. Provision a dedicated database

Use a disposable database whose name begins with `report_flow_eval`, for example:

```text
postgresql://postgres:admin@localhost:5432/report_flow_evaluation
```

The destructive guards reject the generic `postgres` database. The PostgreSQL server must provide TimescaleDB and pgvector, and the migration role must be allowed to create those extensions.

Apply the current initial migration to the dedicated database:

```bash
cd packages/database
bun run db:migrate
```

If the initial migration was applied before the current one-embedding-per-analysis constraint was added, recreate the disposable database and apply the current migration again. Updating the tracked initial migration does not retroactively alter an already migrated database.

## 3. Configure each process

The ingest service, analysis service, and evaluator must all point to the same database.

### Ingest service terminal

```text
DATABASE_URL=postgresql://.../report_flow_evaluation
API_KEY=<ingest-key>
```

### Analysis service terminal

```text
DATABASE_URL=postgresql://.../report_flow_evaluation
API_KEY=<analysis-key>
OPENAI_API_KEY=<required only for embedding or live RAG stages>
```

### Evaluation terminal

An untracked `apps/evaluation/.env` can contain:

```dotenv
EVALUATION_DATABASE_URL=postgresql://.../report_flow_evaluation
INGEST_API_URL=http://localhost:3000
INGEST_API_KEY=<ingest-key>
ANALYSIS_API_URL=http://localhost:3001
ANALYSIS_API_KEY=<analysis-key>
OPENAI_API_KEY=<required only by prepare:rag>
```

Bun loads this file for the evaluation package scripts. Do not commit it.

### k6 variable names

k6 uses `INGEST_BASE_URL` and `ANALYSIS_BASE_URL`, not the evaluator's `*_API_URL` names. Add the applicable k6 variables to the same untracked evaluation `.env` when using the Bun k6 launchers.

## 4. Install and validate tooling

From the repository root:

```bash
bun install
bun run build
bun run check
```

From `apps/evaluation`:

```bash
bun run test
bun run typecheck
bun run check
```

k6 is an external executable:

```bash
k6 version
```

## 5. Start the services

In separate configured terminals:

```bash
cd apps/ingest
bun run dev
```

```bash
cd apps/analysis
bun run dev
```

Do not start these services against a different database from `EVALUATION_DATABASE_URL`.

## 6. Run IDs and immutable artifacts

Use one run ID per independent dataset/profile:

```text
YYYYMMDD-HHMMSSZ-<short-commit>-<profile>
```

Examples:

```text
20260918-140000Z-a1b2c3-correctness
20260918-150000Z-a1b2c3-1p30d
20260918-170000Z-a1b2c3-rag
```

Preflight creates the run directory once. Stage files are created exclusively and are not overwritten. `manifest.json` is the exception: preparation/preload events append to it. If a stage must be repeated after writing its artifact, use a new run ID. Generate the report last because report files are also exclusive.

## 7. Preflight

Official run:

```bash
bun run preflight -- \
  --run-id <run-id> \
  --run-class official
```

Exploratory database-only run:

```bash
bun run preflight -- \
  --run-id <run-id> \
  --run-class exploratory \
  --skip-service-checks
```

Do not use `--skip-service-checks` for official evidence.

## 8. Deterministic correctness evaluation

Use an empty evaluation database and one correctness run ID. Do not run performance or RAG preload first because those commands reset or occupy the database.

```bash
bun run oracle -- \
  --scenarios all \
  --run-id <correctness-run-id>
```

```bash
bun run validate:ingestion -- \
  --scenarios all \
  --run-id <correctness-run-id>
```

```bash
bun run validate:analysis -- \
  --scenarios C1,C2,C3-25,C3-50,C4,C5,C6-A,C6-B \
  --run-id <correctness-run-id>
```

The analysis validator disables both summaries and embeddings. C6-A uses a 90-second continuity cap; the other scenarios use 20 seconds. Acceptance requires score MAE at most `0.01` and maximum absolute error at most `0.05`, together with structural and coverage checks.

## 9. Performance evaluation

Use a separate run ID for each dataset profile. A later preload resets all application tables.

### Seven-day profile

```bash
bun run preload -- \
  --dataset 1-pond-7-days \
  --run-id <1p7d-run-id> \
  --confirm-reset
```

```bash
bun run benchmark:sequential -- \
  --windows 7d \
  --pond-id 1 \
  --run-id <1p7d-run-id>
```

```bash
bun run benchmark:plans -- \
  --windows 7d \
  --pond-id 1 \
  --run-id <1p7d-run-id>
```

### Thirty-day profile and both primary windows

```bash
bun run preload -- \
  --dataset 1-pond-30-days \
  --run-id <1p30d-run-id> \
  --confirm-reset
```

```bash
bun run benchmark:sequential -- \
  --matrix primary \
  --pond-id 1 \
  --run-id <1p30d-run-id>
```

```bash
bun run benchmark:plans -- \
  --windows 7d,30d \
  --pond-id 1 \
  --run-id <1p30d-run-id>
```

Repeat with the `10-ponds-*` and `50-ponds-*` profiles. Benchmarking pond 1 while increasing background pond count measures the selected query against a larger hypertable. Benchmark all ponds only if that is a separately documented experiment.

The `50-ponds-30-days` profile contains `1,728,000` rows. Performance analysis uses the five-minute preload cadence with a 300-second continuity cap. Estimate disk and runtime with smaller datasets first.

## 10. k6 concurrent load

The package scripts use a Bun launcher. Bun loads `apps/evaluation/.env`, inherits it when spawning k6, validates the selected profile, and propagates k6's exit code.

Direct `k6 run` still does not parse `.env` files.

### Required analysis oracle scores

Before analysis load, run `benchmark:sequential` for every target pond and read `expectedFinalScore` from the generated artifact. Preserve the same positional order:

```dotenv
K6_POND_IDS=1,2
K6_EXPECTED_FINAL_SCORES=94.123996,94.087421
```

The dates must match the active preload. For the tracked 30-day profile:

```dotenv
K6_START_DATE=2026-02-01T00:00:00.000Z
K6_END_DATE=2026-03-03T00:00:00.000Z
```

Its trailing seven-day window is:

```dotenv
K6_START_DATE=2026-02-24T00:00:00.000Z
K6_END_DATE=2026-03-03T00:00:00.000Z
```

Never assume the score is `100` for the jittered performance preload.

### Run and export

Example evaluation `.env` values:

```dotenv
K6_ALLOW_LOAD_TEST=true
K6_TARGET_HONORS_EMBEDDING_OPT_OUT=true
K6_RUN_ID=<run-id>
K6_REPETITION=1
K6_TARGET_RPS=5
ANALYSIS_BASE_URL=http://localhost:3001
ANALYSIS_API_KEY=<analysis-key>
K6_POND_IDS=1
K6_EXPECTED_FINAL_SCORES=<verified-oracle-score>
K6_START_DATE=2026-02-24T00:00:00.000Z
K6_END_DATE=2026-03-03T00:00:00.000Z
```

Run with both a compact summary and raw metric samples:

```bash
bun run benchmark:k6:analysis:7d -- \
  --summary-export=results/<run-id>/performance/k6/analysis-7d-5rps-r1-summary.json \
  --out json=results/<run-id>/performance/k6/analysis-7d-5rps-r1-metrics.json
```

Profiles:

```bash
bun run benchmark:k6:ingestion -- <k6-options>
bun run benchmark:k6:analysis:7d -- <k6-options>
bun run benchmark:k6:analysis:30d -- <k6-options>
```

Run ingestion at `10`, `50`, and `100` RPS and each analysis window at `1`, `5`, and `10` RPS. Run every level three times. Every repetition needs a unique output filename.

Ingestion repetitions must use a reset database, different pond/cycle identities, or non-overlapping time ranges; otherwise the measurement identity constraint correctly rejects duplicates. The scripts do not create ponds/cycles or reset the database.

The current report generator does not import arbitrary k6 summaries or resource-monitoring files. Preserve them as official raw evidence and report them separately until an importer is added.

## 11. RAG evaluation

RAG uses a dedicated run and database state. Do not combine it with correctness or performance preloads because recency retrieval would include unrelated analyses.

### 11.1 Controlled knowledge-base preparation

The frozen catalog is `config/rag/controlled-contexts.json`. It creates:

- one controlled pond;
- nine cycles and analytical contexts;
- `2,488,387` measurements;
- nine production analysis results verified against the independent oracle;
- nine approved context documents;
- nine 1,024-dimensional `text-embedding-3-small` embeddings;
- a stable symbolic-context-to-analysis-ID map.

Preparation truncates all application tables, calls the analysis service sequentially with summaries and embeddings disabled, validates each result, and only then creates the approved embeddings directly from the evaluator.

It makes nine paid embedding calls and requires explicit authorization:

```bash
bun run prepare:rag -- \
  --run-id <rag-run-id> \
  --confirm-reset \
  --allow-paid-embeddings
```

Artifacts:

```text
results/<rag-run-id>/rag/preparation/controlled-kb.json
results/<rag-run-id>/rag/preparation/context-map.json
```

Do not continue if preparation fails. Do not hand-edit the generated map.

### 11.2 Retrieval capture

The analysis service exposes an authenticated retrieval-only endpoint:

```text
POST /chats/ponds/:pondId/retrieval
```

It runs the same hybrid retriever used by chat and returns only candidate IDs/ranks/similarities, effective filters, and monotonic embedding/retrieval timings. It does not generate an answer or expose context text.

The capture command runs all 40 cases three times, for 120 paid query-embedding calls:

```bash
bun run capture:rag:retrieval -- \
  --run-id <rag-run-id> \
  --allow-paid-models
```

It writes raw NDJSON, a complete capture, and a Recall@5 score. The acceptance target is mean Recall@5 of at least `0.90` across the 90 answerable executions.

### 11.3 Raw answer capture

The answer command runs 120 live chat completions sequentially. Before every trial it clears the controlled pond's chat history, preventing previous answers from contaminating retrieval or model history.

```bash
bun run capture:rag:answers -- \
  --run-id <rag-run-id> \
  --allow-paid-models
```

It preserves:

- every timestamped SSE event;
- retrieved source labels and titles;
- inline citations;
- response text;
- response-header, first-stream, first-provider, first-text, and total timing;
- clear/request/stream failures.

Artifacts:

```text
results/<rag-run-id>/rag/answers/raw-capture.ndjson
results/<rag-run-id>/rag/answers/answer-review-template.json
```

The template is deliberately marked `UNREVIEWED`. It does not fabricate claims, observed facts, or abstention decisions.

### 11.4 Human or documented model-assisted review

For each execution in the review template:

1. read the captured answer;
2. compare claims with the retrieved approved contexts;
3. populate `observedFacts` only with facts actually present in the answer;
4. populate claim objects with `verifiable`, `supported`, and `sourceContextIds`;
5. set `explicitAbstention` to a boolean;
6. remove or update the `UNREVIEWED` markers;
7. preserve reviewer identity/procedure outside sensitive public artifacts.

If an LLM judge is used, record its model, prompt checksum, settings, raw judgments, retries, and limitations. Report it as model-assisted, not objective ground truth.

Score the reviewed file:

```bash
bun run evaluate:rag:answers -- \
  --input results/<rag-run-id>/rag/answers/answer-reviewed.json \
  --run-id <rag-run-id>
```

Targets:

```text
factual accuracy >= 90%
groundedness >= 90%
correct abstention = 100%
p95 time to first text <= 3 seconds
p95 total completion <= 10 seconds
```

### 11.5 Score an externally produced retrieval capture

The generic scorer remains available:

```bash
bun run evaluate:rag:retrieval -- \
  --input <retrieval-capture.json> \
  --run-id <rag-run-id>
```

A complete retrieval capture must contain exactly trials `1`, `2`, and `3` for every gold case and must use `topK = 5`.

## 12. Reports

Generate reports only after all intended stage artifacts are present:

```bash
bun run report -- --run-id <run-id>
```

Outputs:

```text
reports/validation-summary.json
reports/validation-summary.md
reports/limitations.md
```

Missing evidence remains `not-executed`; it is never converted into a pass. MQTT remains explicit. The report validates implementation fidelity to the configured thesis model, not biological validity.

## 13. Official-run checklist

- Use a clean Git tree and an official preflight.
- Record the implementation commit and database/runtime versions.
- Use a dedicated `report_flow_eval*` database.
- Verify every service uses that database.
- Never weaken destructive or remote-target guards.
- Keep AI controls disabled outside explicitly approved RAG stages.
- Record every paid call, provider failure, retry, and rate limit.
- Keep raw failed samples.
- Generate reports last.
- Archive each complete run directory and calculate an archive checksum.
- Never commit credentials, raw private pond data, or provider-sensitive artifacts.
