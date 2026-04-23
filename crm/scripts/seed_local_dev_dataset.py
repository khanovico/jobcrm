from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.dev_seed import seed_local_dev_dataset
from app.repository import MongoRepository


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed broad local-development dummy data into MongoDB.")
    parser.add_argument("--label", default="local-dev", help="Label prefix for seeded entities.")
    parser.add_argument(
        "--user-email",
        default="local-dev-admin@example.com",
        help="Loginable admin email to create/reuse for local development.",
    )
    parser.add_argument(
        "--user-password",
        default="local-dev-pass123",
        help="Password used if the local-dev admin user is created.",
    )
    args = parser.parse_args()

    repo = MongoRepository()
    result = seed_local_dev_dataset(
        repo,
        label=args.label,
        user_email=args.user_email,
        user_password=args.user_password,
    )

    print("Local dev dataset created successfully.")
    print(f"Companies seeded: {len(result.company_ids)}")
    print(f"Profiles seeded: {len(result.profile_ids)} (frozen: {len(result.frozen_profile_ids)})")
    print(f"Applications seeded: {len(result.application_ids)}")
    print(f"PPAs seeded: {len(result.per_profile_application_ids)}")
    print(f"Emails seeded: {len(result.email_ids)}")
    print(f"Notifications seeded: {len(result.notification_ids)}")
    print("Application status counts:")
    for status, count in result.application_status_counts.items():
        print(f"  - {status}: {count}")
    print("Email lifecycle counts:")
    for status, count in result.email_lifecycle_counts.items():
        print(f"  - {status}: {count}")
    if result.user_created:
        print(f"Login email: {result.user_email}")
        print(f"Login password: {result.user_password}")
    else:
        print(f"Login email reused: {result.user_email}")
        print("Login password unchanged (existing user).")
    print(f"Open highlighted company: /companies/{result.highlight_company_id}")
    print(f"Open highlighted application: /applications/{result.highlight_application_id}")
    print("Open applications list: /applications")
    print("Open notifications: /notifications")


if __name__ == "__main__":
    main()
