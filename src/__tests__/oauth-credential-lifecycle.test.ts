import fs from "node:fs";
import path from "node:path";

describe("OAuth credential lifecycle hardening", () => {
  const migration = fs.readFileSync(path.join(process.cwd(), "prisma/migrations/20260916310000_platform_oauth_credential_lifecycle/migration.sql"), "utf8");
  const lifecycle = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/oauth-lifecycle.ts"), "utf8");
  const sessions = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/oauth-authorization-session.ts"), "utf8");
  const awsStore = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/aws-secrets-manager-credential-resolver.ts"), "utf8");
  const iam = fs.readFileSync(path.join(process.cwd(), "deploy/aws/validation/integration-secrets-access.yaml"), "utf8");
  const quickbooks = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/quickbooks-oauth-provider.ts"), "utf8");
  const salesforce = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/salesforce-oauth-provider.ts"), "utf8");
  const runtime = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/integration-runtime.ts"), "utf8");

  it("stores lifecycle metadata but no OAuth secrets in Postgres", () => {
    expect(migration).toContain('CREATE TABLE "PlatformOAuthCredentialLifecycle"');
    expect(migration).toContain('CREATE TABLE "PlatformOAuthAuthorizationSession"');
    expect(migration).toContain('"stateSha256" TEXT NOT NULL UNIQUE');
    expect(migration).toContain('"pkceChallenge" TEXT NOT NULL');
    expect(migration).not.toContain('"accessToken"');
    expect(migration).not.toContain('"refreshToken"');
    expect(migration).not.toContain('"clientSecret"');
    expect(migration).not.toContain('"codeVerifier"');
    expect(migration).not.toContain('"authorizationCode"');
  });

  it("uses one-time S256 state and PKCE sessions", () => {
    expect(sessions).toContain('randomBytes(32).toString("base64url")');
    expect(sessions).toContain('randomBytes(64).toString("base64url")');
    expect(sessions).toContain('digest("base64url")');
    expect(sessions).toContain('codeChallengeMethod: "S256"');
    expect(sessions).toContain('"consumedAt"=CURRENT_TIMESTAMP');
    expect(sessions).toContain('_traceOAuthPendingAuthorization');
  });

  it("rotates OAuth secrets only through the governed AWS credential store", () => {
    expect(lifecycle).toContain("this.credentials.replace");
    expect(lifecycle).toContain('connection.credentialRef?.startsWith("aws-sm://")');
    expect(awsStore).toContain('"PutSecretValue"');
    expect(iam).toContain("secretsmanager:PutSecretValue");
    expect(iam).toContain("kms:GenerateDataKey");
    expect(iam).toContain("kms:ViaService");
    expect(iam).toContain("secret:trace-qms/validation/integrations/*");
    expect(iam).not.toContain("secret:*");
  });

  it("locks refresh work and fails invalid grants into reauthorization", () => {
    expect(lifecycle).toContain("FOR UPDATE SKIP LOCKED");
    expect(lifecycle).toContain('"status"=\'REFRESHING\'');
    expect(lifecycle).toContain("PlatformOAuthReauthorizationRequiredError");
    expect(quickbooks).toContain('code === "invalid_grant"');
    expect(salesforce).toContain('code === "invalid_grant"');
  });

  it("scrubs provider tokens on revocation and registers reviewed providers only", () => {
    expect(quickbooks).toContain('sanitizedOAuthCredential(record, [');
    expect(salesforce).toContain('sanitizedOAuthCredential(record, [');
    expect(runtime).toContain("new QuickBooksOAuthProvider()");
    expect(runtime).toContain("new SalesforceOAuthProvider()");
    expect(runtime).toContain("new PlatformOAuthLifecycleService(");
    expect(runtime).toContain("new PlatformOAuthAuthorizationSessionService(");
  });
});
