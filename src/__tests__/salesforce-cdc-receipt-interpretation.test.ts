import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SalesforceCdcReceiptInterpretationService } from "@/lib/platform/salesforce-cdc-receipt-interpretation";

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

describe("Salesforce immutable receipt interpretation binding", () => {
  it("requires immutable payload hash and governed schema hash before returning interpretation", () => {
    const payloadBytes = string("Synthetic");
    const schemaJson = JSON.stringify({
      type: "record",
      name: "AccountChangeEvent",
      fields: [{ name: "Name", type: "string" }],
    });
    const receipt = {
      id: "11111111-2222-4333-8444-555555555555",
      schemaId: "schema-001",
      payloadBytes,
      payloadSha256: createHash("sha256").update(payloadBytes).digest("hex"),
    };
    const schema = {
      schemaId: "schema-001",
      schemaJson,
      schemaSha256: createHash("sha256").update(schemaJson, "utf8").digest("hex"),
      rpcId: "rpc-schema-001",
    };

    const result = new SalesforceCdcReceiptInterpretationService().interpret({
      receipt,
      schema,
    });

    expect(result.receiptId).toBe(receipt.id);
    expect(result.schemaId).toBe("schema-001");
    expect(result.value).toEqual({ Name: "Synthetic" });
    expect(result.payloadSha256).toBe(receipt.payloadSha256);
    expect(result.schemaSha256).toBe(schema.schemaSha256);
  });

  it("fails closed when immutable receipt bytes no longer match stored payload evidence", () => {
    const schemaJson = JSON.stringify({
      type: "record",
      name: "Simple",
      fields: [{ name: "Name", type: "string" }],
    });

    expect(() => new SalesforceCdcReceiptInterpretationService().interpret({
      receipt: {
        id: "11111111-2222-4333-8444-555555555555",
        schemaId: "schema-001",
        payloadBytes: string("changed"),
        payloadSha256: "0".repeat(64),
      },
      schema: {
        schemaId: "schema-001",
        schemaJson,
        schemaSha256: createHash("sha256").update(schemaJson, "utf8").digest("hex"),
        rpcId: null,
      },
    })).toThrow("payload hash does not match");
  });

  it("fails closed when discovered schema content does not match its governed schema hash", () => {
    const payloadBytes = string("Synthetic");
    const schemaJson = JSON.stringify({
      type: "record",
      name: "Simple",
      fields: [{ name: "Name", type: "string" }],
    });

    expect(() => new SalesforceCdcReceiptInterpretationService().interpret({
      receipt: {
        id: "11111111-2222-4333-8444-555555555555",
        schemaId: "schema-001",
        payloadBytes,
        payloadSha256: createHash("sha256").update(payloadBytes).digest("hex"),
      },
      schema: {
        schemaId: "schema-001",
        schemaJson,
        schemaSha256: "f".repeat(64),
        rpcId: null,
      },
    })).toThrow("schema hash does not match");
  });
});
