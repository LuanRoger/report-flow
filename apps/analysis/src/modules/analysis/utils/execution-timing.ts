import type {
  AnalysisGenerationOptions,
  ExecutionTimings,
} from "../schemas/types";

const EXECUTION_PHASES = [
  "databaseQuery",
  "deterministicScore",
  "summary",
  "embedding",
  "persistence",
] as const;

type ExecutionPhase = (typeof EXECUTION_PHASES)[number];
type MonotonicClock = () => number;

export interface AnalysisExecutionTimer {
  finish: () => ExecutionTimings;
  measureAsync: <Result>(
    phase: ExecutionPhase,
    operation: () => Promise<Result>
  ) => Promise<Result>;
  measureSync: <Result>(
    phase: ExecutionPhase,
    operation: () => Result
  ) => Result;
}

const monotonicNow = (): number => performance.now();

const elapsedMilliseconds = (startedAt: number, endedAt: number): number =>
  Math.max(0, endedAt - startedAt);

export const createAnalysisExecutionTimer = (
  options: Pick<
    AnalysisGenerationOptions,
    "generateAiSummary" | "generateEmbedding"
  >,
  clock: MonotonicClock = monotonicNow
): AnalysisExecutionTimer => {
  const totalStartedAt = clock();
  const phaseDurations: Record<ExecutionPhase, number> = {
    databaseQuery: 0,
    deterministicScore: 0,
    embedding: 0,
    persistence: 0,
    summary: 0,
  };
  const includedPhases = {
    databaseQuery: true,
    deterministicScore: true,
    embedding: options.generateEmbedding,
    persistence: true,
    serialization: false,
    summary: options.generateAiSummary,
  } as const;

  const recordDuration = (phase: ExecutionPhase, startedAt: number): void => {
    phaseDurations[phase] += elapsedMilliseconds(startedAt, clock());
  };

  const ensurePhaseIsIncluded = (phase: ExecutionPhase): void => {
    if (!includedPhases[phase]) {
      throw new Error(`Cannot measure excluded execution phase: ${phase}`);
    }
  };

  return {
    finish: () => {
      const totalMs = elapsedMilliseconds(totalStartedAt, clock());
      let includedPhaseDurationMs = 0;

      for (const phase of EXECUTION_PHASES) {
        if (includedPhases[phase]) {
          includedPhaseDurationMs += phaseDurations[phase];
        }
      }

      return {
        databaseQueryMs: phaseDurations.databaseQuery,
        deterministicScoreMs: phaseDurations.deterministicScore,
        embeddingMs: phaseDurations.embedding,
        includedPhases: { ...includedPhases },
        overheadMs: Math.max(0, totalMs - includedPhaseDurationMs),
        persistenceMs: phaseDurations.persistence,
        summaryMs: phaseDurations.summary,
        totalMs,
      };
    },
    measureAsync: async (phase, operation) => {
      ensurePhaseIsIncluded(phase);
      const startedAt = clock();

      try {
        return await operation();
      } finally {
        recordDuration(phase, startedAt);
      }
    },
    measureSync: (phase, operation) => {
      ensurePhaseIsIncluded(phase);
      const startedAt = clock();

      try {
        return operation();
      } finally {
        recordDuration(phase, startedAt);
      }
    },
  };
};
