import { createHash } from "node:crypto";
import { PlatformIntegrationConflictError } from "./integration-framework";
import {
  SalesforceCdcAvroInterpreter,
  type SalesforceAvroInterpretation,
} from "./salesforce-cdc-avro-interpreter";
import type { SalesforcePubSubSchemaInfo } from "./salesforce-pubsub-discovery";

export type SalesforceCdcImmutableReceiptEvidence = {
  id: string;
  schemaId: string;
  payloadBytes: Uint8Array;
  payloadSha256: string;
};

export type SalesforceCdcReceiptInterpretation = SalesforceAvroInterpretation & {
  receiptId: string;
};

export class SalesforceCdcReceiptInterpretationService {
  constructor(
    private readonly interpreter: SalesforceCdcAvroInterpreter = new SalesforceCdcAvroInterpreter(),
  ) {}

  interpret(input: {
    receipt: SalesforceCdcImmutableReceiptEvidence;
    schema: SalesforcePubSubSchemaInfo;
  }): SalesforceCdcReceiptInterpretation {
    const actualPayloadSha256 = createHash("sha256")
      .update(Buffer.from(input.receipt.payloadBytes))
      .digest("hex");

    if (actualPayloadSha256 !== input.receipt.payloadSha256) {
      throw new PlatformIntegrationConflictError(
        "Salesforce immutable receipt payload hash does not match stored evidence",
      );
    }

    const interpretation = this.interpreter.interpret({
      receiptSchemaId: input.receipt.schemaId,
      payloadBytes: input.receipt.payloadBytes,
      schemaId: input.schema.schemaId,
      schemaJson: input.schema.schemaJson,
    });

    if (interpretation.schemaSha256 !== input.schema.schemaSha256) {
      throw new PlatformIntegrationConflictError(
        "Salesforce discovered schema hash does not match schema content",
      );
    }

    return {
      receiptId: input.receipt.id,
      ...interpretation,
    };
  }
}
