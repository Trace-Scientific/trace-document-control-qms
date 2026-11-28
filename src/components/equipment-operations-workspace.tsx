"use client";

import { useEffect, useRef, useState } from "react";
import type { EquipmentEvidenceType } from "@/lib/equipment/workspace-selection";
import { EquipmentManagementWorkspace } from "./equipment-management-workspace";
import { EquipmentComplianceEvidenceWorkspace } from "./equipment-compliance-evidence-workspace";
import { EquipmentScheduleCorrectionWorkspace } from "./equipment-schedule-correction-workspace";
import { EquipmentComplianceWorkspace } from "./equipment-compliance-workspace";

type Shortcut = { id: string; evidenceType?: EquipmentEvidenceType; revision: number };

export function EquipmentOperationsWorkspace({ today, canManage }: { today: string; canManage: boolean }) {
  const [holdTarget, setHoldTarget] = useState<Shortcut | null>(null);
  const [evidenceTarget, setEvidenceTarget] = useState<Shortcut | null>(null);
  const holdHeading = useRef<HTMLHeadingElement>(null);
  const evidenceHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (holdTarget) holdHeading.current?.focus();
  }, [holdTarget]);
  useEffect(() => {
    if (evidenceTarget) evidenceHeading.current?.focus();
  }, [evidenceTarget]);

  return <>
    <EquipmentManagementWorkspace
      today={today}
      canManage={canManage}
      onReviewHolds={id => setHoldTarget(current => ({ id, revision: (current?.revision ?? 0) + 1 }))}
      onRecordEvidence={canManage ? (id, evidenceType) => setEvidenceTarget(current =>
        ({ id, evidenceType, revision: (current?.revision ?? 0) + 1 })) : undefined}
    />
    {canManage && <EquipmentComplianceEvidenceWorkspace
      key={evidenceTarget?.revision ?? 0}
      today={today}
      headingRef={evidenceHeading}
      initialEquipmentId={evidenceTarget?.id}
      initialEvidenceType={evidenceTarget?.evidenceType}
    />}
    {canManage && <EquipmentScheduleCorrectionWorkspace />}
    <EquipmentComplianceWorkspace
      key={holdTarget?.revision ?? 0}
      canManage={canManage}
      headingRef={holdHeading}
      initialEquipmentId={holdTarget?.id}
    />
  </>;
}
