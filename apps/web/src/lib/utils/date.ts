import { DateTime } from "luxon";

export function formatDateTimeMed(date: string): string {
  const parsedDate = DateTime.fromISO(date);

  return parsedDate.toLocaleString(DateTime.DATETIME_MED);
}

export function formatDateTime(date: string | number): string {
  const parsedDate = typeof date === "string" ? DateTime.fromISO(date) : DateTime.fromMillis(date);

  return parsedDate.toFormat("HH:mm")
}
