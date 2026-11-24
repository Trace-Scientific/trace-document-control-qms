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
// Source endpoint and bucket must be separately approved and pinned in deployment configuration.
const endpoint = new URL(env.DEMO_FILE_SOURCE_ENDPOINT);
if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password ||
    endpoint.pathname !== "/" || endpoint.search || endpoint.hash ||
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(env.DEMO_FILE_SOURCE_BUCKET ?? "") ||
    env.DEMO_FILE_SOURCE_BUCKET === env.S3_BACKUP_BUCKET ||
    !env.DEMO_FILE_SOURCE_ACCESS_KEY_ID || !env.DEMO_FILE_SOURCE_SECRET_ACCESS_KEY ||
    !env.DEMO_FILE_SOURCE_REGION) throw new Error("Invalid private file source configuration");
const awsEnv = (access, secret, region) => ({
  PATH: env.PATH, HOME: env.HOME, AWS_ACCESS_KEY_ID: access,
  AWS_SECRET_ACCESS_KEY: secret, AWS_DEFAULT_REGION: region,
  AWS_EC2_METADATA_DISABLED: "true", AWS_CONFIG_FILE: "/dev/null",
  AWS_SHARED_CREDENTIALS_FILE: "/dev/null",
});
const source = awsEnv(env.DEMO_FILE_SOURCE_ACCESS_KEY_ID, env.DEMO_FILE_SOURCE_SECRET_ACCESS_KEY, env.DEMO_FILE_SOURCE_REGION);
const destination = awsEnv(env.AWS_ACCESS_KEY_ID, env.AWS_SECRET_ACCESS_KEY, env.AWS_DEFAULT_REGION);
const rows = JSON.parse(await readFile(metadata, "utf8"));
const work = await mkdtemp(join(tmpdir(), "demo-manifest-"));
async function aws(args, credentials) {
  try { await run("aws", args, { env: credentials, timeout: 300000 }); }
  catch { throw new Error("Private backup storage transfer failed"); }
}
try {
  const manifest = await collectPrivateBackup({
    tier: env.DEPLOYMENT_TIER, archive, rows,
    download: (key, path) => aws(["--endpoint-url", endpoint.origin, "s3api", "get-object",
      "--bucket", env.DEMO_FILE_SOURCE_BUCKET, "--key", key, path], source),
    publish: async ({ key, path, body }) => {
      if (!path) { path = join(work, "manifest.json"); await writeFile(path, body, { mode: 0o600 }); }
      await aws(["s3api", "put-object", "--bucket", env.S3_BACKUP_BUCKET,
        "--key", key, "--body", path, "--server-side-encryption", "AES256"], destination);
    },
  });
  console.log("PASS: paired private-file backup published; files:", manifest.files.length);
} finally { await rm(work, { recursive: true, force: true }); }
