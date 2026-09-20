import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SalesforceCdcAvroInterpreter,
  salesforceAvroInterpretationLimits,
} from "@/lib/platform/salesforce-cdc-avro-interpreter";

function long(value: number) {
  let zigzag = BigInt(value >= 0 ? value * 2 : (-value * 2) - 1);
  const bytes: number[] = [];
  while (zigzag >= 0x80n) {
    bytes.push(Number((zigzag & 0x7fn) | 0x80n));
    zigzag >>= 7n;
  }
  bytes.push(Number(zigzag));
  return Buffer.from(bytes);
}

function string(value: string) {
  const bytes = Buffer.from(value, "utf8");
  return Buffer.concat([long(bytes.length), bytes]);
}

function bytes(value: Uint8Array) {
  return Buffer.concat([long(value.length), Buffer.from(value)]);
}

function union(branch: number, payload = Buffer.alloc(0)) {
  return Buffer.concat([long(branch), payload]);
}

function array(items: Buffer[]) {
  if (items.length === 0) return long(0);
  return Buffer.concat([long(items.length), ...items, long(0)]);
}

function map(entries: Array<[string, Buffer]>) {
  if (entries.length === 0) return long(0);
  return Buffer.concat([
    long(entries.length),
    ...entries.flatMap(([key, value]) => [string(key), value]),
    long(0),
  ]);
}

const source = readFileSync(
  join(process.cwd(), "src/lib/platform/salesforce-cdc-avro-interpreter.ts"),
  "utf8",
);
const receiptService = readFileSync(
  join(process.cwd(), "src/lib/platform/salesforce-cdc-event-receipt.ts"),
  "utf8",
);
const runtime = readFileSync(
  join(process.cwd(), "src/lib/platform/integration-runtime.ts"),
  "utf8",
);

