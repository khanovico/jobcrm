
# Tailwind + DaisyUI

- Utilities first; DaisyUI for common patterns before custom CSS. Readable `className` order; responsive variants (`sm:` `md:`).
- Theme tokens in config — no scattered magic values.

```tsx
<button className="btn btn-primary w-full md:w-auto">Save</button>
```
