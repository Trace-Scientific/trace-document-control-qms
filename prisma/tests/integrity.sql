BEGIN;
INSERT INTO "Organization" ("id","legalName","displayName","updatedAt")
VALUES ('00000000-0000-4000-8000-000000000001','Tenant One','Tenant One',CURRENT_TIMESTAMP),
       ('00000000-0000-4000-8000-000000000002','Tenant Two','Tenant Two',CURRENT_TIMESTAMP);
INSERT INTO "Site" ("id","organizationId","name","updatedAt")
VALUES ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Site One',CURRENT_TIMESTAMP);
INSERT INTO "User" ("id","organizationId","email","firstName","lastName","updatedAt")
VALUES ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','one@example.test','Test','One',CURRENT_TIMESTAMP),
       ('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','two@example.test','Test','Two',CURRENT_TIMESTAMP);
INSERT INTO "AuthenticationEvent" ("id","organizationId","userId","eventType","outcome","method")
VALUES ('90000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','LOGIN','SUCCESS','PASSWORD');
INSERT INTO "Role" ("id","organizationId","name","updatedAt")
VALUES ('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','Tenant Two Role',CURRENT_TIMESTAMP);

DO $$ DECLARE blocked boolean := false; BEGIN
  BEGIN
    INSERT INTO "Department" ("organizationId","siteId","name","updatedAt")
    VALUES ('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Invalid',CURRENT_TIMESTAMP);
  EXCEPTION WHEN foreign_key_violation THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'cross-tenant site relation was accepted'; END IF;
END $$;

DO $$ DECLARE blocked boolean := false; BEGIN
  BEGIN
    INSERT INTO "Session" ("id","organizationId","userId","authenticationEventId","tokenHash","idleExpiresAt","absoluteExpiresAt")
    VALUES ('91000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001',repeat('a',64),CURRENT_TIMESTAMP + interval '15 minutes',CURRENT_TIMESTAMP + interval '1 day');
  EXCEPTION WHEN foreign_key_violation THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'cross-tenant session was accepted'; END IF;
END $$;

DO $$ DECLARE blocked boolean := false; BEGIN
  BEGIN
    INSERT INTO "Session" ("id","organizationId","userId","authenticationEventId","tokenHash","idleExpiresAt","absoluteExpiresAt")
    VALUES ('91000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','raw-session-token',CURRENT_TIMESTAMP + interval '15 minutes',CURRENT_TIMESTAMP + interval '1 day');
  EXCEPTION WHEN check_violation THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'unhashed session token was accepted'; END IF;
END $$;

DO $$ DECLARE blocked boolean := false; BEGIN
  BEGIN UPDATE "AuthenticationEvent" SET "outcome"='FAILURE' WHERE "id"='90000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'authentication evidence update was accepted'; END IF;
END $$;

DO $$ DECLARE blocked boolean := false; BEGIN
  BEGIN
    INSERT INTO "UserRole" ("organizationId","userId","roleId")
    VALUES ('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002');
  EXCEPTION WHEN foreign_key_violation THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'cross-tenant role assignment was accepted'; END IF;
END $$;

INSERT INTO "AuditEvent" ("id","organizationId","actorUserId","action","entityType","metadata")
VALUES ('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','TEST','Test','{}');
DO $$ DECLARE blocked boolean := false; BEGIN
  BEGIN UPDATE "AuditEvent" SET "action"='TAMPERED' WHERE "id"='40000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'audit update was accepted'; END IF;
END $$;
DO $$ DECLARE blocked boolean := false; BEGIN
  BEGIN DELETE FROM "AuditEvent" WHERE "id"='40000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'audit delete was accepted'; END IF;
END $$;

INSERT INTO "DocumentType" ("id","organizationId","code","name")
VALUES ('50000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','SOP','Procedure');
INSERT INTO "Document" ("id","organizationId","documentTypeId","documentNumber","title","updatedAt")
VALUES ('60000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','SOP-001','Test SOP',CURRENT_TIMESTAMP);
INSERT INTO "DocumentVersion" ("id","organizationId","documentId","versionNumber","revisionLabel","status","authoredByUserId","contentHash","changeSummary")
VALUES ('70000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',1,'1.0','EFFECTIVE','20000000-0000-4000-8000-000000000001',repeat('a',64),'Initial');
DO $$ DECLARE blocked boolean := false; BEGIN
  BEGIN UPDATE "DocumentVersion" SET "changeSummary"='Tampered' WHERE "id"='70000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'effective version update was accepted'; END IF;
END $$;

UPDATE "DocumentVersion"
SET "status"='SUPERSEDED', "supersededAt"=CURRENT_TIMESTAMP, "lockVersion"="lockVersion" + 1
WHERE "id"='70000000-0000-4000-8000-000000000001';

DO $$ DECLARE blocked boolean := false; BEGIN
  BEGIN UPDATE "DocumentVersion" SET "supersededAt"=CURRENT_TIMESTAMP + interval '1 day' WHERE "id"='70000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'superseded history update was accepted'; END IF;
END $$;

INSERT INTO "ElectronicSignature" ("id","organizationId","signerUserId","entityType","entityId","entityVersion","meaning","meaningText","authenticationEventId","payloadHash")
VALUES ('80000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','DocumentVersion','70000000-0000-4000-8000-000000000001','1.0','APPROVED','Approved','90000000-0000-4000-8000-000000000001',repeat('b',64));
DO $$ DECLARE blocked boolean := false; BEGIN
  BEGIN UPDATE "ElectronicSignature" SET "payloadHash"=repeat('c',64) WHERE "id"='80000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'signature evidence update was accepted'; END IF;
END $$;

ROLLBACK;
