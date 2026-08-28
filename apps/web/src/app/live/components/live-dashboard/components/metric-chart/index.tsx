import { useCallback } from "react";
import { LiveXAxis } from "@/components/charts/live-x-axis";
import { LiveYAxis } from "@/components/charts/live-y-axis";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { chartCssVars } from "@/components/charts/chart-context";
import { Grid } from "@/components/charts/grid";
import { LiveLine } from "@/components/charts/live-line";
import {
  LiveLineChart,
} from "@/components/charts/live-line-chart";
import { MetricSeries } from "@/app/live/types";
import { formatDateTime } from "@/lib/utils/date";


export default function MetricChart({
  definition,
  paused,
  points,
  windowSeconds,
}: MetricSeries & { paused: boolean; windowSeconds: number }) {
  const latestPoint = points.at(-1);
  const formatValue = useCallback(
    (value: number) =>
      `${value.toFixed(definition.fractionDigits)} ${definition.unit}`,
    [definition.fractionDigits, definition.unit]
  );
  const tooltipRows = useCallback(
    (point: Record<string, unknown>) => [
      {
        color: chartCssVars.linePrimary,
        label: definition.title,
        value:
          typeof point.value === "number"
            ? formatValue(point.value)
            : "Unavailable",
      },
    ],
    [definition.title, formatValue]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{definition.title}</CardTitle>
        <CardDescription>{definition.description}</CardDescription>
        <CardAction>
          <span className="font-semibold text-lg tabular-nums">
            {latestPoint ? formatValue(latestPoint.value) : "—"}
          </span>
        </CardAction>
      </CardHeader>
      <CardContent>
        {latestPoint ? (
          <LiveLineChart
            className="h-72"
            data={points}
            exaggerate
            margin={{ left: 52, right: 76 }}
            paused={paused}
            value={latestPoint.value}
            window={windowSeconds}
          >
            <Grid horizontal numTicksRows={4} />
            <LiveLine
              dataKey="value"
              formatValue={formatValue}
              stroke={chartCssVars.linePrimary}
            />
            <ChartTooltip
              className="bg-popover text-popover-foreground"
              rows={tooltipRows}
              showDatePill={false}
            />
            <LiveXAxis formatTime={formatDateTime} numTicks={5} />
            <LiveYAxis formatValue={formatValue} position="left" />
          </LiveLineChart>
        ) : (
          <div className="flex h-72 items-center justify-center rounded-lg border border-dashed">
            <p className="text-muted-foreground text-sm">
              No {definition.title.toLowerCase()} readings in this window.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
