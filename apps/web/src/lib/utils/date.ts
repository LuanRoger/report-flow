import { DateTime } from "luxon";

export function formatDateTime(date: string): string {
  const parsedDate = DateTime.fromISO(date);

  return parsedDate.toLocaleString(DateTime.DATETIME_MED);
}
