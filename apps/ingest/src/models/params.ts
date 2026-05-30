export type ParameterCode =
	| "temperature"
	| "ph"
	| "salinity"
	| "turbidity"
	| "dissolved_oxygen";

export const parameterCodes = [
	"temperature",
	"ph",
	"salinity",
	"turbidity",
	"dissolved_oxygen",
] as const;
