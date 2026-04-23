
# Pydantic

- Models at API boundaries; no raw `dict`. `Field`, enums, `Literal` over `Any`. Separate create/update/read models when fields differ.
- Validate at edges (request + settings), not deep in domain. Stable model names.

```python
class CreateLead(BaseModel):
    email: EmailStr
    source: Literal["web", "referral", "ads"]
```
