import { describe, expect, it } from "vitest";
import { diffLines } from "./diff";
describe("controlled text redline", () => {
  it("preserves equal lines and marks removals and additions", () => {
    expect(
      diffLines("Collect sample\nStore cold", "Collect sample\nStore at 2-8 C"),
    ).toEqual([
      { kind: "equal", text: "Collect sample" },
      { kind: "removed", text: "Store cold" },
      { kind: "added", text: "Store at 2-8 C" },
    ]);
  });
});
