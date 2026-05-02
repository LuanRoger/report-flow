import type { ParameterCode } from "./params";

export type ManualIngestData = {
	farmId: string;
	pondId: string;
	cycleId: string;
	recordedAt: Date;
	parameterCode: ParameterCode;
	value: number;
	unit?: string;
	source: string;
};
