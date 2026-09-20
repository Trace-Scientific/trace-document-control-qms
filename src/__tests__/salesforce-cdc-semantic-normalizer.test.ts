import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SalesforceCdcReceiptInterpretation } from "@/lib/platform/salesforce-cdc-receipt-interpretation";
import {
  SalesforceCdcSemanticNormalizer,
  salesforceCdcSemanticNormalizationLimits,
} from "@/lib/platform/salesforce-cdc-semantic-normalizer";

const schemaObject = {
  type: "record",
  name: "AccountChangeEvent",
  fields: [
    {
      name: "ChangeEventHeader",
      type: {
        type: "record",
        name: "ChangeEventHeader",
        fields: [],
      },
    },
    { name: "Name", type: ["null", "string"] },
    {
      name: "BillingAddress",
      type: [
        "null",
        {
          type: "record",
          name: "BillingAddress",
          fields: [
            { name: "Street", type: ["null", "string"] },
            { name: "City", type: ["null", "string"] },
          ],
        },
      ],
    },
    { name: "Industry", type: ["null", "string"] },
  ],
};

const schemaJson = JSON.stringify(schemaObject);
const schemaSha256 = createHash("sha256").update(schemaJson, "utf8").digest("hex");

function baseInterpretation(header: Record<string, unknown>): SalesforceCdcReceiptInterpretation {
  return {
    receiptId: "11111111-2222-4333-8444-555555555555",
    schemaId: "schema-001",
    schemaSha256,
    payloadSha256: "a".repeat(64),
    value: {
      ChangeEventHeader: header,
      Name: null,
      BillingAddress: null,
      Industry: null,
    } as SalesforceCdcReceiptInterpretation["value"],
  };
}

function governedSchema(overrides: Partial<{
  schemaId: string;
  schemaJson: string;
  schemaSha256: string;
}> = {}) {
  return {
    schemaId: "schema-001",
    schemaJson,
    schemaSha256,
    rpcId: "rpc-schema-001",
    ...overrides,
  };
}

function baseHeader(overrides: Record<string, unknown> = {}) {
  return {
    entityName: "Account",
    recordIds: ["001000000000001AAA"],
    changeType: "UPDATE",
    changeOrigin: "com/salesforce/api/rest/66.0;client=synthetic",
    transactionKey: "transaction-001",
    sequenceNumber: 1,
    commitTimestamp: 1789875000000,
    commitUser: "005000000000001AAA",
    commitNumber: 42,
    changedFields: ["0x0A", "2-0x02"],
    nulledfields: ["0x02"],
    diffFields: [],
    ...overrides,
  };
}

const runtime = readFileSync(
  join(process.cwd(), "src/lib/platform/integration-runtime.ts"),
  "utf8",
);
const source = readFileSync(
  join(process.cwd(), "src/lib/platform/salesforce-cdc-semantic-normalizer.ts"),
  "utf8",
);

