"""Application settings — 12-factor, all overridable via environment variables."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Core
    app_env: str = "development"
    secret_key: str = "dev-secret-change-me-please-set-a-strong-32byte-key"
    access_token_ttl_min: int = 60

    # Data stores
    database_url: str = "sqlite:///./sahulat.db"
    redis_url: str = "redis://localhost:6379/0"
    use_redis: bool = False  # matching falls back to in-process haversine when False

    # Auth / OTP
    otp_ttl_seconds: int = 180
    otp_provider: str = "mock"        # mock | sms | whatsapp
    expose_debug_otp: bool = True     # dev only: return OTP in the request response

    # External providers (mock by default)
    nadra_provider: str = "mock"
    payment_provider: str = "mock"
    stt_provider: str = "mock"
    push_provider: str = "mock"

    # Business rules
    platform_fee_pct: float = 0.10
    match_default_radius_km: float = 10.0
    match_max_radius_km: float = 15.0
    emergency_radius_km: float = 5.0
    biometric_threshold: float = 0.75

    # Bidding engine
    bid_max_rounds: int = 5
    bid_converge_pkr: float = 500.0
    bid_kappa_hirer: float = 1 / 1.5   # Conceder: concedes early
    bid_kappa_worker: float = 1 / 0.8  # Boulware: holds firm

    # Logging
    log_level: str = "INFO"
    log_json: bool = True


settings = Settings()
