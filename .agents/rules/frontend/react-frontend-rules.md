
# React

- Small single-purpose components; typed props. Composition over prop drilling.
- Local state by default; lift when needed. Shared UI logic → custom hooks. Presentational vs data split.

```tsx
type BtnProps = { loading: boolean; onClick: () => void };
```
