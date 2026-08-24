BEGIN;
INSERT INTO "Organization" ("id","legalName","displayName","updatedAt")
VALUES ('00000000-0000-4000-8000-000000000001','Tenant One','Tenant One',CURRENT_TIMESTAMP),
       ('00000000-0000-4000-8000-000000000002','Tenant Two','Tenant Two',CURRENT_TIMESTAMP);
INSERT INTO "Site" ("id","organizationId","name","updatedAt")
VALUES ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Site One',CURRENT_TIMESTAMP);
INSERT INTO "User" ("id","organizationId","email","firstName","lastName","updatedAt")
VALUES ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','one@example.test','Test','One',CURRENT_TIMESTAMP),
       ('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','two@example.test','Test','Two',CURRENT_TIMESTAMP),
       ('20000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','other@example.test','Other','Signer',CURRENT_TIMESTAMP);
INSERT INTO "AuthenticationEvent" ("id","organizationId","userId","eventType","outcome","method","validUntil")
VALUES ('90000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','REAUTHENTICATION','SUCCESS','PASSWORD',CURRENT_TIMESTAMP + interval '5 minutes');
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
  BEGIN
    INSERT INTO "ElectronicSignature" ("organizationId","signerUserId","entityType","entityId","entityVersion","meaning","meaningText","authenticationEventId","payloadHash")
    VALUES ('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','DocumentVersion','70000000-0000-4000-8000-000000000001','1.0','APPROVED','Invalid signer','90000000-0000-4000-8000-000000000001',repeat('d',64));
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'signature accepted authentication evidence for another signer'; END IF;
END $$;
DO $$ DECLARE blocked boolean := false; BEGIN
  BEGIN UPDATE "ElectronicSignature" SET "payloadHash"=repeat('c',64) WHERE "id"='80000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'signature evidence update was accepted'; END IF;
END $$;

INSERT INTO "AuthenticationEvent" ("id","organizationId","userId","eventType","outcome","method","validUntil")
VALUES ('90000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','REAUTHENTICATION','SUCCESS','PASSWORD',CURRENT_TIMESTAMP + interval '5 minutes');
INSERT INTO "DocumentVersion" ("id","organizationId","documentId","versionNumber","revisionLabel","status","authoredByUserId","contentHash","changeSummary")
VALUES ('70000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',2,'2.0','EFFECTIVE','20000000-0000-4000-8000-000000000001',repeat('f',64),'Second version');
INSERT INTO "AcknowledgmentAssignment" ("id","organizationId","documentId","documentVersionId","assignedToUserId","assignedByUserId","dueAt")
VALUES ('92000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003',CURRENT_TIMESTAMP + interval '7 days');
UPDATE "AcknowledgmentAssignment" SET "status"='COMPLETED' WHERE "id"='92000000-0000-4000-8000-000000000001';
INSERT INTO "ElectronicSignature" ("id","organizationId","signerUserId","documentVersionId","entityType","entityId","entityVersion","meaning","meaningText","authenticationEventId","payloadHash")
VALUES ('80000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002','DocumentVersion','70000000-0000-4000-8000-000000000002','2.0','ACKNOWLEDGED','Read and understood','90000000-0000-4000-8000-000000000002',repeat('e',64));
INSERT INTO "AcknowledgmentCompletion" ("id","organizationId","assignmentId","signatureId")
VALUES ('93000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002');
DO $$ DECLARE blocked boolean := false; BEGIN
  BEGIN UPDATE "AcknowledgmentCompletion" SET "completedAt"=CURRENT_TIMESTAMP + interval '1 day' WHERE "id"='93000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'acknowledgment completion update was accepted'; END IF;
END $$;

INSERT INTO "DocumentReviewTask" ("id","organizationId","documentId","documentVersionId","dueAt")
VALUES ('94000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002',CURRENT_TIMESTAMP - interval '1 day');
UPDATE "DocumentReviewTask" SET "status"='COMPLETED',"completedAt"=CURRENT_TIMESTAMP,"completedByUserId"='20000000-0000-4000-8000-000000000001',"outcome"='NO_CHANGE',"comments"='Still current' WHERE "id"='94000000-0000-4000-8000-000000000001';
DO $$ DECLARE blocked boolean := false; BEGIN
  BEGIN UPDATE "DocumentReviewTask" SET "comments"='Tampered' WHERE "id"='94000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'completed review evidence update was accepted'; END IF;
END $$;
INSERT INTO "NotificationOutbox" ("organizationId","eventKey","templateKey","payload") VALUES ('00000000-0000-4000-8000-000000000001','review:1','DOCUMENT_REVIEW_OVERDUE','{}');
DO $$ DECLARE blocked boolean := false; BEGIN
  BEGIN INSERT INTO "NotificationOutbox" ("organizationId","eventKey","templateKey","payload") VALUES ('00000000-0000-4000-8000-000000000001','review:1','DOCUMENT_REVIEW_OVERDUE','{}');
  EXCEPTION WHEN unique_violation THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'duplicate notification event was accepted'; END IF;
END $$;

ROLLBACK;
