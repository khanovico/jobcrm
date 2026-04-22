# Performance Discipline

## Rule
- Treat performance as a default quality bar, not a later cleanup pass.
- For any frontend or API-facing change, review cost from multiple angles: request count, payload size, refetch frequency, client memory, render/DOM work, and first-load navigation behavior.

## Prefer
- Purpose-built list/summary endpoints over fetching full documents for table views.
- Explicit pagination or bounded search over implicit caps or full-catalog loads.
- Shared caches only when they reduce repeated reads without hiding stale-data risks.
- Lazy loading with stable shells: keep layout/sidebar mounted and show loading states in the content panel.
- UI controls that keep DOM size bounded; avoid giant `<select>`s for large entities.

## Verify
- Add targeted regression tests for new loading, pagination, or fetch behavior.
- For frontend changes, run `cd app && npm run build` and the impacted tests.
- Before shipping, ask: "Will this still feel cheap at 1k companies / 2k applications / 30+ profiles?"
