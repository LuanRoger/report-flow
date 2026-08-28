"use client";

import { AlertCircleIcon, RadioIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { chartCssVars } from "@/components/charts/chart-context";
import { Grid } from "@/components/charts/grid";
import { LiveLine } from "@/components/charts/live-line";
import {
  LiveLineChart,
  type LiveLinePoint,
} from "@/components/charts/live-line-chart";
import { LiveXAxis } from "@/components/charts/live-x-axis";
import { LiveYAxis } from "@/components/charts/live-y-axis";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getLiveMeasurementsAction } from "../../actions";
import type {
  LiveMeasurementPoint,
  LiveMeasurementsSnapshot,
} from "../../actions/types";

const POLLING_INTERVAL_MS = 10_000;
const WINDOW_SECONDS = {
  "1h": 60 * 60,
  "6h": 6 * 60 * 60,
  "15m": 15 * 60,
  "24h": 24 * 60 * 60,
} as const;
const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});
const updatedAtFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "medium",
});

const metricDefinitions = [
  {
    code: "temperature",
    description: "Average water temperature",
    fractionDigits: 2,
    title: "Temperature",
    unit: "°C",
  },
  {
    code: "turbidity",
    description: "Average suspended-particle reading",
    fractionDigits: 1,
    title: "Turbidity",
    unit: "NTU",
  },
  {
    code: "dissolvedOxygen",
    description: "Average dissolved oxygen concentration",
    fractionDigits: 2,
    title: "Dissolved oxygen",
    unit: "mg/L",
  },
] as const;

type MetricDefinition = (typeof metricDefinitions)[number];

interface MetricSeries {
  definition: MetricDefinition;
  points: LiveLinePoint[];
}

interface LiveDashboardProps {
  initialData: LiveMeasurementsSnapshot;
  pondId: number;
}

function formatTime(timestamp: number): string {
  return timeFormatter.format(new Date(timestamp));
}

function getStatusLabel(isPageVisible: boolean, isExecuting: boolean): string {
  if (!isPageVisible) {
    return "Paused";
  }
  if (isExecuting) {
    return "Refreshing";
  }
  return "Live";
}

function buildMetricSeries(items: LiveMeasurementPoint[]): MetricSeries[] {
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

function MetricChart({
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
            <LiveXAxis formatTime={formatTime} numTicks={5} />
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

export default function LiveDashboard({
  initialData,
  pondId,
}: LiveDashboardProps) {
  const [snapshot, setSnapshot] = useState(initialData);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const handlePollSuccess = useCallback(
    ({ data }: { data: LiveMeasurementsSnapshot }) => {
      setSnapshot((currentSnapshot) =>
        Date.parse(data.generatedAt) >= Date.parse(currentSnapshot.generatedAt)
          ? data
          : currentSnapshot
      );
    },
    []
  );
  const action = useAction(getLiveMeasurementsAction, {
    onSuccess: handlePollSuccess,
  });

  useEffect(() => {
    const updateVisibility = () => {
      setIsPageVisible(document.visibilityState === "visible");
    };

    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (!isPageVisible || action.isExecuting) {
        return;
      }

      action.execute({
        bucket: snapshot.bucket,
        pondId,
        window: snapshot.window,
      });
    }, POLLING_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    action.execute,
    action.isExecuting,
    isPageVisible,
    pondId,
    snapshot.bucket,
    snapshot.window,
  ]);

  const series = useMemo(
    () => buildMetricSeries(snapshot.items),
    [snapshot.items]
  );
  const windowSeconds = WINDOW_SECONDS[snapshot.window];
  const statusLabel = getStatusLabel(isPageVisible, action.isExecuting);

  return (
    <section aria-labelledby="live-heading" className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <p className="font-medium text-muted-foreground text-sm">
            Pond #{pondId}
          </p>
          <h1
            className="font-semibold text-2xl tracking-tight"
            id="live-heading"
          >
            Live water quality
          </h1>
          <p className="text-muted-foreground text-sm">
            {snapshot.window} rolling window with {snapshot.bucket} averages.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Badge variant={isPageVisible ? "secondary" : "outline"}>
            <RadioIcon data-icon="inline-start" />
            {statusLabel}
          </Badge>
          <p className="text-muted-foreground text-xs tabular-nums">
            Updated {updatedAtFormatter.format(new Date(snapshot.generatedAt))}
          </p>
        </div>
      </header>

      {action.hasErrored ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Live refresh failed</AlertTitle>
          <AlertDescription>
            The last successful readings remain visible. The dashboard will
            retry automatically.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 2xl:grid-cols-3">
        {series.map((metricSeries) => (
          <MetricChart
            definition={metricSeries.definition}
            key={metricSeries.definition.code}
            paused={!isPageVisible}
            points={metricSeries.points}
            windowSeconds={windowSeconds}
          />
        ))}
      </div>
    </section>
  );
}
