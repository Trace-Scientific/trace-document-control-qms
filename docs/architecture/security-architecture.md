# Security Architecture

## Authentication
Use secure password hashing, secure session management, session expiration, account lockout/rate limiting, and MFA-ready authentication. Prefer phishing-resistant MFA for privileged users when supported.

## Authorization
Authorization is server-side and deny-by-default.

Layers:
1. Authentication — who is the user?
2. Tenant authorization — which organization may the user access?
3. Role/permission authorization — what actions may they perform?
4. Resource scope — which site/department/record is accessible?
5. Workflow authorization — is the user eligible to perform this transition/signature?

Frontend controls are UX only and never the security boundary.

## Privileged operations
Require explicit permissions and audit events for:
- role/permission changes
- document approval/retirement
- record disposition
- electronic signatures
- CAPA closure
- competency finalization
- audit finalization
- regulated exports

## Files
Validate file type and size, normalize filenames, store outside the web root, scan uploads through an abstraction, and issue authorized download URLs only after access checks.

## Secrets
Secrets belong in environment/secret-management infrastructure, never source control. `.env.example` contains placeholders only.

## Logging
Use structured security logs. Avoid logging passwords, session tokens, signature credentials, document contents, or unnecessary PHI/PII.

## Backups
Database and object storage require encrypted backups, retention policy, restore testing, and documented recovery objectives.

## Threat model priorities
- cross-tenant data access
- privilege escalation
- forged/abused signatures
- audit-trail tampering
- unauthorized file access
- malicious uploads
- session theft
- mass export
- insider abuse
- AI prompt injection/data exfiltration

## AI security
Retrieved content must be treated as untrusted input. AI output is non-authoritative and cannot invoke privileged regulated mutations without an explicit human-controlled workflow.
