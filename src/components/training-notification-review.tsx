"use client";

import { useState } from "react";

type ReviewRow = {
  id: string;
  employeeNumber: string;
  courseCode: string;
  courseTitle: string;
  renewalDueDate: string;
  reminderType: string;
  lastAttemptAt: string | null;
  updatedAt: string;
  reviewReason?: string | null;
  disposition?: string | null;
  closedAt?: string | null;
};

type ReviewView = "open" | "closed";

type ReviewPage = {
  page: number;
  hasMore: boolean;
  recoverableCount?: number;
  data: ReviewRow[];
};

const reminderLabels: Record<string, string> = {
  DUE_30: "30-day reminder",
  DUE_7: "7-day reminder",
  OVERDUE: "Overdue reminder",
};

function reviewReasonLabel(reason: ReviewRow["reviewReason"]) {
  switch (reason) {
    case "provider_delivery_unknown":
      return "Provider acceptance could not be confirmed";
    case "interrupted_delivery_unknown":
      return "Delivery processing was interrupted";
    default:
      return "Reason unavailable";
  }
}

const reviewOutcomes: Record<string, string> = {
  PROVIDER_ACCEPTANCE_CONFIRMED: "Provider acceptance confirmed",
  PROVIDER_NON_ACCEPTANCE_CONFIRMED: "Provider non-acceptance confirmed",
  OUTCOME_UNCONFIRMED: "Outcome could not be confirmed",
};

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function TrainingNotificationReview() {
  const [view, setView] = useState<ReviewView>("open");
  const [result, setResult] = useState<ReviewPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<ReviewRow | null>(null);
  const [disposition, setDisposition] = useState("");
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState("");
  const [closedMessage, setClosedMessage] = useState("");

  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState("");

  async function loadPage(page: number, nextView = view) {
    if (nextView !== view) {
      setView(nextView);
      setResult(null);
      setClosedMessage("");
      setRecoveryMessage("");
      setRecoveryError(false);
    }
    setLoading(true);
    setError(false);
    setSelected(null);
    setCloseError("");
    try {
      const response = await fetch(`/api/training/notification-review?page=${page}&view=${nextView}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Review queue unavailable");
      setResult(await response.json() as ReviewPage);
    } catch {
      setResult(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function submitReview() {
    if (!selected || !disposition) return;

    setClosing(true);
    setCloseError("");
    setClosedMessage("");
    try {
      const response = await fetch("/api/training/notification-review", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryId: selected.id, disposition }),
      });
      if (response.status === 409) {
        await loadPage(1);
        setCloseError("This reminder is no longer available for review.");
        return;
      }
      if (!response.ok) throw new Error("Review decision could not be saved");

      await loadPage(1);
      setClosedMessage("Review closed.");
    } catch {
      setCloseError("Review could not be closed. Try again.");
    } finally {
      setClosing(false);
    }
  }

  async function recoverInterruptedReminders() {
    setRecovering(true);
    setRecoveryError(false);
    setRecoveryMessage("");
    setClosedMessage("");
    try {
      const response = await fetch("/api/training/notification-recovery", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("Reminder recovery unavailable");

      const { data } = await response.json() as { data: { movedForReview: number } };
      await loadPage(1, "open");
      setRecoveryMessage(data.movedForReview === 0
        ? "No interrupted reminders were available for review."
        : `Moved ${data.movedForReview} interrupted reminder${data.movedForReview === 1 ? "" : "s"} to review.`);
    } catch {
      setRecoveryError(true);
    } finally {
      setRecovering(false);
    }
  }

  const busy = loading || closing || recovering;
  const showHistory = view === "closed";
  const recoverableCount = result?.recoverableCount ?? 0;

  return (
    <section aria-label="Training reminder delivery reviews" aria-busy={busy}>
      <button type="button" disabled={busy} onClick={() => void loadPage(1, "open")}>
        {result && !showHistory ? "Refresh reminders requiring review" : "View reminders requiring review"}
      </button>
      <button type="button" disabled={busy} onClick={() => void loadPage(1, "closed")}>
        {result && showHistory ? "Refresh closed review history" : "View closed review history"}
      </button>
      {!showHistory && !selected && recoverableCount > 0 && (
        <div>
          <p role="status">
            {recoverableCount === 1
              ? "1 reminder attempt has stalled for over an hour."
              : `${recoverableCount} reminder attempts have stalled for over an hour.`}
          </p>
          <button type="button" disabled={busy} onClick={() => void recoverInterruptedReminders()}>
            Move up to 25 stalled attempts to review
          </button>
        </div>
      )}
      {recoveryError && <p role="alert">Interrupted reminders could not be moved to review. Try again.</p>}
      {recoveryMessage && <p role="status">{recoveryMessage}</p>}
      {loading && <p role="status">{showHistory ? "Loading closed reviews…" : "Loading reminders for review…"}</p>}
      {error && <p role="alert">{showHistory ? "Closed reviews could not be loaded." : "Reminders requiring review could not be loaded."}</p>}
      {closeError && <p role="alert">{closeError}</p>}
      {closedMessage && <p role="status">{closedMessage}</p>}
      {selected && (
        <form onSubmit={(event) => { event.preventDefault(); void submitReview(); }}>
          <p>Close review for {selected.employeeNumber} · {selected.courseCode} · due {selected.renewalDueDate}.</p>
          <label>
            Review outcome{" "}
            <select required value={disposition} onChange={(event) => setDisposition(event.target.value)} disabled={busy}>
              <option value="">Select an outcome</option>
              {Object.entries(reviewOutcomes).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={busy || !disposition}>Close review</button>
          <button type="button" disabled={busy} onClick={() => { setSelected(null); setCloseError(""); }}>Cancel</button>
        </form>
      )}
      {result && (
        <>
          {result.data.length === 0 ? (
            <p role="status">{result.page > 1 ? "No reminders on this page." : showHistory ? "No reminder reviews have been closed." : "No reminders require review."}</p>
          ) : (
            <div className="table-wrap">
              <table>
                <caption>{showHistory ? "Closed training reminder reviews" : "Training reminders requiring review"}</caption>
                <thead>
                  <tr>
                    <th scope="col">Employee number</th>
                    <th scope="col">Course</th>
                    <th scope="col">Reminder</th>
                    <th scope="col">Renewal due</th>
                    <th scope="col">Last attempt</th>
                    <th scope="col">{showHistory ? "Review closed" : "Flagged for review"}</th>
                    <th scope="col">Review reason</th>
                    <th scope="col">Delivery reference</th>
                    <th scope="col">{showHistory ? "Recorded outcome" : "Action"}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((row) => (
                    <tr key={row.id}>
                      <td>{row.employeeNumber}</td>
                      <td>{row.courseCode} · {row.courseTitle}</td>
                      <td>{reminderLabels[row.reminderType] ?? row.reminderType}</td>
                      <td>{row.renewalDueDate}</td>
                      <td>{row.lastAttemptAt ? dateTime.format(new Date(row.lastAttemptAt)) : "Unavailable"}</td>
                      <td>{showHistory
                        ? row.closedAt ? dateTime.format(new Date(row.closedAt)) : "Unavailable"
                        : dateTime.format(new Date(row.updatedAt))}</td>
                      <td>{reviewReasonLabel(row.reviewReason)}</td>
                      <td><code>{row.id}</code></td>
                      <td>
                        {showHistory ? (reviewOutcomes[row.disposition ?? ""] ?? "Unavailable") : <button
                          type="button"
                          disabled={busy}
                          aria-label={`Record outcome for ${row.employeeNumber}, ${row.courseCode}, ${reminderLabels[row.reminderType] ?? row.reminderType}, due ${row.renewalDueDate}`}
                          onClick={() => {
                            setSelected(row);
                            setDisposition("");
                            setCloseError("");
                            setClosedMessage("");
                          }}
                        >
                          Record outcome
                        </button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(result.page > 1 || result.hasMore) && (
            <nav aria-label="Review queue pages">
              <button type="button" disabled={busy || result.page === 1} onClick={() => void loadPage(result.page - 1)}>
                Previous page
              </button>
              <span> Page {result.page} </span>
              <button type="button" disabled={busy || !result.hasMore} onClick={() => void loadPage(result.page + 1)}>
                Next page
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
