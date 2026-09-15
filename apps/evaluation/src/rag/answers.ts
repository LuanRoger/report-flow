import {
  type DistributionSummary,
  summarizeDistribution,
} from "../runtime/statistics.ts";
import { checksumJson } from "../shared/json.ts";
import { asArray, asRecord, asString } from "../shared/validation.ts";
import type { AnswerClaim, AnswerExecution, RagGoldCase } from "./types.ts";

const readNonnegativeNumber = (value: unknown, path: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${path} must be a nonnegative finite number`);
  }
  return value;
};

const readPositiveInteger = (value: unknown, path: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${path} must be a positive integer`);
  }
  return value as number;
};

const readBoolean = (value: unknown, path: string): boolean => {
  if (typeof value !== "boolean") {
    throw new Error(`${path} must be boolean`);
  }
  return value;
};

const parseClaim = (value: unknown, path: string): AnswerClaim => {
  const record = asRecord(value, path);
  return {
    sourceContextIds: asArray(
      record.sourceContextIds,
      `${path}.sourceContextIds`
    ).map((entry, index) =>
      asString(entry, `${path}.sourceContextIds[${index}]`)
    ),
    supported: readBoolean(record.supported, `${path}.supported`),
    text: asString(record.text, `${path}.text`),
    verifiable: readBoolean(record.verifiable, `${path}.verifiable`),
  };
};

const parseObservedFacts = (
  value: unknown,
  path: string
): Record<string, number | string> => {
  const record = asRecord(value, path);
  const facts: Record<string, number | string> = {};
  for (const [field, factValue] of Object.entries(record)) {
    if (
      typeof factValue !== "string" &&
      (typeof factValue !== "number" || !Number.isFinite(factValue))
    ) {
      throw new Error(`${path}.${field} must be a finite number or string`);
    }
    facts[field] = factValue;
  }
  return facts;
};

const parseExecution = (value: unknown, index: number): AnswerExecution => {
  const path = `answers.executions[${index}]`;
  const record = asRecord(value, path);
  const ttftMs = readNonnegativeNumber(record.ttftMs, `${path}.ttftMs`);
  const totalMs = readNonnegativeNumber(record.totalMs, `${path}.totalMs`);
  if (ttftMs > totalMs) {
    throw new Error(`${path}.ttftMs must not exceed totalMs`);
  }
  return {
    caseId: asString(record.caseId, `${path}.caseId`),
    claims: asArray(record.claims, `${path}.claims`).map((claim, claimIndex) =>
      parseClaim(claim, `${path}.claims[${claimIndex}]`)
    ),
    explicitAbstention: readBoolean(
      record.explicitAbstention,
      `${path}.explicitAbstention`
    ),
    observedFacts: parseObservedFacts(
      record.observedFacts,
      `${path}.observedFacts`
    ),
    responseText: asString(record.responseText, `${path}.responseText`),
    totalMs,
    trial: readPositiveInteger(record.trial, `${path}.trial`),
    ttftMs,
  };
};

export interface AnswerCapture {
  executions: AnswerExecution[];
  judge: {
    method: string;
    model: string | null;
    promptChecksum: string | null;
  };
  schemaVersion: 1;
}

export const parseAnswerCapture = (value: unknown): AnswerCapture => {
  const record = asRecord(value, "answers");
  if (record.schemaVersion !== 1) {
    throw new Error("answers.schemaVersion must equal 1");
  }
  const judge = asRecord(record.judge, "answers.judge");
  const optionalString = (entry: unknown, path: string): string | null =>
    entry === null ? null : asString(entry, path);
  return {
    executions: asArray(record.executions, "answers.executions").map(
      parseExecution
    ),
    judge: {
      method: asString(judge.method, "answers.judge.method"),
      model: optionalString(judge.model, "answers.judge.model"),
      promptChecksum: optionalString(
        judge.promptChecksum,
        "answers.judge.promptChecksum"
      ),
    },
    schemaVersion: 1,
  };
};

interface FactScore {
  absoluteError: number | null;
  actual: number | string | null;
  expected: number | string;
  field: string;
  passed: boolean;
  tolerance: number | null;
}

interface AnswerExecutionScore {
  caseId: string;
  correctAbstention: boolean | null;
  factScores: FactScore[];
  factualAccuracyPassed: boolean | null;
  forbiddenClaimsFound: string[];
  groundedClaimCount: number;
  groundedness: number | null;
  trial: number;
  verifiableClaimCount: number;
}

const scoreFact = (
  observedFacts: Readonly<Record<string, number | string>>,
  expected: RagGoldCase["expectedFacts"][number]
): FactScore => {
  const actual = observedFacts[expected.field] ?? null;
  if (typeof expected.expectedValue === "number") {
    const tolerance = expected.tolerance ?? 0;
    const absoluteError =
      typeof actual === "number"
        ? Math.abs(actual - expected.expectedValue)
        : null;
    return {
      absoluteError,
      actual,
      expected: expected.expectedValue,
      field: expected.field,
      passed: absoluteError !== null && absoluteError <= tolerance,
      tolerance,
    };
  }
  return {
    absoluteError: null,
    actual,
    expected: expected.expectedValue,
    field: expected.field,
    passed:
      typeof actual === "string" &&
      actual.trim().toLocaleLowerCase("en") ===
        expected.expectedValue.trim().toLocaleLowerCase("en"),
    tolerance: null,
  };
};

