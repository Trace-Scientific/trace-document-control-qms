"use client";

import { useEffect, useRef, useState } from "react";
import type { EquipmentEvidenceType } from "@/lib/equipment/workspace-selection";
import { EquipmentManagementWorkspace } from "./equipment-management-workspace";
import { EquipmentComplianceEvidenceWorkspace } from "./equipment-compliance-evidence-workspace";
import { EquipmentScheduleCorrectionWorkspace } from "./equipment-schedule-correction-workspace";
import { EquipmentComplianceWorkspace } from "./equipment-compliance-workspace";

type HoldShortcut = { id: string; holdId?: string; revision: number };
type EvidenceShortcut = { id: string; evidenceType: EquipmentEvidenceType; holdId?: string; revision: number };

export function EquipmentOperationsWorkspace({ today, canManage }: { today: string; canManage: boolean }) {
  const [holdTarget, setHoldTarget] = useState<HoldShortcut | null>(null);
  const [evidenceTarget, setEvidenceTarget] = useState<EvidenceShortcut | null>(null);
  const holdHeading = useRef<HTMLHeadingElement>(null);
  const evidenceHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (holdTarget) holdHeading.current?.focus();
  }, [holdTarget]);
  useEffect(() => {
    if (evidenceTarget) evidenceHeading.current?.focus();
  }, [evidenceTarget]);

  function reviewHolds(id: string, holdId?: string) {
    setHoldTarget(current => ({ id, holdId, revision: (current?.revision ?? 0) + 1 }));
  }

  function recordEvidence(id: string, evidenceType: EquipmentEvidenceType, holdId?: string) {
    setEvidenceTarget(current => ({ id, evidenceType, holdId, revision: (current?.revision ?? 0) + 1 }));
  }

  return <>
    <EquipmentManagementWorkspace
      today={today}
      canManage={canManage}
      onReviewHolds={reviewHolds}
      onRecordEvidence={canManage ? recordEvidence : undefined}
    />
    {canManage && <EquipmentComplianceEvidenceWorkspace
      key={evidenceTarget?.revision ?? 0}
      today={today}
      headingRef={evidenceHeading}
      initialEquipmentId={evidenceTarget?.id}
      initialEvidenceType={evidenceTarget?.evidenceType}
      onReturnToHold={evidenceTarget?.holdId ? () => reviewHolds(evidenceTarget.id, evidenceTarget.holdId) : undefined}
    />}
    {canManage && <EquipmentScheduleCorrectionWorkspace />}
    <EquipmentComplianceWorkspace
      key={holdTarget?.revision ?? 0}
      canManage={canManage}
      headingRef={holdHeading}
      initialEquipmentId={holdTarget?.id}
      initialHoldId={holdTarget?.holdId}
      onRecordEvidence={canManage ? (id, holdId, type) => recordEvidence(id, type, holdId) : undefined}
    />
  </>;
}
