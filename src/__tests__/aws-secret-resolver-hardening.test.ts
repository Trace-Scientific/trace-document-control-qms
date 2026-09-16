import fs from "node:fs";
import path from "node:path";

describe("AWS integration secret resolver hardening", () => {
  const awsResolver = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/aws-secrets-manager-credential-resolver.ts"), "utf8");
  const chain = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/platform-credential-resolver.ts"), "utf8");
  const runtime = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/integration-runtime.ts"), "utf8");
  const iam = fs.readFileSync(path.join(process.cwd(), "deploy/aws/validation/integration-secrets-access.yaml"), "utf8");

  it("accepts only the governed validation integration secret namespace", () => {
    expect(awsResolver).toContain("trace-qms\\/validation\\/integrations");
    expect(awsResolver).not.toContain("production)\\/integrations");
    expect(awsResolver).toContain('region !== "us-west-1"');
  });

  it("uses ECS task-role credentials and no AWS SDK dependency", () => {
    expect(awsResolver).toContain("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI");
    expect(awsResolver).toContain("169.254.170.2");
    expect(awsResolver).toContain("AWS4-HMAC-SHA256");
    expect(awsResolver).not.toContain("@aws-sdk/");
  });

  it("fails closed by credential reference scheme", () => {
    expect(chain).toContain('reference.startsWith("env:")');
    expect(chain).toContain('reference.startsWith("aws-sm://")');
    expect(chain).toContain("Credential reference scheme is not approved");
    expect(runtime).toContain("new GovernedPlatformCredentialResolver()");
  });

  it("limits task-role access to integration secrets", () => {
    expect(iam).toContain("secretsmanager:GetSecretValue");
    expect(iam).toContain("secret:trace-qms/validation/integrations/*");
    expect(iam).toContain("kms:ViaService");
    expect(iam).not.toContain("secret:*");
  });

  it("bounds secret handling", () => {
    expect(awsResolver).toContain("CACHE_TTL_MS = 5 * 60 * 1000");
    expect(awsResolver).toContain("MAX_SECRET_BYTES = 64 * 1024");
    expect(awsResolver).toContain('cache: "no-store"');
  });
});
