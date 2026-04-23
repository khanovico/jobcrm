
# Unit tests (Jest)

- Utils, hooks, pure logic. `describe` / behavior names. Happy + failure + edge (empty, null, bad input).
- Deterministic mocks (network, storage, timers). Reset mocks between tests. Arrange–Act–Assert. Regression on bugfixes.

```ts
describe("formatLeadName", () => {
  it("fallback when empty", () => expect(formatLeadName("")).toBe("Unknown Lead"));
});
```
