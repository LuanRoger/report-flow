import { describe, expect, test } from "bun:test";
import {
  EXPECTED_TABLES,
  inspectDatabase,
  readCount,
  type SqlClient,
  type SqlRow,
} from "../../src/runtime/database.ts";

const asQueryRows = <Row extends SqlRow>(rows: SqlRow[]): Row[] =>
  rows as unknown as Row[];

class InspectionClient implements SqlClient {
  readonly statements: string[] = [];

  close(): Promise<void> {
    return Promise.resolve();
  }

  query<Row extends SqlRow = SqlRow>(statement: string): Promise<Row[]> {
    this.statements.push(statement);

    if (statement.includes("current_database()")) {
      return Promise.resolve(
        asQueryRows([
          {
            current_database: "report_flow_evaluation",
            version: "PostgreSQL test",
          },
        ])
      );
    }
    if (statement.includes("FROM pg_extension")) {
      return Promise.resolve(
        asQueryRows([
          { extname: "timescaledb", extversion: "test" },
          { extname: "vector", extversion: "test" },
        ])
      );
    }
    if (statement.includes("information_schema.tables")) {
      return Promise.resolve(
        asQueryRows(EXPECTED_TABLES.map((table_name) => ({ table_name })))
      );
    }
    if (statement.includes("FROM pg_indexes")) {
      return Promise.resolve(
        asQueryRows([
          {
            indexdef:
              "CREATE UNIQUE INDEX measurements_pond_parameter_recorded_at_unique ON public.measurements USING btree (pond_id, parameter_code, recorded_at)",
            indexname: "measurements_pond_parameter_recorded_at_unique",
            tablename: "measurements",
          },
        ])
      );
    }
    if (statement.includes("FROM pg_type")) {
      return Promise.resolve(
        asQueryRows([
          { enum_name: "parameter_code", enum_value: "temperature" },
          { enum_name: "parameter_code", enum_value: "ph" },
          { enum_name: "parameter_code", enum_value: "salinity" },
          { enum_name: "parameter_code", enum_value: "dissolvedOxygen" },
          { enum_name: "unit_code", enum_value: "°C" },
          { enum_name: "unit_code", enum_value: "pH" },
          { enum_name: "unit_code", enum_value: "ppt" },
          { enum_name: "unit_code", enum_value: "mg/L" },
        ])
      );
    }
    if (statement.includes("information_schema.columns")) {
      return Promise.resolve(
        asQueryRows([
          { column_name: "id", table_name: "analysis_results" },
          { column_name: "analysis_id", table_name: "analysis_ai_summaries" },
          { column_name: "summary", table_name: "analysis_ai_summaries" },
        ])
      );
    }
    if (statement.includes("FROM pg_constraint")) {
      return Promise.resolve(
        asQueryRows([
          {
            constraint_name: "fk_measurements_cycle_pond",
            table_name: "measurements",
          },
        ])
      );
    }
    if (statement.includes("timescaledb_information.hypertables")) {
      return Promise.resolve(
        asQueryRows([
          {
            compression_enabled: false,
            hypertable_name: "measurements",
            hypertable_schema: "public",
            num_chunks: 1,
            num_dimensions: 1,
          },
        ])
      );
    }
    if (statement.includes("COUNT(*)")) {
      return Promise.resolve(asQueryRows([{ row_count: 0 }]));
    }
    return Promise.resolve([]);
  }
}

describe("database inspection", () => {
  test("verifies extensions, schema tables, and the measurement hypertable", async () => {
    const client = new InspectionClient();
    const inspection = await inspectDatabase(
      client,
      "postgresql://user:password@localhost/report_flow_evaluation"
    );

    expect(inspection.passed).toBe(true);
    expect(inspection.target).toEqual({
      database: "report_flow_evaluation",
      host: "localhost",
      port: 5432,
      sslMode: null,
    });
    expect(inspection.rowCounts.measurements).toBe(0);
    expect(client.statements.join("\n")).not.toContain("password");
  });

  test("normalizes database count representations", () => {
    expect(readCount("42", "count")).toBe(42);
    expect(readCount(5n, "count")).toBe(5);
    expect(() => readCount(-1, "count")).toThrow("nonnegative");
  });
});
