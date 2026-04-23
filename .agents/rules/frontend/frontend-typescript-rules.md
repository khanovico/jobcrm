
# TS (frontend)

- Strict props/hook returns. `interface` for objects, `type` for unions. No `any` — `unknown` + narrow.
- Discriminated unions for multi-mode UI. Colocate feature types.

```ts
type FetchState<T> =
  | { status: "idle" } | { status: "loading" }
  | { status: "error"; message: string } | { status: "success"; data: T };
```
