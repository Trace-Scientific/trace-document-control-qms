import { describe, expect, it } from "vitest";
import { getEnv, getObjectStorageEnv } from "./env";

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
  it("requires complete private object-storage configuration", () => {
    expect(() => getObjectStorageEnv({ OBJECT_STORAGE_ENDPOINT: "https://objects.example" })).toThrow();
    expect(getObjectStorageEnv({ OBJECT_STORAGE_ENDPOINT: "https://objects.example", OBJECT_STORAGE_REGION: "us-west-2", OBJECT_STORAGE_BUCKET: "private-qms", OBJECT_STORAGE_ACCESS_KEY_ID: "access", OBJECT_STORAGE_SECRET_ACCESS_KEY: "secret" }).OBJECT_STORAGE_BUCKET).toBe("private-qms");
  });
});
