import { metricDefinitions } from "@/app/constants/live";
import type { LiveLinePoint } from "@/components/charts/live-line-chart";
import type { LiveMeasurementPoint } from "../actions/types";
import type { MetricSeries } from "../types";

export function buildMetricSeries(
  items: LiveMeasurementPoint[]
): MetricSeries[] {
  return metricDefinitions.map((definition) => {
    const pointsByTimestamp = new Map<number, LiveLinePoint>();

    for (const item of items) {
      if (
        item.parameterCode !== definition.code ||
        item.unit !== definition.unit
      ) {
        continue;
      }

      const time = Date.parse(item.bucketStart) / 1000;
      pointsByTimestamp.set(time, {
        time,
        value: item.averageValue,
      });
    }

    return {
      definition,
      points: Array.from(pointsByTimestamp.values()).toSorted(
        (first, second) => first.time - second.time
      ),
    };
  });
}
