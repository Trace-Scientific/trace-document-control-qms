# Electronic Signature Architecture

## Principle
An electronic signature is a security-sensitive, auditable event. It is not a pasted image of a handwritten signature.

## Signature record
Each signature should bind:
- signature ID
- organization
- signer user ID
- signer authentication event
- signed action/meaning
- entity type and entity ID
- exact entity/version identifier
- timestamp
- reason/meaning text where configured
- cryptographic evidence/hash of the signed payload
- signature status
- correlation/workflow ID

## Signing sequence
1. Authorized workflow creates signature request.
2. Application displays the exact object/version and signature meaning.
3. User re-authenticates as required by policy.
4. Application records authenticated signer and timestamp.
5. System computes/records a canonical payload hash.
6. Signature event is committed transactionally with the workflow transition.
7. Immutable audit event is created.

## Signature invalidation
A signed object/version cannot be silently modified. Any material change creates a new version and a new signature requirement.

## Authentication
The implementation should support configurable re-authentication/MFA requirements for high-risk signatures.

## Verification
A verifier can see signer identity, meaning, timestamp, signed version, and signature validity/integrity status.

## Regulatory posture
The architecture is designed to support controlled electronic signatures but does not by itself establish compliance with any particular regulation or accreditation program. Requirements must be mapped and validated for the deployed system.
