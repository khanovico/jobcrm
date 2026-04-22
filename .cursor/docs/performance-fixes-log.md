# Performance Fixes Log

- `2026-04-21` `ApplicationsPage`: stopped refetching the full companies list on every list-mode switch; company data is reused across pending/applied/archived/all toggles and only force-refetched on explicit refresh.
- `2026-04-21` `GET /applications`: added `company_name` directly to each list row so the applications table can render names without a second company-directory fetch.
- `2026-04-21` `companySummaries` cache: added a shared frontend cache for paged company lists and modal company options so revisiting company-driven screens can reuse recent company data instead of always hitting `/companies` again.
- `2026-04-21` `GET /applications/{id}/detail`: added a purpose-built detail payload that batches application, company, per-profile rows, resolved profile names, and nested emails into one read for the detail screen.
- `2026-04-21` `ApplicationDetailPage`: replaced full-page reload loops after mark/delete actions with targeted local state updates, and memoized email HTML sanitization so repeated renders do less work.
- `2026-04-21` `industryCatalog` cache: added a shared full-taxonomy industry cache so company detail no longer refetches a huge industry list on every visit; industries page now invalidates it on create/update/delete.
- `2026-04-21` `CompanyDetailPage`: paginated per-company applications and split static company/industry loading from application-page loading so the page handles larger company histories more predictably.
