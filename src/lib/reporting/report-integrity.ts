import { createHash } from "node:crypto";

function normalize(value:unknown):unknown{
  if(Array.isArray(value))return value.map(normalize);
  if(value&&typeof value==="object"){
    const record=value as Record<string,unknown>;
    return Object.fromEntries(Object.keys(record).sort().map(key=>[key,normalize(record[key])]));
  }
  return value;
}

export function stableJsonStringify(value:unknown):string{
  return JSON.stringify(normalize(value));
}

export function sha256Json(value:unknown):string{
  return createHash("sha256").update(stableJsonStringify(value)).digest("hex");
}

function legacyGovernedSummaryStringify(value:unknown):string|null{
  if(!Array.isArray(value))return null;
  if(value.some(row=>!row||typeof row!=="object"||Array.isArray(row)))return null;
  const rows=value as Array<Record<string,unknown>>;
  if(rows.some(row=>Object.keys(row).some(key=>key!=="status"&&key!=="count")||!("status" in row)||!("count" in row)))return null;
  return JSON.stringify(rows.map(row=>({status:row.status,count:row.count})));
}

export function verifyReportResultDigest(value:unknown,expectedDigest:string):boolean{
  if(sha256Json(value)===expectedDigest)return true;
  const legacy=legacyGovernedSummaryStringify(value);
  return legacy!==null&&createHash("sha256").update(legacy).digest("hex")===expectedDigest;
}
