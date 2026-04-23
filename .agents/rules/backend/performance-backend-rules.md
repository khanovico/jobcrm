
# Performance

- No blocking I/O in handlers if async available. Paginate/batch reads. Cache hot reads (TTL + invalidation).
- Background jobs for heavy work (email, exports). Measure before optimizing.

```python
# Bad: heavy work in GET
# Good: POST /jobs → 202 + worker
```