describe("Salesforce CDC Avro interpretation", () => {
  it("decodes a bounded Salesforce-style record without mutating the immutable receipt", () => {
    const schema = {
      type: "record",
      name: "AccountChangeEvent",
      namespace: "com.salesforce.eventbus",
      fields: [
        { name: "Name", type: ["null", "string"] },
        { name: "Active__c", type: ["null", "boolean"] },
        { name: "Count__c", type: ["null", "long"] },
        { name: "Opaque__c", type: ["null", "bytes"] },
        { name: "Tags__c", type: { type: "array", items: "string" } },
        { name: "Attrs__c", type: { type: "map", values: "string" } },
      ],
    };
    const payload = Buffer.concat([
      union(1, string("Synthetic Account")),
      union(1, Buffer.from([1])),
      union(1, long(42)),
      union(1, bytes(Buffer.from([0xde, 0xad, 0xbe, 0xef]))),
      array([string("one"), string("two")]),
      map([["source", string("synthetic")]]),
    ]);

    const interpreted = new SalesforceCdcAvroInterpreter().interpret({
      receiptSchemaId: "schema-001",
      payloadBytes: payload,
      schemaId: "schema-001",
      schemaJson: JSON.stringify(schema),
    });

    expect(interpreted.value).toEqual({
      Name: "Synthetic Account",
      Active__c: true,
      Count__c: 42,
      Opaque__c: "3q2+7w==",
      Tags__c: ["one", "two"],
      Attrs__c: { source: "synthetic" },
    });
    expect(interpreted.schemaSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(interpreted.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receiptService).not.toContain('UPDATE "PlatformSalesforceCdcEventReceipt"');
  });

  it("supports named record references, enums, fixed values, float and double", () => {
    const schema = {
      type: "record",
      name: "Root",
      fields: [
        {
          name: "Header",
          type: {
            type: "record",
            name: "Header",
            fields: [{ name: "Id", type: "string" }],
          },
        },
        { name: "HeaderAgain", type: "Header" },
        { name: "Kind", type: { type: "enum", name: "Kind", symbols: ["CREATE", "UPDATE"] } },
        { name: "Token", type: { type: "fixed", name: "Token", size: 2 } },
        { name: "Ratio", type: "float" },
        { name: "Score", type: "double" },
      ],
    };
    const float = Buffer.alloc(4);
    float.writeFloatLE(1.5, 0);
    const double = Buffer.alloc(8);
    double.writeDoubleLE(2.25, 0);
    const payload = Buffer.concat([
      string("first"),
      string("second"),
      long(1),
      Buffer.from([1, 2]),
      float,
      double,
    ]);

    const interpreted = new SalesforceCdcAvroInterpreter().interpret({
      receiptSchemaId: "schema-002",
      payloadBytes: payload,
      schemaId: "schema-002",
      schemaJson: JSON.stringify(schema),
    });

    expect(interpreted.value).toEqual({
      Header: { Id: "first" },
      HeaderAgain: { Id: "second" },
      Kind: "UPDATE",
      Token: "AQI=",
      Ratio: 1.5,
      Score: 2.25,
    });
  });

  it("fails closed on schema ID mismatch and trailing payload bytes", () => {
    const schema = JSON.stringify({
      type: "record",
      name: "Simple",
      fields: [{ name: "Name", type: "string" }],
    });
    const interpreter = new SalesforceCdcAvroInterpreter();

    expect(() => interpreter.interpret({
      receiptSchemaId: "schema-a",
      payloadBytes: string("x"),
      schemaId: "schema-b",
      schemaJson: schema,
    })).toThrow("schema ID does not match");

    expect(() => interpreter.interpret({
      receiptSchemaId: "schema-a",
      payloadBytes: Buffer.concat([string("x"), Buffer.from([0])]),
      schemaId: "schema-a",
      schemaJson: schema,
    })).toThrow("trailing bytes");
  });

  it("enforces strict resource bounds and rejects unresolved named types", () => {
    expect(salesforceAvroInterpretationLimits.maxPayloadBytes).toBe(3 * 1024 * 1024);
    expect(salesforceAvroInterpretationLimits.maxDepth).toBe(32);
    expect(salesforceAvroInterpretationLimits.maxCollectionItems).toBe(10_000);

    const interpreter = new SalesforceCdcAvroInterpreter();
    expect(() => interpreter.interpret({
      receiptSchemaId: "schema-003",
      payloadBytes: Buffer.from([0]),
      schemaId: "schema-003",
      schemaJson: JSON.stringify({
        type: "record",
        name: "Broken",
        fields: [{ name: "Unknown", type: "MissingType" }],
      }),
    })).toThrow("named type MissingType is unresolved");
  });

  it("rejects unsafe longs, malformed booleans, and invalid union branches", () => {
    const interpreter = new SalesforceCdcAvroInterpreter();

    expect(() => interpreter.interpret({
      receiptSchemaId: "schema-004",
      payloadBytes: Buffer.from([2]),
      schemaId: "schema-004",
      schemaJson: JSON.stringify({
        type: "record",
        name: "BooleanEvent",
        fields: [{ name: "Flag", type: "boolean" }],
      }),
    })).toThrow("boolean is invalid");

    expect(() => interpreter.interpret({
      receiptSchemaId: "schema-005",
      payloadBytes: long(3),
      schemaId: "schema-005",
      schemaJson: JSON.stringify({
        type: "record",
        name: "UnionEvent",
        fields: [{ name: "Value", type: ["null", "string"] }],
      }),
    })).toThrow("union branch is invalid");
  });

  it("does not persist interpretations or compose decoding into runtime", () => {
    expect(source).not.toContain("db.");
    expect(source).not.toContain("Prisma");
    expect(source).not.toContain("PlatformIntegrationNormalizedEvent");
    expect(runtime).not.toContain("SalesforceCdcAvroInterpreter");
    expect(runtime).not.toContain("salesforce-cdc-avro-interpreter");
  });
});
