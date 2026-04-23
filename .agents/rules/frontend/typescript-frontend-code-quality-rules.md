
# TS quality

- Readable > clever. Early returns. DRY via helpers/hooks. Handlers: `handleSubmit`, `handleRowClick`.
- Immutable updates for state/derived data. No JSDoc when types suffice.

```ts
if (!user) return null;
if (!user.isActive) return <Banner />;
```
