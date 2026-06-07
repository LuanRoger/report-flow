export class PondNotFoundError extends Error {
	status = 404;

	constructor(pondId: number) {
		super(`Pond with ID '${pondId}' not found`);
		this.name = "PondNotFoundError";
	}
}

export class AnalysisNotFound extends Error {
	status = 404;

	constructor(analysisId: number) {
		super(`Analysis with ID '${analysisId}' not found`);
		this.name = "AnalysisNotFound";
	}
}

export class InsufficientDataError extends Error {
	status = 400;

	constructor() {
		super(`Insufficient data`);
		this.name = "InsufficientDataError";
	}
}
