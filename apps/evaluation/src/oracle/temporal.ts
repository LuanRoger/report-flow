import {
  millisecondsFromSeconds,
  secondsFromMilliseconds,
  toUtcIsoString,
} from "../shared/time.ts";
import type { ScoreRange } from "./normalization.ts";

export interface ScoredReading {
  recordedAtEpochMilliseconds: number;
  score: number;
  value: number;
}

export interface DurationInterval {
  durationSeconds: number;
  end: string;
  start: string;
}

export interface RepresentedInterval extends DurationInterval {
  readingRecordedAt: string;
  score: number;
  unfavorable: boolean;
  value: number;
}

export interface TemporalAggregation {
  coverage: number;
  coveredDurationSeconds: number;
  durationWeightedMean: number | null;
  missingDurationSeconds: number;
  missingIntervals: DurationInterval[];
  pLow: number | null;
  representedIntervals: RepresentedInterval[];
  status: "evaluated" | "noCoveredTime";
  temporalScore: number | null;
  unfavorableDurationSeconds: number;
}

export interface TemporalOptions {
  maximumContinuityGapSeconds: number;
  scoreRange: ScoreRange;
  unfavorableThreshold: number;
  windowEndEpochMilliseconds: number;
  windowStartEpochMilliseconds: number;
}

const validateOptions = (options: TemporalOptions): number => {
  const {
    windowStartEpochMilliseconds,
    windowEndEpochMilliseconds,
    unfavorableThreshold,
    scoreRange,
  } = options;
  if (
    !(
      Number.isSafeInteger(windowStartEpochMilliseconds) &&
      Number.isSafeInteger(windowEndEpochMilliseconds)
    )
  ) {
    throw new Error("Window boundaries must be safe integer milliseconds");
  }
  if (windowEndEpochMilliseconds <= windowStartEpochMilliseconds) {
    throw new Error("Window end must be after its start");
  }
  if (!Number.isFinite(unfavorableThreshold)) {
    throw new Error("The unfavorable threshold must be finite");
  }
  if (
    !(
      Number.isFinite(scoreRange.minimum) && Number.isFinite(scoreRange.maximum)
    ) ||
    scoreRange.maximum <= scoreRange.minimum
  ) {
    throw new Error("The temporal score range is invalid");
  }
  return millisecondsFromSeconds(options.maximumContinuityGapSeconds);
};

const validateAndSortReadings = (
  readings: readonly ScoredReading[],
  scoreRange: ScoreRange
): ScoredReading[] => {
  const sortedReadings = readings.map((reading) => ({ ...reading }));
  sortedReadings.sort(
    (left, right) =>
      left.recordedAtEpochMilliseconds - right.recordedAtEpochMilliseconds
  );

  let previousTimestamp: number | undefined;
  for (const reading of sortedReadings) {
    if (!Number.isSafeInteger(reading.recordedAtEpochMilliseconds)) {
      throw new Error("Reading timestamps must be safe integer milliseconds");
    }
    if (!Number.isFinite(reading.value)) {
      throw new Error("Reading values must be finite");
    }
    if (
      !Number.isFinite(reading.score) ||
      reading.score < scoreRange.minimum ||
      reading.score > scoreRange.maximum
    ) {
      throw new Error(
        "Reading scores must be finite and within the score range"
      );
    }
    if (reading.recordedAtEpochMilliseconds === previousTimestamp) {
      throw new Error("A parameter cannot have duplicate reading timestamps");
    }
    previousTimestamp = reading.recordedAtEpochMilliseconds;
  }
  return sortedReadings;
};

const buildRepresentedIntervals = (
  readings: readonly ScoredReading[],
  options: TemporalOptions,
  maximumContinuityGapMilliseconds: number
): RepresentedInterval[] => {
  const representedIntervals: RepresentedInterval[] = [];

  for (const [index, reading] of readings.entries()) {
    const nextReading = readings[index + 1];
    const nextTimestamp =
      nextReading?.recordedAtEpochMilliseconds ??
      options.windowEndEpochMilliseconds;
    const intervalStartMilliseconds = Math.max(
      reading.recordedAtEpochMilliseconds,
      options.windowStartEpochMilliseconds
    );
    const intervalEndMilliseconds = Math.min(
      nextTimestamp,
      reading.recordedAtEpochMilliseconds + maximumContinuityGapMilliseconds,
      options.windowEndEpochMilliseconds
    );

    if (intervalEndMilliseconds <= intervalStartMilliseconds) {
      continue;
    }

    representedIntervals.push({
      durationSeconds: secondsFromMilliseconds(
        intervalEndMilliseconds - intervalStartMilliseconds
      ),
      end: toUtcIsoString(intervalEndMilliseconds),
      readingRecordedAt: toUtcIsoString(reading.recordedAtEpochMilliseconds),
      score: reading.score,
      start: toUtcIsoString(intervalStartMilliseconds),
      unfavorable: reading.score < options.unfavorableThreshold,
      value: reading.value,
    });
  }

  return representedIntervals;
};

