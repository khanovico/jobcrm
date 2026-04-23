from pathlib import Path

from app.config import ENV_FILE, Settings


def test_settings_env_file_uses_absolute_crm_path() -> None:
    env_file = Path(Settings.model_config["env_file"])
    assert env_file.is_absolute()
    assert env_file == ENV_FILE
    assert env_file.name == ".env"
    assert env_file.parent.name == "crm"
