from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "JobCRM API"
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_exp_minutes: int = 120
    mongo_uri: str = "mongodb://mongo:27017"
    mongo_db_name: str = "jobcrm"
    # Comma-separated browser origins allowed for CORS (Vite dev server, etc.)
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    agent_rate_limit_per_minute: int = 120
    # Dev/E2E only: use in-process data instead of Mongo (see README).
    use_memory_repository: bool = False

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
