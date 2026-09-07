import { getMeasurementsAction } from "../../actions";
import { default as MeasurementsTableClient } from "./client";

interface MeasurementsTableProps {
  cursor: string | null;
  cycleId: number;
}

export default async function MeasurementsTable({
  cycleId,
  cursor,
}: MeasurementsTableProps) {
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

  return (
    <MeasurementsTableClient data={items} nextCursor={pagination.nextCursor} />
  );
}
