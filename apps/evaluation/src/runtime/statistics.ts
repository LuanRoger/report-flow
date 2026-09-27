export interface DistributionSummary {
  count: number;
  maximum: number;
  mean: number;
  median: number;
  minimum: number;
  p95: number;
  p99: number;
  percentileMethod: "linear-interpolation-r7";
}

const assertFiniteSamples = (samples: readonly number[]): void => {
  if (samples.length === 0) {
    throw new Error("At least one sample is required");
  }
  if (samples.some((sample) => !Number.isFinite(sample))) {
    throw new Error("Distribution samples must all be finite");
  }
};

export const percentile = (
  sortedSamples: readonly number[],
  probability: number
): number => {
  assertFiniteSamples(sortedSamples);
  if (probability < 0 || probability > 1) {
    throw new Error("Percentile probability must be within [0,1]");
  }

  const rank = probability * (sortedSamples.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const lower = sortedSamples[lowerIndex];
  const upper = sortedSamples[upperIndex];
  if (lower === undefined || upper === undefined) {
    throw new Error("Percentile rank fell outside the sample distribution");
  }
  return lower + (upper - lower) * (rank - lowerIndex);
};

export const summarizeDistribution = (
  samples: readonly number[]
): DistributionSummary => {
  assertFiniteSamples(samples);
  const sortedSamples = [...samples].sort((left, right) => left - right);
  let sum = 0;
  for (const sample of sortedSamples) {
    sum += sample;
  }

  const [minimum] = sortedSamples;
  const maximum = sortedSamples.at(-1);
  if (minimum === undefined || maximum === undefined) {
    throw new Error("Distribution bounds are unavailable");
  }

  return {
    count: sortedSamples.length,
    maximum,
    mean: sum / sortedSamples.length,
    median: percentile(sortedSamples, 0.5),
    minimum,
    p95: percentile(sortedSamples, 0.95),
    p99: percentile(sortedSamples, 0.99),
    percentileMethod: "linear-interpolation-r7",
  };
};
