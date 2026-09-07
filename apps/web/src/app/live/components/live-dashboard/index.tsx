import { getLiveMeasurementsAction } from "../../actions";
import { default as LiveDashboardClient } from "./client";

interface LiveDashboardProps {
  pondId: number;
}

export default async function LiveDashboard({ pondId }: LiveDashboardProps) {
  const bucket = "15s" as const;
  const window = "15m" as const;

  const { data, serverError } = await getLiveMeasurementsAction({
    bucket,
    pondId,
    window,
  });

  if (serverError || !data) {
    return <h1>Error: {serverError}</h1>;
  }

  return <LiveDashboardClient initialData={data} pondId={pondId} />;
}
