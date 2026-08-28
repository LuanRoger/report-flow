import { LiveLinePoint } from "@/components/charts/live-line-chart";

export type MetricDefinition = (typeof metricDefinitions)[number];

export interface MetricSeries {
  definition: MetricDefinition;
  points: LiveLinePoint[];
}
