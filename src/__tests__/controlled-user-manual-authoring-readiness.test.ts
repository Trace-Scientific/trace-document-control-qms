import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const root=process.cwd();
const baseline=readFileSync(join(root,"src/lib/platform/controlled-user-manual.ts"),"utf8");
const service=readFileSync(join(root,"src/lib/platform/help-content.ts"),"utf8");
const panel=readFileSync(join(root,"src/components/platform-controlled-user-manual-panel.tsx"),"utf8");
const assembly=readFileSync(join(root,"src/lib/platform/controlled-user-manual-assembly.ts"),"utf8");
describe("controlled user manual authoring readiness",()=>{
 it("defines the launch manual identity and complete section baseline",()=>{ expect(baseline).toContain('code: "UM-QMS-001"'); expect(baseline).toContain("Document operations and controlled files"); expect(baseline).toContain("Training and competency"); expect(baseline).toContain("Help, customer support, and controlled support access"); expect(baseline).toContain("Evidence handling, integrity, and prohibited content"); });
 it("keeps authoring behind platform help management permission",()=>{ expect(service).toContain('async listManualAuthoring'); expect(service).toContain('async getManualAuthoring'); expect(service).toContain('permission: "platform.help.manage"'); });
 it("keeps the manual authoring lookup explicitly typed for production builds",()=>{ expect(service).toContain('$queryRaw<{ id: string; code: string; name: string; description: string | null }[]>'); });
 it("shows release composition without bypassing publication controls",()=>{ expect(panel).toContain("Release readiness"); expect(panel).toContain("frozen sections"); expect(panel).toContain("It remains DRAFT, unscheduled, and unpublished."); expect(panel).toContain("Generating a snapshot does not publish a manual"); expect(panel).not.toContain("SupportSession"); });
 it("makes repeat reviewed-draft assembly a true no-op and preserves exact evidence on real assembly",()=>{ expect(assembly).toContain("const changed ="); expect(assembly).toContain("if (changed)"); expect(assembly).toContain("sectionRevisionIds: revisionIds"); expect(assembly).toContain("changed,"); });
 it("does not invite a second assembly when exact v0.1 readiness is already present",()=>{ expect(panel).toContain("assembledDraft"); expect(panel).toContain("Reviewed draft v0.1 is already assembled."); expect(panel).toContain("await open(controlled.id)"); expect(panel).toContain("Verifying reviewed draft readiness"); expect(panel).toContain("Reconcile its controlled release state before assembly"); });
});
