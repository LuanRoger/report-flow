import PondsCyclesSelector from "@/components/ponds-cycles-selector";
import LiveDashboard from "./components/live-dashboard";
import { loadSearchParams } from "./query";

export default async function LivePage({ searchParams }: PageProps<"/live">) {
  const { pondId } = await loadSearchParams(searchParams);
  const canShowLiveDashboard = pondId !== null && pondId >= 1;

  return (
    <>
      <PondsCyclesSelector hideCycles pondId={pondId} />
      {canShowLiveDashboard && <LiveDashboard pondId={pondId} />}
    </>
  );
}
