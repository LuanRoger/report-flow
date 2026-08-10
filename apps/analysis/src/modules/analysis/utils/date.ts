import { ANALYSIS_TIME_WINDOWS_NUMBERS, DAY_MS } from "../constants";
import type { AnalysisTimeWindow } from "../types/analysis";

export function calculateTimeWindow(
	window: AnalysisTimeWindow,
	startDate?: Date,
	endDate?: Date
): { startDate: Date; endDate: Date } {
	const now = new Date();

	if (startDate && endDate) {
		return { endDate, startDate };
	}

	if (startDate && !endDate) {
		return { endDate: now, startDate };
	}

	if (!startDate && endDate) {
		const days = ANALYSIS_TIME_WINDOWS_NUMBERS[window] || 7;
		const start = new Date(endDate.getTime() - days * DAY_MS);
		return { endDate, startDate: start };
	}

	const days = ANALYSIS_TIME_WINDOWS_NUMBERS[window] || 7;
	const start = new Date(now.getTime() - days * DAY_MS);
	return { endDate: now, startDate: start };
}
