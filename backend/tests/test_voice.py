"""Tests for the voice interface (BO-4): Urdu-aware intent parsing, role-aware routing,
the /voice endpoints, and the local-Whisper adapter glue.

The whole suite runs on STT_PROVIDER=mock (conftest never sets it), so no faster-whisper
install or model download is required. The local path is exercised via a monkeypatched model.
"""
import base64

from app.modules.jobs.router import extract_intent
from app.modules.voice import grammar


# ----------------------------------------------------------- extract_intent (now Urdu-aware)
def test_extract_intent_urdu_script_and_digits():
    r = extract_intent("مجھے نلکا ٹھیک کرانا ہے ۲۰۰۰")
    assert r["category"] == "plumber"
    assert r["budget"] == 2000.0


def test_extract_intent_urdu_city_alias():
    r = extract_intent("کراچی میں بجلی والا چاہیے")
    assert r["category"] == "electrician"
    assert r["location"] == "karachi"


def test_extract_intent_english_regression():
    r = extract_intent("I need a plumber in Lahore budget 2000")
    assert r["category"] == "plumber" and r["location"] == "lahore" and r["budget"] == 2000.0


# ----------------------------------------------------------- grammar.interpret (unit)
def test_interpret_navigation_urdu():
    r = grammar.interpret("میری بکنگ دکھاؤ", "ur", "hirer")
    assert r["intent"] == "navigate" and r["route"] == "bookings" and r["action"] == "navigate"


def test_interpret_search_roman():
    r = grammar.interpret("mujhe plumber chahiye", "roman_ur", "hirer")
    assert r["action"] == "search" and r["params"]["category"] == "plumber"


def test_interpret_post_job_with_budget():
    r = grammar.interpret("نلکے کا کام پوسٹ کرو ۲۰۰۰", "ur", "hirer")
    assert r["action"] == "post_job" and r["route"] == "postJob"
    assert r["params"].get("budget_target") == 2000.0


def test_interpret_role_aware_destinations():
    assert grammar.interpret("go home", "en", "hirer")["route"] == "home"
    assert grammar.interpret("go home", "en", "worker")["route"] == "workerDashboard"
    # "my jobs" -> hirer sees postings; worker is routed to their bookings
    assert grammar.interpret("meray kaam", "en", "hirer")["route"] == "myJobs"
    assert grammar.interpret("meray kaam", "en", "worker")["route"] == "bookings"


def test_interpret_switch_language():
    assert grammar.interpret("speak English", "ur", "hirer")["params"]["lang"] == "en"
    assert grammar.interpret("اردو میں بولو", "en", "hirer")["params"]["lang"] == "ur"
    assert grammar.interpret("roman urdu", "en", "hirer")["params"]["lang"] == "roman_ur"


def test_interpret_worker_search_denied():
    r = grammar.interpret("mujhe plumber chahiye", "roman_ur", "worker")
    assert r["intent"] == "denied" and r["route"] is None


def test_interpret_worker_post_denied():
    r = grammar.interpret("naya kaam lagao", "roman_ur", "worker")
    assert r["intent"] == "denied"


def test_interpret_unknown():
    r = grammar.interpret("asdfgh qwerty zxcv", "en", "hirer")
    assert r["intent"] == "unknown"


def test_interpret_empty_transcript():
    r = grammar.interpret("   ", "en", "hirer")
    assert r["intent"] == "unknown" and r["action"] == "speak_only"


def test_interpret_wallet_bare_word():
    assert grammar.interpret("wallet", "en", "hirer")["route"] == "wallet"


def test_interpret_help():
    r = grammar.interpret("tum kya kar sakte ho", "roman_ur", "hirer")
    assert r["intent"] == "help" and r["action"] == "speak_only"


def test_interpret_home_roman_ghar():
    # "ghar le jao" (take me home) — role-aware
    assert grammar.interpret("ghar le jao", "roman_ur", "hirer")["route"] == "home"
    assert grammar.interpret("ghar le jao", "roman_ur", "worker")["route"] == "workerDashboard"


