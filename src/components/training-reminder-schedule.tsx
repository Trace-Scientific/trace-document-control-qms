"use client";

import { useEffect, useState, type FormEvent } from "react";

type ScheduleSettings = {
  scheduleEnabled: boolean;
  hourUtc: number;
  minimumIntervalHours: number;
};

const endpoint = "/api/training/notification-schedule-readiness";

export function TrainingReminderSchedule({ disabled, onSaved }: { disabled: boolean; onSaved: () => void }) {
  const [settings, setSettings] = useState<ScheduleSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint, { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Schedule unavailable");
        const { data }: { data: ScheduleSettings } = await response.json();
        if (!controller.signal.aborted) setSettings({
          scheduleEnabled: data.scheduleEnabled,
          hourUtc: data.hourUtc,
          minimumIntervalHours: data.minimumIntervalHours,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Unable to load the staging schedule.");
      });
    return () => controller.abort();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings || disabled || saving) return;

    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!response.ok) throw new Error("Schedule could not be saved");
      const { data }: { data: ScheduleSettings } = await response.json();
      setSettings(data);
      setSaved(true);
      onSaved();
    } catch {
      setError("Unable to save the staging schedule.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <details>
      <summary>Reminder staging schedule</summary>
      {!settings && !error && <p role="status">Loading the staging schedule…</p>}
      {settings && (
        <form onSubmit={(event) => void save(event)}>
          <fieldset disabled={disabled || saving}>
            <legend>Manual staging</legend>
            <label>
              <input type="checkbox" checked={settings.scheduleEnabled} onChange={(event) => {
                setSettings({ ...settings, scheduleEnabled: event.target.checked });
                setSaved(false);
              }} />
              Allow managers to stage pending reminders
            </label>
            <label>
              Earliest staging hour (UTC)
              <input type="number" required min={0} max={23} value={Number.isFinite(settings.hourUtc) ? settings.hourUtc : ""}
                onChange={(event) => {
                  setSettings({ ...settings, hourUtc: event.target.valueAsNumber });
                  setSaved(false);
                }} />
            </label>
            <label>
              Minimum hours between runs
              <input type="number" required min={24} max={168}
                value={Number.isFinite(settings.minimumIntervalHours) ? settings.minimumIntervalHours : ""}
                onChange={(event) => {
                  setSettings({ ...settings, minimumIntervalHours: event.target.valueAsNumber });
                  setSaved(false);
                }} />
            </label>
            <button type="submit">Save staging schedule</button>
          </fieldset>
        </form>
      )}
      {saving && <p role="status">Saving the staging schedule…</p>}
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">Staging schedule saved. Email delivery is off.</p>}
    </details>
  );
}
