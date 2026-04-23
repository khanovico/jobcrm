
# Routing

- Routers per domain (`/leads`, not verbs-only). Resource paths; explicit `response_model` + `status_code`.
- One job per route. Dependencies for auth/tenant/RBAC. Pagination/filters instead of unbounded lists.

```python
router = APIRouter(prefix="/leads", tags=["leads"])
@router.get("", response_model=LeadListOut)
async def list_leads(q: LeadQuery = Depends(), svc: LeadService = Depends(get_svc)): ...
```
