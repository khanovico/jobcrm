from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pymongo.errors import PyMongoError

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.auth import hash_password
from app.models import UserCreate, UserRole
from app.repository import BaseRepository, MongoRepository


def _default_name_from_username(username: str) -> str:
    local_part = username.split("@", 1)[0]
    cleaned = local_part.replace(".", " ").replace("_", " ").strip()
    if not cleaned:
        return "User"
    return " ".join(piece.capitalize() for piece in cleaned.split())


def create_account(
    repo: BaseRepository,
    *,
    username: str,
    password: str,
    role: UserRole,
    name: str | None = None,
) -> None:
    payload = UserCreate(
        name=name or _default_name_from_username(username),
        email=username,
        password=password,
        role=role,
    )
    repo.create_user(payload, hash_password(password))


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Create a JobCRM user account directly in DB.")
    parser.add_argument("--username", required=True, help="Login username (email).")
    parser.add_argument("--password", required=True, help="Account password (minimum 8 characters).")
    parser.add_argument(
        "--role",
        required=True,
        choices=[UserRole.admin.value, UserRole.user.value],
        help="Account role.",
    )
    parser.add_argument("--name", default=None, help="Optional display name.")
    return parser


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()
    try:
        create_account(
            MongoRepository(),
            username=args.username,
            password=args.password,
            role=UserRole(args.role),
            name=args.name,
        )
    except ValueError as exc:
        print(f"Failed to create account: {exc}")
        return 1
    except PyMongoError as exc:
        print(f"Failed to connect to MongoDB: {exc}")
        return 1

    print("Account created successfully.")
    print(f"username={args.username}")
    print(f"role={args.role}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