const scoreExecution = (
  execution: AnswerExecution,
  goldCase: RagGoldCase
): AnswerExecutionScore => {
  const factScores = goldCase.mustAbstain
    ? []
    : goldCase.expectedFacts.map((expected) =>
        scoreFact(execution.observedFacts, expected)
      );
  const verifiableClaims = execution.claims.filter(
    ({ verifiable }) => verifiable
  );
  const groundedClaimCount = verifiableClaims.filter(
    ({ supported }) => supported
  ).length;
  const lowerResponse = execution.responseText.toLocaleLowerCase("en");
  const forbiddenClaimsFound = goldCase.forbiddenUnsupportedClaims.filter(
    (claim) => lowerResponse.includes(claim.toLocaleLowerCase("en"))
  );
  return {
    caseId: execution.caseId,
    correctAbstention: goldCase.mustAbstain
      ? execution.explicitAbstention && forbiddenClaimsFound.length === 0
      : null,
    factScores,
    factualAccuracyPassed: goldCase.mustAbstain
      ? null
      : factScores.every(({ passed }) => passed) &&
        forbiddenClaimsFound.length === 0,
    forbiddenClaimsFound,
    groundedClaimCount,
    groundedness:
      verifiableClaims.length === 0
        ? null
        : groundedClaimCount / verifiableClaims.length,
    trial: execution.trial,
    verifiableClaimCount: verifiableClaims.length,
  };
};

export interface AnswerScoreResult {
  abstention: {
    correct: number;
    executions: number;
    passed: boolean;
    rate: number | null;
    target: 1;
  };
  captureChecksum: string;
  completeThreeTrialsPerCase: boolean;
  executions: AnswerExecutionScore[];
  factualAccuracy: {
    correct: number;
    executions: number;
    passed: boolean;
    rate: number | null;
    target: 0.9;
  };
  goldChecksum: string;
  groundedness: {
    passed: boolean;
    rate: number | null;
    supportedClaims: number;
    target: 0.9;
    verifiableClaims: number;
  };
  judge: AnswerCapture["judge"];
  latency: {
    totalMs: DistributionSummary;
    totalP95TargetMs: 10_000;
    totalTargetPassed: boolean;
    ttftMs: DistributionSummary;
    ttftP95TargetMs: 3000;
    ttftTargetPassed: boolean;
  };
  passed: boolean;
  schemaVersion: 1;
}

export const scoreAnswerCapture = (
  capture: AnswerCapture,
  goldCases: readonly RagGoldCase[]
): AnswerScoreResult => {
  const caseById = new Map(
    goldCases.map((goldCase) => [goldCase.id, goldCase])
  );
  const executions = capture.executions.map((execution) => {
    const goldCase = caseById.get(execution.caseId);
    if (!goldCase) {
      throw new Error(
        `Unknown RAG case in answer capture: ${execution.caseId}`
      );
    }
    return scoreExecution(execution, goldCase);
  });
  const answerable = executions.filter(
    (execution) => execution.factualAccuracyPassed !== null
  );
  const factualCorrect = answerable.filter(
    ({ factualAccuracyPassed }) => factualAccuracyPassed
  ).length;
  const factualRate =
    answerable.length === 0 ? null : factualCorrect / answerable.length;
  const insufficient = executions.filter(
    (execution) => execution.correctAbstention !== null
  );
  const abstentionCorrect = insufficient.filter(
    ({ correctAbstention }) => correctAbstention
  ).length;
  const abstentionRate =
    insufficient.length === 0 ? null : abstentionCorrect / insufficient.length;
  const verifiableClaims = executions.reduce(
    (sum, execution) => sum + execution.verifiableClaimCount,
    0
  );
  const supportedClaims = executions.reduce(
    (sum, execution) => sum + execution.groundedClaimCount,
    0
  );
  const groundednessRate =
    verifiableClaims === 0 ? null : supportedClaims / verifiableClaims;
  const completeThreeTrialsPerCase = goldCases.every((goldCase) => {
    const trials = executions
      .filter(({ caseId }) => caseId === goldCase.id)
      .map(({ trial }) => trial);
    return (
      trials.length === 3 &&
      new Set(trials).size === 3 &&
      trials.every((trial) => trial >= 1 && trial <= 3)
    );
  });
  const ttftMs = summarizeDistribution(
    capture.executions.map((execution) => execution.ttftMs)
  );
  const totalMs = summarizeDistribution(
    capture.executions.map((execution) => execution.totalMs)
  );
  const factualPassed = factualRate !== null && factualRate >= 0.9;
  const abstentionPassed = abstentionRate === 1;
  const groundednessPassed =
    groundednessRate !== null && groundednessRate >= 0.9;
  const ttftTargetPassed = ttftMs.p95 <= 3000;
  const totalTargetPassed = totalMs.p95 <= 10_000;

  return {
    abstention: {
      correct: abstentionCorrect,
      executions: insufficient.length,
      passed: abstentionPassed,
      rate: abstentionRate,
      target: 1,
    },
    captureChecksum: checksumJson(capture),
    completeThreeTrialsPerCase,
    executions,
    factualAccuracy: {
      correct: factualCorrect,
      executions: answerable.length,
      passed: factualPassed,
      rate: factualRate,
      target: 0.9,
    },
    goldChecksum: checksumJson(goldCases),
    groundedness: {
      passed: groundednessPassed,
      rate: groundednessRate,
      supportedClaims,
      target: 0.9,
      verifiableClaims,
    },
    judge: capture.judge,
    latency: {
      totalMs,
      totalP95TargetMs: 10_000,
      totalTargetPassed,
      ttftMs,
      ttftP95TargetMs: 3000,
      ttftTargetPassed,
    },
    passed:
      completeThreeTrialsPerCase &&
      factualPassed &&
      abstentionPassed &&
      groundednessPassed &&
      ttftTargetPassed &&
      totalTargetPassed,
    schemaVersion: 1,
  };
};
