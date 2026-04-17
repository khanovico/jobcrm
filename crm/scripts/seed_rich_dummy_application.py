from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.dev_seed import seed_rich_dummy_application
from app.repository import MongoRepository


def main() -> None:
    repo = MongoRepository()
    result = seed_rich_dummy_application(repo, label="local-seed")
    print("Dummy dataset created successfully.")
    print(f"Company: {result.company_name}")
    print(f"Company ID: {result.company_id}")
    print(f"Application ID: {result.application_id}")
    print(f"Open company page: /companies/{result.company_id}")
    print(f"Open application page: /applications/{result.application_id}")
    print(f"Profiles seeded: {len(result.profile_ids)}")
    print(f"PPAs seeded: {len(result.per_profile_application_ids)}")
    print(f"Emails seeded: {len(result.email_ids)}")


if __name__ == "__main__":
    main()
