import { createHash } from "node:crypto";
import { PlatformIntegrationConfigurationError } from "./integration-framework";

const MAX_SCHEMA_JSON_BYTES = 2_000_000;
const MAX_PAYLOAD_BYTES = 3 * 1024 * 1024;
const MAX_DEPTH = 32;
const MAX_COLLECTION_ITEMS = 10_000;
const MAX_STRING_BYTES = 1_000_000;
const MAX_BYTES_VALUE = 3 * 1024 * 1024;
const MAX_RECORD_FIELDS = 2_000;

type AvroSchema = string | AvroSchema[] | {
  type: AvroSchema;
  name?: string;
  namespace?: string;
  fields?: Array<{ name: string; type: AvroSchema }>;
  symbols?: string[];
  items?: AvroSchema;
  values?: AvroSchema;
  size?: number;
};

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type SalesforceAvroInterpretation = {
  schemaId: string;
  schemaSha256: string;
  payloadSha256: string;
  value: JsonValue;
};

class AvroReader {
  private offset = 0;

  constructor(private readonly buffer: Uint8Array) {}

  remaining() {
    return this.buffer.length - this.offset;
  }

  eof() {
    return this.offset === this.buffer.length;
  }

  readByte() {
    if (this.offset >= this.buffer.length) {
      throw new PlatformIntegrationConfigurationError("Salesforce Avro payload ended unexpectedly");
    }
    return this.buffer[this.offset++];
  }

