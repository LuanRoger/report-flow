import { ANALYSIS_TIME_WINDOWS, DAY_MS } from "../constants";
import type { AnalysisTimeWindow } from "../types";

export function calculateTimeWindow(
	window: AnalysisTimeWindow,
	startDate?: Date,
	endDate?: Date,
): { startDate: Date; endDate: Date } {
	const now = new Date();

	if (startDate && endDate) {
		return { startDate, endDate };
	}

	if (startDate && !endDate) {
		return { startDate, endDate: now };
	}

	if (!startDate && endDate) {
		const days = ANALYSIS_TIME_WINDOWS[window] || 7;
		const start = new Date(endDate.getTime() - days * DAY_MS);
		return { startDate: start, endDate };
	}

	const days = ANALYSIS_TIME_WINDOWS[window] || 7;
	const start = new Date(now.getTime() - days * DAY_MS);
	return { startDate: start, endDate: now };
}
