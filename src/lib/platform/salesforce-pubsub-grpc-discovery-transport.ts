import { connect, constants as http2Constants, type ClientHttp2Session } from "node:http2";
import {
  PlatformIntegrationConfigurationError,
} from "./integration-framework";
import {
  salesforcePubSubEndpoint,
  type SalesforcePubSubDiscoveryTransport,
  type SalesforcePubSubRpcMetadata,
} from "./salesforce-pubsub-discovery";

const AUTHORITY = "https://api.pubsub.salesforce.com";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2_500_000;

const RPC_PATHS = {
  getTopic: "/eventbus.v1.PubSub/GetTopic",
  getSchema: "/eventbus.v1.PubSub/GetSchema",
} as const;

type HeaderMap = Record<string, string | string[] | undefined>;

function encodeVarint(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new PlatformIntegrationConfigurationError("Protobuf varint value is invalid");
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

function encodeStringField(fieldNumber: number, value: string) {
  const bytes = Buffer.from(value, "utf8");
  return Buffer.concat([
    encodeVarint((fieldNumber << 3) | 2),
    encodeVarint(bytes.length),
    bytes,
  ]);
}

function encodeGrpcFrame(message: Uint8Array) {
  const payload = Buffer.from(message);
  const header = Buffer.alloc(5);
  header.writeUInt8(0, 0);
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}

function readVarint(buffer: Uint8Array, offset: number) {
  let result = 0;
  let multiplier = 1;
  let index = offset;
  for (let count = 0; count < 10; count += 1) {
    if (index >= buffer.length) throw new PlatformIntegrationConfigurationError("Protobuf response ended unexpectedly");
    const byte = buffer[index++];
    result += (byte & 0x7f) * multiplier;
    if ((byte & 0x80) === 0) return { value: result, offset: index };
    multiplier *= 128;
  }
  throw new PlatformIntegrationConfigurationError("Protobuf varint is too long");
}

function decodeLengthDelimited(buffer: Uint8Array, offset: number) {
  const length = readVarint(buffer, offset);
  const end = length.offset + length.value;
  if (length.value < 0 || end > buffer.length) {
    throw new PlatformIntegrationConfigurationError("Protobuf field length is invalid");
  }
  return {
    value: buffer.slice(length.offset, end),
    offset: end,
  };
}

function skipField(buffer: Uint8Array, offset: number, wireType: number) {
  if (wireType === 0) return readVarint(buffer, offset).offset;
  if (wireType === 1) {
    if (offset + 8 > buffer.length) throw new PlatformIntegrationConfigurationError("Protobuf fixed64 field is truncated");
    return offset + 8;
  }
  if (wireType === 2) return decodeLengthDelimited(buffer, offset).offset;
  if (wireType === 5) {
    if (offset + 4 > buffer.length) throw new PlatformIntegrationConfigurationError("Protobuf fixed32 field is truncated");
    return offset + 4;
  }
  throw new PlatformIntegrationConfigurationError("Unsupported protobuf wire type");
}

function decodeFields(buffer: Uint8Array) {
  const fields = new Map<number, Array<{ wireType: number; value: Uint8Array | number }>>();
  let offset = 0;
  while (offset < buffer.length) {
    const key = readVarint(buffer, offset);
    offset = key.offset;
    const fieldNumber = key.value >>> 3;
    const wireType = key.value & 0x07;
    if (fieldNumber <= 0) throw new PlatformIntegrationConfigurationError("Protobuf field number is invalid");

    let value: Uint8Array | number;
    if (wireType === 0) {
      const decoded = readVarint(buffer, offset);
      value = decoded.value;
      offset = decoded.offset;
    } else if (wireType === 2) {
      const decoded = decodeLengthDelimited(buffer, offset);
      value = decoded.value;
      offset = decoded.offset;
    } else {
      offset = skipField(buffer, offset, wireType);
      continue;
    }
    const existing = fields.get(fieldNumber) ?? [];
    existing.push({ wireType, value });
    fields.set(fieldNumber, existing);
  }
  return fields;
}

function firstString(fields: ReturnType<typeof decodeFields>, fieldNumber: number, label: string) {
  const entry = fields.get(fieldNumber)?.[0];
  if (!entry || entry.wireType !== 2 || !(entry.value instanceof Uint8Array)) {
    throw new PlatformIntegrationConfigurationError(`${label} is missing from Salesforce Pub/Sub response`);
  }
  return Buffer.from(entry.value).toString("utf8");
}

function firstBoolean(fields: ReturnType<typeof decodeFields>, fieldNumber: number) {
  const entry = fields.get(fieldNumber)?.[0];
  return Boolean(entry && entry.wireType === 0 && typeof entry.value === "number" && entry.value !== 0);
}

function decodeTopicInfo(message: Uint8Array) {
  const fields = decodeFields(message);
  return {
    topic_name: firstString(fields, 1, "Salesforce topic name"),
    tenant_guid: firstString(fields, 2, "Salesforce tenant GUID"),
    can_publish: firstBoolean(fields, 3),
    can_subscribe: firstBoolean(fields, 4),
    schema_id: firstString(fields, 5, "Salesforce schema ID"),
    rpc_id: fields.get(6)?.[0]?.value instanceof Uint8Array
      ? Buffer.from(fields.get(6)![0].value as Uint8Array).toString("utf8")
      : null,
  };
}

function decodeSchemaInfo(message: Uint8Array) {
  const fields = decodeFields(message);
  return {
    schema_json: firstString(fields, 1, "Salesforce schema JSON"),
    schema_id: firstString(fields, 2, "Salesforce schema ID"),
    rpc_id: fields.get(3)?.[0]?.value instanceof Uint8Array
      ? Buffer.from(fields.get(3)![0].value as Uint8Array).toString("utf8")
      : null,
  };
}

function decodeGrpcUnaryResponse(body: Uint8Array) {
  if (body.length < 5) throw new PlatformIntegrationConfigurationError("Salesforce gRPC response is incomplete");
  const compressed = body[0];
  if (compressed !== 0) throw new PlatformIntegrationConfigurationError("Compressed Salesforce gRPC responses are not supported");
  const length = Buffer.from(body).readUInt32BE(1);
  if (length > MAX_RESPONSE_BYTES || body.length !== length + 5) {
    throw new PlatformIntegrationConfigurationError("Salesforce gRPC response length is invalid");
  }
  return body.slice(5);
}

function grpcStatus(headers: HeaderMap) {
  const value = headers["grpc-status"];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function grpcMessage(headers: HeaderMap) {
  const value = headers["grpc-message"];
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).slice(0, 300);
  } catch {
    return raw.slice(0, 300);
  }
}

