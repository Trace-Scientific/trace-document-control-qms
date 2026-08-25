export interface ReadinessDependency {
  name: string;
  check(): Promise<void>;
}

export async function checkReadiness(
  dependencies: ReadinessDependency[],
  checkedAt = new Date(),
) {
  const checks = await Promise.all(
    dependencies.map(async (dependency) => {
      try {
        await dependency.check();
        return { name: dependency.name, status: "ok" as const };
      } catch {
        return { name: dependency.name, status: "unavailable" as const };
      }
    }),
  );
  return {
    status: checks.every((check) => check.status === "ok")
      ? ("ready" as const)
      : ("not_ready" as const),
    checkedAt: checkedAt.toISOString(),
    checks,
  };
}
