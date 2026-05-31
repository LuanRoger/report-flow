import type { ParameterCode } from "database";

export type MeasurementRecord = {
	pondId: string;
	parameterCode: ParameterCode;
	value: number;
	recordedAt: Date;
};
