export class PondNotFoundError extends Error {
	status = 404;

	constructor(pondId: string) {
		super(`Pond with ID '${pondId}' not found`);
		this.name = "PondNotFoundError";
	}
}

export class InsufficientDataError extends Error {
	status = 400;

	constructor() {
		super(`Insufficient data`);
		this.name = "InsufficientDataError";
	}
}
