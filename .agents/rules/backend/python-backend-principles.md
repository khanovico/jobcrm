
# Python style

- Typed public APIs; small pure helpers; explicit deps. Split when routing + logic + data mix.
- `snake_case` names (`is_active`, `order_repo`). No hidden side effects.

```python
def process(u): ...  # bad
def process_user_signup(p: UserIn) -> SignupResult: ...  # good
```
