
# Logging

- Structured logs: request_id, user_id, endpoint, duration_ms, etc. Right level; no duplicate noise.
- Failures: actionable context → re-raise or map to API-safe errors. Never log secrets/PII.
- Metrics: latency, errors, throughput on hot paths. Correlation IDs in logs + error responses when possible.

```python
logger.error("x_failed", extra={"request_id": rid})
```
