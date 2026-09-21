import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const root=process.cwd();
const baseline=readFileSync(join(root,"src/lib/platform/controlled-user-manual.ts"),"utf8");
const service=readFileSync(join(root,"src/lib/platform/help-content.ts"),"utf8");
const panel=readFileSync(join(root,"src/components/platform-controlled-user-manual-panel.tsx"),"utf8");
describe("controlled user manual authoring readiness",()=>{
 it("defines the launch manual identity and complete section baseline",()=>{ expect(baseline).toContain('code: "UM-QMS-001"'); expect(baseline).toContain("Document operations and controlled files"); expect(baseline).toContain("Training and competency"); expect(baseline).toContain("Help, customer support, and controlled support access"); expect(baseline).toContain("Evidence handling, integrity, and prohibited content"); });
 it("keeps authoring behind platform help management permission",()=>{ expect(service).toContain('async listManualAuthoring'); expect(service).toContain('async getManualAuthoring'); expect(service).toContain('permission: "platform.help.manage"'); });
 it("shows release composition without bypassing publication controls",()=>{ expect(panel).toContain("Release readiness"); expect(panel).toContain("frozen sections"); expect(panel).toContain("Publication remains an explicit platform.help.manage action"); expect(panel).not.toContain("SupportSession"); });
});
