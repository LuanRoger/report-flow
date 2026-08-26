"use client";

import { AlertCircleIcon, DatabaseIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  useQueryStates,
} from "nuqs";
import { type MouseEvent, useCallback, useEffect } from "react";
import { getMeasurementsAction } from "@/app/actions/measurements";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 25;
const FIRST_PAGE_CURSOR = "__first_page__";
const LOADING_ROW_IDS = ["one", "two", "three", "four", "five"] as const;
const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "medium",
});
const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 3,
});
const parameterLabels: Record<string, string> = {
  dissolvedOxygen: "Dissolved oxygen",
  ph: "pH",
  salinity: "Salinity",
  temperature: "Temperature",
  turbidity: "Turbidity",
};

function formatDateTime(value: string): string {
  return dateTimeFormatter.format(new Date(value));
}

export function MeasurementsTable() {
  const [filters, setFilters] = useQueryStates(
    {
      cursor: parseAsString,
      cursorHistory: parseAsArrayOf(parseAsString).withDefault([]),
      cycleId: parseAsInteger,
      page: parseAsInteger.withDefault(1),
      pondId: parseAsInteger,
    },
    {
      history: "push",
      shallow: true,
    }
  );
  const action = useAction(getMeasurementsAction);
  const hasPondScope = filters.pondId !== null;
  const hasCycleScope = filters.cycleId !== null;
  const hasValidScope = hasPondScope !== hasCycleScope;

  useEffect(() => {
    if (!hasValidScope) {
      action.reset();
      return;
    }

    if (filters.pondId !== null) {
      action.execute({
        cursor: filters.cursor ?? undefined,
        limit: PAGE_SIZE,
        pondId: filters.pondId,
        scope: "pond",
      });
      return;
    }

    if (filters.cycleId !== null) {
      action.execute({
        cursor: filters.cursor ?? undefined,
        cycleId: filters.cycleId,
        limit: PAGE_SIZE,
        scope: "cycle",
      });
    }
  }, [
    action.execute,
    action.reset,
    filters.cursor,
    filters.cycleId,
    filters.pondId,
    hasValidScope,
  ]);

  const data = action.hasSucceeded ? action.result.data : undefined;
  const nextCursor = data?.pagination.nextCursor ?? null;
  const isPreviousDisabled =
    action.isPending || filters.cursorHistory.length === 0;
  const isNextDisabled = action.isPending || nextCursor === null;

  const handlePrevious = useCallback(
    async (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      if (isPreviousDisabled) {
        return;
      }

      const previousCursor = filters.cursorHistory.at(-1);
      if (!previousCursor) {
        return;
      }

      await setFilters({
        cursor: previousCursor === FIRST_PAGE_CURSOR ? null : previousCursor,
        cursorHistory: filters.cursorHistory.slice(0, -1),
        page: Math.max(1, filters.page - 1),
      });
    },
    [filters.cursorHistory, filters.page, isPreviousDisabled, setFilters]
  );

  const handleNext = useCallback(
    async (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      if (isNextDisabled || !nextCursor) {
        return;
      }

      await setFilters({
        cursor: nextCursor,
        cursorHistory: [
          ...filters.cursorHistory,
          filters.cursor ?? FIRST_PAGE_CURSOR,
        ],
        page: filters.page + 1,
      });
    },
    [
      filters.cursor,
      filters.cursorHistory,
      filters.page,
      isNextDisabled,
      nextCursor,
      setFilters,
    ]
  );

  const scopeDescription = hasPondScope
    ? `Pond #${filters.pondId}`
    : `Cycle #${filters.cycleId}`;

  if (!hasValidScope) {
    const hasBothScopes = hasPondScope && hasCycleScope;

    return (
      <Alert>
        <DatabaseIcon />
        <AlertTitle>
          {hasBothScopes ? "Choose one measurement scope" : "Select a scope"}
        </AlertTitle>
        <AlertDescription>
          {hasBothScopes
            ? "Use either pondId or cycleId in the URL, not both."
            : "Add pondId or cycleId to the URL, for example ?pondId=1."}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <section aria-labelledby="measurements-heading" className="space-y-5">
      <header className="space-y-1">
        <p className="font-medium text-muted-foreground text-sm">
          {scopeDescription}
        </p>
        <h1
          className="font-semibold text-2xl tracking-tight"
          id="measurements-heading"
        >
          Measurements
        </h1>
        <p className="text-muted-foreground text-sm">
          Latest sensor readings, ordered from newest to oldest.
        </p>
      </header>

      {action.hasErrored ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Unable to load measurements</AlertTitle>
          <AlertDescription>
            {action.result.serverError ??
              "Check the selected pond or cycle and try again."}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableCaption className="sr-only">
            Measurements for {scopeDescription}
          </TableCaption>
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
            {action.isPending || action.isIdle
              ? LOADING_ROW_IDS.map((rowId) => (
                  <TableRow key={rowId}>
                    {Array.from({ length: 6 }, (_, columnIndex) => (
                      <TableCell key={`${rowId}-${columnIndex}`}>
                        <Skeleton className="h-5 w-24" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : null}

            {data?.items.map((measurement) => (
              <TableRow key={`${measurement.id}-${measurement.recordedAt}`}>
                <TableCell className="font-medium">
                  {formatDateTime(measurement.recordedAt)}
                </TableCell>
                <TableCell>
                  {parameterLabels[measurement.parameterCode] ??
                    measurement.parameterCode}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {numberFormatter.format(measurement.value)}
                </TableCell>
                <TableCell>{measurement.unit}</TableCell>
                <TableCell>{measurement.pondId}</TableCell>
                <TableCell>{measurement.cycleId}</TableCell>
              </TableRow>
            ))}

            {action.hasSucceeded && data && data.items.length === 0 ? (
              <TableRow>
                <TableCell className="h-32 text-center" colSpan={6}>
                  <p className="font-medium">No measurements found</p>
                  <p className="text-muted-foreground text-sm">
                    This scope does not have measurements yet.
                  </p>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-muted-foreground text-sm tabular-nums">
          Page {filters.page}
          {data ? ` · ${data.items.length} rows` : ""}
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
                onClick={handlePrevious}
              />
            </PaginationItem>
            <PaginationItem>
              <span
                aria-current="page"
                className="flex size-9 items-center justify-center rounded-md border font-medium text-sm tabular-nums"
              >
                {filters.page}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                aria-disabled={isNextDisabled}
                className={
                  isNextDisabled ? "pointer-events-none opacity-50" : undefined
                }
                href="#"
                onClick={handleNext}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </section>
  );
}
