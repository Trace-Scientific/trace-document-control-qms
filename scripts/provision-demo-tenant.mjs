import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { validateDemoManifest } from "./demo-tenant-manifest.mjs";

export const DEMO_CODE = "trace-demo-lab";
export const DEMO_NAME = "Trace Scientific Demo Laboratory (SYNTHETIC)";
export const DEMO_LEGAL_NAME = "Trace Scientific Demonstration Laboratory - Fictional";
const CONFIRMATION = "CREATE-SYNTHETIC-DEMO-TENANT";

export function parseDemoArgs(args) {
  const apply = args.includes("--apply");
  const dryRun = args.includes("--dry-run");
  const confirm = args.find((arg) => arg.startsWith("--confirm="));
  if (apply && dryRun) throw new Error("Choose either --apply or --dry-run");
  if (args.some((arg) => !["--apply", "--dry-run", `--confirm=${CONFIRMATION}`].includes(arg))) {
    throw new Error("Unknown or invalid argument");
  }
  if (apply && confirm !== `--confirm=${CONFIRMATION}`) {
    throw new Error("Apply requires explicit synthetic-demo confirmation");
  }
  return { apply };
}

export async function inspectDemoTenant(db) {
  const existing = await db.organization.findUnique({ where: { loginCode: DEMO_CODE } });
  if (existing) {
    throw new Error("Demo login code is already in use; refuse to modify an existing organization");
  }
  return {
    mode: "create-only",
    loginCode: DEMO_CODE,
    displayName: DEMO_NAME,
    lifecycle: "inactive-until-explicit-activation",
    existingOrganizationChanges: 0,
    usersCreated: 0,
    documentsCreated: 0,
  };
}

export async function provisionDemoTenant(db, { apply }) {
  const manifest = validateDemoManifest();
  const plan = { ...(await inspectDemoTenant(db)), manifest };
  if (!apply) return { ...plan, applied: false };
  // Unique loginCode constraint prevents racing another provisioner.
  const created = await db.organization.create({
    data: {
      loginCode: DEMO_CODE,
      legalName: DEMO_LEGAL_NAME,
      displayName: DEMO_NAME,
      timezone: "America/Los_Angeles",
      active: false,
    },
    select: { id: true, loginCode: true, active: true },
  });
  return { ...plan, applied: true, organization: created };
}

async function main() {
  const options = parseDemoArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const db = new PrismaClient();
  try {
    const result = await provisionDemoTenant(db, options);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
