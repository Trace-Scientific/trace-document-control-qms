import {
  connect,
  constants as http2Constants,
  type ClientHttp2Session,
  type ClientHttp2Stream,
} from "node:http2";
import { PlatformIntegrationConfigurationError } from "./integration-framework";
import {
  salesforcePubSubEndpoint,
  type SalesforcePubSubRpcMetadata,
} from "./salesforce-pubsub-discovery";
import {
  decodeSalesforceFetchResponse,
  encodeSalesforceFetchRequest,
  type SalesforceFetchRequestInput,
  type SalesforceFetchResponseEnvelope,
} from "./salesforce-pubsub-subscribe-protocol";

const AUTHORITY = "https://api.pubsub.salesforce.com";
const SUBSCRIBE_RPC_PATH = "/eventbus.v1.PubSub/Subscribe";
const MAX_GRPC_MESSAGE_BYTES = 4 * 1024 * 1024;
const MAX_BUFFERED_BYTES = MAX_GRPC_MESSAGE_BYTES + 5;
const STREAM_IDLE_TIMEOUT_MS = 300_000;

type HeaderMap = Record<string, string | string[] | undefined>;

export type SalesforceSubscribeStreamCallbacks = {
  onResponse(response: SalesforceFetchResponseEnvelope): void | Promise<void>;
  onError(error: Error): void | Promise<void>;
  onEnd(): void | Promise<void>;
};

export type SalesforceSubscribeStreamHandle = {
  sendInitial(input: Extract<SalesforceFetchRequestInput, { phase: "INITIAL" }>): void;
  requestMore(numRequested: number): void;
  close(): void;
};

function validateMetadata(metadata: SalesforcePubSubRpcMetadata) {
  for (const [key, value] of Object.entries(metadata)) {
    if (!value || /[\r\n]/.test(value)) {
      throw new PlatformIntegrationConfigurationError(`Salesforce Pub/Sub metadata ${key} is invalid`);
    }
  }
}

function encodeGrpcFrame(message: Uint8Array) {
  if (message.length > MAX_GRPC_MESSAGE_BYTES) {
    throw new PlatformIntegrationConfigurationError("Salesforce gRPC request message exceeds the maximum size");
  }
  const header = Buffer.alloc(5);
  header.writeUInt8(0, 0);
  header.writeUInt32BE(message.length, 1);
  return Buffer.concat([header, Buffer.from(message)]);
}

