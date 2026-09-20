import { createHash } from "node:crypto";
import { PlatformIntegrationConfigurationError } from "./integration-framework";
import type { SalesforceCdcReceiptInterpretation } from "./salesforce-cdc-receipt-interpretation";
import type { SalesforcePubSubSchemaInfo } from "./salesforce-pubsub-discovery";

const CHANGE_TYPES = new Set([
  "CREATE",
  "UPDATE",
  "DELETE",
  "UNDELETE",
  "SNAPSHOT",
  "GAP_CREATE",
  "GAP_UPDATE",
  "GAP_DELETE",
  "GAP_UNDELETE",
  "GAP_OVERFLOW",
]);

const MAX_RECORD_IDS = 1000;
const MAX_FIELD_NAMES = 5000;
const MAX_FIELD_NAME_LENGTH = 512;
const MAX_TEXT_LENGTH = 1024;

type JsonObject = Record<string, unknown>;

export type SalesforceNormalizedChangeHeader = {
  entityName: string;
  recordIds: string[];
  changeType:
    | "CREATE"
    | "UPDATE"
    | "DELETE"
    | "UNDELETE"
    | "SNAPSHOT"
    | "GAP_CREATE"
    | "GAP_UPDATE"
    | "GAP_DELETE"
    | "GAP_UNDELETE"
    | "GAP_OVERFLOW";
  changeOrigin: string | null;
  transactionKey: string;
  sequenceNumber: number;
  commitTimestamp: number;
  commitUser: string;
  commitNumber: number;
  changedFields: string[];
  nulledFields: string[];
  diffFields: string[];
};

export type SalesforceNormalizedCdcEvent = {
  receiptId: string;
  schemaId: string;
  schemaSha256: string;
  payloadSha256: string;
  header: SalesforceNormalizedChangeHeader;
};

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PlatformIntegrationConfigurationError(`${label} must be an object`);
  }
  return value as JsonObject;
}

function text(value: unknown, label: string, max = MAX_TEXT_LENGTH) {
  if (typeof value !== "string" || !value.trim()) {
    throw new PlatformIntegrationConfigurationError(`${label} is required`);
  }
  const normalized = value.trim();
  if (normalized.length > max) {
    throw new PlatformIntegrationConfigurationError(`${label} is too long`);
  }
  return normalized;
}

function nullableText(value: unknown, label: string, max = MAX_TEXT_LENGTH) {
  if (value === null || value === undefined || value === "") return null;
  return text(value, label, max);
}

function safeInteger(value: unknown, label: string, min = 0) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min
  ) {
    throw new PlatformIntegrationConfigurationError(`${label} is invalid`);
  }
  return value;
}

function stringArray(
  value: unknown,
  label: string,
  maxItems: number,
  maxItemLength = MAX_FIELD_NAME_LENGTH,
) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new PlatformIntegrationConfigurationError(`${label} is invalid`);
  }
  return value.map((item, index) => text(item, `${label}[${index}]`, maxItemLength));
}

function normalizedFieldName(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_FIELD_NAME_LENGTH) {
    throw new PlatformIntegrationConfigurationError("Salesforce CDC field name is invalid");
  }
  if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(normalized)) {
    throw new PlatformIntegrationConfigurationError("Salesforce CDC field name contains unsupported characters");
  }
  return normalized;
}

type AvroField = { name: string; type: unknown };

function schemaFields(schema: unknown, label: string): AvroField[] {
  const record = object(schema, label);
  if (record.type !== "record" || !Array.isArray(record.fields) || record.fields.length > MAX_FIELD_NAMES) {
    throw new PlatformIntegrationConfigurationError(`${label} fields are invalid`);
  }
  return record.fields.map((field, index) => {
    const value = object(field, `${label} field[${index}]`);
    return {
      name: normalizedFieldName(text(value.name, `${label} field name`, MAX_FIELD_NAME_LENGTH)),
      type: value.type,
    };
  });
}

function valueSchema(schema: unknown) {
  if (!Array.isArray(schema)) return schema;
  if (schema.length === 2 && (schema[0] === "null" || schema[0] === "string")) return schema[1];
  if (schema.length === 3 && schema[0] === "null" && schema[1] === "string") return schema[2];
  return schema;
}

function bitPositions(bitmap: string) {
  if (!/^0x(?:[A-Fa-f0-9]{2})+$/.test(bitmap)) {
    throw new PlatformIntegrationConfigurationError("Salesforce CDC bitmap is invalid");
  }
  const hex = bitmap.slice(2);
  const bytes = Buffer.from(hex, "hex");
  const positions: number[] = [];
  const reversed = Buffer.from(bytes).reverse();
  for (let byteIndex = 0; byteIndex < reversed.length; byteIndex += 1) {
    for (let bit = 0; bit < 8; bit += 1) {
      if ((reversed[byteIndex] & (1 << bit)) !== 0) {
        positions.push((byteIndex * 8) + bit);
      }
    }
  }
  return positions;
}

function fieldNamesFromBitmap(bitmap: string, fields: AvroField[]) {
  return bitPositions(bitmap).map((position) => {
    const field = fields[position];
    if (!field) {
      throw new PlatformIntegrationConfigurationError("Salesforce CDC bitmap references a field outside the Avro schema");
    }
    return field.name;
  });
}

