import PondsCyclesSelector from "@/components/ponds-cycles-selector";
import MeasurementsTable from "./components/measurements-table";
import { loadSearchParams } from "./query";

export default async function MeasurementsPage({
  searchParams,
}: PageProps<"/measurements">) {
  const { cycleId, pondId, cursor } = await loadSearchParams(searchParams);
  const canShowTable = cycleId && pondId;

  return (
    <>
      <PondsCyclesSelector pondId={pondId} />
      {canShowTable && <MeasurementsTable cursor={cursor} cycleId={cycleId} />}
    </>
  );
}
