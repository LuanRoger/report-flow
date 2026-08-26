export class MeasurementPondNotFoundError extends Error {
  status = 404;

  constructor(pondId: number) {
    super(`Pond with ID '${pondId}' not found`);
    this.name = "MeasurementPondNotFoundError";
  }
}

export class MeasurementCycleNotFoundError extends Error {
  status = 404;

  constructor(cycleId: number) {
    super(`Cycle with ID '${cycleId}' not found`);
    this.name = "MeasurementCycleNotFoundError";
  }
}

export class InvalidMeasurementCursorError extends Error {
  status = 400;

  constructor(message: string, options: ErrorOptions) {
    super(message, options);
    this.name = "InvalidMeasurementCursorError";
  }
}
