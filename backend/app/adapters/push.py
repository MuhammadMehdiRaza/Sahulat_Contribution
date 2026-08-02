import logging
from typing import Dict, Any, Optional, Protocol
import httpx
from ..core.config import settings

logger = logging.getLogger(__name__)

class PushProvider(Protocol):
    def send(self, token: str, title: str, body: str, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        ...

class MockPushProvider:
    def send(self, token: str, title: str, body: str, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        masked = f"{token[:4]}...{token[-4:]}" if len(token) > 8 else "***"
        logger.info(f"Mock push sent to {masked}: {title}")
        return {"provider": "mock", "sent": True, "token": token, "status": "ok"}

class ExpoPushProvider:
    def __init__(self):
        self.url = "https://exp.host/--/api/v2/push/send"

    def send(self, token: str, title: str, body: str, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        payload = {
            "to": token,
            "title": title,
            "body": body,
            "data": data or {}
        }
        
        try:
            response = httpx.post(self.url, json=payload, timeout=10.0)
            response.raise_for_status()
            result = response.json()
            
            # Expo push API always returns a "data" object containing the receipt array
            # We are sending a single notification, so we check the first item.
            receipts = result.get("data", [])
            masked = f"{token[:4]}...{token[-4:]}" if len(token) > 8 else "***"
            if receipts:
                receipt = receipts[0]
                status = receipt.get("status")
                if status == "error":
                    error_detail = receipt.get("details", {}).get("error")
                    logger.warning(f"Expo push error for {masked}: {error_detail}")
                    return {"provider": "expo", "sent": False, "token": token, "status": "error", "error": error_detail}
                
            return {"provider": "expo", "sent": True, "token": token, "status": "ok"}
            
        except httpx.RequestError as e:
            masked = f"{token[:4]}...{token[-4:]}" if len(token) > 8 else "***"
            logger.error(f"Network error sending Expo push to {masked}: {e}")
            return {"provider": "expo", "sent": False, "token": token, "status": "network_error"}
        except httpx.HTTPStatusError as e:
            masked = f"{token[:4]}...{token[-4:]}" if len(token) > 8 else "***"
            logger.error(f"HTTP error sending Expo push to {masked}: {e.response.status_code}")
            return {"provider": "expo", "sent": False, "token": token, "status": "http_error"}
        except Exception as e:
            masked = f"{token[:4]}...{token[-4:]}" if len(token) > 8 else "***"
            logger.error(f"Failed to send Expo push to {masked}: {e}")
            return {"provider": "expo", "sent": False, "token": token, "status": "unknown_error"}

def get_push_provider() -> PushProvider:
    if getattr(settings, "push_provider", "mock").lower() == "expo":
        return ExpoPushProvider()
    return MockPushProvider()
