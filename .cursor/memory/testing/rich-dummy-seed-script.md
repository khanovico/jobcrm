# Rich Dummy Seed Script

## Problem
- Manual UI testing of application detail needed complete linked data (company, job post link, multiple PPAs, tailored resumes, and multiple emails).

## Fix
- Added backend seeding utility `crm/app/dev_seed.py` with `seed_rich_dummy_application(repo, label=...)`.
- Added runnable script `crm/scripts/seed_rich_dummy_application.py` to seed Mongo-backed local dev data in one command.
- Script output includes created IDs and direct app routes for quick navigation.

## Why
- Prevents repetitive manual data entry and guarantees realistic coverage for application-detail UI checks.

## When to reuse
- Before UI changes affecting application/company detail pages, run:
  - `cd crm && python3 scripts/seed_rich_dummy_application.py`
