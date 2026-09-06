"use client"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseAsInteger, useQueryStates } from "nuqs";

interface PondsCyclesSelectorShellProps {
  cyclesId?: number[];
  pondsId: number[];
}

export default function PondsCyclesSelectorShell({
  pondsId,
  cyclesId,
}: PondsCyclesSelectorShellProps) {
	const [pondData, setPondData] = useQueryStates({
		cycleId: parseAsInteger,
		pondId: parseAsInteger,
	}, {
		history: "push",
		shallow: false
	})
	const { cycleId: selectedCycleId, pondId: selectedPondId } = pondData

  return (
    <div className="flex gap-2">
      <Select value={selectedPondId?.toString()} onValueChange={(pondId) => setPondData({ pondId: Number.parseInt(pondId) })}>
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

      {cyclesId && (
        <Select value={selectedCycleId?.toString()} onValueChange={(cycleId) => setPondData({ cycleId: Number.parseInt(cycleId) })}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione um ciclo" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {cyclesId.map((cycleId) => (
                <SelectItem key={cycleId} value={cycleId.toString()}>
                  {cycleId}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
