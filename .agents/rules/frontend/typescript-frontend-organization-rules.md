
# TS organization

- Exports + main symbol at top; private helpers below. Split files mixing UI + fetch + heavy logic.
- Minimal scope per commit. Exported hooks/utils: explicit return types. Constants for repeated literals.

```ts
export function useLeadFilters(): LeadFiltersResult { ... }
function normalize(s: string): string { return s.trim().toLowerCase(); }
```
