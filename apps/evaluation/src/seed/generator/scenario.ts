import { createHash } from "node:crypto";
import { canonicalJson } from "../../shared/json.ts";
import {
  collectionInstantCount,
  parseUtcTimestamp,
  timestampAtOffsetSeconds,
  timestampByIndex,
  toUtcIsoString,
} from "../../shared/time.ts";
import {
  type MeasurementRecord,
  type ModelConfig,
  PARAMETER_CODES,
  type ParameterCode,
  type ScenarioSeries,
  type ScoringScenarioConfig,
} from "../../shared/types.ts";

const MILLISECONDS_PER_SECOND = 1000;
const PARAMETER_ORDER: Record<ParameterCode, number> = {
  dissolvedOxygen: 3,
  ph: 1,
  salinity: 2,
  temperature: 0,
};

const valueAtOffset = (
  series: Extract<ScenarioSeries, { mode: "cadence" }>,
  offsetSeconds: number
): number => {
  let selectedValue = series.segments[0]?.value;
  if (selectedValue === undefined) {
    throw new Error("Cadence series must contain at least one segment");
  }

  for (const segment of series.segments) {
    if (segment.startOffsetSeconds > offsetSeconds) {
      break;
    }
    selectedValue = segment.value;
  }
  return selectedValue;
};

const generateParameterRecords = (
  scenario: ScoringScenarioConfig,
  model: ModelConfig,
  parameterCode: ParameterCode
): MeasurementRecord[] => {
  const series = scenario.series[parameterCode];
  const records: MeasurementRecord[] = [];
  const startEpochMilliseconds = parseUtcTimestamp(
    scenario.start,
    `${scenario.id}.start`
  );

  if (series.mode === "explicit") {
    for (const reading of series.readings) {
      records.push({
        cycleId: scenario.cycleId,
        parameterCode,
        pondId: scenario.pondId,
        recordedAt: toUtcIsoString(
          timestampAtOffsetSeconds(
            startEpochMilliseconds,
            reading.offsetSeconds
          )
        ),
        sourceType: scenario.sourceType,
        unit: model.units[parameterCode],
        value: reading.value,
      });
    }
    return records;
  }

  const instantCount = collectionInstantCount(
    scenario.start,
    scenario.end,
    scenario.intervalSeconds
  );
  const intervalMilliseconds =
    scenario.intervalSeconds * MILLISECONDS_PER_SECOND;
  let index = 0;
  while (index < instantCount) {
    const offsetSeconds = index * scenario.intervalSeconds;
    records.push({
      cycleId: scenario.cycleId,
      parameterCode,
      pondId: scenario.pondId,
      recordedAt: toUtcIsoString(
        timestampByIndex(startEpochMilliseconds, index, intervalMilliseconds)
      ),
      sourceType: scenario.sourceType,
      unit: model.units[parameterCode],
      value: valueAtOffset(series, offsetSeconds),
    });
    index += 1;
  }
  return records;
};

export const expectedScenarioRowCount = (
  scenario: ScoringScenarioConfig
): number => {
  const cadenceCount = collectionInstantCount(
    scenario.start,
    scenario.end,
    scenario.intervalSeconds
  );
  let rowCount = 0;
  for (const parameterCode of PARAMETER_CODES) {
    const series = scenario.series[parameterCode];
    rowCount +=
      series.mode === "cadence" ? cadenceCount : series.readings.length;
  }
  return rowCount;
};

export const generateScenarioMeasurements = (
  scenario: ScoringScenarioConfig,
  model: ModelConfig
): MeasurementRecord[] => {
  if (scenario.intervalSeconds !== model.collection.intervalSeconds) {
    throw new Error(
      `${scenario.id} interval does not match the tracked model collection interval`
    );
  }

  const records: MeasurementRecord[] = [];
  for (const parameterCode of PARAMETER_CODES) {
    records.push(...generateParameterRecords(scenario, model, parameterCode));
  }
  records.sort((left, right) => {
    const timestampComparison = left.recordedAt.localeCompare(right.recordedAt);
    if (timestampComparison !== 0) {
      return timestampComparison;
    }
    return (
      PARAMETER_ORDER[left.parameterCode] - PARAMETER_ORDER[right.parameterCode]
    );
  });

  const expectedRowCount = expectedScenarioRowCount(scenario);
  if (records.length !== expectedRowCount) {
    throw new Error(
      `${scenario.id} generated ${records.length} rows; expected ${expectedRowCount}`
    );
  }
  return records;
};

export const checksumMeasurementRecords = (
  records: Iterable<MeasurementRecord>
): string => {
  const hash = createHash("sha256");
  for (const record of records) {
    hash.update(`${canonicalJson(record)}\n`);
  }
  return `sha256:${hash.digest("hex")}`;
};

export const scenarioTransitionTimestamps = (
  scenario: ScoringScenarioConfig
): Partial<Record<ParameterCode, string[]>> => {
  const startEpochMilliseconds = parseUtcTimestamp(
    scenario.start,
    `${scenario.id}.start`
  );
  const transitions: Partial<Record<ParameterCode, string[]>> = {};

  for (const parameterCode of PARAMETER_CODES) {
    const series = scenario.series[parameterCode];
    if (series.mode !== "cadence" || series.segments.length <= 1) {
      continue;
    }
    transitions[parameterCode] = series.segments
      .slice(1)
      .map(({ startOffsetSeconds }) =>
        toUtcIsoString(
          timestampAtOffsetSeconds(startEpochMilliseconds, startOffsetSeconds)
        )
      );
  }
  return transitions;
};
