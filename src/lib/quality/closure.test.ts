import { describe, expect, it, vi } from "vitest";
import type { AuthorizationContext } from "../security/authorization";
import { hashPassword } from "../security/crypto";
import { QualityClosureReauthenticationFailedError, QualityClosureService, QualityClosureValidationError, type QualityClosureEvidence, type QualityClosureRecord, type QualityClosureStore } from "./closure";

const organizationId="00000000-0000-0000-0000-000000000001";const userId="00000000-0000-0000-0000-000000000002";const eventId="00000000-0000-0000-0000-000000000003";const password="SyntheticPassphrase!2026";
const context=(permissions:string[]):AuthorizationContext=>({organizationId,userId,userState:"ACTIVE",grants:permissions.map(permission=>({permission,scopeType:"ORGANIZATION" as const,scopeId:null}))});
const evidence:QualityClosureEvidence={organizationId,userId,passwordHash:hashPassword(password),eventId,eventNumber:"QE-2026-000001",status:"VERIFICATION"};
const closure:QualityClosureRecord={closureId:"c",eventId,eventNumber:"QE-2026-000001",closureReason:"Verified complete",closedAt:new Date("2026-09-08T06:00:00Z"),signerUserId:userId,signerName:"Synthetic Signer",signerEmail:"signer@example.test",signatureId:"s",meaning:"COMPLETED",meaningText:"I confirm this quality event is complete.",signedAt:new Date("2026-09-08T06:00:00Z"),authenticationEventId:"a",authenticationMethod:"PASSWORD",authenticationOutcome:"SUCCESS",payloadHash:"abc"};
const store=():QualityClosureStore=>({loadEvidence:vi.fn(async()=>evidence),loadClosure:vi.fn(async()=>closure),recentFailedReauthentications:vi.fn(async()=>0),recordFailedReauthentication:vi.fn(async()=>undefined),commitClosure:vi.fn(async()=>({closureId:"00000000-0000-0000-0000-000000000004",signatureId:"00000000-0000-0000-0000-000000000005"}))});

describe("QualityClosureService",()=>{
  it("requires quality event read permission for closure evidence",async()=>{await expect(new QualityClosureService(store()).read(context([]),organizationId,eventId)).rejects.toThrow("Access denied");});
  it("returns immutable closure evidence to authorized readers",async()=>{await expect(new QualityClosureService(store()).read(context(["quality_event.read"]),organizationId,eventId)).resolves.toEqual(closure);});
  it("requires quality event management permission",async()=>{await expect(new QualityClosureService(store()).close(context([]),{organizationId,eventId,closureReason:"Verified complete",password,confirmed:true})).rejects.toThrow("Access denied");});
  it("requires explicit signature confirmation",async()=>{await expect(new QualityClosureService(store()).close(context(["quality_event.manage"]),{organizationId,eventId,closureReason:"Verified complete",password,confirmed:false})).rejects.toThrow(QualityClosureValidationError);});
  it("records failed reauthentication",async()=>{const s=store();await expect(new QualityClosureService(s).close(context(["quality_event.manage"]),{organizationId,eventId,closureReason:"Verified complete",password:"wrong password",confirmed:true})).rejects.toThrow(QualityClosureReauthenticationFailedError);expect(s.recordFailedReauthentication).toHaveBeenCalledOnce();});
  it("normalizes reason and commits signed closure",async()=>{const s=store();const result=await new QualityClosureService(s,()=>new Date("2026-09-08T06:00:00Z")).close(context(["quality_event.manage"]),{organizationId,eventId,closureReason:"  CAPA verified effective  ",password,confirmed:true});expect(result.status).toBe("CLOSED");expect(s.commitClosure).toHaveBeenCalledWith(expect.objectContaining({closureReason:"CAPA verified effective",signerUserId:userId,eventNumber:"QE-2026-000001"}));});
});
