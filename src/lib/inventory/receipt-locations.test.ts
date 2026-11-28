import { describe, expect, it } from "vitest";
import { availableReceiptDepartments, type ReceiptLocations } from "./receipt-locations";

const directory: ReceiptLocations = {
  sites: [
    { id: "main", name: "Main", active: true },
    { id: "annex", name: "Annex", active: false },
  ],
  departments: [
    { id: "main-receiving", name: "Receiving", siteId: "main", active: true },
    { id: "historical", name: "Historical department", siteId: "main", active: false },
    { id: "annex-receiving", name: "Receiving", siteId: "annex", active: true },
    { id: "shared", name: "Shared receiving", siteId: null, active: true },
  ],
};

describe("receipt location options", () => {
  it("offers only active departments at the selected active site", () => {
    expect(availableReceiptDepartments(directory, "main").map(department => department.id)).toEqual(["main-receiving"]);
    expect(availableReceiptDepartments(directory, "annex")).toEqual([]);
    expect(availableReceiptDepartments(directory, "unknown")).toEqual([]);
  });

  it("offers organization-level departments when no site is selected", () => {
    expect(availableReceiptDepartments(directory, null).map(department => department.id)).toEqual(["shared"]);
  });
});
