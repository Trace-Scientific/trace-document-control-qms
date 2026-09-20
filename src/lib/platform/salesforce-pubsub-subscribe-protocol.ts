import { PlatformIntegrationConfigurationError } from "./integration-framework";
import {
  validateSalesforceCdcTopic,
  validateSalesforceReplayIdBase64,
} from "./salesforce-cdc-subscriber-state";

const MAX_FETCH_EVENTS = 100;
const MAX_EVENT_PAYLOAD_BYTES = 3 * 1024 * 1024;
const MAX_EVENT_ID_BYTES = 512;
const MAX_SCHEMA_ID_BYTES = 512;
const MAX_RPC_ID_BYTES = 512;

export type SalesforceReplayPreset = "LATEST" | "EARLIEST" | "CUSTOM";

export type SalesforceFetchRequestInput =
  | {
      phase: "INITIAL";
      topic: string;
      replayPreset: SalesforceReplayPreset;
      replayIdBase64?: string | null;
      numRequested: number;
    }
  | {
      phase: "FLOW_CONTROL";
      numRequested: number;
    };

export type SalesforcePubSubConsumerEventEnvelope = {
  eventId: string;
  schemaId: string;
  payloadBytes: Uint8Array;
  replayIdBase64: string;
};

export type SalesforceFetchResponseEnvelope = {
  events: SalesforcePubSubConsumerEventEnvelope[];
  latestReplayIdBase64: string;
  rpcId: string | null;
  pendingNumRequested: number;
  keepalive: boolean;
};

type FieldValue = { wireType: number; value: Uint8Array | number };

function encodeVarint(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new PlatformIntegrationConfigurationError("Salesforce protobuf varint value is invalid");
  }
  const bytes: number[] = [];
  let remaining = value;
  while (remaining >= 0x80) {
    bytes.push((remaining & 0x7f) | 0x80);
    remaining = Math.floor(remaining / 128);
  }
  bytes.push(remaining);
  return Buffer.from(bytes);
}

function encodeKey(fieldNumber: number, wireType: number) {
  return encodeVarint((fieldNumber << 3) | wireType);
}

function encodeStringField(fieldNumber: number, value: string) {
  const bytes = Buffer.from(value, "utf8");
  return Buffer.concat([encodeKey(fieldNumber, 2), encodeVarint(bytes.length), bytes]);
}

function encodeBytesField(fieldNumber: number, value: Uint8Array) {
  const bytes = Buffer.from(value);
  return Buffer.concat([encodeKey(fieldNumber, 2), encodeVarint(bytes.length), bytes]);
}

function encodeVarintField(fieldNumber: number, value: number) {
  return Buffer.concat([encodeKey(fieldNumber, 0), encodeVarint(value)]);
}

function readVarint(buffer: Uint8Array, offset: number) {
  let result = 0;
  let multiplier = 1;
  let index = offset;
  for (let count = 0; count < 10; count += 1) {
    if (index >= buffer.length) {
      throw new PlatformIntegrationConfigurationError("Salesforce protobuf message ended unexpectedly");
    }
    const byte = buffer[index++];
    result += (byte & 0x7f) * multiplier;
    if ((byte & 0x80) === 0) {
      if (!Number.isSafeInteger(result)) {
        throw new PlatformIntegrationConfigurationError("Salesforce protobuf varint exceeds safe integer range");
      }
      return { value: result, offset: index };
    }
    multiplier *= 128;
  }
  throw new PlatformIntegrationConfigurationError("Salesforce protobuf varint is too long");
}

function readLengthDelimited(buffer: Uint8Array, offset: number) {
  const length = readVarint(buffer, offset);
  const end = length.offset + length.value;
  if (end > buffer.length) {
    throw new PlatformIntegrationConfigurationError("Salesforce protobuf field length is invalid");
  }
  return { value: buffer.slice(length.offset, end), offset: end };
}

