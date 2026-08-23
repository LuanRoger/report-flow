export class PondNotFoundError extends Error {
	status = 404;

	constructor(pondId: number) {
		super(`Pond with id ${pondId} was not found`);
		this.name = "PondNotFoundError";
	}
}

export class CycleIsNotFromPondError extends Error {
	status = 422;

	constructor(pondId: number) {
		super(`Cycle is not from pond with id ${pondId}`);
		this.name = "CycleIsNotFromPondError";
	}
}
