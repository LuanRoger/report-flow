import type { ParameterCode } from "@/db";

export interface ManualIngestData {
	cycleId: string;
	farmId: string;
	parameterCode: ParameterCode;
	pondId: string;
	recordedAt: Date;
	source: string;
	unit?: string;
	value: number;
}
