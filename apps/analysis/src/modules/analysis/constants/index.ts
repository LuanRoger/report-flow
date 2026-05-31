import type { AnalysisTimeWindow } from "../types";

export const DEFAULT_MIN_MAX_DATE = {
	startDate: null,
	endDate: null,
};

export const ANALYSIS_TIME_WINDOWS = ["7d", "30d", "90d", "custom"] as const;

export const ANALYSIS_TIME_WINDOWS_NUMBERS: Record<AnalysisTimeWindow, number> =
	{
		"7d": 7,
		"30d": 30,
		"90d": 90,
		custom: 0,
	};

export const DAY_MS = 24 * 60 * 60 * 1000;
