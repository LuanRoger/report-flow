import { DateTime } from "luxon";
import { ANALYSIS_TIME_WINDOWS_NUMBERS } from "../constants";
import type { AnalysisTimeWindow } from "../types/analysis";

export function calculateTimeWindow(
  window: AnalysisTimeWindow,
  startDate?: Date,
  endDate?: Date
): { startDate: Date; endDate: Date } {
  const now = DateTime.now();

  if (startDate && endDate) {
    return { endDate, startDate };
  }

  if (startDate && !endDate) {
    return { endDate: now.toJSDate(), startDate };
  }

  if (!startDate && endDate) {
    const days = ANALYSIS_TIME_WINDOWS_NUMBERS[window] || 7;
    const start = DateTime.fromJSDate(endDate).minus({ days }).toJSDate();
    return { endDate, startDate: start };
  }

  const days = ANALYSIS_TIME_WINDOWS_NUMBERS[window] || 7;
  const start = now.minus({ days }).toJSDate();
  return { endDate: now.toJSDate(), startDate: start };
}
