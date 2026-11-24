import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyPrivateBackup } from "./demo-private-backup-integrity.mjs";

const id = "fc269887-cb47-4784-826a-a70dddf48ce8";
const archive = "trace-qms-demo-20261124T015518Z.backup";
const bytes = Buffer.from("synthetic");
const row = { id, sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };

test("paired backup integrity rejects missing, corrupted, duplicate and unexpected objects", async () => {
  const directory = await mkdtemp(join(tmpdir(), "demo-backup-test-"));
  const verify = (expected = [row], name = archive) => verifyPrivateBackup({ archive: name, expected, directory });
  try {
    await assert.rejects(verify());
    await writeFile(join(directory, id), bytes);
    assert.deepEqual(await verify(), { archive, files: [row] });
    await assert.rejects(verify([row, row]));
    await assert.rejects(verify([row], "../production.backup"));
    await assert.rejects(verify([{ ...row, id: "../escape" }]));
    await writeFile(join(directory, id), Buffer.alloc(bytes.length));
    await assert.rejects(verify(), /SHA-256/);
    await writeFile(join(directory, id), bytes);
    await writeFile(join(directory, "unexpected"), bytes);
    await assert.rejects(verify(), /Unexpected/);
    await rm(join(directory, "unexpected"));
    await rm(join(directory, id));
    await writeFile(join(directory, "target"), bytes);
    await symlink(join(directory, "target"), join(directory, id));
    await assert.rejects(verify(), /type or size/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
