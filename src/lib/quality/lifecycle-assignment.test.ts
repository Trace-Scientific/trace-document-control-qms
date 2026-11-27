import { describe, expect, it } from "vitest";
import { getLifecycleAssignmentChanges } from "./lifecycle-assignment";

const assigned = { ownerUserId: "user-1", dueAt: "2026-12-01T00:00:00.000Z" };
const unassigned = { ownerUserId: null, dueAt: null };

describe("quality event assignment changes", () => {
  it("sends only fields the user changed", () => {
    expect(getLifecycleAssignmentChanges(assigned, { ownerUserId: "user-2" })).toEqual({ ownerUserId: "user-2" });
    expect(getLifecycleAssignmentChanges(assigned, { dueAt: "2026-12-02" })).toEqual({ dueAt: "2026-12-02" });
  });

  it("distinguishes explicit clearing from leaving a field untouched", () => {
    expect(getLifecycleAssignmentChanges(assigned, { ownerUserId: null })).toEqual({ ownerUserId: null });
    expect(getLifecycleAssignmentChanges(assigned, { dueAt: null })).toEqual({ dueAt: null });
  });

  it("omits unchanged values and dates that match after normalizing the timestamp", () => {
    expect(getLifecycleAssignmentChanges(assigned, {})).toEqual({});
    expect(getLifecycleAssignmentChanges(assigned, { ownerUserId: "user-1", dueAt: "2026-12-01" })).toEqual({});
    expect(getLifecycleAssignmentChanges(unassigned, { ownerUserId: null, dueAt: null })).toEqual({});
  });
});
