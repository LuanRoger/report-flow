"use client";

import { useAction } from "next-safe-action/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getLiveMeasurementsAction } from "../../actions";
import type {
  LiveMeasurementsSnapshot,
} from "../../actions/types";
import MetricChart from "./components/metric-chart";
import { buildMetricSeries } from "../../utils";
import { POLLING_INTERVAL_MS, WINDOW_SECONDS } from "@/app/constants/live";
import { Badge } from "@/components/ui/badge";
import { RadioIcon } from "lucide-react";
import { formatDateTimeMed } from "@/lib/utils/date";

interface LiveDashboardProps {
  initialData: LiveMeasurementsSnapshot;
  pondId: number;
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

	const series = buildMetricSeries(snapshot.items);
  const windowSeconds = WINDOW_SECONDS[snapshot.window];

	return (
		<section className="flex flex-col gap-2">
			<header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-1">
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
        <div className="flex flex-col items-end gap-2">
          <Badge>
            <RadioIcon data-icon="inline-start" />
            Ao vivo
          </Badge>
          <p className="text-muted-foreground text-xs tabular-nums">
            Atualizado em {formatDateTimeMed(snapshot.generatedAt)}
          </p>
        </div>
      </header>
      <div className="grid gap-4 2xl:grid-cols-2">
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