function expandBitmapField(value: unknown, label: string, rootFields: AvroField[]) {
  const entries = stringArray(value ?? [], label, MAX_FIELD_NAMES, 4096);
  if (entries.length === 0) return [];

  const expanded: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith("0x")) {
      expanded.push(...fieldNamesFromBitmap(entry, rootFields));
      continue;
    }

    const match = /^(\d+)-(0x(?:[A-Fa-f0-9]{2})+)$/.exec(entry);
    if (!match) {
      throw new PlatformIntegrationConfigurationError(`${label} contains an invalid bitmap entry`);
    }

    const parentPosition = Number(match[1]);
    const parentField = rootFields[parentPosition];
    if (!parentField) {
      throw new PlatformIntegrationConfigurationError(`${label} compound bitmap parent is outside the Avro schema`);
    }

    const child = valueSchema(parentField.type);
    const childFields = schemaFields(child, `Salesforce compound field ${parentField.name}`);
    const nested = fieldNamesFromBitmap(match[2], childFields);

    if (nested.length === childFields.length && nested.length > 0) {
      expanded.push(parentField.name);
    } else {
      expanded.push(...nested.map((name) => `${parentField.name}.${name}`));
    }
  }

  if (expanded.length > MAX_FIELD_NAMES) {
    throw new PlatformIntegrationConfigurationError(`${label} expands beyond the field limit`);
  }
  return expanded.map(normalizedFieldName);
}

function changeType(value: unknown): SalesforceNormalizedChangeHeader["changeType"] {
  const normalized = text(value, "Salesforce changeType", 64);
  if (!CHANGE_TYPES.has(normalized)) {
    throw new PlatformIntegrationConfigurationError("Salesforce changeType is not allowed");
  }
  return normalized as SalesforceNormalizedChangeHeader["changeType"];
}

function validateRecordIds(value: unknown) {
  const recordIds = stringArray(value, "Salesforce recordIds", MAX_RECORD_IDS, 64);
  for (const recordId of recordIds) {
    if (!/^[A-Za-z0-9]{15,18}$/.test(recordId) && !/^[A-Za-z0-9]{3}\*$/.test(recordId)) {
      throw new PlatformIntegrationConfigurationError("Salesforce recordIds contains an invalid identifier");
    }
  }
  return recordIds;
}

export class SalesforceCdcSemanticNormalizer {
  normalize(input: {
    interpretation: SalesforceCdcReceiptInterpretation;
    schema: SalesforcePubSubSchemaInfo;
  }): SalesforceNormalizedCdcEvent {
    const { interpretation, schema } = input;
    if (interpretation.schemaId !== schema.schemaId) {
      throw new PlatformIntegrationConfigurationError("Salesforce normalized event schema ID does not match governed schema");
    }
    const schemaSha256 = createHash("sha256").update(schema.schemaJson, "utf8").digest("hex");
    if (schemaSha256 !== schema.schemaSha256 || interpretation.schemaSha256 !== schema.schemaSha256) {
      throw new PlatformIntegrationConfigurationError("Salesforce normalized event schema hash does not match governed schema");
    }

    let parsedSchema: unknown;
    try {
      parsedSchema = JSON.parse(schema.schemaJson);
    } catch {
      throw new PlatformIntegrationConfigurationError("Salesforce normalized event schema JSON is invalid");
    }
    const rootFields = schemaFields(parsedSchema, "Salesforce CDC root schema");

    const root = object(interpretation.value, "Salesforce CDC interpreted event");
    const header = object(root.ChangeEventHeader, "Salesforce ChangeEventHeader");

    return {
      receiptId: interpretation.receiptId,
      schemaId: interpretation.schemaId,
      schemaSha256: interpretation.schemaSha256,
      payloadSha256: interpretation.payloadSha256,
      header: {
        entityName: text(header.entityName, "Salesforce entityName", 256),
        recordIds: validateRecordIds(header.recordIds),
        changeType: changeType(header.changeType),
        changeOrigin: nullableText(header.changeOrigin, "Salesforce changeOrigin", 1024),
        transactionKey: text(header.transactionKey, "Salesforce transactionKey", 256),
        sequenceNumber: safeInteger(header.sequenceNumber, "Salesforce sequenceNumber", 1),
        commitTimestamp: safeInteger(header.commitTimestamp, "Salesforce commitTimestamp", 0),
        commitUser: text(header.commitUser, "Salesforce commitUser", 64),
        commitNumber: safeInteger(header.commitNumber, "Salesforce commitNumber", 0),
        changedFields: expandBitmapField(
          header.changedFields ?? [],
          "Salesforce changedFields",
          rootFields,
        ),
        nulledFields: expandBitmapField(
          header.nulledfields ?? header.nulledFields ?? [],
          "Salesforce nulledFields",
          rootFields,
        ),
        diffFields: expandBitmapField(
          header.diffFields ?? [],
          "Salesforce diffFields",
          rootFields,
        ),
      },
    };
  }
}

export const salesforceCdcSemanticNormalizationLimits = Object.freeze({
  maxRecordIds: MAX_RECORD_IDS,
  maxFieldNames: MAX_FIELD_NAMES,
  maxFieldNameLength: MAX_FIELD_NAME_LENGTH,
});
