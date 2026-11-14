-- REVIEW-ONLY SQL SOURCE. DO NOT RUN AGAINST RAILWAY OR PRODUCTION.
-- Installation requires a separate reviewed, no-login least-privilege owner,
-- restricted deployment identity, and written approval. No GRANT EXECUTE here.
-- IMPORTANT: PostgreSQL CREATE FUNCTION initially grants EXECUTE to PUBLIC by
-- default; this file wraps CREATE and REVOKE in one transaction to avoid exposure.
BEGIN;
-- Fail closed: never reuse an existing schema or replace an existing privileged function.
DO $preflight$
BEGIN
  IF pg_catalog.to_regnamespace('demo_one_time') IS NOT NULL THEN
    RAISE EXCEPTION 'Demo routine installation rejected: schema already exists';
  END IF;
END
$preflight$;
CREATE SCHEMA demo_one_time;
REVOKE ALL ON SCHEMA demo_one_time FROM PUBLIC;
CREATE FUNCTION demo_one_time.create_inactive_trace_demo_lab()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  created_id uuid;
BEGIN
  -- Fixed lock key; serializes authorized invocations of this specific routine.
  PERFORM pg_catalog.pg_advisory_xact_lock(774231004818::bigint);
  IF EXISTS (
    SELECT 1 FROM public."Organization" WHERE "loginCode" = 'trace-demo-lab'
  ) THEN
    RAISE EXCEPTION 'Demo provisioning rejected: target already exists';
  END IF;

  INSERT INTO public."Organization"
    ("loginCode", "legalName", "displayName", "timezone", "active", "updatedAt")
  VALUES
    ('trace-demo-lab',
     'Trace Scientific Demonstration Laboratory - Fictional',
     'Trace Scientific Demo Laboratory (SYNTHETIC)',
     'America/Los_Angeles', false, pg_catalog.clock_timestamp())
  RETURNING "id" INTO created_id;

  INSERT INTO public."AuditEvent"
    ("organizationId", "action", "entityType", "entityId", "reason", "metadata")
  VALUES
    (created_id, 'DEMO_TENANT_PROVISIONED', 'Organization', created_id,
     'Synthetic demonstration environment provisioning',
     '{"synthetic":true,"loginCode":"trace-demo-lab","provisioningVersion":1,"initialStatus":"INACTIVE"}'::jsonb);
  RETURN created_id;
END
$function$;
REVOKE ALL ON FUNCTION demo_one_time.create_inactive_trace_demo_lab() FROM PUBLIC;
COMMIT;

-- No GRANT EXECUTE, no caller, no Railway wiring, no application entrypoint.
-- SECURITY: installation must be performed by an identity that cannot
-- accidentally leave this routine owned by a superuser or broad table owner.
-- This source is NOT approved for execution merely because CI passes.
