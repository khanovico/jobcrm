
# Errors

- Domain exceptions in services → HTTP at boundary. Log + translate; never silent swallow.
- Consistent `{code,message,details}` (or project standard). No stacks/SQL/secrets to clients.
- Explicit handling: validation, 404, 409, 403, upstream timeout.

```python
except LeadNotFoundError as e:
    raise HTTPException(404, detail=str(e))
```
