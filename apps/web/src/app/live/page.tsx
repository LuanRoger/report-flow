import { getLiveMeasurementsAction } from "./actions";
import InvalidPondAlert from "./components/invalid-pond-alert";
import LiveDashboard from "./components/live-dashboard";
import { loadLiveSearchParams } from "./query";

export default async function LivePage({ searchParams }: PageProps<"/live">) {
  const { pondId } = await loadLiveSearchParams(searchParams);

  if (pondId === null || pondId < 1) {
    return <InvalidPondAlert />;
  }

  const { data, serverError } = await getLiveMeasurementsAction({
    bucket: "15s",
    pondId,
    window: "15m",
  });

  if (serverError || !data) {
    return <h1>Error: {serverError}</h1>;
  }

  return <LiveDashboard initialData={data} key={pondId} pondId={pondId} />;
}
