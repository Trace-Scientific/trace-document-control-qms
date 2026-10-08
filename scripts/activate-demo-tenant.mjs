import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";

export const DEMO_CODE = "trace-demo-lab";
export const CONFIRM = "ACTIVATE-SYNTHETIC-DEMO-TENANT";

export function parseActivationArgs(args) {
  if (args.length === 0 || (args.length === 1 && args[0] === "--dry-run")) return { apply: false };
  if (args.length === 2 && args.includes("--apply") && args.includes(`--confirm=${CONFIRM}`)) return { apply: true };
  throw new Error("Activation requires --apply and exact confirmation, or --dry-run");
}

export async function activateDemoTenant(db, { apply = false } = {}) {
  const org = await db.organization.findUnique({
    where: { loginCode: DEMO_CODE },
    select: { id: true, loginCode: true, legalName: true, displayName: true, active: true },
  });
  if (!org || org.legalName !== "Trace Scientific Demonstration Laboratory - Fictional" ||
      org.displayName !== "Trace Scientific Demo Laboratory (SYNTHETIC)") {
    throw new Error("Refusing activation: expected synthetic demo organization not found");
  }
  const [users, credentials] = await Promise.all([
    db.user.count({ where: { organizationId: org.id } }),
    db.credential.count({ where: { organizationId: org.id } }),
  ]);
  if (users !== 0 || credentials !== 0) {
    throw new Error("Refusing activation: demo tenant is not empty");
  }
  if (org.active) throw new Error("Refusing activation: demo tenant is already active");
  if (!apply) return { applied: false, organizationId: org.id, loginCode: DEMO_CODE };
  const changed = await db.organization.updateMany({
    where: { id: org.id, loginCode: DEMO_CODE, active: false },
    data: { active: true },
  });
  if (changed.count !== 1) throw new Error("Activation failed: tenant state changed");
  return { applied: true, organizationId: org.id, loginCode: DEMO_CODE };
}

async function main() {
  const args = parseActivationArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const db = new PrismaClient();
  try {
    console.log(JSON.stringify(await activateDemoTenant(db, args), null, 2));
  } finally {
    await db.$disconnect();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
