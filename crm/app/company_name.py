"""Normalized company name comparison for duplicate detection."""


def normalize_company_name(name: str) -> str:
    """Lowercase, strip, collapse internal whitespace (Unicode casefold)."""
    return " ".join(name.strip().casefold().split())
