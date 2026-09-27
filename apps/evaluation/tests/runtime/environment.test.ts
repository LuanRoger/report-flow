import { describe, expect, test } from "bun:test";
import {
  assertDestructiveDatabaseTarget,
  assertHttpTargetAllowed,
  redactSecrets,
  requireEvaluationDatabaseUrl,
  sanitizeDatabaseUrl,
  sanitizeHttpBaseUrl,
} from "../../src/runtime/environment.ts";

describe("evaluation target safety", () => {
  test("sanitizes database targets without retaining credentials", () => {
    expect(
      sanitizeDatabaseUrl(
        "postgresql://secret-user:secret-password@localhost:5433/report_flow_eval_test?sslmode=disable"
      )
    ).toEqual({
      database: "report_flow_eval_test",
      host: "localhost",
      port: 5433,
      sslMode: "disable",
    });
  });

  test("never falls back to DATABASE_URL", () => {
    expect(() =>
      requireEvaluationDatabaseUrl({
        DATABASE_URL: "postgresql://localhost/dev",
      })
    ).toThrow("intentionally not used");
  });

  test("guards destructive database operations", () => {
    const evaluationUrl =
      "postgresql://postgres:admin@localhost:5432/report_flow_evaluation";

    expect(() =>
      assertDestructiveDatabaseTarget(evaluationUrl, { confirmed: false })
    ).toThrow("--confirm-reset");
    expect(
      assertDestructiveDatabaseTarget(
        "postgresql://postgres:admin@localhost:5432/postgres",
        { confirmed: true }
      ).database
    ).toBe("postgres");
    expect(() =>
      assertDestructiveDatabaseTarget(
        "postgresql://postgres:admin@production.example/report_flow_evaluation",
        { confirmed: true }
      )
    ).toThrow("production-like host");
    expect(
      assertDestructiveDatabaseTarget(evaluationUrl, { confirmed: true })
        .database
    ).toBe("report_flow_evaluation");
  });

  test("redacts URL credentials and configured secrets", () => {
    const message =
      "failed postgresql://user:password@localhost/report_flow_eval with token-secret";
    expect(redactSecrets(message, { ANALYSIS_API_KEY: "token-secret" })).toBe(
      "failed postgresql://[REDACTED]@localhost/report_flow_eval with [REDACTED]"
    );
  });

  test("requires explicit approval for non-loopback HTTP targets", () => {
    const localTarget = sanitizeHttpBaseUrl("http://localhost:3001/");
    expect(localTarget.baseUrl).toBe("http://localhost:3001");
    expect(() => assertHttpTargetAllowed(localTarget, false)).not.toThrow();

    const remoteTarget = sanitizeHttpBaseUrl("https://evaluation.example/api/");
    expect(() => assertHttpTargetAllowed(remoteTarget, false)).toThrow(
      "--allow-remote-target"
    );
    expect(() => assertHttpTargetAllowed(remoteTarget, true)).not.toThrow();
  });
});
