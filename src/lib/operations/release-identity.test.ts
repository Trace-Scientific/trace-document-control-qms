import { describe, expect, it } from "vitest";
import { releaseIdentity } from "./release-identity";

describe("release identity", () => {
  it("returns an immutable production candidate identity", () => {
    expect(
      releaseIdentity({
        NODE_ENV: "production",
        APP_RELEASE_VERSION: "0.1.0-rc.2",
        APP_RELEASE_SHA: "e9992606c460f2d3bef4ba7f1dde5c1b6f691e00",
      }),
    ).toEqual({
      version: "0.1.0-rc.2",
      sha: "e9992606c460f2d3bef4ba7f1dde5c1b6f691e00",
    });
  });

  it("rejects incomplete production identity", () => {
    expect(() =>
      releaseIdentity({
        NODE_ENV: "production",
        APP_RELEASE_VERSION: "latest",
        APP_RELEASE_SHA: "e999260",
      }),
    ).toThrow();
  });

  it("uses explicit non-production placeholders", () => {
    expect(releaseIdentity({ NODE_ENV: "development" })).toEqual({
      version: "development",
      sha: "unknown",
    });
  });
});
