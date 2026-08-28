"use client";

import { useQueryStates } from "nuqs";
import { type MouseEvent, useCallback, useTransition } from "react";
import type { Measurement } from "../../actions/types";
import { pageQueryParams } from "../../query";
import { default as InnerMeasurementsTable } from "./inner";

const FIRST_PAGE_CURSOR = "__first_page__";

interface MeasurementsTableProps {
  data: Measurement[];
  nextCursor: string | null;
}

export default function MeasurementsTable({
  data,
  nextCursor,
}: MeasurementsTableProps) {
  const [isPending, startTransition] = useTransition();
  const [filters, setFilters] = useQueryStates(pageQueryParams, {
    history: "push",
    shallow: false,
    startTransition,
  });

  const isPreviousDisabled = isPending || filters.cursorHistory.length === 0;
  const isNextDisabled = isPending || nextCursor === null;

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

  return (
    <InnerMeasurementsTable
      currentPage={filters.page}
      data={data}
      isNextDisabled={isNextDisabled}
      isPreviousDisabled={isPreviousDisabled}
      onNextPage={handleNext}
      onPreviousPage={handlePrevious}
    />
  );
}
