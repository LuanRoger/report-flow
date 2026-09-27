const decimalFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

const integerFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});

export const formatDecimal = (value: number): string =>
  decimalFormatter.format(value);

export const formatPercentage = (value: number): string =>
  `${decimalFormatter.format(value)}%`;

export const getScoreBadgeVariant = (
  score: number
): "default" | "secondary" | "destructive" => {
  if (score >= 80) {
    return "default";
  }

  if (score >= 60) {
    return "secondary";
  }

  return "destructive";
};

export const formatDuration = (seconds: number): string => {
  if (seconds < 60) {
    return `${decimalFormatter.format(seconds)} s`;
  }

  const totalMinutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${integerFormatter.format(days)} d`);
  }
  if (hours > 0) {
    parts.push(`${integerFormatter.format(hours)} h`);
  }
  if (minutes > 0) {
    parts.push(`${integerFormatter.format(minutes)} min`);
  }
  if (remainingSeconds > 0 && days === 0) {
    parts.push(`${integerFormatter.format(remainingSeconds)} s`);
  }

  return parts.join(" ");
};
