# Milestone 1 Bootstrap Lessons

## Context
Bootstrapping JobCRM Milestone 1 from an almost-empty repository.

## Reusable Decisions
- Keep a repository abstraction with `InMemoryRepository` plus `MongoRepository` so core business tests can run without Mongo dependency coupling.
- Put workflow-critical logic (status transition + applied stamping) in backend models/repository layer, not frontend.
- Build frontend CRUD pages around a shared API client and auth context early to avoid repeated token plumbing.

## Environment Pitfall
- If package installs are blocked by proxy/network, continue implementation with deterministic file scaffolding and document exact blocked commands.
- Prefer no-network verifications (syntax checks, static structure checks, lints) while waiting for package access.

## Reuse Trigger
Use this approach for future milestone scaffolding or when building new domains requiring both API and UI in one pass.
