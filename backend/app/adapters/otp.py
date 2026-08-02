import logging
import httpx
from typing import Dict, Protocol
from ..core.config import settings

logger = logging.getLogger(__name__)

class OtpProvider(Protocol):
    def send(self, phone: str, code: str, channel: str = "sms") -> Dict:
        ...

# Single mock state for testing backward compatibility
_sent_otps: Dict[str, str] = {}

class MockOtpProvider:
    def send(self, phone: str, code: str, channel: str = "sms") -> Dict:
        _sent_otps[phone] = code
        # Mask phone number for logging
        masked_phone = phone[:5] + "***" + phone[-3:] if len(phone) >= 8 else "***"
        logger.info(f"Mock OTP sent to {masked_phone} via {channel}")
        return {"provider": "mock", "channel": channel, "sent": True}

class SendPkOtpProvider:
    def __init__(self):
        self.api_key = settings.sendpk_api_key
        self.sender = settings.sendpk_sender
        self.base_url = settings.sendpk_base_url

    def send(self, phone: str, code: str, channel: str = "sms") -> Dict:
        # Mask phone for logging (e.g., +92300***567)
        masked_phone = phone[:5] + "***" + phone[-3:] if len(phone) >= 8 else "***"
        
        try:
            params = {
                "api_key": self.api_key,
                "sender": self.sender,
                "mobile": phone,
                "message": f"Your Sahulat OTP is {code}. Valid for 3 minutes."
            }
            
            response = httpx.get(self.base_url, params=params, timeout=10.0)
            response.raise_for_status()
            
            # SendPK returns "OK ID:XXXXX" on success, or plain text error codes
            resp_text = response.text.strip()
            if not resp_text.startswith("OK"):
                logger.error(f"SendPK API Error: {resp_text}")
                from fastapi import HTTPException
                if "8 :" in resp_text or "Insufficient Credit" in resp_text:
                    raise HTTPException(500, detail="SendPK Error: Insufficient SMS Balance (Please Top up)")
                raise HTTPException(500, detail=f"SendPK Error: {resp_text}")
                
            logger.info(f"SendPK OTP sent successfully to {masked_phone} via {channel}. Response: {resp_text}")
            return {"provider": "sendpk", "channel": channel, "sent": True, "response": resp_text}
            
        except httpx.RequestError as e:
            logger.error(f"Network error sending SendPK OTP to {masked_phone}. Error: {type(e).__name__}")
            from fastapi import HTTPException
            raise HTTPException(500, detail="Failed to deliver OTP SMS (Network Error).") from None
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error sending SendPK OTP to {masked_phone}. Status: {e.response.status_code}")
            from fastapi import HTTPException
            raise HTTPException(500, detail="Failed to deliver OTP SMS (Provider Error).") from None
        except Exception as e:
            # Re-raise HTTPException if it's already one
            from fastapi import HTTPException
            if isinstance(e, HTTPException):
                raise e
            logger.error(f"Failed to send SendPK OTP to {masked_phone}. Error: {type(e).__name__}")
            raise HTTPException(500, detail="Failed to deliver OTP SMS.") from None

def get_otp_provider() -> OtpProvider:
    provider_name = settings.otp_provider.lower()
    if provider_name == "sendpk":
        return SendPkOtpProvider()
    return MockOtpProvider()
