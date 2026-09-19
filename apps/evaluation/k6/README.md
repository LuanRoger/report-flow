# k6 load profiles

These profiles implement the manual-ingestion, seven-day analysis, and thirty-day analysis load evaluations from the repository `EVALUATION.md` and `SPECIFICATIONS.md`.

k6 is an external executable. Install it separately and confirm that `k6 version` succeeds. Run the package commands from `apps/evaluation`; they invoke k6 through Bun and do not install it.

## Safety gates

Every profile aborts before sending requests unless:

- `K6_ALLOW_LOAD_TEST=true`;
- `K6_RUN_ID` is non-empty;
- the profile-specific bearer key is configured;
- a non-loopback target also has `K6_ALLOW_REMOTE_TARGET=true`.

Analysis additionally requires:

- `K6_TARGET_HONORS_EMBEDDING_OPT_OUT=true` after verifying the deployed service honors `generateEmbedding: false`;
- one independently calculated value in `K6_EXPECTED_FINAL_SCORES` for each pond in `K6_POND_IDS`.

Every analysis request sends `generateAiSummary: false` and `generateEmbedding: false`. Do not set the opt-out attestation against an old or unverified deployment.

The scripts never create ponds or cycles and never reset the database. Use only disposable evaluation data.

## `.env` behavior

The package commands use `src/k6/runner.ts`. Bun loads the untracked `apps/evaluation/.env`, and the launcher passes the resulting environment to k6:

```bash
bun run benchmark:k6:ingestion
bun run benchmark:k6:analysis:7d
bun run benchmark:k6:analysis:30d
```

Direct execution such as `k6 run k6/analysis-7d.js` does **not** load `.env`. If invoking k6 directly, export every required variable through your shell or another supported environment mechanism.

k6 uses `INGEST_BASE_URL` and `ANALYSIS_BASE_URL`, not the evaluator CLI's `INGEST_API_URL` and `ANALYSIS_API_URL` names.

Never commit `.env`, bearer keys, or authorization headers.

## Profiles and load matrix

| Setting | Ingestion | Analysis |
| --- | ---: | ---: |
| Primary measured target | 50 RPS | 10 RPS |
| Full measured matrix | 10, 50, 100 RPS | 1, 5, 10 RPS |
| Warm-up default | 1 minute | 1 minute |
| Measured default | 5 minutes | 5 minutes |
| p95 target | 500 ms | 2,000 ms |
| Repetitions | 3 per level | 3 per level and window |

Warm-up and measurement are separate `constant-arrival-rate` scenarios. Thresholds apply to measurement samples; dropped iterations in either phase fail the run.

Override the measured level with `K6_TARGET_RPS`. Set `K6_REPETITION` to `1`, `2`, or `3` so every artifact can be traced to one repetition.

## Required dates for tracked performance preloads

Dates must match the active preload exactly. For `1-pond-30-days` and the other tracked 30-day datasets:

```dotenv
K6_START_DATE=2026-02-01T00:00:00.000Z
K6_END_DATE=2026-03-03T00:00:00.000Z
```

For the trailing seven-day window over that same preload:

```dotenv
K6_START_DATE=2026-02-24T00:00:00.000Z
K6_END_DATE=2026-03-03T00:00:00.000Z
```

The scripts require an exact 7- or 30-day span. Always set these values explicitly rather than relying on script defaults when collecting official evidence.

## Obtain `K6_EXPECTED_FINAL_SCORES`

Never assume a jittered performance dataset has a final score of `100`.

After preloading the exact database state used for load testing, run the sequential benchmark for every target pond:

```bash
bun run benchmark:sequential -- \
  --matrix primary \
  --pond-id 1 \
  --run-id <run-id>
```

Read `expectedFinalScore` from the applicable case in:

```text
results/<run-id>/performance/sequential/pond-<pond-id>-7-30d.json
```

Use the same positional order as `K6_POND_IDS`:

```dotenv
K6_POND_IDS=1,2
K6_EXPECTED_FINAL_SCORES=94.123996,94.087421
```

