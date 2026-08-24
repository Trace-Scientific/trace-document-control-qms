import { describe, expect, it } from "vitest";
import { filterDashboardDocuments, summarizeOperationalData } from "./dashboard";

const documents = [
  { id: "SOP-001", title: "Specimen Handling", type: "Procedure", status: "Effective" },
  { id: "POL-014", title: "Document Control", type: "Policy", status: "In review" },
  { id: "FRM-022", title: "Corrective Action", type: "Form", status: "Draft" },
];

describe("document dashboard filters", () => {
  it("searches document number, title, and type without case sensitivity", () => {
    expect(filterDashboardDocuments(documents, "sop-001", "All documents")).toHaveLength(1);
    expect(filterDashboardDocuments(documents, "DOCUMENT", "All documents")[0]?.id).toBe("POL-014");
    expect(filterDashboardDocuments(documents, "form", "All documents")[0]?.id).toBe("FRM-022");
  });

  it("combines text and status filters", () => {
    expect(filterDashboardDocuments(documents, "control", "In review")).toHaveLength(1);
    expect(filterDashboardDocuments(documents, "control", "Effective")).toHaveLength(0);
  });
});

describe("operational dashboard summary",()=>{
  it("counts unread notifications, overdue reviews, and delivery failures",()=>{
    expect(summarizeOperationalData({notifications:[{readAt:null},{readAt:"2026-08-24T00:00:00Z"}],reviews:[{overdue:true},{overdue:false}],failures:[{}]})).toEqual({unread:1,overdue:1,failures:1});
  });
});