function validateMetadata(metadata: SalesforcePubSubRpcMetadata) {
  for (const [key, value] of Object.entries(metadata)) {
    if (!value || /[\r\n]/.test(value)) {
      throw new PlatformIntegrationConfigurationError(`Salesforce Pub/Sub metadata ${key} is invalid`);
    }
  }
}

async function unaryRpc(input: {
  path: string;
  requestMessage: Uint8Array;
  metadata: SalesforcePubSubRpcMetadata;
}) {
  validateMetadata(input.metadata);
  if (!Object.values(RPC_PATHS).includes(input.path as (typeof RPC_PATHS)[keyof typeof RPC_PATHS])) {
    throw new PlatformIntegrationConfigurationError("Salesforce Pub/Sub RPC path is not allowed");
  }

  const session: ClientHttp2Session = connect(AUTHORITY);
  return await new Promise<Uint8Array>((resolve, reject) => {
    let settled = false;
    let responseBytes = 0;
    const chunks: Buffer[] = [];
    let trailers: HeaderMap = {};
    let responseHeaders: HeaderMap = {};

    let timer: ReturnType<typeof setTimeout> | null = null;
    const finishError = (error: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      session.close();
      reject(error);
    };

    session.once("error", (error) => finishError(new Error(`Salesforce Pub/Sub transport failed: ${error.message}`)));

    const request = session.request({
      [http2Constants.HTTP2_HEADER_METHOD]: "POST",
      [http2Constants.HTTP2_HEADER_PATH]: input.path,
      [http2Constants.HTTP2_HEADER_SCHEME]: "https",
      [http2Constants.HTTP2_HEADER_AUTHORITY]: "api.pubsub.salesforce.com",
      [http2Constants.HTTP2_HEADER_CONTENT_TYPE]: "application/grpc",
      te: "trailers",
      "grpc-timeout": "10S",
      accesstoken: input.metadata.accesstoken,
      instanceurl: input.metadata.instanceurl,
      tenantid: input.metadata.tenantid,
    });

    timer = setTimeout(() => {
      request.close(http2Constants.NGHTTP2_CANCEL);
      finishError(new Error("Salesforce Pub/Sub RPC timed out"));
    }, REQUEST_TIMEOUT_MS);

    request.on("response", (headers) => {
      responseHeaders = headers as HeaderMap;
      const status = headers[http2Constants.HTTP2_HEADER_STATUS];
      if (String(status) !== "200") {
        finishError(new Error(`Salesforce Pub/Sub HTTP transport failed with status ${status ?? "unknown"}`));
      }
    });
    request.on("trailers", (headers) => {
      trailers = headers as HeaderMap;
    });
    request.on("data", (chunk: Buffer) => {
      responseBytes += chunk.length;
      if (responseBytes > MAX_RESPONSE_BYTES + 5) {
        request.close(http2Constants.NGHTTP2_CANCEL);
        finishError(new PlatformIntegrationConfigurationError("Salesforce gRPC response exceeds the maximum size"));
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    request.on("error", (error) => finishError(new Error(`Salesforce Pub/Sub RPC failed: ${error.message}`)));
    request.on("end", () => {
      if (settled) return;
      const finalStatus = grpcStatus(trailers) ?? grpcStatus(responseHeaders);
      if (finalStatus !== "0") {
        const message = grpcMessage(trailers) ?? grpcMessage(responseHeaders);
        finishError(new Error(`Salesforce Pub/Sub RPC returned gRPC status ${finalStatus ?? "missing"}${message ? `: ${message}` : ""}`));
        return;
      }
      settled = true;
      if (timer) clearTimeout(timer);
      session.close();
      try {
        resolve(decodeGrpcUnaryResponse(Buffer.concat(chunks)));
      } catch (error) {
        reject(error);
      }
    });

    request.end(encodeGrpcFrame(input.requestMessage));
  });
}

export class NodeHttp2SalesforcePubSubDiscoveryTransport implements SalesforcePubSubDiscoveryTransport {
  async getTopic(input: {
    endpoint: string;
    metadata: SalesforcePubSubRpcMetadata;
    topicName: string;
  }) {
    if (input.endpoint !== salesforcePubSubEndpoint("global")) {
      throw new PlatformIntegrationConfigurationError("Salesforce Pub/Sub endpoint is not allowed");
    }
    const response = await unaryRpc({
      path: RPC_PATHS.getTopic,
      metadata: input.metadata,
      requestMessage: encodeStringField(1, input.topicName),
    });
    return decodeTopicInfo(response);
  }

  async getSchema(input: {
    endpoint: string;
    metadata: SalesforcePubSubRpcMetadata;
    schemaId: string;
  }) {
    if (input.endpoint !== salesforcePubSubEndpoint("global")) {
      throw new PlatformIntegrationConfigurationError("Salesforce Pub/Sub endpoint is not allowed");
    }
    const response = await unaryRpc({
      path: RPC_PATHS.getSchema,
      metadata: input.metadata,
      requestMessage: encodeStringField(1, input.schemaId),
    });
    return decodeSchemaInfo(response);
  }
}

export const salesforcePubSubDiscoveryRpcPaths = Object.freeze({ ...RPC_PATHS });


export const salesforcePubSubGrpcCodec = Object.freeze({
  encodeStringField,
  encodeGrpcFrame,
  decodeGrpcUnaryResponse,
  decodeTopicInfo,
  decodeSchemaInfo,
});
