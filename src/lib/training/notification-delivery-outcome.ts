import type { TrainingReminderDeliveryResult } from "./notification-delivery-provider";

/**
 * Delivery outcome classification for the transaction layer.
 * An uncertain provider outcome must be manually reconciled, not retried.
 * Only a verified provider receipt is evidence of acceptance, not delivery
 * to a recipient inbox.
 */
export function classifyTrainingReminderOutcome(
  result: TrainingReminderDeliveryResult,
): "SENT" | "FAILED" | "REVIEW_REQUIRED" {
  switch (result.status) {
    case "accepted":
      return result.providerMessageId.trim() ? "SENT" : "REVIEW_REQUIRED";
    case "rejected":
      return "FAILED";
    case "unknown":
      return "REVIEW_REQUIRED";
  }
}
