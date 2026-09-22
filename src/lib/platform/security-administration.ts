import { Prisma } from "@prisma/client";
import { db } from "../db";
import { requirePlatformAuthorization, type PlatformAuthorizationContext } from "./authorization";
import { PLATFORM_PERMISSIONS, type PlatformPermissionKey } from "./permissions";

export class PlatformSecurityValidationError extends Error {
  constructor(message:string){super(message);this.name="PlatformSecurityValidationError";}
}

export class PlatformSecurityService {
  async workspace(context:PlatformAuthorizationContext){
    requirePlatformAuthorization(context,{permission:"platform.security.manage"});
    const [principals,roles,permissions,rolePermissions,assignments]=await Promise.all([
      db.$queryRaw<Array<{identityId:string;membershipId:string;email:string;identityStatus:string;membershipStatus:string}>>(Prisma.sql`
        SELECT pi."id" AS "identityId",pm."id" AS "membershipId",u."email",
          pi."status"::text AS "identityStatus",pm."status"::text AS "membershipStatus"
        FROM "PlatformIdentity" pi
        INNER JOIN "User" u ON u."id"=pi."sourceUserId"
        INNER JOIN "PlatformMembership" pm ON pm."identityId"=pi."id"
        ORDER BY lower(u."email")
      `),
      db.$queryRaw<Array<{id:string;name:string;description:string|null;systemRole:boolean}>>(Prisma.sql`
        SELECT "id","name","description","systemRole" FROM "PlatformRole" ORDER BY "systemRole" DESC,"name"
      `),
      db.$queryRaw<Array<{id:string;key:string;description:string|null}>>(Prisma.sql`
        SELECT "id","key","description" FROM "PlatformPermission" ORDER BY "key"
      `),
      db.$queryRaw<Array<{roleId:string;permissionId:string;permissionKey:string}>>(Prisma.sql`
        SELECT prp."roleId",prp."permissionId",pp."key" AS "permissionKey"
        FROM "PlatformRolePermission" prp
        INNER JOIN "PlatformPermission" pp ON pp."id"=prp."permissionId"
        ORDER BY prp."roleId",pp."key"
      `),
      db.$queryRaw<Array<{membershipId:string;roleId:string;assignedAt:Date;assignedByMembershipId:string|null}>>(Prisma.sql`
        SELECT "membershipId","roleId","assignedAt","assignedByMembershipId"
        FROM "PlatformMembershipRole" ORDER BY "assignedAt" DESC
      `)
    ]);
    return {principals,roles,permissions,rolePermissions,assignments};
  }

  async createRole(context:PlatformAuthorizationContext,input:{name:string;description?:string|null;permissionKeys:PlatformPermissionKey[];reason:string}){
    requirePlatformAuthorization(context,{permission:"platform.security.manage"});
    const name=requireText(input.name,"Role name",160);
    const description=input.description?.trim()||null;
    const reason=requireText(input.reason,"Reason",1000);
    if(description&&description.length>1000) throw new PlatformSecurityValidationError("Description must be 1000 characters or fewer");
    const permissionKeys=validatePermissionKeys(input.permissionKeys);

    return db.$transaction(async(tx)=>{
      const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
        INSERT INTO "PlatformRole" ("id","name","description","systemRole","updatedAt")
        VALUES (gen_random_uuid(),${name},${description},false,CURRENT_TIMESTAMP)
        RETURNING "id"
      `);
      const roleId=rows[0].id;
      await replaceCustomRolePermissions(tx,roleId,permissionKeys);
      await audit(tx,context,"platform.security.role_created","PlatformRole",roleId,reason,{name,permissionKeys});
      return {id:roleId,name,description,systemRole:false,permissionKeys};
    });
  }

  async setRolePermissions(context:PlatformAuthorizationContext,input:{roleId:string;permissionKeys:PlatformPermissionKey[];reason:string}){
    requirePlatformAuthorization(context,{permission:"platform.security.manage"});
    const reason=requireText(input.reason,"Reason",1000);
    const permissionKeys=validatePermissionKeys(input.permissionKeys);
    return db.$transaction(async(tx)=>{
      await ensureCustomRole(tx,input.roleId);
      await replaceCustomRolePermissions(tx,input.roleId,permissionKeys);
      await tx.$executeRaw(Prisma.sql`UPDATE "PlatformRole" SET "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${input.roleId}::uuid`);
      await audit(tx,context,"platform.security.role_permissions_set","PlatformRole",input.roleId,reason,{permissionKeys});
      return {id:input.roleId,permissionKeys};
    });
  }

