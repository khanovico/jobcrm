# Local Dummy Data Expansion Plan

## Goal

Create a local-development seed flow that populates realistic, linked dummy data across the main JobCRM surfaces so manual QA and local smoke testing can cover most common and edge-case UI/API paths without repetitive hand entry.

## Scope

- Expand backend dev seeding beyond the current single rich application and single list-column demo.
- Seed enough variety to exercise:
  - dashboard counts
  - applications list modes and sorting
  - application detail states
  - company detail states
  - profile list/filter behavior
  - notification inbox behavior
  - archived / invalid / pending / ready flows
  - per-profile application and email combinations
- Keep local-dev focus. No production fixture system. No speculative admin/demo tooling beyond one clear local entrypoint.

## Current Baseline

- `crm/app/dev_seed.py`
  - `seed_rich_dummy_application(...)`
  - `seed_multi_ppa_single_ready_profile_demo(...)`
- `crm/scripts/seed_rich_dummy_application.py`
- `crm/scripts/seed_applied_profiles_column_demo.py`
- `crm/tests/test_dev_seed.py`

Current coverage good for one rich detail page and one applied-profiles table case. Missing broad dataset for list filters, dashboard metrics, notifications, company states, frozen profiles, archived rows, invalid rows, and mixed email/plan combinations.

## Required Dataset Matrix

### Companies

Seed at least these company variants:

1. `pending` research company with minimal fields
2. `indexing` research company with partial enrichment
3. `indexed` company with full enrichment and links
4. `invalid` company with reason-like notes in overview/details
5. archived company with archived applications

### Profiles

Seed at least these profile variants:

1. active profile with full resume/bio
2. active profile with different geography/timezone
3. frozen profile to verify include/exclude behavior
4. profile reused across multiple applications

### Applications

Seed at least one application in each meaningful status:

1. `company_research_pending`
2. `company_researching`
3. `ppa_pending`
4. `ppa_analyzing`
5. `application_pending`
6. `application_drafting`
7. `application_ready` and not yet applied
8. `application_ready` and applied
9. `invalid`
10. `archived`

Also ensure mix of:

- with and without `job_post`
- with and without `notes`
- recent vs older `updated_at` ordering
- mixed `created_by_user_id` support left untouched unless current seed path already needs user ownership

### Per-Profile Applications

Cover these combinations:

1. analysis only
2. tailored resume only
3. cold email plan only
4. substantive drafted email only
5. sent cold email + drafted follow-up
6. multiple PPAs on one application with different `order_index`
7. fit scores high / medium / low
8. selected recipient with and without email/timezone

### Emails

Cover these lifecycle states:

1. `drafted`
2. `sent`
3. `received`
4. `timed_out`
5. `failed`

Also mix:

- `cold`
- `follow_up`
- HTML content suitable for detail rendering
- `sent_at` set only when appropriate

### Notifications

Seed enough user notifications to verify:

1. unread count on dashboard
2. read vs unread rows
3. `APPLICATION_UPDATE`
4. `COMPANY_UPDATE`
5. `FOLLOW_UP_DRAFT`
6. `SYSTEM_ERROR`
7. links to application/company routes where applicable

### Dashboard / List Behaviors

Dataset should make these screens obviously testable:

1. pending applications tab non-empty
2. applied applications tab non-empty
3. archived applications tab non-empty
4. company search returns subset
5. applied-profile filter has multiple names
6. dashboard metrics show non-zero values in multiple cards
7. company detail shows paginated/varied application rows
8. notifications page has enough rows for selection actions

## Implementation Approach

### 1. Reshape seed code into scenario helpers

Refactor `crm/app/dev_seed.py` into small internal builders:

- company factory
- profile factory
- application factory
- PPA factory
- email factory
- notification factory

Keep current public helpers working. Add one new higher-level helper, likely:

- `seed_local_dev_dataset(repo, *, label="local-dev")`

Return a structured result object with created ids grouped by entity type plus a few highlighted routes.

### 2. Build deterministic scenario catalog

Create named scenarios instead of random ad-hoc rows:

1. rich ready application
2. research-pipeline application
3. PPA-analysis application
4. drafting application
5. applied application with sent outreach
6. invalid company/application pair
7. archived company/application pair
8. multi-PPA list-filter scenario
9. frozen-profile presence scenario
10. notification-heavy scenario

Reason: easier local QA, easier tests, easier future extension.

### 3. Add single local entry script

Add script, likely:

- `crm/scripts/seed_local_dev_dataset.py`

Behavior:

- use `MongoRepository`
- run new seed helper once
- print summary counts
- print a few direct routes:
  - one company detail route
  - one application detail route
  - applications list
  - notifications page

Keep existing narrower scripts for focused QA.

### 4. Test coverage

Expand `crm/tests/test_dev_seed.py` to verify:

1. scenario counts by entity
2. every target application status exists
3. every target email lifecycle status exists
4. archived and invalid entities created
5. at least one frozen profile exists
6. dashboard-relevant counts derivable from seeded applications
7. notifications seeded with expected kinds and unread/read mix
8. existing narrow helper tests still pass

Prefer `InMemoryRepository` for seed tests.

### 5. Docs and memory updates

Update:

- `.agents/docs/PROJECT_STRUCTURE.md` if new script/helper names change structure
- `.agents/memory/testing/rich-dummy-seed-script.md` or add new memory note if the broader dataset becomes the new default local QA path

## Files Expected To Change

- `crm/app/dev_seed.py`
- `crm/scripts/seed_local_dev_dataset.py` (new)
- `crm/tests/test_dev_seed.py`
- `.agents/docs/PROJECT_STRUCTURE.md`
- `.agents/memory/testing/...` if reusable lesson worth recording

## TODO Checklist

- [x] design scenario catalog and result object
- [x] refactor `dev_seed.py` into reusable builders without breaking current helpers
- [x] add broad local dataset helper
- [x] add runnable local seed script
- [x] add/expand automated tests for seeded status/entity coverage
- [x] update docs/memory if seed entrypoint changes
- [x] run targeted backend tests

## Verification

Minimum:

1. `source crm/.venv/bin/activate && cd crm && pytest tests/test_dev_seed.py`

Nice-to-have if changes touch broader backend behavior:

1. `source crm/.venv/bin/activate && cd crm && pytest tests/test_api.py -k seed`

No frontend build required unless this task expands into UI changes.

## Parallel-Safe Work

Possible parallel split if implementation grows:

- worker A: seed helper/data model refactor in `crm/app/dev_seed.py`
- worker B: tests in `crm/tests/test_dev_seed.py`
- main agent: script wiring, integration, docs

Only safe after scenario contract/result shape is fixed.

## Dependencies / Risks

1. `InMemoryRepository` and `MongoRepository` must both accept seeded payloads exactly as built.
2. Overly huge seed set could make local runs noisy; keep dataset intentionally rich but bounded.
3. Timestamp/order interactions matter for list sorting and dashboard impressions; scenario helpers should control ordering deliberately.
4. Existing focused scripts/tests must remain intact; broad seed should reuse, not silently replace, narrow QA helpers.

## Assumptions

1. One-command local seeding matters more than fixture configurability.
2. We want breadth of realistic states, not thousands of rows.
3. We should preserve existing focused seed flows for targeted manual QA while adding one broader default dataset.
