import { PlatformIntegrationConfigurationError } from "./integration-framework";
import type { SalesforceCdcReceiptInterpretation } from "./salesforce-cdc-receipt-interpretation";

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

function normalizedFieldArray(value: unknown, label: string) {
  return stringArray(value, label, MAX_FIELD_NAMES).map(normalizedFieldName);
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
  normalize(input: SalesforceCdcReceiptInterpretation): SalesforceNormalizedCdcEvent {
    const root = object(input.value, "Salesforce CDC interpreted event");
    const header = object(root.ChangeEventHeader, "Salesforce ChangeEventHeader");

    return {
      receiptId: input.receiptId,
      schemaId: input.schemaId,
      schemaSha256: input.schemaSha256,
      payloadSha256: input.payloadSha256,
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
        changedFields: normalizedFieldArray(header.changedFields ?? [], "Salesforce changedFields"),
        nulledFields: normalizedFieldArray(
          header.nulledfields ?? header.nulledFields ?? [],
          "Salesforce nulledFields",
        ),
        diffFields: normalizedFieldArray(header.diffFields ?? [], "Salesforce diffFields"),
      },
    };
  }
}

export const salesforceCdcSemanticNormalizationLimits = Object.freeze({
  maxRecordIds: MAX_RECORD_IDS,
  maxFieldNames: MAX_FIELD_NAMES,
  maxFieldNameLength: MAX_FIELD_NAME_LENGTH,
});
