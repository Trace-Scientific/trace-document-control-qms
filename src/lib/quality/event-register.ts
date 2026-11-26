import type { QualityEventStatus } from "./events";

export type QualityEventView = "all" | "active" | "mine" | "overdue" | "unassigned";

type RegisterEvent = {
  eventNumber: string;
  summary: string;
  severity: string;
  status: QualityEventStatus;
  ownerUserId: string | null;
  dueAt: string | null;
};

export function isQualityEventOverdue(event: RegisterEvent, today: string) {
  return event.status !== "CLOSED" && event.dueAt !== null && event.dueAt.slice(0, 10) < today;
}

export function filterQualityEvents<T extends RegisterEvent>(
  events: readonly T[],
  filters: { view: QualityEventView; query: string; status: string; severity: string },
  userId: string,
  today: string,
) {
  const query = filters.query.trim().toLowerCase();
  return events.filter(event => {
    if (filters.view !== "all" && event.status === "CLOSED") return false;
    if (filters.view === "mine" && event.ownerUserId !== userId) return false;
    if (filters.view === "overdue" && !isQualityEventOverdue(event, today)) return false;
    if (filters.view === "unassigned" && event.ownerUserId !== null) return false;
    if (filters.status && event.status !== filters.status) return false;
    if (filters.severity && event.severity !== filters.severity) return false;
    return event.eventNumber.toLowerCase().includes(query) || event.summary.toLowerCase().includes(query);
  });
}
