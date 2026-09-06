import { getPondCycles, getPonds } from "@/app/actions";
import PondsCyclesSelectorShell from "./components/selector";

interface PondsCyclesSelectorProps {
  pondId: number | null;
}

export default async function PondsCyclesSelector({
  pondId
}: PondsCyclesSelectorProps) {
  const { data: ponds, serverError: pondsServerError } = await getPonds();

  if (!ponds || pondsServerError) {
    return null;
  }

  const pondsId = ponds.map((pond) => pond.id);
  let cyclesId: number[] | undefined = undefined;
  if (pondId) {
    const { data: cycles, serverError: pondCyclesServerError } =
      await getPondCycles({ id: pondId });

    if (cycles && !pondCyclesServerError) {
      cyclesId = cycles.map((cycle) => cycle.id);
    }
  }

  return (
    <PondsCyclesSelectorShell
      cyclesId={cyclesId}
      pondsId={pondsId}
    />
  );
}
