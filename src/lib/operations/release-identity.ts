const SHA_PATTERN = /^[0-9a-f]{40}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export interface ReleaseIdentity {
  version: string;
  sha: string;
}

export function releaseIdentity(
  source: Record<string, string | undefined> = process.env,
): ReleaseIdentity {
  const version = source.APP_RELEASE_VERSION ?? "development";
  const sha = source.APP_RELEASE_SHA ?? "unknown";

  if (source.NODE_ENV === "production") {
    if (!VERSION_PATTERN.test(version)) {
      throw new Error("APP_RELEASE_VERSION must be a semantic release version");
    }
    if (!SHA_PATTERN.test(sha)) {
      throw new Error("APP_RELEASE_SHA must be a full lowercase Git commit SHA");
    }
  }

  return { version, sha };
}
