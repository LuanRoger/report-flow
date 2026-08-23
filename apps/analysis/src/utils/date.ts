import { DateTime } from "luxon";

export function formatDate(date: Date): string {
	const parsedDate = DateTime.fromJSDate(date);
	return parsedDate.toFormat("yyyy-MM-dd");
}