def test_interpret_go_back():
    r = grammar.interpret("wapas jao", "roman_ur", "hirer")
    assert r["intent"] == "go_back" and r["action"] == "go_back"


def test_interpret_chat_navigation_variants():
    for phrase in ["chat pe le jao", "chat kholo", "message pe le jao"]:
        assert grammar.interpret(phrase, "roman_ur", "hirer")["route"] == "chat", phrase


# ----------------------------------------------------------- /voice endpoints (integration)
def test_voice_interpret_endpoint_en(hirer, client):
    r = client.post("/api/v1/voice/interpret", headers=hirer["headers"],
                    json={"text": "open my wallet", "lang": "en"})
    assert r.status_code == 200
    body = r.json()
    assert body["route"] == "wallet"
    assert body["reply"] and body["tts_text"]
    assert body["tts_lang"] == "en-US" and body["reply_lang"] == "en"


def test_voice_interpret_endpoint_urdu_tts(hirer, client):
    r = client.post("/api/v1/voice/interpret", headers=hirer["headers"],
                    json={"text": "میری بکنگ دکھاؤ", "lang": "ur"})
    body = r.json()
    assert body["route"] == "bookings"
    assert body["tts_lang"] == "ur-PK" and body["reply_lang"] == "ur"


def test_voice_interpret_roman_ur_speaks_urdu_script(hirer, client):
    # roman_ur is DISPLAYED in Latin but SPOKEN in Urdu script (a TTS Urdu voice needs script)
    r = client.post("/api/v1/voice/interpret", headers=hirer["headers"],
                    json={"text": "wallet kholo", "lang": "roman_ur"})
    body = r.json()
    assert body["route"] == "wallet"
    assert body["tts_lang"] == "ur-PK"
    assert any("؀" <= ch <= "ۿ" for ch in body["tts_text"])  # contains Arabic/Urdu block


def test_voice_transcribe_role_neutral_worker(worker, client):
    # a WORKER can transcribe (role-neutral) — unlike /jobs/search/nl which is hirer-only
    r = client.post("/api/v1/voice/transcribe", headers=worker["headers"],
                    json={"voice_b64": "abc", "lang": "ur"})
    assert r.status_code == 200 and r.json()["text"]  # canned mock transcript


def test_voice_transcribe_requires_auth(client):
    r = client.post("/api/v1/voice/transcribe", json={"voice_b64": "abc", "lang": "ur"})
    assert r.status_code == 401


def test_jobs_nl_search_still_hirer_only(worker, client):
    # regression: the older voice-search endpoint stays hirer-restricted
    r = client.post("/api/v1/jobs/search/nl", headers=worker["headers"], json={"query": "plumber"})
    assert r.status_code == 403


# ----------------------------------------------------------- local Whisper adapter glue (monkeypatched)
def test_transcribe_local_adapter_glue(monkeypatch):
    """Verify the faster-whisper glue (base64 -> temp file -> join lazy segments) WITHOUT
    installing the package or downloading a model, by injecting a fake cached model."""
    from app import adapters

    class _Seg:
        def __init__(self, text):
            self.text = text

    class _FakeModel:
        def transcribe(self, path, language=None, **kwargs):
            with open(path, "rb") as f:              # prove a real, readable temp file was written
                assert f.read() == b"hello-audio"
            return iter([_Seg("mujhe "), _Seg("plumber chahiye")]), {"language": language}

    monkeypatch.setattr(adapters.settings, "stt_provider", "local", raising=False)
    monkeypatch.setattr(adapters, "_whisper_model", _FakeModel(), raising=False)
    out = adapters.transcribe(base64.b64encode(b"hello-audio").decode(), "ur")
    assert out["text"] == "mujhe plumber chahiye" and out["lang"] == "ur"


def test_transcribe_local_empty_audio(monkeypatch):
    from app import adapters
    monkeypatch.setattr(adapters.settings, "stt_provider", "local", raising=False)
    assert adapters.transcribe("", "ur")["text"] == ""


def test_transcribe_mock_is_default():
    from app import adapters
    # default provider is mock -> deterministic canned transcript (what the test suite relies on)
    assert "plumber" in adapters.transcribe("abc", "ur")["text"]
