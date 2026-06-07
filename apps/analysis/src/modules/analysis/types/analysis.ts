import type { ParameterCode } from "database";

export type AnalysisTimeWindow = "7d" | "30d" | "90d" | "custom";

export type AnalysisQueryParams = {
	pondId: string;
	startDate?: string;
	endDate?: string;
	window?: string;
};

export type MeasurementData = {
	pondId: string;
	parameterCode: ParameterCode;
	value: number;
	recordedAt: Date;
};

export type NormalizedScore = {
	parameterCode: ParameterCode;
	score: number;
	recordedAt: Date;
};

export type ParameterStats = {
	rawValues: {
		min: number | null;
		max: number | null;
		mean: number | null;
		count: number;
	};
	normalizedScores: {
		min: number | null;
		max: number | null;
		mean: number | null;
		count: number;
	};
	temporalMetrics: ParameterMetrics;
};

export type ParameterMetrics = {
	meanScore: number;
	minScore: number;
	criticalTimeRatio: number;
	criticalCount: number;
};

export type ParameterTemporalScore = {
	parameterCode: ParameterCode;
	temporalScore: number;
};

// Normalization configuration types
export type GaussianConfig = {
	type: "gaussian";
	mu: number;
	sigma: number;
};

export type TriangularConfig = {
	type: "triangular";
	xopt: number;
	w: number;
};

export type NormalizationConfig = GaussianConfig | TriangularConfig;

export type ParameterConfig = {
	normalization: NormalizationConfig;
	weight: number;
};
