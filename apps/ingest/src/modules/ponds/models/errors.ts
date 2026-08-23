export class PondNotFoundError extends Error {
	status = 404;

	constructor(pondId: number) {
		super(`Pond with id ${pondId} was not found`);
		this.name = "PondNotFoundError";
	}
}
