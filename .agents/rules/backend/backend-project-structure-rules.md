
# Structure

- Separate routers, services, schemas, repositories. No fat route handlers.
- Group by domain. Tiny shared utils only. Tests under `tests/` by domain. Split files that mix concerns.

```
routers/leads.py  → HTTP
services/leads.py → logic
repositories/leads.py → persistence
```
