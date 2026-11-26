"use client";

import { useEffect, useState } from "react";
import type { CompetencyProgramScopeOptions } from "@/lib/training/competency-program-scope";

export function CompetencyProgramScopeFields() {
  const [options, setOptions] = useState<CompetencyProgramScopeOptions>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [system, setSystem] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/training/competency/programs/scope-options", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Scope lookup failed.");
        const result = await response.json() as { data: CompetencyProgramScopeOptions };
        if (!controller.signal.aborted) setOptions(result.data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true);
      });
    return () => controller.abort();
  }, []);

  if (loadFailed) return <p role="status">Instrument and test-system choices are unavailable. Reopen Programs to retry.</p>;
  if (!options) return <p role="status">Loading instrument and test-system choices…</p>;

  return <>
    {options.canReadEquipment && <label>Instrument
      <select name="equipmentId" defaultValue="">
        <option value="">No instrument</option>
        {options.equipment.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </label>}
    <label>Test system
      <select name="testSystemSelection" value={system} onChange={(event) => setSystem(event.target.value)}>
        <option value="">No test system</option>
        {options.testSystems.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        <option value="new">Create a test system</option>
      </select>
    </label>
    {system === "new" && <>
      <label>Test system code<input name="testSystemCode" maxLength={80} required /></label>
      <label>Test system name<input name="testSystemName" maxLength={240} required /></label>
    </>}
  </>;
}
