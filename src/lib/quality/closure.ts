import { createHash } from "node:crypto";
import type { AuthorizationContext } from "../security/authorization";
import { requireAuthorization } from "../security/authorization";
import { verifyPassword } from "../security/crypto";

export class QualityClosureValidationError extends Error {}
export class QualityClosureReauthenticationFailedError extends Error { constructor(){super("Reauthentication failed");this.name="QualityClosureReauthenticationFailedError";} }
export class QualityClosureReauthenticationThrottledError extends Error { constructor(){super("Too many reauthentication attempts");this.name="QualityClosureReauthenticationThrottledError";} }

export type QualityClosureEvidence={organizationId:string;userId:string;passwordHash:string;eventId:string;eventNumber:string;status:string};
export type QualityClosureRecord={closureId:string;eventId:string;eventNumber:string;closureReason:string;closedAt:Date;signerUserId:string;signerName:string;signerEmail:string;signatureId:string;meaning:string;meaningText:string;signedAt:Date;authenticationEventId:string;authenticationMethod:string;authenticationOutcome:string;payloadHash:string};
export interface QualityClosureStore{
  loadEvidence(organizationId:string,userId:string,eventId:string):Promise<QualityClosureEvidence|null>;
  loadClosure(organizationId:string,eventId:string):Promise<QualityClosureRecord|null>;
  recentFailedReauthentications(organizationId:string,userId:string,since:Date):Promise<number>;
  recordFailedReauthentication(evidence:QualityClosureEvidence,occurredAt:Date):Promise<void>;
  commitClosure(input:{organizationId:string;eventId:string;eventNumber:string;signerUserId:string;closureReason:string;payloadHash:string;signedAt:Date;authenticationValidUntil:Date}):Promise<{closureId:string;signatureId:string}>;
}

export class QualityClosureService{
  constructor(private readonly store:QualityClosureStore,private readonly clock:()=>Date=()=>new Date()){}
  read(context:AuthorizationContext,organizationId:string,eventId:string){requireAuthorization(context,{organizationId,permission:"quality_event.read"});return this.store.loadClosure(organizationId,eventId);}
  async close(context:AuthorizationContext,input:{organizationId:string;eventId:string;closureReason:string;password:string;confirmed:boolean}){
    requireAuthorization(context,{organizationId:input.organizationId,permission:"quality_event.manage"});
    const closureReason=input.closureReason.trim();
    if(!input.confirmed)throw new QualityClosureValidationError("Closure signature meaning must be confirmed");
    if(!closureReason||closureReason.length>5000)throw new QualityClosureValidationError("Closure reason is required and must not exceed 5000 characters");
    const evidence=await this.store.loadEvidence(input.organizationId,context.userId,input.eventId);
    if(!evidence)throw new Error("Access denied");
    if(evidence.status!=="VERIFICATION")throw new QualityClosureValidationError("Quality event must be in VERIFICATION before closure");
    const signedAt=this.clock();
    const failures=await this.store.recentFailedReauthentications(evidence.organizationId,evidence.userId,new Date(signedAt.getTime()-15*60*1000));
    if(failures>=5)throw new QualityClosureReauthenticationThrottledError();
    if(!verifyPassword(input.password,evidence.passwordHash)){await this.store.recordFailedReauthentication(evidence,signedAt);throw new QualityClosureReauthenticationFailedError();}
    const payloadHash=createHash("sha256").update(JSON.stringify({organizationId:evidence.organizationId,eventId:evidence.eventId,eventNumber:evidence.eventNumber,signerUserId:evidence.userId,closureReason,signedAt:signedAt.toISOString()})).digest("hex");
    const result=await this.store.commitClosure({organizationId:evidence.organizationId,eventId:evidence.eventId,eventNumber:evidence.eventNumber,signerUserId:evidence.userId,closureReason,payloadHash,signedAt,authenticationValidUntil:new Date(signedAt.getTime()+5*60*1000)});
    return {...result,status:"CLOSED" as const,signedAt};
  }
}
