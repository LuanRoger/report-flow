const UTC_TIMESTAMP_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/u;
const MILLISECONDS_PER_SECOND = 1000;

export const parseUtcTimestamp = (value: string, label: string): number => {
  if (!UTC_TIMESTAMP_PATTERN.test(value)) {
    throw new Error(`${label} must include an explicit UTC offset`);
  }

  const epochMilliseconds = Date.parse(value);
  if (!Number.isSafeInteger(epochMilliseconds)) {
    throw new Error(
      `${label} must be a valid timestamp in the safe Date range`
    );
  }

  return epochMilliseconds;
};

export const validateWindow = (start: string, end: string): number => {
  const startEpochMilliseconds = parseUtcTimestamp(start, "start");
  const endEpochMilliseconds = parseUtcTimestamp(end, "end");

  if (endEpochMilliseconds <= startEpochMilliseconds) {
    throw new Error("The analysis window end must be after its start");
  }

  return endEpochMilliseconds - startEpochMilliseconds;
};

export const timestampByIndex = (
  startEpochMilliseconds: number,
  index: number,
  intervalMilliseconds: number
): number => {
  if (!Number.isSafeInteger(startEpochMilliseconds)) {
    throw new Error("startEpochMilliseconds must be a safe integer");
  }
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new Error("index must be a nonnegative safe integer");
  }
  if (
    !Number.isSafeInteger(intervalMilliseconds) ||
    intervalMilliseconds <= 0
  ) {
    throw new Error("intervalMilliseconds must be a positive safe integer");
  }

  const offsetMilliseconds = index * intervalMilliseconds;
  const timestamp = startEpochMilliseconds + offsetMilliseconds;
  if (
    !(
      Number.isSafeInteger(offsetMilliseconds) &&
      Number.isSafeInteger(timestamp)
    )
  ) {
    throw new Error("The derived timestamp exceeds safe integer precision");
  }

  return timestamp;
};

export const timestampAtOffsetSeconds = (
  startEpochMilliseconds: number,
  offsetSeconds: number
): number => {
  if (!Number.isSafeInteger(offsetSeconds) || offsetSeconds < 0) {
    throw new Error("offsetSeconds must be a nonnegative safe integer");
  }

  return timestampByIndex(
    startEpochMilliseconds,
    offsetSeconds,
    MILLISECONDS_PER_SECOND
  );
};

export const toUtcIsoString = (epochMilliseconds: number): string => {
  if (!Number.isSafeInteger(epochMilliseconds)) {
    throw new Error("epochMilliseconds must be a safe integer");
  }
  return new Date(epochMilliseconds).toISOString();
};

export const collectionInstantCount = (
  start: string,
  end: string,
  intervalSeconds: number
): number => {
  if (!Number.isSafeInteger(intervalSeconds) || intervalSeconds <= 0) {
    throw new Error("intervalSeconds must be a positive safe integer");
  }

  const durationMilliseconds = validateWindow(start, end);
  const intervalMilliseconds = intervalSeconds * MILLISECONDS_PER_SECOND;
  if (durationMilliseconds % intervalMilliseconds !== 0) {
    throw new Error(
      "The window duration must be exactly divisible by the collection interval"
    );
  }

  const count = durationMilliseconds / intervalMilliseconds;
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new Error(
      "The collection instant count must be a positive safe integer"
    );
  }
  return count;
};

export const secondsFromMilliseconds = (milliseconds: number): number =>
  milliseconds / MILLISECONDS_PER_SECOND;

export const millisecondsFromSeconds = (seconds: number): number => {
  const milliseconds = seconds * MILLISECONDS_PER_SECOND;
  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) {
    throw new Error("seconds must resolve to positive whole milliseconds");
  }
  return milliseconds;
};