describe("Salesforce CDC semantic normalization", () => {
  it("normalizes only allowlisted ChangeEventHeader metadata", () => {
    const result = new SalesforceCdcSemanticNormalizer().normalize({
      interpretation: baseInterpretation(baseHeader()),
      schema: governedSchema(),
    });

    expect(result).toEqual({
      receiptId: "11111111-2222-4333-8444-555555555555",
      schemaId: "schema-001",
      schemaSha256,
      payloadSha256: "a".repeat(64),
      header: {
        entityName: "Account",
        recordIds: ["001000000000001AAA"],
        changeType: "UPDATE",
        changeOrigin: "com/salesforce/api/rest/66.0;client=synthetic",
        transactionKey: "transaction-001",
        sequenceNumber: 1,
        commitTimestamp: 1789875000000,
        commitUser: "005000000000001AAA",
        commitNumber: 42,
        changedFields: ["Name", "Industry", "BillingAddress.City"],
        nulledFields: ["Name"],
        diffFields: [],
      },
    });
  });

  it("expands a fully selected compound bitmap to the parent field", () => {
    const result = new SalesforceCdcSemanticNormalizer().normalize({
      interpretation: baseInterpretation(baseHeader({
        changedFields: ["2-0x03"],
      })),
      schema: governedSchema(),
    });

    expect(result.header.changedFields).toEqual(["BillingAddress"]);
  });

  it("accepts Salesforce wildcard record IDs used for broad field conversions", () => {
    const result = new SalesforceCdcSemanticNormalizer().normalize({
      interpretation: baseInterpretation(baseHeader({
        recordIds: ["001*"],
        changeType: "UPDATE",
      })),
      schema: governedSchema(),
    });

    expect(result.header.recordIds).toEqual(["001*"]);
  });

  it("allows documented gap and overflow change types but rejects unknown values", () => {
    for (const type of [
      "GAP_CREATE",
      "GAP_UPDATE",
      "GAP_DELETE",
      "GAP_UNDELETE",
      "GAP_OVERFLOW",
    ]) {
      expect(new SalesforceCdcSemanticNormalizer().normalize({
        interpretation: baseInterpretation(baseHeader({ changeType: type })),
        schema: governedSchema(),
      }).header.changeType).toBe(type);
    }

    expect(() => new SalesforceCdcSemanticNormalizer().normalize({
      interpretation: baseInterpretation(baseHeader({ changeType: "UPSERT" })),
      schema: governedSchema(),
    })).toThrow("changeType is not allowed");
  });

  it("fails closed when interpretation and governed schema evidence disagree", () => {
    expect(() => new SalesforceCdcSemanticNormalizer().normalize({
      interpretation: baseInterpretation(baseHeader()),
      schema: governedSchema({ schemaId: "schema-002" }),
    })).toThrow("schema ID does not match");

    expect(() => new SalesforceCdcSemanticNormalizer().normalize({
      interpretation: baseInterpretation(baseHeader()),
      schema: governedSchema({ schemaSha256: "f".repeat(64) }),
    })).toThrow("schema hash does not match");
  });

  it("rejects malformed bitmap entries and out-of-schema field positions", () => {
    expect(() => new SalesforceCdcSemanticNormalizer().normalize({
      interpretation: baseInterpretation(baseHeader({ changedFields: ["not-a-bitmap"] })),
      schema: governedSchema(),
    })).toThrow("invalid bitmap entry");

    expect(() => new SalesforceCdcSemanticNormalizer().normalize({
      interpretation: baseInterpretation(baseHeader({ changedFields: ["0x80"] })),
      schema: governedSchema(),
    })).toThrow("outside the Avro schema");

    expect(() => new SalesforceCdcSemanticNormalizer().normalize({
      interpretation: baseInterpretation(baseHeader({ changedFields: ["99-0x01"] })),
      schema: governedSchema(),
    })).toThrow("compound bitmap parent is outside");
  });

  it("enforces bounded metadata and record IDs", () => {
    expect(salesforceCdcSemanticNormalizationLimits.maxRecordIds).toBe(1000);
    expect(salesforceCdcSemanticNormalizationLimits.maxFieldNames).toBe(5000);

    expect(() => new SalesforceCdcSemanticNormalizer().normalize({
      interpretation: baseInterpretation(baseHeader({
        recordIds: ["not-a-salesforce-id"],
      })),
      schema: governedSchema(),
    })).toThrow("invalid identifier");

    expect(() => new SalesforceCdcSemanticNormalizer().normalize({
      interpretation: baseInterpretation(baseHeader({
        sequenceNumber: 0,
      })),
      schema: governedSchema(),
    })).toThrow("sequenceNumber is invalid");
  });

  it("does not persist normalized metadata, include record body fields, or compose runtime behavior", () => {
    expect(source).not.toContain("db.");
    expect(source).not.toContain("Prisma");
    expect(source).not.toContain("PlatformIntegrationNormalizedEvent");
    expect(source).not.toContain("requestMore(");
    expect(runtime).not.toContain("SalesforceCdcSemanticNormalizer");
    expect(runtime).not.toContain("salesforce-cdc-semantic-normalizer");
  });
});
