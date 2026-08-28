import { getMeasurementsAction } from "./actions";
import InvalidScopeAlert from "./components/invalid-scope-alert";
import MeasurementsTable from "./components/measurements-table";
import { loadSearchParams } from "./query";

export default async function MeasurementsPage({
  searchParams,
}: PageProps<"/measurements">) {
  const { cycleId, cursor } = await loadSearchParams(searchParams);

  if (cycleId === null) {
    return <InvalidScopeAlert hasBothScopes={false} />;
  }

  const { data, serverError } = await getMeasurementsAction({
    cursor: cursor ?? undefined,
    cycleId,
    limit: 25,
    scope: "cycle",
  });

  if (serverError || !data) {
    return <h1>Error: {serverError}</h1>;
  }

  const { pagination, items } = data;

  return <MeasurementsTable data={items} nextCursor={pagination.nextCursor} />;
}