function skipField(buffer: Uint8Array, offset: number, wireType: number) {
  if (wireType === 0) return readVarint(buffer, offset).offset;
  if (wireType === 1) {
    if (offset + 8 > buffer.length) throw new PlatformIntegrationConfigurationError("Salesforce protobuf fixed64 field is truncated");
    return offset + 8;
  }
  if (wireType === 2) return readLengthDelimited(buffer, offset).offset;
  if (wireType === 5) {
    if (offset + 4 > buffer.length) throw new PlatformIntegrationConfigurationError("Salesforce protobuf fixed32 field is truncated");
    return offset + 4;
  }
  throw new PlatformIntegrationConfigurationError("Salesforce protobuf wire type is unsupported");
}

function decodeFields(buffer: Uint8Array) {
  const fields = new Map<number, FieldValue[]>();
  let offset = 0;
  while (offset < buffer.length) {
    const key = readVarint(buffer, offset);
    offset = key.offset;
    const fieldNumber = key.value >>> 3;
    const wireType = key.value & 0x07;
    if (fieldNumber <= 0) {
      throw new PlatformIntegrationConfigurationError("Salesforce protobuf field number is invalid");
    }

    let value: Uint8Array | number;
    if (wireType === 0) {
      const decoded = readVarint(buffer, offset);
      value = decoded.value;
      offset = decoded.offset;
    } else if (wireType === 2) {
      const decoded = readLengthDelimited(buffer, offset);
      value = decoded.value;
      offset = decoded.offset;
    } else {
      offset = skipField(buffer, offset, wireType);
      continue;
    }

    const values = fields.get(fieldNumber) ?? [];
    values.push({ wireType, value });
    fields.set(fieldNumber, values);
  }
  return fields;
}

function requiredBytes(fields: Map<number, FieldValue[]>, fieldNumber: number, label: string, maxBytes: number) {
  const field = fields.get(fieldNumber)?.[0];
  if (!field || field.wireType !== 2 || !(field.value instanceof Uint8Array) || field.value.length === 0) {
    throw new PlatformIntegrationConfigurationError(`${label} is missing from Salesforce Pub/Sub response`);
  }
  if (field.value.length > maxBytes) {
    throw new PlatformIntegrationConfigurationError(`${label} exceeds the allowed size`);
  }
  return field.value;
}

function optionalString(fields: Map<number, FieldValue[]>, fieldNumber: number, maxBytes: number) {
  const field = fields.get(fieldNumber)?.[0];
  if (!field) return null;
  if (field.wireType !== 2 || !(field.value instanceof Uint8Array) || field.value.length > maxBytes) {
    throw new PlatformIntegrationConfigurationError("Salesforce Pub/Sub string field is invalid");
  }
  return Buffer.from(field.value).toString("utf8");
}

function requiredString(fields: Map<number, FieldValue[]>, fieldNumber: number, label: string, maxBytes: number) {
  return Buffer.from(requiredBytes(fields, fieldNumber, label, maxBytes)).toString("utf8");
}

function optionalVarint(fields: Map<number, FieldValue[]>, fieldNumber: number) {
  const field = fields.get(fieldNumber)?.[0];
  if (!field) return 0;
  if (field.wireType !== 0 || typeof field.value !== "number") {
    throw new PlatformIntegrationConfigurationError("Salesforce Pub/Sub integer field is invalid");
  }
  return field.value;
}

function validateNumRequested(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_FETCH_EVENTS) {
    throw new PlatformIntegrationConfigurationError("Salesforce num_requested must be between 1 and 100");
  }
  return value;
}

function replayPresetNumber(value: SalesforceReplayPreset) {
  if (value === "LATEST") return 0;
  if (value === "EARLIEST") return 1;
  if (value === "CUSTOM") return 2;
  throw new PlatformIntegrationConfigurationError("Salesforce replay preset is invalid");
}

