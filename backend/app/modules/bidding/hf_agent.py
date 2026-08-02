"""Hugging Face & LLM Model Generator for AgenticPay AI Negotiation Agents.

Integrates Hugging Face transformers instruct model pipeline with fast background loading,
chat-template formatting, structured prompting, and post-sanitization to generate high-quality,
natural, and complete negotiation dialogue for Customer Agent and Worker Agent.
"""
import logging
import re
import threading
import time
from typing import Optional

logger = logging.getLogger(__name__)

# Lazy singleton model pipeline cache
_HF_PIPELINE = None
_HF_INIT_ATTEMPTED = False
_HF_LOCK = threading.Lock()


def _init_hf_pipeline_background():
    """Background loader for Hugging Face LLM model to avoid blocking HTTP requests."""
    global _HF_PIPELINE, _HF_INIT_ATTEMPTED
    with _HF_LOCK:
        if _HF_INIT_ATTEMPTED:
            return
        _HF_INIT_ATTEMPTED = True

    try:
        from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline
        model_id = "Qwen/Qwen2.5-0.5B-Instruct"
        tokenizer = AutoTokenizer.from_pretrained(model_id)
        model = AutoModelForCausalLM.from_pretrained(model_id)
        pipe = pipeline(
            "text-generation",
            model=model,
            tokenizer=tokenizer,
        )
        with _HF_LOCK:
            _HF_PIPELINE = pipe
        logger.info(f"Loaded Hugging Face LLM model in background: {model_id}")
    except Exception as e:
        logger.info(f"Hugging Face local LLM background load info: {e}")


def preload_hf_model():
    """Start background loading of Hugging Face LLM model."""
    t = threading.Thread(target=_init_hf_pipeline_background, daemon=True)
    t.start()


# Trigger background load
preload_hf_model()


def _get_hf_pipeline():
    with _HF_LOCK:
        return _HF_PIPELINE


