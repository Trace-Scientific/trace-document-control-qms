-- Read-only commercial approval history consistency findings.
-- This view does not repair records or prove resistance to privileged database tampering.
CREATE VIEW "TraceQmsCommercialProposalAuditFinding" AS
WITH event_chain AS (
  SELECT e."proposalId", e."revision", e."action", e."fromStatus", e."toStatus",
         e."actorIdentityId",
         LAG(e."revision") OVER (PARTITION BY e."proposalId" ORDER BY e."revision") AS previous_revision,
         LAG(e."toStatus") OVER (PARTITION BY e."proposalId" ORDER BY e."revision") AS previous_status
  FROM "TraceQmsCommercialProposalEvent" e
), event_summary AS (
  SELECT "proposalId", COUNT(*)::integer AS event_count,
         MAX("revision") AS max_revision
  FROM "TraceQmsCommercialProposalEvent" GROUP BY "proposalId"
), findings AS (
  SELECT p."id" AS "proposalId", 'EVENT_COUNT_MISMATCH'::text AS "findingCode",
         NULL::integer AS "eventRevision"
  FROM "TraceQmsCommercialProposal" p
  LEFT JOIN event_summary s ON s."proposalId" = p."id"
  WHERE COALESCE(s.event_count, 0) <> p."revision"
     OR COALESCE(s.max_revision, 0) <> p."revision"

  UNION ALL
  SELECT p."id", 'LATEST_STATUS_MISMATCH', NULL::integer
  FROM "TraceQmsCommercialProposal" p
  LEFT JOIN "TraceQmsCommercialProposalEvent" e
    ON e."proposalId" = p."id" AND e."revision" = p."revision"
  WHERE (p."revision" = 0 AND p."status" <> 'DRAFT')
     OR (p."revision" > 0 AND (e."id" IS NULL OR e."toStatus" <> p."status"))

  UNION ALL
  SELECT e."proposalId", 'EVENT_CHAIN_MISMATCH', e."revision"
  FROM event_chain e
  WHERE (e.previous_revision IS NULL AND (e."revision" <> 1 OR e."fromStatus" <> 'DRAFT'))
     OR (e.previous_revision IS NOT NULL AND
         (e."revision" <> e.previous_revision + 1 OR e."fromStatus" <> e.previous_status))
     OR (e."action" = 'SUBMIT' AND (e."fromStatus" <> 'DRAFT' OR e."toStatus" <> 'SUBMITTED'))
     OR (e."action" = 'APPROVE' AND (e."fromStatus" <> 'SUBMITTED' OR e."toStatus" <> 'APPROVED'))
     OR (e."action" = 'REJECT' AND (e."fromStatus" <> 'SUBMITTED' OR e."toStatus" <> 'REJECTED'))

  UNION ALL
  SELECT e."proposalId", 'CREATOR_SELF_APPROVAL', e."revision"
  FROM event_chain e
  JOIN "TraceQmsCommercialProposal" p ON p."id" = e."proposalId"
  WHERE e."action" IN ('APPROVE', 'REJECT')
    AND e."actorIdentityId" = p."createdByIdentityId"
)
SELECT "proposalId", "findingCode", "eventRevision" FROM findings;