  async assignRole(context:PlatformAuthorizationContext,input:{membershipId:string;roleId:string;reason:string}){
    requirePlatformAuthorization(context,{permission:"platform.security.manage"});
    const reason=requireText(input.reason,"Reason",1000);
    return db.$transaction(async(tx)=>{
      await ensureActiveMembership(tx,input.membershipId);
      await ensureCustomRole(tx,input.roleId);
      const changed=await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PlatformMembershipRole" ("membershipId","roleId","assignedByMembershipId")
        VALUES (${input.membershipId}::uuid,${input.roleId}::uuid,${context.platformMembershipId}::uuid)
        ON CONFLICT ("membershipId","roleId") DO NOTHING
      `);
      if(changed!==1) throw new PlatformSecurityValidationError("Role is already assigned to this platform membership");
      await audit(tx,context,"platform.security.role_assigned","PlatformMembership",input.membershipId,reason,{roleId:input.roleId});
      return {membershipId:input.membershipId,roleId:input.roleId,assigned:true};
    });
  }

  async unassignRole(context:PlatformAuthorizationContext,input:{membershipId:string;roleId:string;reason:string}){
    requirePlatformAuthorization(context,{permission:"platform.security.manage"});
    const reason=requireText(input.reason,"Reason",1000);
    return db.$transaction(async(tx)=>{
      await ensureCustomRole(tx,input.roleId);
      const changed=await tx.$executeRaw(Prisma.sql`
        DELETE FROM "PlatformMembershipRole"
        WHERE "membershipId"=${input.membershipId}::uuid AND "roleId"=${input.roleId}::uuid
      `);
      if(changed!==1) throw new PlatformSecurityValidationError("Custom role assignment was not found");
      await audit(tx,context,"platform.security.role_unassigned","PlatformMembership",input.membershipId,reason,{roleId:input.roleId});
      return {membershipId:input.membershipId,roleId:input.roleId,assigned:false};
    });
  }
}

function validatePermissionKeys(keys:PlatformPermissionKey[]){
  const unique=[...new Set(keys)];
  const allowed=new Set<string>(PLATFORM_PERMISSIONS);
  for(const key of unique) if(!allowed.has(key)) throw new PlatformSecurityValidationError("Unknown platform permission: "+key);
  return unique;
}

async function ensureCustomRole(tx:Prisma.TransactionClient,roleId:string){
  const rows=await tx.$queryRaw<Array<{systemRole:boolean}>>(Prisma.sql`
    SELECT "systemRole" FROM "PlatformRole" WHERE "id"=${roleId}::uuid FOR UPDATE
  `);
  if(rows.length!==1) throw new PlatformSecurityValidationError("Platform role not found");
  if(rows[0].systemRole) throw new PlatformSecurityValidationError("System platform roles are bootstrap-controlled and read-only");
}

async function ensureActiveMembership(tx:Prisma.TransactionClient,membershipId:string){
  const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
    SELECT pm."id" FROM "PlatformMembership" pm
    INNER JOIN "PlatformIdentity" pi ON pi."id"=pm."identityId"
    WHERE pm."id"=${membershipId}::uuid AND pm."status"='ACTIVE' AND pi."status"='ACTIVE'
  `);
  if(rows.length!==1) throw new PlatformSecurityValidationError("Platform membership and identity must both be active");
}

async function replaceCustomRolePermissions(tx:Prisma.TransactionClient,roleId:string,permissionKeys:PlatformPermissionKey[]){
  const permissions=permissionKeys.length
    ? await tx.$queryRaw<Array<{id:string;key:string}>>(Prisma.sql`
        SELECT "id","key" FROM "PlatformPermission" WHERE "key"=ANY(${permissionKeys}::text[])
      `)
    : [];
  if(permissions.length!==permissionKeys.length) throw new PlatformSecurityValidationError("One or more platform permissions are unavailable");
  await tx.$executeRaw(Prisma.sql`DELETE FROM "PlatformRolePermission" WHERE "roleId"=${roleId}::uuid`);
  for(const permission of permissions){
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "PlatformRolePermission" ("roleId","permissionId")
      VALUES (${roleId}::uuid,${permission.id}::uuid)
    `);
  }
}

function requireText(value:string,label:string,max:number){
  const normalized=value.trim();
  if(!normalized||normalized.length>max) throw new PlatformSecurityValidationError(`${label} is required and must be ${max} characters or fewer`);
  return normalized;
}

async function audit(tx:Prisma.TransactionClient,context:PlatformAuthorizationContext,action:string,entityType:string,entityId:string,reason:string,metadata:Record<string,unknown>){
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "PlatformAuditEvent" ("id","actorIdentityId","actorMembershipId","action","entityType","entityId","reason","metadata")
    VALUES (gen_random_uuid(),${context.platformIdentityId}::uuid,${context.platformMembershipId}::uuid,${action},${entityType},${entityId}::uuid,${reason},${JSON.stringify(metadata)}::jsonb)
  `);
}
