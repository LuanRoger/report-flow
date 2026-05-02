export type ParameterCode =
	| "temperature"
	| "ph"
	| "salinity"
	| "turbidity"
	| "dissolved_oxygen"
	| "suspended_solids"
	| "ammonia"
	| "nitrate"
	| "nitrite";

export const parameterCodes = [
	"temperature",
	"ph",
	"salinity",
	"turbidity",
	"dissolved_oxygen",
	"suspended_solids",
	"ammonia",
	"nitrate",
	"nitrite",
] as const;
