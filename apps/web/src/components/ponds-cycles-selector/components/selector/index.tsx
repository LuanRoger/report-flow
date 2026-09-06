"use client";

import { useQueryStates } from "nuqs";
import { useCallback, useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { pondDataQuery } from "./query";

interface PondsCyclesSelectorShellProps {
  cyclesId?: number[];
  pondsId: number[];
}

export default function PondsCyclesSelectorShell({
  pondsId,
  cyclesId,
}: PondsCyclesSelectorShellProps) {
  const [isPending, startTransition] = useTransition();
  const [pondData, setPondData] = useQueryStates(pondDataQuery, {
    history: "push",
    shallow: false,
    startTransition,
  });
  const { cycleId: selectedCycleId, pondId: selectedPondId } = pondData;

  const updatePondId = useCallback((pondId: string) => {
    setPondData({ pondId: Number.parseInt(pondId, 10) });
  }, []);
  const updateCycleId = useCallback((cycleId: string) => {
    setPondData({ cycleId: Number.parseInt(cycleId, 10) });
  }, []);

  return (
    <div className="flex items-center gap-2">
      <Select onValueChange={updatePondId} value={selectedPondId?.toString()}>
        <SelectTrigger>
          <SelectValue placeholder="Selecione um viveiro" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {pondsId.map((pondId) => (
              <SelectItem key={pondId} value={pondId.toString()}>
                {pondId}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <Select
        disabled={!cyclesId?.length}
        onValueChange={updateCycleId}
        value={selectedCycleId?.toString()}
      >
        <SelectTrigger>
          <SelectValue placeholder="Selecione um ciclo" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {cyclesId?.map((cycleId) => (
              <SelectItem key={cycleId} value={cycleId.toString()}>
                {cycleId}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {isPending && <Spinner />}
    </div>
  );
}
