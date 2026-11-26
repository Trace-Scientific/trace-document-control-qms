import { cliaCompetencyMethods } from "./clia-competency-methods";
import type { AuthorizationContext } from "../security/authorization";
import { requireAuthorization } from "../security/authorization";

export class CompetencyValidationError extends Error {}
export class CompetencyEligibilityError extends Error {}

export type CompetencyProgramRecord = { id:string; organizationId:string; code:string; title:string; description:string|null; active:boolean; validityDays:number|null; createdAt:Date; updatedAt:Date };
export type CompetencyElementRecord = { id:string; organizationId:string; programId:string; code:string; title:string; method:string|null; required:boolean; sortOrder:number; createdAt:Date };
export type CompetencyAssessmentRecord = { id:string; organizationId:string; employeeId:string; programId:string; assessedAt:Date; outcome:"QUALIFIED"|"NOT_QUALIFIED"|"CONDITIONAL"; expiresAt:Date|null; assessorUserId:string; fileId:string|null; notes:string|null; createdAt:Date };
export type CompetencyElementResultInput = { elementId:string; outcome:"PASS"|"FAIL"|"NOT_APPLICABLE"; notes?:string|null };

export type CompetencyElementInput = Pick<CompetencyElementRecord, "code" | "title" | "method" | "required" | "sortOrder">;
type CliaTemplateElementInput = { code: string; title: string; method: string; required?: boolean };
export type CompetencyProgramWrite = { organizationId: string; programId: string; actorUserId: string };

export interface CompetencyStore {
  listPrograms(organizationId:string):Promise<CompetencyProgramRecord[]>;
  createProgram(input:{organizationId:string;code:string;title:string;description:string|null;validityDays:number|null;actorUserId:string}):Promise<CompetencyProgramRecord>;
  listElements(organizationId:string, programId:string):Promise<CompetencyElementRecord[]>;
  createElement(input: CompetencyProgramWrite & CompetencyElementInput): Promise<CompetencyElementRecord>;
  createCliaTemplate(input: CompetencyProgramWrite & { elements: CompetencyElementInput[] }): Promise<CompetencyElementRecord[]>;
  listAssessments(organizationId:string, employeeId?:string):Promise<CompetencyAssessmentRecord[]>;
  createAssessment(input:{organizationId:string;employeeId:string;programId:string;assessedAt:Date;outcome:CompetencyAssessmentRecord["outcome"];expiresAt:Date|null;fileId:string|null;notes:string|null;elementResults:CompetencyElementResultInput[];actorUserId:string}):Promise<CompetencyAssessmentRecord>;
}

