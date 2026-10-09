import assert from "node:assert/strict";
import test from "node:test";
import { assertDemoTestDatabase } from "./demo-database-safety.mjs";

const approved =
  "postgresql://trace_qms_test:local_integration_test_only@127.0.0.1:5433/trace_qms_integration_test?schema=public";

test("accepts the approved integration-test database", () => {
  assert.equal(assertDemoTestDatabase(approved), true);
});

test("rejects missing and malformed database URLs", () => {
  for (const value of [undefined, "", "not-a-url"]) {
    assert.throws(() => assertDemoTestDatabase(value), /Demo database safety/);
  }
});

test("rejects production and external database hosts", () => {
  for (const host of ["production.example.com", "localhost", "10.0.0.5"]) {
    const url = new URL(approved);
    url.hostname = host;
    assert.throws(() => assertDemoTestDatabase(url.href), /not the approved/);
  }
});

test("rejects incorrect database names, ports, and users", () => {
  const changes = [
    ["pathname", "/trace_qms"],
    ["port", "5432"],
    ["username", "postgres"],
  ];

  for (const [field, value] of changes) {
    const url = new URL(approved);
    url[field] = value;
    assert.throws(() => assertDemoTestDatabase(url.href), /not the approved/);
  }
});

test("rejects unexpected connection parameters", () => {
  const url = new URL(approved);
  url.searchParams.set("sslmode", "require");
  assert.throws(() => assertDemoTestDatabase(url.href), /not the approved/);
});

test("rejects database URLs containing fragments", () => {
  const url = new URL(approved);
  url.hash = "#unexpected";
  assert.throws(() => assertDemoTestDatabase(url.href), /not the approved/);
});

test("rejects duplicate schema parameters", () => {
  const url = new URL(approved);
  url.searchParams.append("schema", "public");
  assert.throws(() => assertDemoTestDatabase(url.href), /not the approved/);
});

test("rejects incorrect integration-test database passwords", () => {
  const url = new URL(approved);
  url.password = "incorrect_password";
  assert.throws(() => assertDemoTestDatabase(url.href), /not the approved/);
});
