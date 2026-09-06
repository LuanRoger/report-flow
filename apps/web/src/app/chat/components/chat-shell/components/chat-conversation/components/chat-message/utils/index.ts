export function getReasoningMessage(
  isStreaming: boolean,
  duration?: number
): string {
  if (isStreaming) {
    return "Raciocinando…";
  }
  if (duration === undefined) {
    return "Raciocínio do consultor";
  }

  const durationUnit = duration === 1 ? "segundo" : "segundos";
  return `Raciocinou por ${duration} ${durationUnit}`;
}
