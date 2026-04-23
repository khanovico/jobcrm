
# Config

- Env / typed settings only; no secrets or env-specific constants in code. One settings module; inject everywhere.
- Defaults only for safe local dev. Fail startup if required vars missing. `.env.example` matches reality.

```python
class Settings(BaseSettings):
    database_url: str
    redis_url: str | None = None
```
