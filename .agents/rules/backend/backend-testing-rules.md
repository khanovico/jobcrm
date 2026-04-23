
# Backend tests

- `pytest` only (new code). Business logic + API contracts + error paths. Deterministic; mock external deps.
- `tests/` layout mirrors features. Names state behavior + outcome. Regression tests for bugs when practical.

```python
def test_create_returns_201_when_payload_valid() -> None: ...
```
