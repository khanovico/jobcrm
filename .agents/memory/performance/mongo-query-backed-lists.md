# Mongo Query-Backed Lists

When reviewing bounded list or picker work, verify the `MongoRepository` method is query-backed and not only bounded at the FastAPI or frontend layer. This repository often extends `InMemoryRepository`; if Mongo does not override a list helper, requests may still load/filter/sort full in-memory collections even when the API accepts `skip` and `limit`.

Review checklist:
- Confirm Mongo overrides call `_mongo_find_page` or collection query helpers with `skip`, `limit`, sort, and any needed collation.
- Add fake Mongo tests that assert `find_queries`, `sorts`, `skips`, `limits`, and collations for new list paths.
- Treat inherited in-memory helpers as a scale risk for UX performance batches.
