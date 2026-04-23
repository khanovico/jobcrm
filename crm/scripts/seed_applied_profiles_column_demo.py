"""
Populate the DB with one application that has 3 PPAs; only the third is "ready"
(resume link OR substantive email). Use this to verify the Applications list
**Applied profiles** column shows a single chip.

Usage (from repo, with Mongo and env as for the CRM app):

  cd crm && python3 scripts/seed_applied_profiles_column_demo.py

Email-only third PPA (no tailored resume on that row):

  cd crm && python3 scripts/seed_applied_profiles_column_demo.py --email
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.dev_seed import seed_multi_ppa_single_ready_profile_demo
from app.repository import MongoRepository


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--email",
        action="store_true",
        help="Third PPA is ready via email draft only (no resume link on that PPA).",
    )
    args = parser.parse_args()
    ready_artifact: str = "email" if args.email else "resume"

    repo = MongoRepository()
    result = seed_multi_ppa_single_ready_profile_demo(repo, label="local-qa", ready_artifact=ready_artifact)
    print("Seeded: one application, three PPAs; only the third PPA has resume or email prep.")
    print()
    print(f"Company: {result.company_name}")
    print(f"Company ID:  {result.company_id}")
    print(f"Application ID: {result.application_id}")
    print(f"Ready artifact: {result.ready_artifact}")
    if result.email_id_if_any:
        print(f"Email ID (3rd PPA only): {result.email_id_if_any}")
    print()
    print("Expected on Applications list (Applied profiles column):")
    print(f"  • Exactly ONE chip: {result.ready_profile_name!r}")
    print("  • These profiles must NOT appear as chips: ", ", ".join(repr(n) for n in result.not_ready_profile_names))
    print()
    print("Open: /applications — find this company, expand row or check Applied profiles column.")


if __name__ == "__main__":
    main()
