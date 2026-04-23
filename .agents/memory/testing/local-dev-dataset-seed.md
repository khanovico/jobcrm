# Local Dev Dataset Seed

## Problem

- The repo had focused seed helpers for one rich application-detail row and one applied-profiles-table demo.
- Local QA still lacked one command to populate enough breadth for dashboard, applications list modes, company states, notifications, archived/invalid rows, frozen profiles, and mixed email states.

## Fix

- Added broad seed helper `crm/app/dev_seed.py::seed_local_dev_dataset(...)`.
- Added runnable script `crm/scripts/seed_local_dev_dataset.py`.
- Kept existing focused seed helpers intact for narrow QA flows.
- Added tests covering application status matrix, email lifecycle matrix, notification coverage, archived company/application state, and frozen profile presence.

## Why

- Faster local QA across most product surfaces without repetitive manual entry.
- Better guardrails for future dummy-data changes because the broad dataset now has automated coverage.

## When to reuse

- Before local UI/API QA across multiple surfaces, run:
  - `cd crm && python3 scripts/seed_local_dev_dataset.py`
- For narrower application-detail QA, keep using:
  - `cd crm && python3 scripts/seed_rich_dummy_application.py`
