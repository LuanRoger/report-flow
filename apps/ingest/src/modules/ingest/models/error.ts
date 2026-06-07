export class CycleIsNotFromPondError extends Error {
	status = 422;

	constructor(pondId: number) {
		super(`Cycle is not from pond with id ${pondId}`);
		this.name = "CycleIsNotFromPondError";
	}
}
