export const PARAMETER_CODES = [
  "temperature",
  "ph",
  "salinity",
  "dissolvedOxygen",
] as const;

export type ParameterCode = (typeof PARAMETER_CODES)[number];

export type ParameterRecord<Value> = Record<ParameterCode, Value>;

export const SCORING_SCENARIO_IDS = [
  "C1",
  "C2",
  "C3-25",
  "C3-50",
  "C4",
  "C5",
  "C6-A",
  "C6-B",
] as const;

export type ScoringScenarioId = (typeof SCORING_SCENARIO_IDS)[number];

export type SourceType = "manual" | "sensor";

export interface GaussianNormalizationConfig {
  kind: "gaussian";
  mu: number;
  sigma: number;
}

export interface TriangleNormalizationConfig {
  halfWidth: number;
  kind: "symmetricTriangle";
  reference: number;
}

export type NormalizationConfig =
  | GaussianNormalizationConfig
  | TriangleNormalizationConfig;

export interface ModelConfig {
  collection: {
    intervalSeconds: number;
    windowConvention: "[start,end)";
    timezone: "UTC";
  };
  formulas: {
    gaussian: string;
    dissolvedOxygen: string;
    pLow: string;
    pondScore: string;
  };
  limitations: string[];
  modelVersion: string;
  normalization: ParameterRecord<NormalizationConfig>;
  runtimeParameterCodes: ParameterCode[];
  schemaVersion: 1;
  scoreRange: {
    minimum: number;
    maximum: number;
  };
  temporal: {
    formula: string;
    defaultMaximumContinuityGapSeconds: number;
    minimumCoveragePerParameter: number;
    sufficiencyRule: "allParameters";
    finalScoreAvailabilityRule: "allParametersHaveTemporalScores";
    missingDataTreatment: "excludeFromScoreDenominators";
    thresholdComparison: "score < unfavorableThreshold";
  };
  unfavorableThreshold: number;
  units: ParameterRecord<string>;
  weightSumTolerance: number;
  weights: ParameterRecord<number>;
}

export interface ScenarioSegment {
  startOffsetSeconds: number;
  value: number;
}

export interface ExplicitScenarioReading {
  offsetSeconds: number;
  value: number;
}

export interface CadenceScenarioSeries {
  mode: "cadence";
  segments: ScenarioSegment[];
}

export interface ExplicitScenarioSeries {
  mode: "explicit";
  readings: ExplicitScenarioReading[];
}

export type ScenarioSeries = CadenceScenarioSeries | ExplicitScenarioSeries;

export interface ScoringScenarioConfig {
  cycleId: number;
  description: string;
  documentedCadenceException?: string;
  end: string;
  id: ScoringScenarioId;
  intervalSeconds: number;
  kind: "scoring";
  maximumContinuityGapSeconds?: number;
  pondId: number;
  schemaVersion: 1;
  seed: number;
  series: ParameterRecord<ScenarioSeries>;
  sourceType: SourceType;
  start: string;
}

export type InvalidFixtureCategory =
  | "schema"
  | "transport"
  | "relationship"
  | "identity";

export interface InvalidPayloadFixture {
  body?: Record<string, unknown>;
  category: InvalidFixtureCategory;
  expectedPersistenceDelta: number;
  expectedSecondRequest?: string;
  id: string;
  rawBody?: string;
  requests?: Record<string, unknown>[];
  setup?: Record<string, unknown>;
}

export interface AcceptedPayloadControl {
  body: Record<string, unknown>;
  expectedPersistenceDelta: number;
  id: string;
}

export interface InvalidPayloadConfig {
  acceptedControls: AcceptedPayloadControl[];
  cases: InvalidPayloadFixture[];
  description: string;
  endpoint: string;
  id: "C7";
  kind: "invalidPayloads";
  schemaVersion: 1;
  transportNotes: string[];
  validControl: Record<string, unknown>;
}

export interface ValueProfile {
  center: number;
  jitter: number;
}

export interface DatasetConfig {
  batchSize: number;
  cyclesPerPond: number;
  end: string;
  expectedRowCount: number;
  generatorVersion: "evaluation-seed-v1";
  id: string;
  intervalSeconds: number;
  pondCount: number;
  scenarioId: ScoringScenarioId;
  schemaVersion: 1;
  seed: number;
  sourceType: SourceType;
  start: string;
  valueProfiles: ParameterRecord<ValueProfile>;
}

export interface MeasurementRecord {
  cycleId: number;
  parameterCode: ParameterCode;
  pondId: number;
  recordedAt: string;
  sourceType: SourceType;
  unit: string;
  value: number;
}

export interface OracleReading {
  parameterCode: ParameterCode;
  recordedAt: string;
  value: number;
}
