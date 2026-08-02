# Starts the Sahulat backend with REAL offline voice (faster-whisper) — for the mobile app.
# Usage (PowerShell):   cd C:\Users\Pc\Sahulat\backend ;  .\run_voice.ps1
# If PowerShell blocks scripts:   powershell -ExecutionPolicy Bypass -File .\run_voice.ps1

Set-Location $PSScriptRoot   # always run from the backend folder (where this file lives)

# Turn ON real on-device Whisper (instead of the fixed demo sentence):
$env:STT_PROVIDER          = "local"
$env:WHISPER_MODEL         = "small"
$env:WHISPER_DOWNLOAD_ROOT = "D:/sahulat_models/whisper"   # model cache (auto-downloads here if missing)

# Find a Python that has faster-whisper. Prefer a local .venv; fall back to the D: voice venv.
if (Test-Path ".\.venv\Scripts\python.exe") {
    $py = ".\.venv\Scripts\python.exe"
} elseif (Test-Path "D:\sahulat_venv313\Scripts\python.exe") {
    $py = "D:\sahulat_venv313\Scripts\python.exe"
} else {
    Write-Error "No Python env with Whisper found. See backend\README.md -> 'Voice setup'."
    exit 1
}

Write-Host "Using Python: $py" -ForegroundColor Cyan
Write-Host "Starting Sahulat API with LOCAL voice on http://0.0.0.0:8000 ..." -ForegroundColor Green
Write-Host "First voice command takes ~5-10s (loads the model once), then it's fast." -ForegroundColor DarkGray
& $py -m uvicorn app.main:app --host 0.0.0.0 --port 8000
