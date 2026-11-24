import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { collectPrivateBackup } from "./demo-private-backup-collection.mjs";

const run = promisify(execFile);
const env = process.env;
const [archive, metadata] = process.argv.slice(2);
if (env.DEPLOYMENT_TIER !== "demo" ||
    env.S3_BACKUP_BUCKET !== "trace-qms-demo-db-backups" ||
    env.AWS_DEFAULT_REGION !== "us-east-2") throw new Error("Invalid backup destination");
const exportSecret = env.DEMO_BACKUP_EXPORT_SECRET;
if (!exportSecret || exportSecret.length < 32) throw new Error("Missing dedicated export credential");
const exportOrigin = "https://trace-qms-demo-demo.up.railway.app";
const awsEnv = (access, secret, region) => ({
  PATH: env.PATH, HOME: env.HOME, AWS_ACCESS_KEY_ID: access,
  AWS_SECRET_ACCESS_KEY: secret, AWS_DEFAULT_REGION: region,
  AWS_EC2_METADATA_DISABLED: "true", AWS_CONFIG_FILE: "/dev/null",
  AWS_SHARED_CREDENTIALS_FILE: "/dev/null",
});
const destination = awsEnv(env.AWS_ACCESS_KEY_ID, env.AWS_SECRET_ACCESS_KEY, env.AWS_DEFAULT_REGION);
const rows = JSON.parse(await readFile(metadata, "utf8"));
const work = await mkdtemp(join(tmpdir(), "demo-manifest-"));
async function aws(args, credentials) {
  try { await run("aws", args, { env: credentials, timeout: 300000 }); }
  catch { throw new Error("Private backup storage transfer failed"); }
}
const preflight = env.DEMO_BACKUP_EXPORT_PREFLIGHT === "1";
try {
  if (preflight) {
    if (!rows.length) throw new Error("Preflight requires at least one archived file");
    const url = new URL("/api/internal/demo-backup-export", exportOrigin);
    url.searchParams.set("id", rows[0].id);
    for (const headers of [{}, { authorization: "Bearer invalid-preflight-token" }]) {
      const response = await fetch(url, { headers, redirect: "error", signal: AbortSignal.timeout(30000) });
      if (response.status !== 401) throw new Error("Unauthorized export denial failed");
      await response.body?.cancel();
    }
    console.log("PASS: missing and invalid export credentials denied");
  }
  const manifest = await collectPrivateBackup({
    tier: env.DEPLOYMENT_TIER, archive, rows,
    download: async (key, path) => {
      const row = rows.find((item) => item.storageKey === key);
      const url = new URL("/api/internal/demo-backup-export", exportOrigin);
      url.searchParams.set("id", row.id);
      const response = await fetch(url, {
        headers: { authorization: "Bearer " + exportSecret },
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(120000),
      });
      if (!response.ok) throw new Error("Restricted private file export failed");
      await writeFile(path, new Uint8Array(await response.arrayBuffer()), { mode: 0o600, flag: "wx" });
    },
    publish: async ({ key, path, body }) => {
      if (preflight) return;
      if (!path) { path = join(work, "manifest.json"); await writeFile(path, body, { mode: 0o600 }); }
      await aws(["s3api", "put-object", "--bucket", env.S3_BACKUP_BUCKET,
        "--key", key, "--body", path, "--server-side-encryption", "AES256"], destination);
    },
  });
  console.log(preflight ? "PASS: export preflight verified without publication; files:" : "PASS: paired private-file backup published; files:", manifest.files.length);
} finally { await rm(work, { recursive: true, force: true }); }