class HFAgenticGenerator:
    """LLM-driven Agentic dialogue generator for marketplace price bargaining."""

    def __init__(self, job_category: str = "service", job_description: str = ""):
        self.job_category = job_category.strip() or "domestic service"
        self.job_description = job_description.strip() or "requested service"

    def _clean_llm_output(self, raw_text: str, role: str, offer: float) -> str:
        """Sanitize LLM output: strip prefixes, remove strange artifacts, and ensure completion."""
        if not raw_text:
            return ""
        
        # Take first complete line
        text = raw_text.strip().split("\n")[0].strip()
        # Strip artificial role prefixes & repetitive lead phrases
        text = re.sub(r'^(Customer|Worker|Assistant|User|Customer Agent|Worker Agent):\s*', '', text, flags=re.I)
        text = re.sub(r'^(Sure thing!|Certainly!|Dear\s+\[?[^\]]+\]?,?\s*)', '', text, flags=re.I).strip()
        
        # Filter out non-English / hallucinated junk tokens if present
        text = re.sub(r'[\u0080-\uFFFF]', '', text)
        text = re.sub(r'::\s*\d+\s*\w*', '', text)
        text = re.sub(r'\b(Gree|Thôngical|anyachts|pointsye)\b.*', '', text, flags=re.I)

        text = text.strip()

        # Fix truncated sentence ends
        if text and not text.endswith(('.', '!', '?')):
            words = text.split()
            if len(words) > 3:
                if len(words[-1]) < 3 or not words[-1].isalpha():
                    words.pop()
                text = ' '.join(words) + '.'
            else:
                text = text + '.'

        # Ensure exact PKR price figure is clearly present
        pkr_str = f"PKR {offer:,.0f}"
        if pkr_str not in text and f"{offer:.0f}" not in text:
            text = text.rstrip('.!') + f" for {pkr_str}."

        return text

    def generate_customer_message(
        self,
        round_no: int,
        offer: float,
        target: float,
        max_budget: float,
        prev_worker_offer: Optional[float] = None,
    ) -> str:
        """Customer Agent LLM generation."""
        cat = self.job_category
        pkr_str = f"PKR {offer:,.0f}"

        pipe = _get_hf_pipeline()
        if pipe:
            try:
                tokenizer = pipe.tokenizer
                sys_prompt = (
                    "You are an AI negotiation agent representing a customer on Sahulat app in Pakistan. "
                    "Generate ONE natural, polite, 1-sentence chat message offering a price in PKR. "
                    "Always mention the exact PKR offer amount."
                )

                if round_no == 0:
                    user_prompt = f"Job: {cat}. Offer: {pkr_str}. State that your starting budget for {cat} is {pkr_str}."
                elif prev_worker_offer and abs(prev_worker_offer - offer) <= 350:
                    user_prompt = f"Job: {cat}. Offer: {pkr_str}. The price is very close. State that you agree to {pkr_str}."
                else:
                    user_prompt = f"Job: {cat}. Offer: {pkr_str}. Counter with {pkr_str} for the {cat} work."

                msgs = [
                    {"role": "system", "content": sys_prompt},
                    {"role": "user", "content": "Job: electrician. Offer: PKR 1,500. State starting budget."},
                    {"role": "assistant", "content": "Hello! I am looking for a reliable electrician. My starting budget is PKR 1,500 — can you assist?"},
                    {"role": "user", "content": user_prompt},
                ]

                prompt = tokenizer.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
                out = pipe(
                    prompt,
                    max_new_tokens=40,
                    do_sample=True,
                    temperature=0.5,
                    repetition_penalty=1.15,
                )
                raw = out[0]["generated_text"][len(prompt):].strip()
                cleaned = self._clean_llm_output(raw, "Customer Agent", offer)
                if cleaned and len(cleaned) > 10:
                    return cleaned
            except Exception as e:
                logger.warning(f"LLM Customer generation exception: {e}")

        # High-quality natural language generator if LLM is loading or warming up
        if round_no == 0:
            return f"Hello! I am looking for a reliable {cat} worker. My starting budget is {pkr_str} — can you help?"
        elif prev_worker_offer and abs(prev_worker_offer - offer) <= 350:
            return f"We are very close! I can go up to {pkr_str}. Let's lock this deal and proceed."
        else:
            return f"I can increase my offer to {pkr_str} for this {cat} job. Does that work for you?"

    def generate_worker_message(
        self,
        round_no: int,
        offer: float,
        rate_min: float,
        rate_target: float,
        prev_hirer_offer: Optional[float] = None,
    ) -> str:
        """Worker Agent LLM generation."""
        cat = self.job_category
        pkr_str = f"PKR {offer:,.0f}"

        pipe = _get_hf_pipeline()
        if pipe:
            try:
                tokenizer = pipe.tokenizer
                sys_prompt = (
                    "You are an AI negotiation agent representing a skilled worker on Sahulat app in Pakistan. "
                    "Generate ONE natural, polite, 1-sentence chat message quoting a price in PKR. "
                    "Always mention the exact PKR offer amount."
                )

                if round_no == 0:
                    user_prompt = f"Job: {cat}. Quote: {pkr_str}. State your standard rate quote of {pkr_str}."
                elif prev_hirer_offer and abs(offer - prev_hirer_offer) <= 350:
                    user_prompt = f"Job: {cat}. Quote: {pkr_str}. Agree to the deal at {pkr_str}."
                else:
                    user_prompt = f"Job: {cat}. Quote: {pkr_str}. Offer a discounted price quote of {pkr_str}."

                msgs = [
                    {"role": "system", "content": sys_prompt},
                    {"role": "user", "content": "Job: electrician. Quote: PKR 2,200. State standard rate."},
                    {"role": "assistant", "content": "Hi! For quality electrician work, my standard quote is PKR 2,200 including labor."},
                    {"role": "user", "content": user_prompt},
                ]

                prompt = tokenizer.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
                out = pipe(
                    prompt,
                    max_new_tokens=40,
                    do_sample=True,
                    temperature=0.5,
                    repetition_penalty=1.15,
                )
                raw = out[0]["generated_text"][len(prompt):].strip()
                cleaned = self._clean_llm_output(raw, "Worker Agent", offer)
                if cleaned and len(cleaned) > 10:
                    return cleaned
            except Exception as e:
                logger.warning(f"LLM Worker generation exception: {e}")

        if round_no == 0:
            return f"Hi! For quality {cat} work, my standard quote is {pkr_str} including labor."
        elif prev_hirer_offer and abs(offer - prev_hirer_offer) <= 350:
            return f"Deal! {pkr_str} works for me. I'm ready to start whenever you confirm."
        else:
            return f"Considering labor and quality, I can discount my price to {pkr_str} for you."
