import type { ClaimedPlatformNotification, PlatformNotificationChannel } from "./notifications-reporting";
import { PlatformNotificationReportingService } from "./notifications-reporting";

export interface PlatformNotificationTransport {
  readonly channel: PlatformNotificationChannel;
  send(notification: ClaimedPlatformNotification): Promise<void>;
}

export class InAppPlatformNotificationTransport implements PlatformNotificationTransport {
  readonly channel = "IN_APP" as const;
  async send(notification: ClaimedPlatformNotification): Promise<void> {
    void notification;
    // In-app delivery is complete once the durable row reaches SENT.
  }
}

export class UnconfiguredEmailPlatformNotificationTransport implements PlatformNotificationTransport {
  readonly channel = "EMAIL" as const;
  async send(notification: ClaimedPlatformNotification): Promise<void> {
    void notification;
    throw new Error("Platform email provider is not configured");
  }
}

export class PlatformNotificationDeliveryWorker {
  constructor(
    private readonly service = new PlatformNotificationReportingService(),
    private readonly transports: readonly PlatformNotificationTransport[] = [
      new InAppPlatformNotificationTransport(),
      new UnconfiguredEmailPlatformNotificationTransport(),
    ],
  ) {}

  async run(workerId: string, limit = 25) {
    const claimed = await this.service.claimDeliveryBatch(workerId, limit);
    const results: Array<{ id: string; outcome: "SENT" | "RETRY" | "DEAD_LETTER" }> = [];

    for (const notification of claimed) {
      const transport = this.transports.find((candidate) => candidate.channel === notification.channel);
      if (!transport) {
        const failed = await this.service.markDeliveryFailed(notification.id, workerId, `No transport configured for ${notification.channel}`);
        results.push({ id: notification.id, outcome: failed.status === "DEAD_LETTER" ? "DEAD_LETTER" : "RETRY" });
        continue;
      }

      try {
        await transport.send(notification);
        await this.service.markDelivered(notification.id, workerId);
        results.push({ id: notification.id, outcome: "SENT" });
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 1000) : "Platform notification delivery failed";
        const failed = await this.service.markDeliveryFailed(notification.id, workerId, message);
        results.push({ id: notification.id, outcome: failed.status === "DEAD_LETTER" ? "DEAD_LETTER" : "RETRY" });
      }
    }

    return { claimed: claimed.length, results };
  }
}