export function encodeSalesforceFetchRequest(input: SalesforceFetchRequestInput) {
  const numRequested = validateNumRequested(input.numRequested);

  if (input.phase === "FLOW_CONTROL") {
    return encodeVarintField(4, numRequested);
  }

  const topic = validateSalesforceCdcTopic(input.topic);
  const replayPreset = replayPresetNumber(input.replayPreset);
  const fields: Buffer[] = [encodeStringField(1, topic)];

  if (replayPreset !== 0) {
    fields.push(encodeVarintField(2, replayPreset));
  }

  if (input.replayPreset === "CUSTOM") {
    if (!input.replayIdBase64) {
      throw new PlatformIntegrationConfigurationError("Salesforce CUSTOM replay requires a replay ID");
    }
    const replayIdBase64 = validateSalesforceReplayIdBase64(input.replayIdBase64);
    fields.push(encodeBytesField(3, Buffer.from(replayIdBase64, "base64")));
  } else if (input.replayIdBase64) {
    throw new PlatformIntegrationConfigurationError("Salesforce replay ID is allowed only with CUSTOM replay");
  }

  fields.push(encodeVarintField(4, numRequested));
  return Buffer.concat(fields);
}

function decodeProducerEvent(message: Uint8Array) {
  const fields = decodeFields(message);
  const eventId = requiredString(fields, 1, "Salesforce producer event ID", MAX_EVENT_ID_BYTES);
  const schemaId = requiredString(fields, 2, "Salesforce producer schema ID", MAX_SCHEMA_ID_BYTES);
  const payloadBytes = requiredBytes(fields, 3, "Salesforce producer payload", MAX_EVENT_PAYLOAD_BYTES);

  return {
    eventId,
    schemaId,
    payloadBytes: Uint8Array.from(payloadBytes),
  };
}

function decodeConsumerEvent(message: Uint8Array): SalesforcePubSubConsumerEventEnvelope {
  const fields = decodeFields(message);
  const eventMessage = requiredBytes(fields, 1, "Salesforce consumer event", MAX_EVENT_PAYLOAD_BYTES + 2048);
  const replayId = requiredBytes(fields, 2, "Salesforce consumer replay ID", 3072);
  const producer = decodeProducerEvent(eventMessage);
  const replayIdBase64 = Buffer.from(replayId).toString("base64");
  validateSalesforceReplayIdBase64(replayIdBase64);

  return {
    ...producer,
    replayIdBase64,
  };
}

export function decodeSalesforceFetchResponse(message: Uint8Array): SalesforceFetchResponseEnvelope {
  const fields = decodeFields(message);
  const rawEvents = fields.get(1) ?? [];
  if (rawEvents.length > MAX_FETCH_EVENTS) {
    throw new PlatformIntegrationConfigurationError("Salesforce FetchResponse contains too many events");
  }

  const events = rawEvents.map((field) => {
    if (field.wireType !== 2 || !(field.value instanceof Uint8Array)) {
      throw new PlatformIntegrationConfigurationError("Salesforce FetchResponse event field is invalid");
    }
    return decodeConsumerEvent(field.value);
  });

  const latestReplayId = requiredBytes(fields, 2, "Salesforce latest replay ID", 3072);
  const latestReplayIdBase64 = Buffer.from(latestReplayId).toString("base64");
  validateSalesforceReplayIdBase64(latestReplayIdBase64);

  const pendingNumRequested = optionalVarint(fields, 4);
  if (!Number.isInteger(pendingNumRequested) || pendingNumRequested < 0 || pendingNumRequested > MAX_FETCH_EVENTS) {
    throw new PlatformIntegrationConfigurationError("Salesforce pending_num_requested is invalid");
  }

  return {
    events,
    latestReplayIdBase64,
    rpcId: optionalString(fields, 3, MAX_RPC_ID_BYTES),
    pendingNumRequested,
    keepalive: events.length === 0,
  };
}

export function checkpointFromSalesforceFetchResponse(response: SalesforceFetchResponseEnvelope) {
  return {
    replayIdBase64: response.latestReplayIdBase64,
    kind: response.keepalive ? "KEEPALIVE" as const : "EVENT" as const,
  };
}

export const salesforceSubscribeProtocolLimits = Object.freeze({
  maxFetchEvents: MAX_FETCH_EVENTS,
  maxEventPayloadBytes: MAX_EVENT_PAYLOAD_BYTES,
});
