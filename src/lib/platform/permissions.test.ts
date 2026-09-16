import { describe, expect, it } from "vitest";
import {
  PLATFORM_PERMISSION_DESCRIPTIONS,
  PLATFORM_PERMISSIONS,
} from "./permissions";

describe("platform permission catalog", () => {
  it("contains unique stable keys with descriptions", () => {
    expect(new Set(PLATFORM_PERMISSIONS).size).toBe(PLATFORM_PERMISSIONS.length);
    for (const permission of PLATFORM_PERMISSIONS) {
      expect(permission.startsWith("platform.")).toBe(true);
      expect(PLATFORM_PERMISSION_DESCRIPTIONS[permission].trim().length).toBeGreaterThan(10);
    }
  });

  it("keeps tenant permission keys out of the platform catalog", () => {
    for (const permission of PLATFORM_PERMISSIONS) {
      expect(permission).not.toMatch(/^document\./);
      expect(permission).not.toMatch(/^administration\./);
      expect(permission).not.toMatch(/^audit\./);
      expect(permission).not.toMatch(/^notification\./);
    }
  });
});
