# Performance Fixes Log

- `2026-04-21` `ApplicationsPage`: stopped refetching the full companies list on every list-mode switch; company data is reused across pending/applied/archived/all toggles and only force-refetched on explicit refresh.
- `2026-04-21` `GET /applications`: added `company_name` directly to each list row so the applications table can render names without a second company-directory fetch.
- `2026-04-21` `companySummaries` cache: added a shared frontend cache for paged company lists and modal company options so revisiting company-driven screens can reuse recent company data instead of always hitting `/companies` again.
