import type { MeasurementRecord } from "../shared/types.ts";

export interface MeasurementFieldMismatch {
  actual: unknown;
  expected: unknown;
  field: string;
  identity: string;
}

export interface MeasurementRecordComparison {
  actualCount: number;
  duplicateActualIdentities: string[];
  expectedCount: number;
  fieldMismatchCount: number;
  fieldMismatchSamples: MeasurementFieldMismatch[];
  missingIdentities: string[];
  passed: boolean;
  unexpectedIdentities: string[];
}

export const measurementIdentity = (record: {
  parameterCode: string;
  pondId: number;
  recordedAt: string;
}): string => `${record.pondId}|${record.parameterCode}|${record.recordedAt}`;

const collectByIdentity = (
  records: readonly MeasurementRecord[]
): {
  duplicates: string[];
  recordsByIdentity: Map<string, MeasurementRecord>;
} => {
  const recordsByIdentity = new Map<string, MeasurementRecord>();
  const duplicates: string[] = [];
  for (const record of records) {
    const identity = measurementIdentity(record);
    if (recordsByIdentity.has(identity)) {
      duplicates.push(identity);
    } else {
      recordsByIdentity.set(identity, record);
    }
  }
  return { duplicates, recordsByIdentity };
};

export const compareMeasurementRecords = (
  expectedRecords: readonly MeasurementRecord[],
  actualRecords: readonly MeasurementRecord[],
  valueTolerance = 0.000_001
): MeasurementRecordComparison => {
  const expected = collectByIdentity(expectedRecords);
  const actual = collectByIdentity(actualRecords);
  const missingIdentities: string[] = [];
  const unexpectedIdentities: string[] = [];
  const fieldMismatchSamples: MeasurementFieldMismatch[] = [];
  let fieldMismatchCount = 0;

  for (const [identity, expectedRecord] of expected.recordsByIdentity) {
    const actualRecord = actual.recordsByIdentity.get(identity);
    if (!actualRecord) {
      missingIdentities.push(identity);
      continue;
    }

    const compareField = (
      field: string,
      expectedValue: unknown,
      actualValue: unknown
    ): void => {
      const matches =
        field === "value" &&
        typeof expectedValue === "number" &&
        typeof actualValue === "number"
          ? Math.abs(expectedValue - actualValue) <= valueTolerance
          : Object.is(expectedValue, actualValue);
      if (!matches) {
        fieldMismatchCount += 1;
        if (fieldMismatchSamples.length < 100) {
          fieldMismatchSamples.push({
            actual: actualValue,
            expected: expectedValue,
            field,
            identity,
          });
        }
      }
    };

    compareField("cycleId", expectedRecord.cycleId, actualRecord.cycleId);
    compareField(
      "sourceType",
      expectedRecord.sourceType,
      actualRecord.sourceType
    );
    compareField("unit", expectedRecord.unit, actualRecord.unit);
    compareField("value", expectedRecord.value, actualRecord.value);
  }

  for (const identity of actual.recordsByIdentity.keys()) {
    if (!expected.recordsByIdentity.has(identity)) {
      unexpectedIdentities.push(identity);
    }
  }

  return {
    actualCount: actualRecords.length,
    duplicateActualIdentities: actual.duplicates,
    expectedCount: expectedRecords.length,
    fieldMismatchCount,
    fieldMismatchSamples,
    missingIdentities,
    passed:
      expected.duplicates.length === 0 &&
      actual.duplicates.length === 0 &&
      missingIdentities.length === 0 &&
      unexpectedIdentities.length === 0 &&
      fieldMismatchCount === 0,
    unexpectedIdentities,
  };
};
