const TRAILING_SLASH_PATTERN = /\/+$/;
const PRODUCTION_HOST_PATTERN = /(^|[.-])(prod|production)([.-]|$)/i;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const LEADING_PATH_SLASHES_PATTERN = /^\/+/;

export interface SanitizedDatabaseTarget {
  database: string;
  host: string;
  port: number;
  sslMode: string | null;
}

export interface SanitizedHttpTarget {
  baseUrl: string;
  host: string;
  isLoopback: boolean;
  port: number | null;
  protocol: "http:" | "https:";
}

const parsePort = (url: URL, fallback: number): number => {
  if (!url.port) {
    return fallback;
  }
  const port = Number(url.port);
  if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid port in URL for ${url.hostname}`);
  }
  return port;
};

export const sanitizeDatabaseUrl = (
  databaseUrl: string
): SanitizedDatabaseTarget => {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch (error) {
    throw new Error("EVALUATION_DATABASE_URL must be a valid URL", {
      cause: error,
    });
  }

  if (
    parsedUrl.protocol !== "postgres:" &&
    parsedUrl.protocol !== "postgresql:"
  ) {
    throw new Error("EVALUATION_DATABASE_URL must use postgres or postgresql");
  }

  const database = decodeURIComponent(
    parsedUrl.pathname.replace(LEADING_PATH_SLASHES_PATTERN, "")
  );
  if (!database || database.includes("/")) {
    throw new Error("EVALUATION_DATABASE_URL must name exactly one database");
  }

  return {
    database,
    host: parsedUrl.hostname,
    port: parsePort(parsedUrl, 5432),
    sslMode: parsedUrl.searchParams.get("sslmode"),
  };
};

export const requireEvaluationDatabaseUrl = (
  environment: NodeJS.ProcessEnv = process.env
): string => {
  const value = environment.EVALUATION_DATABASE_URL?.trim();
  if (!value) {
    throw new Error(
      "EVALUATION_DATABASE_URL is required; DATABASE_URL is intentionally not used"
    );
  }
  sanitizeDatabaseUrl(value);
  return value;
};

export interface DestructiveDatabaseGuardOptions {
  confirmed: boolean;
}

export const assertDestructiveDatabaseTarget = (
  databaseUrl: string,
  options: DestructiveDatabaseGuardOptions
): SanitizedDatabaseTarget => {
  const target = sanitizeDatabaseUrl(databaseUrl);

  if (!options.confirmed) {
    throw new Error("Destructive database operation requires --confirm-reset");
  }
  if (PRODUCTION_HOST_PATTERN.test(target.host)) {
    throw new Error(
      `Refusing destructive operation on production-like host ${target.host}`
    );
  }

  return target;
};

export const sanitizeHttpBaseUrl = (baseUrl: string): SanitizedHttpTarget => {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(baseUrl);
  } catch (error) {
    throw new Error("Service base URL must be a valid URL", { cause: error });
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Service base URL must use HTTP or HTTPS");
  }
  if (parsedUrl.username || parsedUrl.password) {
    throw new Error("Service base URL must not contain credentials");
  }
  if (parsedUrl.search || parsedUrl.hash) {
    throw new Error("Service base URL must not contain a query or fragment");
  }

  const port = parsedUrl.port ? parsePort(parsedUrl, 0) : null;
  const normalizedPath = parsedUrl.pathname.replace(TRAILING_SLASH_PATTERN, "");
  return {
    baseUrl: `${parsedUrl.protocol}//${parsedUrl.host}${normalizedPath}`,
    host: parsedUrl.hostname,
    isLoopback: LOOPBACK_HOSTS.has(parsedUrl.hostname.toLowerCase()),
    port,
    protocol: parsedUrl.protocol,
  };
};

export const assertHttpTargetAllowed = (
  target: SanitizedHttpTarget,
  allowRemoteTarget: boolean
): void => {
  if (!(target.isLoopback || allowRemoteTarget)) {
    throw new Error(
      `Remote target ${target.host} requires the explicit --allow-remote-target flag`
    );
  }
  if (PRODUCTION_HOST_PATTERN.test(target.host)) {
    throw new Error(
      `Production-like HTTP target is not allowed: ${target.host}`
    );
  }
};

export const requireEnvironmentValue = (
  name: string,
  environment: NodeJS.ProcessEnv = process.env
): string => {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const URL_CREDENTIAL_PATTERN = /([a-z][a-z0-9+.-]*:\/\/)([^@\s/]+)@/gi;

export const redactSecrets = (
  message: string,
  environment: NodeJS.ProcessEnv = process.env
): string => {
  let redacted = message.replace(URL_CREDENTIAL_PATTERN, "$1[REDACTED]@");
  for (const name of [
    "ANALYSIS_API_KEY",
    "INGEST_API_KEY",
    "OPENAI_API_KEY",
    "EVALUATION_DATABASE_URL",
  ]) {
    const secret = environment[name];
    if (secret && secret.length >= 4) {
      redacted = redacted.replaceAll(secret, "[REDACTED]");
    }
  }
  return redacted;
};