  readLong() {
    let raw = 0n;
    let shift = 0n;
    for (let count = 0; count < 10; count += 1) {
      const byte = this.readByte();
      raw |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) {
        const value = (raw >> 1n) ^ -(raw & 1n);
        if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new PlatformIntegrationConfigurationError("Salesforce Avro long exceeds safe integer range");
        }
        return Number(value);
      }
      shift += 7n;
    }
    throw new PlatformIntegrationConfigurationError("Salesforce Avro long is too large");
  }

  readBoolean() {
    const value = this.readByte();
    if (value !== 0 && value !== 1) {
      throw new PlatformIntegrationConfigurationError("Salesforce Avro boolean is invalid");
    }
    return value === 1;
  }

  readFloat() {
    if (this.remaining() < 4) {
      throw new PlatformIntegrationConfigurationError("Salesforce Avro float is truncated");
    }
    const value = Buffer.from(this.buffer).readFloatLE(this.offset);
    this.offset += 4;
    if (!Number.isFinite(value)) {
      throw new PlatformIntegrationConfigurationError("Salesforce Avro float is not finite");
    }
    return value;
  }

  readDouble() {
    if (this.remaining() < 8) {
      throw new PlatformIntegrationConfigurationError("Salesforce Avro double is truncated");
    }
    const value = Buffer.from(this.buffer).readDoubleLE(this.offset);
    this.offset += 8;
    if (!Number.isFinite(value)) {
      throw new PlatformIntegrationConfigurationError("Salesforce Avro double is not finite");
    }
    return value;
  }

  readBytes(maxBytes = MAX_BYTES_VALUE) {
    const length = this.readLong();
    if (!Number.isInteger(length) || length < 0 || length > maxBytes || length > this.remaining()) {
      throw new PlatformIntegrationConfigurationError("Salesforce Avro byte length is invalid");
    }
    const value = this.buffer.slice(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  readString() {
    const bytes = this.readBytes(MAX_STRING_BYTES);
    const value = Buffer.from(bytes).toString("utf8");
    if (!Buffer.from(value, "utf8").equals(Buffer.from(bytes))) {
      throw new PlatformIntegrationConfigurationError("Salesforce Avro string is not valid UTF-8");
    }
    return value;
  }

  readFixed(size: number) {
    if (!Number.isInteger(size) || size < 0 || size > MAX_BYTES_VALUE || size > this.remaining()) {
      throw new PlatformIntegrationConfigurationError("Salesforce Avro fixed value size is invalid");
    }
    const value = this.buffer.slice(this.offset, this.offset + size);
    this.offset += size;
    return value;
  }
}

function asRecord(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PlatformIntegrationConfigurationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function parseSchema(schemaJson: string) {
  const byteLength = Buffer.byteLength(schemaJson, "utf8");
  if (byteLength < 2 || byteLength > MAX_SCHEMA_JSON_BYTES) {
    throw new PlatformIntegrationConfigurationError("Salesforce Avro schema size is invalid");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(schemaJson);
  } catch {
    throw new PlatformIntegrationConfigurationError("Salesforce Avro schema JSON is invalid");
  }
  return parsed as AvroSchema;
}

function fullName(schema: { name?: string; namespace?: string }, inheritedNamespace?: string) {
  if (!schema.name) return null;
  if (schema.name.includes(".")) return schema.name;
  const namespace = schema.namespace ?? inheritedNamespace;
  return namespace ? `${namespace}.${schema.name}` : schema.name;
}

function collectNamedSchemas(
  schema: AvroSchema,
  named: Map<string, AvroSchema>,
  inheritedNamespace?: string,
  depth = 0,
) {
  if (depth > MAX_DEPTH) {
    throw new PlatformIntegrationConfigurationError("Salesforce Avro schema nesting is too deep");
  }
  if (typeof schema === "string") return;
  if (Array.isArray(schema)) {
    for (const branch of schema) collectNamedSchemas(branch, named, inheritedNamespace, depth + 1);
    return;
  }

  const object = schema as Exclude<AvroSchema, string | AvroSchema[]>;
  const type = object.type;
  const typeName = typeof type === "string" ? type : null;
  let namespace = inheritedNamespace;

  if (typeName === "record" || typeName === "enum" || typeName === "fixed") {
    const name = fullName(object, inheritedNamespace);
    if (!name) throw new PlatformIntegrationConfigurationError("Salesforce Avro named schema is missing a name");
    if (named.has(name) || named.has(object.name!)) {
      throw new PlatformIntegrationConfigurationError("Salesforce Avro schema contains a duplicate named type");
    }
    named.set(name, schema);
    named.set(object.name!, schema);
    namespace = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : inheritedNamespace;
  }

  if (typeName === "record") {
    if (!Array.isArray(object.fields) || object.fields.length > MAX_RECORD_FIELDS) {
      throw new PlatformIntegrationConfigurationError("Salesforce Avro record fields are invalid");
    }
    for (const field of object.fields) {
      if (!field || typeof field.name !== "string" || !field.name || field.name.length > 512) {
        throw new PlatformIntegrationConfigurationError("Salesforce Avro record field name is invalid");
      }
      collectNamedSchemas(field.type, named, namespace, depth + 1);
    }
  } else if (typeName === "array" && object.items) {
    collectNamedSchemas(object.items, named, namespace, depth + 1);
  } else if (typeName === "map" && object.values) {
    collectNamedSchemas(object.values, named, namespace, depth + 1);
  } else if (typeof type !== "string") {
    collectNamedSchemas(type, named, namespace, depth + 1);
  }
}

function readBlockCount(reader: AvroReader) {
  let count = reader.readLong();
  if (count < 0) {
    count = -count;
    const blockSize = reader.readLong();
    if (blockSize < 0 || blockSize > MAX_PAYLOAD_BYTES) {
      throw new PlatformIntegrationConfigurationError("Salesforce Avro block size is invalid");
    }
  }
  if (!Number.isInteger(count) || count < 0 || count > MAX_COLLECTION_ITEMS) {
    throw new PlatformIntegrationConfigurationError("Salesforce Avro collection count is invalid");
  }
  return count;
}

function decodeValue(
  reader: AvroReader,
  schema: AvroSchema,
  named: Map<string, AvroSchema>,
  depth = 0,
): JsonValue {
  if (depth > MAX_DEPTH) {
    throw new PlatformIntegrationConfigurationError("Salesforce Avro payload nesting is too deep");
  }

  if (Array.isArray(schema)) {
    const branchIndex = reader.readLong();
    if (!Number.isInteger(branchIndex) || branchIndex < 0 || branchIndex >= schema.length) {
      throw new PlatformIntegrationConfigurationError("Salesforce Avro union branch is invalid");
    }
    return decodeValue(reader, schema[branchIndex], named, depth + 1);
  }

  if (typeof schema === "string") {
    switch (schema) {
      case "null": return null;
      case "boolean": return reader.readBoolean();
      case "int":
      case "long": return reader.readLong();
      case "float": return reader.readFloat();
      case "double": return reader.readDouble();
      case "bytes": return Buffer.from(reader.readBytes()).toString("base64");
      case "string": return reader.readString();
      default: {
        const resolved = named.get(schema);
        if (!resolved) {
          throw new PlatformIntegrationConfigurationError(`Salesforce Avro named type ${schema} is unresolved`);
        }
        return decodeValue(reader, resolved, named, depth + 1);
      }
    }
  }

  const object = schema as Exclude<AvroSchema, string | AvroSchema[]>;
  if (typeof object.type !== "string") {
    return decodeValue(reader, object.type, named, depth + 1);
  }

  switch (object.type) {
    case "record": {
      if (!Array.isArray(object.fields) || object.fields.length > MAX_RECORD_FIELDS) {
        throw new PlatformIntegrationConfigurationError("Salesforce Avro record fields are invalid");
      }
      const value: Record<string, JsonValue> = {};
      for (const field of object.fields) {
        value[field.name] = decodeValue(reader, field.type, named, depth + 1);
      }
      return value;
    }
    case "enum": {
      if (!Array.isArray(object.symbols) || object.symbols.length === 0 || object.symbols.length > MAX_COLLECTION_ITEMS) {
        throw new PlatformIntegrationConfigurationError("Salesforce Avro enum symbols are invalid");
      }
      const index = reader.readLong();
      if (!Number.isInteger(index) || index < 0 || index >= object.symbols.length) {
        throw new PlatformIntegrationConfigurationError("Salesforce Avro enum index is invalid");
      }
      return object.symbols[index];
    }
    case "array": {
      if (!object.items) throw new PlatformIntegrationConfigurationError("Salesforce Avro array items schema is missing");
      const values: JsonValue[] = [];
      while (true) {
        const count = readBlockCount(reader);
        if (count === 0) break;
        if (values.length + count > MAX_COLLECTION_ITEMS) {
          throw new PlatformIntegrationConfigurationError("Salesforce Avro array exceeds the item limit");
        }
        for (let index = 0; index < count; index += 1) {
          values.push(decodeValue(reader, object.items, named, depth + 1));
        }
      }
      return values;
    }
    case "map": {
      if (!object.values) throw new PlatformIntegrationConfigurationError("Salesforce Avro map values schema is missing");
      const value: Record<string, JsonValue> = {};
      let entries = 0;
      while (true) {
        const count = readBlockCount(reader);
        if (count === 0) break;
        entries += count;
        if (entries > MAX_COLLECTION_ITEMS) {
          throw new PlatformIntegrationConfigurationError("Salesforce Avro map exceeds the item limit");
        }
        for (let index = 0; index < count; index += 1) {
          const key = reader.readString();
          value[key] = decodeValue(reader, object.values, named, depth + 1);
        }
      }
      return value;
    }
    case "fixed": {
      if (!Number.isInteger(object.size)) {
        throw new PlatformIntegrationConfigurationError("Salesforce Avro fixed schema size is invalid");
      }
      return Buffer.from(reader.readFixed(object.size!)).toString("base64");
    }
    default:
      return decodeValue(reader, object.type, named, depth + 1);
  }
}

export class SalesforceCdcAvroInterpreter {
  interpret(input: {
    receiptSchemaId: string;
    payloadBytes: Uint8Array;
    schemaId: string;
    schemaJson: string;
  }): SalesforceAvroInterpretation {
    if (!input.receiptSchemaId || input.receiptSchemaId !== input.schemaId) {
      throw new PlatformIntegrationConfigurationError("Salesforce receipt schema ID does not match the discovered schema");
    }

    const payloadBytes = Buffer.from(input.payloadBytes);
    if (payloadBytes.length < 1 || payloadBytes.length > MAX_PAYLOAD_BYTES) {
      throw new PlatformIntegrationConfigurationError("Salesforce Avro payload size is invalid");
    }

    const schema = parseSchema(input.schemaJson);
    const root = asRecord(schema, "Salesforce Avro root schema");
    if (root.type !== "record") {
      throw new PlatformIntegrationConfigurationError("Salesforce Avro root schema must be a record");
    }

    const named = new Map<string, AvroSchema>();
    collectNamedSchemas(schema, named);

    const reader = new AvroReader(payloadBytes);
    const value = decodeValue(reader, schema, named);
    if (!reader.eof()) {
      throw new PlatformIntegrationConfigurationError("Salesforce Avro payload contains trailing bytes");
    }

    return {
      schemaId: input.schemaId,
      schemaSha256: createHash("sha256").update(input.schemaJson, "utf8").digest("hex"),
      payloadSha256: createHash("sha256").update(payloadBytes).digest("hex"),
      value,
    };
  }
}

export const salesforceAvroInterpretationLimits = Object.freeze({
  maxSchemaJsonBytes: MAX_SCHEMA_JSON_BYTES,
  maxPayloadBytes: MAX_PAYLOAD_BYTES,
  maxDepth: MAX_DEPTH,
  maxCollectionItems: MAX_COLLECTION_ITEMS,
  maxStringBytes: MAX_STRING_BYTES,
  maxRecordFields: MAX_RECORD_FIELDS,
});