function grpcStatus(headers: HeaderMap) {
  const value = headers["grpc-status"];
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
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

export class SalesforceGrpcStreamFrameDecoder {
  private buffered = Buffer.alloc(0);

  push(chunk: Uint8Array): Uint8Array[] {
    if (chunk.length === 0) return [];
    if (this.buffered.length + chunk.length > MAX_BUFFERED_BYTES) {
      throw new PlatformIntegrationConfigurationError("Salesforce gRPC stream buffer exceeds the maximum size");
    }

    this.buffered = Buffer.concat([this.buffered, Buffer.from(chunk)]);
    const messages: Uint8Array[] = [];

    while (this.buffered.length >= 5) {
      const compressed = this.buffered.readUInt8(0);
      if (compressed !== 0) {
        throw new PlatformIntegrationConfigurationError("Compressed Salesforce gRPC stream messages are not supported");
      }

      const length = this.buffered.readUInt32BE(1);
      if (length > MAX_GRPC_MESSAGE_BYTES) {
        throw new PlatformIntegrationConfigurationError("Salesforce gRPC stream message exceeds the maximum size");
      }
      if (this.buffered.length < length + 5) break;

      messages.push(Uint8Array.from(this.buffered.subarray(5, length + 5)));
      this.buffered = this.buffered.subarray(length + 5);
    }

    return messages;
  }

  finish() {
    if (this.buffered.length !== 0) {
      throw new PlatformIntegrationConfigurationError("Salesforce gRPC stream ended with an incomplete frame");
    }
  }

  bufferedBytes() {
    return this.buffered.length;
  }
}

export class NodeHttp2SalesforcePubSubSubscribeTransport {
  open(input: {
    endpoint: string;
    metadata: SalesforcePubSubRpcMetadata;
    callbacks: SalesforceSubscribeStreamCallbacks;
  }): SalesforceSubscribeStreamHandle {
    if (input.endpoint !== salesforcePubSubEndpoint("global")) {
      throw new PlatformIntegrationConfigurationError("Salesforce Pub/Sub endpoint is not allowed");
    }
    validateMetadata(input.metadata);

    const session: ClientHttp2Session = connect(AUTHORITY);
    const decoder = new SalesforceGrpcStreamFrameDecoder();
    let request: ClientHttp2Stream | null = null;
    let responseHeaders: HeaderMap = {};
    let trailers: HeaderMap = {};
    let initialSent = false;
    let closed = false;
    let ended = false;
    let callbackChain = Promise.resolve();
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const enqueue = (action: () => void | Promise<void>) => {
      callbackChain = callbackChain.then(action, action);
    };

    const clearIdleTimer = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    const closeResources = () => {
      if (closed) return;
      closed = true;
      clearIdleTimer();
      if (request && !request.closed) {
        request.close(http2Constants.NGHTTP2_CANCEL);
      }
      session.close();
    };

    const fail = (error: Error) => {
      if (closed) return;
      closeResources();
      enqueue(() => input.callbacks.onError(error));
    };

    const armIdleTimer = () => {
      clearIdleTimer();
      idleTimer = setTimeout(() => {
        fail(new Error("Salesforce Pub/Sub Subscribe stream exceeded the idle timeout"));
      }, STREAM_IDLE_TIMEOUT_MS);
    };

    session.once("error", (error) => {
      fail(new Error(`Salesforce Pub/Sub Subscribe transport failed: ${error.message}`));
    });

    request = session.request({
      [http2Constants.HTTP2_HEADER_METHOD]: "POST",
      [http2Constants.HTTP2_HEADER_PATH]: SUBSCRIBE_RPC_PATH,
      [http2Constants.HTTP2_HEADER_SCHEME]: "https",
      [http2Constants.HTTP2_HEADER_AUTHORITY]: "api.pubsub.salesforce.com",
      [http2Constants.HTTP2_HEADER_CONTENT_TYPE]: "application/grpc",
      te: "trailers",
      accesstoken: input.metadata.accesstoken,
      instanceurl: input.metadata.instanceurl,
      tenantid: input.metadata.tenantid,
    });

    request.on("response", (headers) => {
      responseHeaders = headers as HeaderMap;
      const status = headers[http2Constants.HTTP2_HEADER_STATUS];
      if (status !== 200) {
        fail(new Error(`Salesforce Pub/Sub Subscribe HTTP transport failed with status ${status ?? "unknown"}`));
        return;
      }
      armIdleTimer();
    });

    request.on("trailers", (headers) => {
      trailers = headers as HeaderMap;
    });

    request.on("data", (chunk: Buffer) => {
      if (closed) return;
      armIdleTimer();
      try {
        for (const message of decoder.push(chunk)) {
          const response = decodeSalesforceFetchResponse(message);
          enqueue(() => input.callbacks.onResponse(response));
        }
      } catch (error) {
        fail(error instanceof Error ? error : new Error("Salesforce Pub/Sub Subscribe response decoding failed"));
      }
    });

    request.on("error", (error) => {
      fail(new Error(`Salesforce Pub/Sub Subscribe RPC failed: ${error.message}`));
    });

    request.on("end", () => {
      if (closed || ended) return;
      ended = true;
      clearIdleTimer();
      try {
        decoder.finish();
      } catch (error) {
        fail(error instanceof Error ? error : new Error("Salesforce Pub/Sub Subscribe stream framing failed"));
        return;
      }

      const finalStatus = grpcStatus(trailers) ?? grpcStatus(responseHeaders);
      if (finalStatus !== "0") {
        const message = grpcMessage(trailers) ?? grpcMessage(responseHeaders);
        fail(new Error(`Salesforce Pub/Sub Subscribe returned gRPC status ${finalStatus ?? "missing"}${message ? `: ${message}` : ""}`));
        return;
      }

      closeResources();
      enqueue(() => input.callbacks.onEnd());
    });

    return {
      sendInitial(fetchInput) {
        if (closed) throw new PlatformIntegrationConfigurationError("Salesforce Subscribe stream is closed");
        if (initialSent) throw new PlatformIntegrationConfigurationError("Salesforce Subscribe initial request was already sent");
        if (!request) throw new PlatformIntegrationConfigurationError("Salesforce Subscribe stream is unavailable");
        request.write(encodeGrpcFrame(encodeSalesforceFetchRequest(fetchInput)));
        initialSent = true;
        armIdleTimer();
      },

      requestMore(numRequested) {
        if (closed) throw new PlatformIntegrationConfigurationError("Salesforce Subscribe stream is closed");
        if (!initialSent) throw new PlatformIntegrationConfigurationError("Salesforce Subscribe initial request must be sent first");
        if (!request) throw new PlatformIntegrationConfigurationError("Salesforce Subscribe stream is unavailable");
        request.write(encodeGrpcFrame(encodeSalesforceFetchRequest({
          phase: "FLOW_CONTROL",
          numRequested,
        })));
        armIdleTimer();
      },

      close() {
        closeResources();
      },
    };
  }
}

export const salesforceSubscribeTransportConstants = Object.freeze({
  authority: AUTHORITY,
  rpcPath: SUBSCRIBE_RPC_PATH,
  maxGrpcMessageBytes: MAX_GRPC_MESSAGE_BYTES,
  idleTimeoutMs: STREAM_IDLE_TIMEOUT_MS,
});
