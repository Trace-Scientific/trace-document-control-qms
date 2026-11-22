"use client";

import { useState } from "react";

type ReviewPage = {
  page: number;
  hasMore: boolean;
  data: {
    id: string;
    employeeNumber: string;
    courseCode: string;
    courseTitle: string;
    renewalDueDate: string;
    reminderType: string;
    lastAttemptAt: string | null;
    updatedAt: string;
  }[];
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

  async function loadPage(page: number) {
    setLoading(true);
    setError(false);
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

  return (
    <section aria-label="Training reminders requiring review" aria-busy={loading}>
      <button type="button" disabled={loading} onClick={() => void loadPage(1)}>
        {result ? "Refresh reminders requiring review" : "View reminders requiring review"}
      </button>
      {loading && <p role="status">Loading reminders for review…</p>}
      {error && <p role="alert">Reminders requiring review could not be loaded.</p>}
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(result.page > 1 || result.hasMore) && (
            <nav aria-label="Review queue pages">
              <button type="button" disabled={loading || result.page === 1} onClick={() => void loadPage(result.page - 1)}>
                Previous page
              </button>
              <span> Page {result.page} </span>
              <button type="button" disabled={loading || !result.hasMore} onClick={() => void loadPage(result.page + 1)}>
                Next page
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
