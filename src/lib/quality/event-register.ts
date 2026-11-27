import type { QualityEventSeverity, QualityEventStatus } from "./events";

export type QualityEventView = "all" | "active" | "mine" | "overdue" | "unassigned";

export type QualityEventSort = "newest" | "due" | "severity";

const severityOrder: Record<QualityEventSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

type RegisterEvent = {
  eventNumber: string;
  summary: string;
  severity: QualityEventSeverity;
  type: string;
  status: QualityEventStatus;
  ownerUserId: string | null;
  dueAt: string | null;
};

export function isQualityEventOverdue(event: RegisterEvent, today: string) {
  return event.status !== "CLOSED" && event.dueAt !== null && event.dueAt.slice(0, 10) < today;
}

export function filterQualityEvents<T extends RegisterEvent>(
  events: readonly T[],
  filters: { view: QualityEventView; query: string; status: string; severity: string; type: string; sort: QualityEventSort },
  userId: string,
  today: string,
) {
  const query = filters.query.trim().toLowerCase();
  const matches = events.filter(event => {
    if (filters.view !== "all" && event.status === "CLOSED") return false;
    if (filters.view === "mine" && event.ownerUserId !== userId) return false;
    if (filters.view === "overdue" && !isQualityEventOverdue(event, today)) return false;
    if (filters.view === "unassigned" && event.ownerUserId !== null) return false;
    if (filters.status && event.status !== filters.status) return false;
    if (filters.type && event.type !== filters.type) return false;
    if (filters.severity && event.severity !== filters.severity) return false;
    return event.eventNumber.toLowerCase().includes(query) || event.summary.toLowerCase().includes(query);
  });
  if (filters.sort === "newest") return matches;
  return matches.sort((left, right) => {
    const closedLast = Number(left.status === "CLOSED") - Number(right.status === "CLOSED");
    if (closedLast) return closedLast;
    const severity = severityOrder[left.severity] - severityOrder[right.severity];
    const due = Number(!left.dueAt) - Number(!right.dueAt) ||
      (left.dueAt ?? "").slice(0, 10).localeCompare((right.dueAt ?? "").slice(0, 10));
    return filters.sort === "severity" ? severity || due : due || severity;
  });
}