const buildMissingIntervals = (
  representedIntervals: readonly RepresentedInterval[],
  windowStartEpochMilliseconds: number,
  windowEndEpochMilliseconds: number
): DurationInterval[] => {
  const missingIntervals: DurationInterval[] = [];
  let cursor = windowStartEpochMilliseconds;

  for (const interval of representedIntervals) {
    const intervalStart = Date.parse(interval.start);
    const intervalEnd = Date.parse(interval.end);
    if (intervalStart > cursor) {
      missingIntervals.push({
        durationSeconds: secondsFromMilliseconds(intervalStart - cursor),
        end: toUtcIsoString(intervalStart),
        start: toUtcIsoString(cursor),
      });
    }
    cursor = Math.max(cursor, intervalEnd);
  }

  if (cursor < windowEndEpochMilliseconds) {
    missingIntervals.push({
      durationSeconds: secondsFromMilliseconds(
        windowEndEpochMilliseconds - cursor
      ),
      end: toUtcIsoString(windowEndEpochMilliseconds),
      start: toUtcIsoString(cursor),
    });
  }

  return missingIntervals;
};

export const calculateTemporalScore = (
  durationWeightedMean: number,
  pLow: number,
  scoreRange: ScoreRange
): number => {
  if (
    !Number.isFinite(durationWeightedMean) ||
    durationWeightedMean < scoreRange.minimum ||
    durationWeightedMean > scoreRange.maximum
  ) {
    throw new Error("durationWeightedMean must be within the score range");
  }
  if (!Number.isFinite(pLow) || pLow < 0 || pLow > 1) {
    throw new Error("pLow must be within [0,1]");
  }

  const span = scoreRange.maximum - scoreRange.minimum;
  if (!Number.isFinite(span) || span <= 0) {
    throw new Error("The temporal score range is invalid");
  }
  const favorableTimeComponent = scoreRange.maximum - span * pLow;
  return (durationWeightedMean + favorableTimeComponent) / 2;
};

export const aggregateTemporalScores = (
  readings: readonly ScoredReading[],
  options: TemporalOptions
): TemporalAggregation => {
  const maximumContinuityGapMilliseconds = validateOptions(options);
  const sortedReadings = validateAndSortReadings(readings, options.scoreRange);
  const representedIntervals = buildRepresentedIntervals(
    sortedReadings,
    options,
    maximumContinuityGapMilliseconds
  );
  const missingIntervals = buildMissingIntervals(
    representedIntervals,
    options.windowStartEpochMilliseconds,
    options.windowEndEpochMilliseconds
  );
  const requestedDurationSeconds = secondsFromMilliseconds(
    options.windowEndEpochMilliseconds - options.windowStartEpochMilliseconds
  );

  let coveredDurationSeconds = 0;
  let unfavorableDurationSeconds = 0;
  let weightedScoreTotal = 0;
  for (const interval of representedIntervals) {
    coveredDurationSeconds += interval.durationSeconds;
    weightedScoreTotal += interval.score * interval.durationSeconds;
    if (interval.unfavorable) {
      unfavorableDurationSeconds += interval.durationSeconds;
    }
  }

  const missingDurationSeconds =
    requestedDurationSeconds - coveredDurationSeconds;
  const coverage = coveredDurationSeconds / requestedDurationSeconds;
  if (coveredDurationSeconds === 0) {
    return {
      coverage,
      coveredDurationSeconds,
      durationWeightedMean: null,
      missingDurationSeconds,
      missingIntervals,
      pLow: null,
      representedIntervals,
      status: "noCoveredTime",
      temporalScore: null,
      unfavorableDurationSeconds,
    };
  }

  const durationWeightedMean = weightedScoreTotal / coveredDurationSeconds;
  const pLow = unfavorableDurationSeconds / coveredDurationSeconds;
  return {
    coverage,
    coveredDurationSeconds,
    durationWeightedMean,
    missingDurationSeconds,
    missingIntervals,
    pLow,
    representedIntervals,
    status: "evaluated",
    temporalScore: calculateTemporalScore(
      durationWeightedMean,
      pLow,
      options.scoreRange
    ),
    unfavorableDurationSeconds,
  };
};