The sequential artifact is the evidence for these values. Preserve it with the k6 results. If the dataset, dates, pond IDs, continuity configuration, or scoring implementation changes, regenerate the expected scores.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `K6_ALLOW_LOAD_TEST` | unset | Must equal `true` |
| `K6_ALLOW_REMOTE_TARGET` | unset | Required for non-loopback targets |
| `K6_RUN_ID` | unset | Required evaluation run identifier |
| `K6_REPETITION` | `1` | Repetition tag |
| `K6_TARGET_RPS` | profile default | Measured constant arrival rate |
| `K6_WARMUP_RPS` | measured target | Warm-up arrival rate |
| `K6_DURATION` | `5m` | Measured duration |
| `K6_WARMUP_DURATION` | `1m` | Warm-up duration |
| `K6_REQUEST_TIMEOUT` | `30s` | Request timeout |
| `K6_PRE_ALLOCATED_VUS` | 50 ingest / 20 analysis | Initial arrival-rate VUs |
| `K6_MAX_VUS` | 200 ingest / 100 analysis | Maximum arrival-rate VUs |
| `K6_P95_TARGET_MS` | 500 ingest / 2000 analysis | Measurement p95 threshold |
| `K6_POND_IDS` | `1` | Comma-separated positive pond IDs |
| `K6_CYCLE_IDS` | `1` | Ingestion cycle IDs paired with pond IDs |
| `K6_EXPECTED_FINAL_SCORES` | unset | Analysis oracle scores paired with pond IDs |
| `K6_SCORE_TOLERANCE` | `0.05` | Maximum absolute score error |
| `K6_START_DATE` | script default | Canonical UTC inclusive start |
| `K6_END_DATE` | script default | Canonical UTC exclusive end |
| `INGEST_BASE_URL` | `http://localhost:3000` | Ingestion service URL |
| `INGEST_API_KEY` | unset | Ingestion bearer key |
| `ANALYSIS_BASE_URL` | `http://localhost:3001` | Analysis service URL |
| `ANALYSIS_API_KEY` | unset | Analysis bearer key |
| `K6_TARGET_HONORS_EMBEDDING_OPT_OUT` | unset | Required analysis safety attestation |

Duration values accept one positive integer followed by `ms`, `s`, `m`, or `h`.

## Example analysis configuration

Place values like these in the untracked `apps/evaluation/.env`:

```dotenv
K6_ALLOW_LOAD_TEST=true
K6_TARGET_HONORS_EMBEDDING_OPT_OUT=true
K6_RUN_ID=20260918-150000Z-a1b2c3-analysis-7d
K6_REPETITION=1
K6_TARGET_RPS=5
K6_POND_IDS=1
K6_EXPECTED_FINAL_SCORES=<value-from-sequential-artifact>
K6_START_DATE=2026-02-24T00:00:00.000Z
K6_END_DATE=2026-03-03T00:00:00.000Z
ANALYSIS_BASE_URL=http://localhost:3001
ANALYSIS_API_KEY=<analysis-key>
```

Run from `apps/evaluation` and export both a compact summary and raw metric samples:

```bash
bun run benchmark:k6:analysis:7d -- \
  --summary-export=results/<run-id>/performance/k6/analysis-7d-5rps-r1-summary.json \
  --out json=results/<run-id>/performance/k6/analysis-7d-5rps-r1-metrics.json
```

Forwarded k6 arguments must follow `--`. The launcher places them before the fixed script path and propagates k6's exit code.

Use unique output names for every profile, level, and repetition. k6 may overwrite an existing export path; the launcher does not provide the evaluator artifact store's exclusive-write protection.

## Ingestion identity and repetitions

`ingestion.js` uses the scenario-global row index. Parameter, pond/cycle pair, and timestamp selection are deterministic:

```text
collection_index = floor(row_index / 4)
timestamp_index = floor(collection_index / target_count)
timestamp = start_epoch_ms + timestamp_index * 10_000
```

All four parameter rows at a collection instant share a timestamp. The endpoint accepts one parameter per request, so RPS is parameter-row request rate, not pond collection rate.

A repeated ingestion run over the same pond, cycle, parameter, and timestamp range correctly collides with the measurement identity constraint. Between repetitions, reset the disposable database, use different pond/cycle identities, or use non-overlapping time ranges. Preserve the chosen method in the run manifest.

## Emitted metrics

In addition to standard k6 HTTP metrics:

- ingestion emits attempted/submitted/persisted/rejected row metrics, status distribution, failure rate, and persistence-confirmation latency;
- analysis emits attempted requests, persisted result rows, represented measurements, status and contract failures, oracle mismatches, total latency, final score, and coverage.

Analysis checks status, pond, exact half-open period, score range, independent-oracle tolerance, and absence of an AI summary.

Client timings do not provide database query time, scoring time, connection-pool wait, CPU, memory, disk, or lock metrics. Collect synchronized service, database, and host telemetry separately.

## Result handling

Run every matrix level three times and retain all failures, dropped iterations, summaries, and raw samples. Do not discard a failed repetition and renumber a replacement.

The current report generator does not import arbitrary k6 summary, raw metric, or resource-monitoring files. Preserve them as official raw evidence and summarize them separately until an importer is implemented.
