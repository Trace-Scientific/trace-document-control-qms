import { requireAuthorization,type AuthorizationContext } from "../security/authorization";
export type ListedStatus="DRAFT"|"IN_REVIEW"|"APPROVED"|"EFFECTIVE"|"SUPERSEDED"|"RETIRED";
export interface ListedDocumentVersion {id:string;documentId:string;documentNumber:string;title:string;type:string;versionNumber:number;revisionLabel:string;status:ListedStatus;owner:string;effectiveAt:Date|null;reviewDueAt:Date|null;createdAt:Date;}
export interface DocumentQueryStore {list(input:{organizationId:string;query?:string;status?:ListedStatus;limit:number;cursor?:{createdAt:Date;id:string}}):Promise<ListedDocumentVersion[]>;listTypes(organizationId:string):Promise<Array<{id:string;code:string;name:string}>>;}
export class DocumentQueryService {
 constructor(private readonly store:DocumentQueryStore){}
 async list(context:AuthorizationContext,input:{organizationId:string;query?:string;status?:ListedStatus;limit?:number;cursor?:string}){
  requireAuthorization(context,{organizationId:input.organizationId,permission:"document.read"});const limit=Math.min(100,Math.max(1,input.limit??25)),cursor=input.cursor?decodeCursor(input.cursor):undefined;const rows=await this.store.list({organizationId:input.organizationId,query:input.query?.trim()||undefined,status:input.status,limit:limit+1,cursor});const hasMore=rows.length>limit,items=hasMore?rows.slice(0,limit):rows,nextCursor=hasMore?encodeCursor(items[items.length-1]!):null;return{items,nextCursor,types:await this.store.listTypes(input.organizationId)};
 }
}
function encodeCursor(row:{createdAt:Date;id:string}){return Buffer.from(JSON.stringify({createdAt:row.createdAt.toISOString(),id:row.id}),"utf8").toString("base64url");}
function decodeCursor(value:string){try{const parsed=JSON.parse(Buffer.from(value,"base64url").toString("utf8")) as {createdAt?:unknown;id?:unknown};if(typeof parsed.createdAt!=="string"||typeof parsed.id!=="string")throw new Error();const createdAt=new Date(parsed.createdAt);if(Number.isNaN(createdAt.getTime())||!/^[0-9a-f-]{36}$/i.test(parsed.id))throw new Error();return{createdAt,id:parsed.id};}catch{throw new DocumentCursorError();}}
export class DocumentCursorError extends Error {constructor(){super("Invalid document cursor");}}
