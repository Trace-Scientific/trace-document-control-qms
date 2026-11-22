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
};

type ReviewPage = {
  page: number;
  hasMore: boolean;
  data: ReviewRow[];
};

const reminderLabels: Record<string, string> = {
  DUE_30: "30-day reminder",
  DUE_7: "7-day reminder",
  OVERDUE: "Overdue reminder",
};

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function TrainingNotificationReview() {
  const [result, setResult] = useState<ReviewPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<ReviewRow | null>(null);
  const [disposition, setDisposition] = useState("");
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState("");
  const [closedMessage, setClosedMessage] = useState("");

  async function loadPage(page: number) {
    setLoading(true);
    setError(false);
    setSelected(null);
    setCloseError("");
    try {
      const response = await fetch(`/api/training/notification-review?page=${page}`, {
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

  const busy = loading || closing;

  return (
    <section aria-label="Training reminders requiring review" aria-busy={busy}>
      <button type="button" disabled={busy} onClick={() => void loadPage(1)}>
        {result ? "Refresh reminders requiring review" : "View reminders requiring review"}
      </button>
      {loading && <p role="status">Loading reminders for review…</p>}
      {error && <p role="alert">Reminders requiring review could not be loaded.</p>}
      {closeError && <p role="alert">{closeError}</p>}
      {closedMessage && <p role="status">{closedMessage}</p>}
      {selected && (
        <form onSubmit={(event) => { event.preventDefault(); void submitReview(); }}>
          <p>Close review for {selected.employeeNumber} · {selected.courseCode} · due {selected.renewalDueDate}.</p>
          <label>
            Review outcome{" "}
            <select required value={disposition} onChange={(event) => setDisposition(event.target.value)} disabled={busy}>
              <option value="">Select an outcome</option>
              <option value="PROVIDER_ACCEPTANCE_CONFIRMED">Provider acceptance confirmed</option>
              <option value="PROVIDER_NON_ACCEPTANCE_CONFIRMED">Provider non-acceptance confirmed</option>
              <option value="OUTCOME_UNCONFIRMED">Outcome could not be confirmed</option>
            </select>
          </label>
          <button type="submit" disabled={busy || !disposition}>Close review</button>
          <button type="button" disabled={busy} onClick={() => { setSelected(null); setCloseError(""); }}>Cancel</button>
        </form>
      )}
      {result && (
        <>
          {result.data.length === 0 ? (
            <p role="status">{result.page === 1 ? "No reminders require review." : "No reminders on this page."}</p>
          ) : (
            <div className="table-wrap">
              <table>
                <caption>Training reminders requiring review</caption>
                <thead>
                  <tr>
                    <th scope="col">Employee number</th>
                    <th scope="col">Course</th>
                    <th scope="col">Reminder</th>
                    <th scope="col">Renewal due</th>
                    <th scope="col">Last attempt</th>
                    <th scope="col">Flagged for review</th>
                    <th scope="col">Delivery reference</th>
                    <th scope="col">Action</th>
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
                      <td>{dateTime.format(new Date(row.updatedAt))}</td>
                      <td><code>{row.id}</code></td>
                      <td>
                        <button
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
                        </button>
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
