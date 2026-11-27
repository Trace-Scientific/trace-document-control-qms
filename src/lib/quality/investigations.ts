import type { AuthorizationContext } from "../security/authorization";
import { requireAuthorization } from "../security/authorization";

export class QualityInvestigationValidationError extends Error {}
export type RootCauseMethod = "FIVE_WHYS"|"FISHBONE"|"FAULT_TREE"|"OTHER";
export type QualityInvestigationRecord={id:string;organizationId:string;eventId:string;sequence:number;findings:string;affectedScope:string;evidenceSummary:string|null;evidenceFileId:string|null;rootCauseMethod:RootCauseMethod;rootCause:string;riskLikelihood:number;riskImpact:number;riskScore:number;investigatorUserId:string;createdAt:Date};

export type QualityInvestigationHistoryEntry = QualityInvestigationRecord & { investigatorName: string };

export interface QualityInvestigationStore {
  list(organizationId:string,eventId:string):Promise<QualityInvestigationHistoryEntry[]>;
  create(input:{organizationId:string;eventId:string;findings:string;affectedScope:string;evidenceSummary:string|null;evidenceFileId:string|null;rootCauseMethod:RootCauseMethod;rootCause:string;riskLikelihood:number;riskImpact:number;investigatorUserId:string}):Promise<QualityInvestigationRecord>;
}

export class QualityInvestigationService {
  constructor(private readonly store:QualityInvestigationStore) {}
  list(context:AuthorizationContext,organizationId:string,eventId:string){requireAuthorization(context,{organizationId,permission:"quality_event.read"});return this.store.list(organizationId,eventId);}
  create(context:AuthorizationContext,input:{organizationId:string;eventId:string;findings:string;affectedScope:string;evidenceSummary?:string|null;evidenceFileId?:string|null;rootCauseMethod:RootCauseMethod;rootCause:string;riskLikelihood:number;riskImpact:number}){
    requireAuthorization(context,{organizationId:input.organizationId,permission:"quality_event.manage"});
    const findings=input.findings.trim();const affectedScope=input.affectedScope.trim();const evidenceSummary=input.evidenceSummary?.trim()||null;const rootCause=input.rootCause.trim();
    if(!findings||findings.length>10000)throw new QualityInvestigationValidationError("Investigation findings are required and must not exceed 10000 characters");
    if(!affectedScope||affectedScope.length>5000)throw new QualityInvestigationValidationError("Affected scope is required and must not exceed 5000 characters");
    if((evidenceSummary?.length??0)>5000)throw new QualityInvestigationValidationError("Evidence summary is too long");
    if(!rootCause||rootCause.length>5000)throw new QualityInvestigationValidationError("Root cause is required and must not exceed 5000 characters");
    if(!Number.isInteger(input.riskLikelihood)||input.riskLikelihood<1||input.riskLikelihood>5)throw new QualityInvestigationValidationError("Risk likelihood must be an integer from 1 to 5");
    if(!Number.isInteger(input.riskImpact)||input.riskImpact<1||input.riskImpact>5)throw new QualityInvestigationValidationError("Risk impact must be an integer from 1 to 5");
    return this.store.create({organizationId:input.organizationId,eventId:input.eventId,findings,affectedScope,evidenceSummary,evidenceFileId:input.evidenceFileId||null,rootCauseMethod:input.rootCauseMethod,rootCause,riskLikelihood:input.riskLikelihood,riskImpact:input.riskImpact,investigatorUserId:context.userId});
  }
}
