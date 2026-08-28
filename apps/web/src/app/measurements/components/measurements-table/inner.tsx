"use client";

import type { MouseEventHandler } from "react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils/date";
import type { Measurement } from "../../actions/types";

const parameterLabels: Record<string, string> = {
  dissolvedOxygen: "Dissolved oxygen",
  ph: "pH",
  salinity: "Salinity",
  temperature: "Temperature",
  turbidity: "Turbidity",
};

interface MeasurementsTableProps {
  currentPage: number;
  data: Measurement[];
  isNextDisabled: boolean;
  isPreviousDisabled: boolean;
  onNextPage: MouseEventHandler<HTMLAnchorElement>;
  onPreviousPage: MouseEventHandler<HTMLAnchorElement>;
}

export default function MeasurementsTable({
  data,
  currentPage,
  onNextPage,
  onPreviousPage,
  isPreviousDisabled,
  isNextDisabled,
}: MeasurementsTableProps) {
  return (
    <section aria-labelledby="measurements-heading" className="space-y-5">
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead>Recorded at</TableHead>
              <TableHead>Parameter</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Pond</TableHead>
              <TableHead>Cycle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((measurement) => (
              <TableRow key={`${measurement.id}-${measurement.recordedAt}`}>
                <TableCell className="font-medium">
                  {formatDateTime(measurement.recordedAt)}
                </TableCell>
                <TableCell>
                  {parameterLabels[measurement.parameterCode] ??
                    measurement.parameterCode}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {measurement.value}
                </TableCell>
                <TableCell>{measurement.unit}</TableCell>
                <TableCell>{measurement.pondId}</TableCell>
                <TableCell>{measurement.cycleId}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-muted-foreground text-sm tabular-nums">
          Page {currentPage}
          {` · ${data.length} rows`}
        </p>
        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                aria-disabled={isPreviousDisabled}
                className={
                  isPreviousDisabled
                    ? "pointer-events-none opacity-50"
                    : undefined
                }
                href="#"
                onClick={onPreviousPage}
              />
            </PaginationItem>
            <PaginationItem>
              <span
                aria-current="page"
                className="flex size-9 items-center justify-center rounded-md border font-medium text-sm tabular-nums"
              >
                {currentPage}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                aria-disabled={isNextDisabled}
                className={
                  isNextDisabled ? "pointer-events-none opacity-50" : undefined
                }
                href="#"
                onClick={onNextPage}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </section>
  );
}
