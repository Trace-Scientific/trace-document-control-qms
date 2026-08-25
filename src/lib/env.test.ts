import { describe, expect, it } from "vitest";
import { getEnv } from "./env";

describe('environment configuration', () => {
  it('accepts a valid database URL', () => {
    expect(
      getEnv({
        DATABASE_URL:
          "postgresql://postgres:postgres@localhost:5432/trace_qms",
      }).DATABASE_URL,
    ).toContain("postgresql://");
  });
  it("rejects non-PostgreSQL databases and weak scheduler secrets", () => {
    expect(() => getEnv({ DATABASE_URL: "https://database.example" })).toThrow(
      "PostgreSQL",
    );
    expect(() =>
      getEnv({
        DATABASE_URL: "postgresql://localhost/qms",
        CRON_SECRET: "short",
      }),
    ).toThrow();
  });
});
