-- REVIEW BEFORE EXECUTION. Railway DEMO database only; never production.
-- Requires explicit operator confirmation of Railway project/environment/service.
-- Intended invocation: psql -v ON_ERROR_STOP=1 -f sql/railway-demo-activate-synthetic.sql
-- Transactional and fail-closed; no accounts or credentials are created.
BEGIN;
DO $activation$
DECLARE
  target_id uuid := '61a376f5-20b9-4458-8b25-cbe0674c2349';
  matches integer;
BEGIN
  IF current_database() <> 'railway' THEN
    RAISE EXCEPTION 'Wrong database';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(774231004819::bigint);
  SELECT count(*) INTO matches
  FROM public."Organization"
  WHERE id = target_id
    AND "loginCode" = 'trace-demo-lab'
    AND "legalName" = 'Trace Scientific Demonstration Laboratory - Fictional'
    AND "displayName" = 'Trace Scientific Demo Laboratory (SYNTHETIC)'
    AND active = false;
  IF matches <> 1 THEN
    RAISE EXCEPTION 'Expected inactive synthetic organization not found';
  END IF;
  IF EXISTS (SELECT 1 FROM public."User" WHERE "organizationId" = target_id)
    OR EXISTS (SELECT 1 FROM public."Credential" WHERE "organizationId" = target_id) THEN
    RAISE EXCEPTION 'Demo organization is not empty';
  END IF;
  UPDATE public."Organization"
  SET active = true, "updatedAt" = pg_catalog.clock_timestamp()
  WHERE id = target_id AND "loginCode" = 'trace-demo-lab' AND active = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activation update failed';
  END IF;
  INSERT INTO public."AuditEvent"
    ("organizationId", "action", "entityType", "entityId", "reason", "metadata")
  VALUES
    (target_id, 'DEMO_TENANT_ACTIVATED', 'Organization', target_id,
     'Owner-authorized synthetic Railway demo activation',
     '{"synthetic":true,"loginCode":"trace-demo-lab","demoOnly":true}'::jsonb);
END
$activation$;
COMMIT;
-- Read-only postcondition:
SELECT id, "loginCode", active FROM public."Organization"
WHERE id = '61a376f5-20b9-4458-8b25-cbe0674c2349'::uuid;
