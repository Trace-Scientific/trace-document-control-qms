import { requireAuthorization, type AuthorizationContext } from "../security/authorization";
export interface ClaimedNotification { id:string;organizationId:string;recipientUserId:string|null;recipientAddress:string|null;channel:"IN_APP"|"EMAIL";templateKey:string;payload:unknown;attempts:number }
export interface DeliveryStore {
  claimBatch(organizationId:string,workerId:string,now:Date,leaseExpiredAt:Date,limit:number):Promise<ClaimedNotification[]>;
  markSent(id:string,workerId:string,sentAt:Date):Promise<boolean>;
  markFailed(id:string,workerId:string,input:{failedAt:Date;availableAt:Date;error:string;deadLetter:boolean}):Promise<boolean>;
  listInbox(organizationId:string,userId:string):Promise<Array<{id:string;templateKey:string;payload:unknown;sentAt:Date|null;readAt:Date|null}>>;
  markRead(organizationId:string,userId:string,id:string,readAt:Date):Promise<boolean>;
  listDeliveryFailures(organizationId:string):Promise<Array<{id:string;status:string;attempts:number;lastError:string|null;availableAt:Date}>>;
  requeue(organizationId:string,id:string,actorUserId:string,now:Date):Promise<boolean>;
}
export interface NotificationTransport { deliver(notification:ClaimedNotification):Promise<void> }
const MAX_ATTEMPTS=5,LEASE_MS=5*60_000;
export class NotificationDeliveryService {
  constructor(private readonly store:DeliveryStore,private readonly transports:Record<"IN_APP"|"EMAIL",NotificationTransport>,private readonly clock:()=>Date=()=>new Date()){}
  async process(organizationId:string,workerId:string,limit=50){
    if(!organizationId||!workerId.trim()||limit<1||limit>100)throw new NotificationValidationError();
    const now=this.clock(),claimed=await this.store.claimBatch(organizationId,workerId,now,new Date(now.getTime()-LEASE_MS),limit);let sent=0,failed=0,deadLettered=0;
    for(const item of claimed){try{await this.transports[item.channel].deliver(item);if(await this.store.markSent(item.id,workerId,this.clock()))sent++;}catch(error){const attempts=item.attempts+1,deadLetter=attempts>=MAX_ATTEMPTS,delay=Math.min(24*60*60_000,60_000*2**Math.max(0,attempts-1)),failedAt=this.clock(),message=error instanceof Error?error.message:"Delivery failed";await this.store.markFailed(item.id,workerId,{failedAt,availableAt:new Date(failedAt.getTime()+delay),error:message.slice(0,1000),deadLetter});failed++;if(deadLetter)deadLettered++;}}
    return{claimed:claimed.length,sent,failed,deadLettered};
  }
}
export class NotificationInboxService {
  constructor(private readonly store:DeliveryStore,private readonly clock:()=>Date=()=>new Date()){}
  async list(context:AuthorizationContext,organizationId:string){if(context.userState!=="ACTIVE"||context.organizationId!==organizationId)throw new Error("Access denied");return this.store.listInbox(organizationId,context.userId);}
  async markRead(context:AuthorizationContext,input:{organizationId:string;notificationId:string}){if(context.userState!=="ACTIVE"||context.organizationId!==input.organizationId)throw new Error("Access denied");if(!await this.store.markRead(input.organizationId,context.userId,input.notificationId,this.clock()))throw new Error("Access denied");return{read:true};}
  async failures(context:AuthorizationContext,organizationId:string){requireAuthorization(context,{organizationId,permission:"notification.manage"});return this.store.listDeliveryFailures(organizationId);}
  async requeue(context:AuthorizationContext,input:{organizationId:string;notificationId:string}){requireAuthorization(context,{organizationId:input.organizationId,permission:"notification.manage"});if(!await this.store.requeue(input.organizationId,input.notificationId,context.userId,this.clock()))throw new NotificationConflictError();return{requeued:true};}
}
export class NotificationValidationError extends Error {}
export class NotificationConflictError extends Error {constructor(){super("Notification is not eligible for requeue");}}
