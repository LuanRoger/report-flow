# RAG gold dataset

`rag-cases.json` contains exactly 40 tracked cases required by `EVALUATION.md`:

- 10 direct questions;
- 10 same-pond, different-period comparisons;
- 10 unfavorable-event or evidence-bounded action questions;
- 10 insufficient-information questions.

`rag-cases.schema.json` is a JSON Schema 2020-12 document that enforces the case shape, exact total, exact category counts, symbolic context-ID format, and abstention policy.

## Controlled fixture identity

Every case uses logical fixture `pondId: 1`. This is a dataset alias, not an observed production pond ID. Materialization may rewrite that field to the positive ID allocated to the controlled evaluation pond, but it must preserve one pond across both contexts in every comparison case because advisor retrieval is pond-scoped.

`expectedContextIds` are stable symbolic source keys such as `ctx:c3-25:pond-001:7d:p03`. They are deliberately not database analysis IDs and must never be replaced in the tracked gold file with identifiers observed from production.

The controlled context catalog is:

| Symbol | Scenario and half-open period |
|---|---|
| `ctx:c1:pond-001:7d:p01` | C1, `[2026-01-01, 2026-01-08)` |
| `ctx:c2:pond-001:7d:p02` | C2, `[2026-01-08, 2026-01-15)` |
| `ctx:c3-25:pond-001:7d:p03` | C3-25, `[2026-01-15, 2026-01-22)` |
| `ctx:c3-50:pond-001:7d:p04` | C3-50, `[2026-01-22, 2026-01-29)` |
| `ctx:c4:pond-001:7d:p05` | C4, `[2026-02-01, 2026-02-08)` with a six-hour oxygen event |
| `ctx:c5:pond-001:7d:p06` | C5, `[2026-02-08, 2026-02-15)` |
| `ctx:c6-a:pond-001:100s:p07` | C6-A, `[2026-02-15T00:00:00Z, 00:01:40Z)` |
| `ctx:c6-b:pond-001:100s:p08` | C6-B, `[2026-02-16T00:00:00Z, 00:01:40Z)` |
| `ctx:c4:pond-001:30d:p09` | C4, `[2026-03-01, 2026-03-31)` with the same six-hour event duration |

Scores and tolerances are independent expectations from the frozen C1-C6 equations, not values copied from production responses. In particular, the C4 seven-day and thirty-day contexts intentionally differ because the same six-hour event occupies different proportions of each requested period.

## Materialization

Before retrieval evaluation:

1. seed the deterministic C1-C6 periods for one disposable pond and its controlled cycle(s);
2. run deterministic analyses with summary and embedding generation disabled while verifying the score against the independent oracle;
3. create the approved analytical contexts and embeddings as a separate, recorded preparation step;
4. write an **untracked run artifact** mapping each symbolic context key to its actual analysis ID/source key and mapping logical `pondId: 1` to the disposable database pond ID;
5. verify every mapped context's scenario, pond, period, coverage, and expected facts before running retrieval;
6. keep retrieval filters pond-scoped and use `topK = 5` unless the evaluation configuration explicitly creates a new version.

Do not materialize a symbol from a merely similar production record. If a controlled context is absent or fails oracle verification, fail preparation rather than weakening the gold case.

Insufficient cases may name a nearest in-scope context so the evaluator can verify grounded abstention. Recall@5 is calculated only for answerable cases. An empty context list means the requested comparison is outside the authorized pond scope.

Action cases permit only conservative follow-up that follows from the analytical evidence (for example, verify a reading, inspect the affected process, or restore collection). They do not encode treatment doses, causal diagnoses, guaranteed outcomes, or biological validation claims.

## Validation commands

From `apps/evaluation/gold`, syntax-check both JSON files with an available Python installation:

```bash
python -m json.tool rag-cases.schema.json > /dev/null
python -m json.tool rag-cases.json > /dev/null
```

Validate the instance with any JSON Schema 2020-12 validator, for example an independently installed AJV CLI:

```bash
ajv validate --spec=draft2020 -s rag-cases.schema.json -d rag-cases.json
```

No validator dependency is added to this repository by this evaluation slice.