export class CompetencyService {
  constructor(private readonly store:CompetencyStore) {}
  listPrograms(context:AuthorizationContext, organizationId:string){ requireAuthorization(context,{organizationId,permission:"training.read"}); return this.store.listPrograms(organizationId); }
  createProgram(context:AuthorizationContext,input:{organizationId:string;code:string;title:string;description?:string|null;validityDays?:number|null}){
    requireAuthorization(context,{organizationId:input.organizationId,permission:"training.manage"});
    const code=input.code.trim(), title=input.title.trim(), description=input.description?.trim()||null, validityDays=input.validityDays??null;
    if(!code||code.length>80) throw new CompetencyValidationError("Competency program code is required");
    if(!title||title.length>240) throw new CompetencyValidationError("Competency program title is required");
    if((description?.length??0)>2000) throw new CompetencyValidationError("Competency program description is too long");
    if(validityDays!==null&&(!Number.isInteger(validityDays)||validityDays<1||validityDays>3650)) throw new CompetencyValidationError("Competency validity days are invalid");
    return this.store.createProgram({organizationId:input.organizationId,code,title,description,validityDays,actorUserId:context.userId});
  }
  listElements(context:AuthorizationContext,organizationId:string,programId:string){ requireAuthorization(context,{organizationId,permission:"training.read"}); return this.store.listElements(organizationId,programId); }
  createElement(context:AuthorizationContext,input:{organizationId:string;programId:string;code:string;title:string;method?:string|null;required?:boolean;sortOrder?:number}){
    requireAuthorization(context,{organizationId:input.organizationId,permission:"training.manage"});
    const code=input.code.trim(), title=input.title.trim(), method=input.method?.trim()||null, sortOrder=input.sortOrder??0;
    if(!code||code.length>80) throw new CompetencyValidationError("Competency element code is required");
    if(!title||title.length>240) throw new CompetencyValidationError("Competency element title is required");
    if((method?.length??0)>500) throw new CompetencyValidationError("Competency element method is too long");
    if(!Number.isInteger(sortOrder)||sortOrder<0) throw new CompetencyValidationError("Competency element sort order is invalid");
    return this.store.createElement({organizationId:input.organizationId,programId:input.programId,code,title,method,required:input.required??true,sortOrder,actorUserId:context.userId});
  }
  createCliaTemplate(context: AuthorizationContext, input: {
    organizationId: string;
    programId: string;
    elements: CliaTemplateElementInput[];
  }) {
    const { organizationId, programId } = input;
    requireAuthorization(context, { organizationId, permission: "training.manage" });

    const byCode = new Map(input.elements.map((element) => [element.code, element]));
    if (input.elements.length !== cliaCompetencyMethods.length || byCode.size !== input.elements.length) {
      throw new CompetencyValidationError("Supply all six distinct CLIA assessment methods.");
    }

    const elements = cliaCompetencyMethods.map(({ code }, index) => {
      const element = byCode.get(code);
      if (!element) throw new CompetencyValidationError("Supply all six distinct CLIA assessment methods.");
      const title = element.title.trim();
      const method = element.method.trim();
      if (!title || title.length > 240 || !method || method.length > 500) {
        throw new CompetencyValidationError(`Enter a title and assessment instructions for ${code}.`);
      }
      return { code, title, method, required: element.required ?? true, sortOrder: index + 1 };
    });

    return this.store.createCliaTemplate({ organizationId, programId, actorUserId: context.userId, elements });
  }
  listAssessments(context:AuthorizationContext,organizationId:string,employeeId?:string){ requireAuthorization(context,{organizationId,permission:"training.read"}); return this.store.listAssessments(organizationId,employeeId); }
  createAssessment(context:AuthorizationContext,input:{organizationId:string;employeeId:string;programId:string;assessedAt:Date;outcome:CompetencyAssessmentRecord["outcome"];expiresAt?:Date|null;fileId?:string|null;notes?:string|null;elementResults:CompetencyElementResultInput[]}){
    requireAuthorization(context,{organizationId:input.organizationId,permission:"training.manage"});
    const notes=input.notes?.trim()||null, expiresAt=input.expiresAt??null;
    if(Number.isNaN(input.assessedAt.getTime())) throw new CompetencyValidationError("Competency assessment date is invalid");
    if(input.assessedAt.getTime()>Date.now()) throw new CompetencyValidationError("Competency assessment date cannot be in the future");
    if(expiresAt&&Number.isNaN(expiresAt.getTime())) throw new CompetencyValidationError("Competency expiration date is invalid");
    if(expiresAt&&expiresAt.getTime()<input.assessedAt.getTime()) throw new CompetencyValidationError("Competency expiration cannot precede the assessment date");
    if((notes?.length??0)>2000) throw new CompetencyValidationError("Competency assessment notes are too long");
    if(input.elementResults.length===0) throw new CompetencyValidationError("Competency assessment requires element results");
    const ids=new Set<string>();
    for(const result of input.elementResults){ if(ids.has(result.elementId)) throw new CompetencyValidationError("Competency element results must be unique"); ids.add(result.elementId); if((result.notes?.trim().length??0)>1000) throw new CompetencyValidationError("Competency element notes are too long"); }
    return this.store.createAssessment({organizationId:input.organizationId,employeeId:input.employeeId,programId:input.programId,assessedAt:input.assessedAt,outcome:input.outcome,expiresAt,fileId:input.fileId??null,notes,elementResults:input.elementResults.map(r=>({...r,notes:r.notes?.trim()||null})),actorUserId:context.userId});
  }
}
