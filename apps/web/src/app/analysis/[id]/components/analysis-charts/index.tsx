"use client";

import { useCallback } from "react";
import type { AnalysisChartDatum } from "@/app/analysis/types";
import { Bar } from "@/components/charts/bar";
import { BarChart } from "@/components/charts/bar-chart";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { chartCssVars } from "@/components/charts/chart-context";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";

interface AnalysisBarChartProps {
  data: AnalysisChartDatum[];
  metric: "coverage" | "score";
}

const metricConfig = {
  coverage: {
    color: chartCssVars.lineSecondary,
    label: "Cobertura",
    suffix: "%",
  },
  score: {
    color: chartCssVars.linePrimary,
    label: "Nota",
    suffix: "",
  },
} as const;

export default function AnalysisBarChart({
  data,
  metric,
}: AnalysisBarChartProps) {
  const { color, label, suffix } = metricConfig[metric];
  const tooltipRows = useCallback(
    (point: Record<string, unknown>) => {
      const value = point[metric];

      return [
        {
          color,
          label,
          value:
            typeof value === "number" ? `${value.toFixed(1)}${suffix}` : "—",
        },
      ];
    },
    [color, label, metric, suffix]
  );

  return (
    <BarChart
      aspectRatio="16 / 7"
      className="min-h-64"
      data={data}
      margin={{ bottom: 44, left: 24, right: 24, top: 20 }}
      xDataKey="parameter"
    >
      <Grid horizontal numTicksRows={5} />
      <Bar dataKey={metric} fill={color} lineCap={6} />
      <BarXAxis showAllLabels tickerHalfWidth={44} />
      <ChartTooltip
        className="bg-popover text-popover-foreground"
        rows={tooltipRows}
        showCrosshair={false}
      />
    </BarChart>
  );
}
