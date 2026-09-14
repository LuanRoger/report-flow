import { DateTime } from "luxon";
import { ANALYSIS_TIME_WINDOWS_NUMBERS } from "../constants";
import type { AnalysisTimeWindow } from "../types/analysis";

function assertValidTimeWindow(startDate: Date, endDate: Date): void {
  if (!(startDate.getTime() < endDate.getTime())) {
    throw new Error("Analysis start must be before analysis end");
  }
}

export function calculateTimeWindow(
  window: AnalysisTimeWindow,
  startDate?: Date,
  endDate?: Date
): { endDate: Date; startDate: Date } {
  const now = DateTime.now();

  if (window === "custom" && !(startDate && endDate)) {
    throw new Error("Custom analysis windows require startDate and endDate");
  }

  if (startDate && endDate) {
    assertValidTimeWindow(startDate, endDate);
    return { endDate, startDate };
  }

  if (startDate) {
    const resolvedEndDate = now.toJSDate();
    assertValidTimeWindow(startDate, resolvedEndDate);
    return { endDate: resolvedEndDate, startDate };
  }

  if (endDate) {
    const days = ANALYSIS_TIME_WINDOWS_NUMBERS[window] ?? 7;
    const resolvedStartDate = DateTime.fromJSDate(endDate)
      .minus({ days })
      .toJSDate();
    assertValidTimeWindow(resolvedStartDate, endDate);
    return { endDate, startDate: resolvedStartDate };
  }

  const days = ANALYSIS_TIME_WINDOWS_NUMBERS[window] ?? 7;
  const resolvedEndDate = now.toJSDate();
  const resolvedStartDate = now.minus({ days }).toJSDate();
  assertValidTimeWindow(resolvedStartDate, resolvedEndDate);

  return { endDate: resolvedEndDate, startDate: resolvedStartDate };
}
