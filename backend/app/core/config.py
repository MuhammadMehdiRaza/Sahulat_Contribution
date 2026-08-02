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
    stt_provider: str = "mock"        # mock | local  (local = offline faster-whisper, BO-4 voice)
    push_provider: str = "mock"

    # Speech-to-text (voice interface, BO-4). Used only when stt_provider == "local".
    whisper_model: str = "small"         # tiny | base | small | medium | large-v3 (small = much better Urdu)
    whisper_device: str = "cpu"          # cpu | cuda
    whisper_compute_type: str = "int8"   # int8 (CPU) | float16 (GPU)
    whisper_lang_default: str = "ur"     # Urdu; Whisper still auto-handles English / Roman-Urdu
    whisper_download_root: str = ""      # empty = default HF cache; set a D: path on low C-disk machines

    # Business rules
    platform_fee_pct: float = 0.10
    match_default_radius_km: float = 15.0
    match_max_radius_km: float = 100.0   # allow searching further out for far-away workers
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
