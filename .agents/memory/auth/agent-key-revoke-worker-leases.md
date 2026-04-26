# Agent Key Revoke And Worker Leases

## Lesson
- API key revocation must also resolve worker leases tied to that key, or revoked keys can strand worker capacity.

## Why
- Worker slot checks count active leases by worker type, not key validity.
- Agent release endpoints require valid API key auth and matching `agent_key_id`, so a revoked key can no longer release its own leases.
- Result: queues can hit permanent `409 No worker slots available` until admins manually release leases.

## Review Rule
- For any credential revoke flow, verify dependent runtime resources are cleaned up or reassigned (leases, sessions, locks, tokens).
- Add regression coverage: revoke key with active lease, then verify capacity is available for a new key.
