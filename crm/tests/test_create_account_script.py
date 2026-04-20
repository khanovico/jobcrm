import pytest

from app.models import UserRole
from app.repository import InMemoryRepository
from scripts.create_account import create_account


def test_create_account_creates_admin_user() -> None:
    repo = InMemoryRepository()
    create_account(
        repo,
        username="owner@example.com",
        password="secret1234",
        role=UserRole.admin,
    )
    created = repo.get_user_by_email("owner@example.com")
    assert created is not None
    assert created.role == UserRole.admin
    assert created.admin is True


def test_create_account_rejects_duplicate_username() -> None:
    repo = InMemoryRepository()
    create_account(
        repo,
        username="duplicate@example.com",
        password="secret1234",
        role=UserRole.user,
    )
    with pytest.raises(ValueError, match="Email already exists"):
        create_account(
            repo,
            username="duplicate@example.com",
            password="secret1234",
            role=UserRole.user,
        )
