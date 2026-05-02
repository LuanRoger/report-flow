export type ParameterCode =
	| "temperature"
	| "ph"
	| "salinity"
	| "turbidity"
	| "dissolved_oxygen"
	| "ammonia"
	| "nitrate"
	| "nitrite";

export const parameterCodes = [
	"temperature",
	"ph",
	"salinity",
	"turbidity",
	"dissolved_oxygen",
	"ammonia",
	"nitrate",
	"nitrite",
] as const;
