import {
  PlatformIntegrationConfigurationError,
  type PlatformCredentialResolver,
} from "./integration-framework";
import {
  SalesforceCdcSubscriberStateService,
  type SalesforceCdcCheckpointKind,
} from "./salesforce-cdc-subscriber-state";
import {
  parseSalesforcePubSubCredential,
  salesforcePubSubEndpoint,
} from "./salesforce-pubsub-discovery";
import type {
  SalesforceSubscribeStreamCallbacks,
  SalesforceSubscribeStreamHandle,
} from "./salesforce-pubsub-subscribe-transport";
import { NodeHttp2SalesforcePubSubSubscribeTransport } from "./salesforce-pubsub-subscribe-transport";
import { SalesforceCdcEventReceiptService } from "./salesforce-cdc-event-receipt";

const INITIAL_REQUEST_COUNT = 10;
const EVENT_RECEIPT_PERSIST_FAILED_CODE = "EVENT_RECEIPT_PERSIST_FAILED";
const CREDENTIAL_UNAVAILABLE_CODE = "CREDENTIAL_UNAVAILABLE";
const SUBSCRIBE_START_FAILED_CODE = "SUBSCRIBE_START_FAILED";
const SUBSCRIBE_STREAM_FAILED_CODE = "SUBSCRIBE_STREAM_FAILED";

type SalesforceSubscriberClaim = {
  id: string;
  connectionId: string;
  topic: string;
  replayIdBase64: string | null;
  credentialRef: string;
};

type SalesforceSubscriberStateBoundary = {
  claimReady(workerId: string, limit?: number): Promise<SalesforceSubscriberClaim[]>;
  checkpoint(input: {
    subscriptionId: string;
    workerId: string;
    replayIdBase64: string;
    kind: SalesforceCdcCheckpointKind;
  }): Promise<void>;
  release(subscriptionId: string, workerId: string): Promise<void>;
  markDegraded(subscriptionId: string, workerId: string, failureCode: string): Promise<void>;
};

type SalesforceEventReceiptBoundary = {
  persist(input: {
    subscriptionId: string;
    connectionId: string;
    topic: string;
    event: import("./salesforce-pubsub-subscribe-protocol").SalesforcePubSubConsumerEventEnvelope;
  }): Promise<{ id: string; duplicate: boolean; payloadSha256: string }>;
};

type SalesforceSubscribeTransportBoundary = {
  open(input: {
    endpoint: string;
    metadata: ReturnType<typeof parseSalesforcePubSubCredential>;
    callbacks: SalesforceSubscribeStreamCallbacks;
  }): SalesforceSubscribeStreamHandle;
};

export type SalesforceCdcActiveSubscription = {
  subscriptionId: string;
  connectionId: string;
  topic: string;
  replayMode: "LATEST" | "CUSTOM";
  close(): Promise<void>;
};

function failureCode(error: unknown) {
  if (error instanceof PlatformIntegrationConfigurationError) return "CONFIGURATION_ERROR";
  return SUBSCRIBE_STREAM_FAILED_CODE;
}

export class SalesforceCdcSubscriberController {
  constructor(
    private readonly credentials: PlatformCredentialResolver,
    private readonly state: SalesforceSubscriberStateBoundary = new SalesforceCdcSubscriberStateService(),
    private readonly transport: SalesforceSubscribeTransportBoundary = new NodeHttp2SalesforcePubSubSubscribeTransport(),
    private readonly receipts: SalesforceEventReceiptBoundary = new SalesforceCdcEventReceiptService(),
  ) {}

  async startNext(workerId: string): Promise<SalesforceCdcActiveSubscription | null> {
    const claims = await this.state.claimReady(workerId, 1);
    const claim = claims[0];
    if (!claim) return null;

    let stream: SalesforceSubscribeStreamHandle | null = null;
    let finalized = false;

    const markDegraded = async (code: string) => {
      if (finalized) return;
      finalized = true;
      stream?.close();
      await this.state.markDegraded(claim.id, workerId, code);
    };

    const release = async () => {
      if (finalized) return;
      finalized = true;
      stream?.close();
      await this.state.release(claim.id, workerId);
    };

    let credential: string | null;
    try {
      credential = await this.credentials.resolve(claim.credentialRef);
    } catch {
      await markDegraded(CREDENTIAL_UNAVAILABLE_CODE);
      return null;
    }
    if (!credential) {
      await markDegraded(CREDENTIAL_UNAVAILABLE_CODE);
      return null;
    }

    let metadata: ReturnType<typeof parseSalesforcePubSubCredential>;
    try {
      metadata = parseSalesforcePubSubCredential(credential);
    } catch {
      await markDegraded(CREDENTIAL_UNAVAILABLE_CODE);
      return null;
    }

    const callbacks: SalesforceSubscribeStreamCallbacks = {
      onResponse: async (response) => {
        if (finalized) return;

        if (response.keepalive && response.events.length === 0) {
          await this.state.checkpoint({
            subscriptionId: claim.id,
            workerId,
            replayIdBase64: response.latestReplayIdBase64,
            kind: "KEEPALIVE",
          });
          return;
        }

        try {
          for (const event of response.events) {
            await this.receipts.persist({
              subscriptionId: claim.id,
              connectionId: claim.connectionId,
              topic: claim.topic,
              event,
            });
          }
        } catch {
          await markDegraded(EVENT_RECEIPT_PERSIST_FAILED_CODE);
          return;
        }

        await this.state.checkpoint({
          subscriptionId: claim.id,
          workerId,
          replayIdBase64: response.latestReplayIdBase64,
          kind: "EVENT",
        });
      },

      onError: async (error) => {
        await markDegraded(failureCode(error));
      },

      onEnd: async () => {
        await release();
      },
    };

    try {
      stream = this.transport.open({
        endpoint: salesforcePubSubEndpoint("global"),
        metadata,
        callbacks,
      });

      if (claim.replayIdBase64) {
        stream.sendInitial({
          phase: "INITIAL",
          topic: claim.topic,
          replayPreset: "CUSTOM",
          replayIdBase64: claim.replayIdBase64,
          numRequested: INITIAL_REQUEST_COUNT,
        });
      } else {
        stream.sendInitial({
          phase: "INITIAL",
          topic: claim.topic,
          replayPreset: "LATEST",
          numRequested: INITIAL_REQUEST_COUNT,
        });
      }
    } catch {
      await markDegraded(SUBSCRIBE_START_FAILED_CODE);
      return null;
    }

    return {
      subscriptionId: claim.id,
      connectionId: claim.connectionId,
      topic: claim.topic,
      replayMode: claim.replayIdBase64 ? "CUSTOM" : "LATEST",
      close: release,
    };
  }
}

export const salesforceCdcSubscriberControllerConstants = Object.freeze({
  initialRequestCount: INITIAL_REQUEST_COUNT,
  eventReceiptPersistFailedCode: EVENT_RECEIPT_PERSIST_FAILED_CODE,
});
