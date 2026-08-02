// Shared types for the voice interface (BO-4). No runtime code, so both the web and native
// STT engines import from here without pulling in each other's platform dependencies.
import type { Lang } from '../i18n';

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export type SpeechCallbacks = {
  onPartial?: (text: string) => void;   // live (interim) transcript — web only
  onResult: (text: string) => void;     // final transcript
  onError: (code: string) => void;       // 'permission' | 'unsupported' | 'empty' | ...
};

export type SpeechInput = {
  recording: boolean;
  supported: boolean;
  start: (lang: Lang, cbs: SpeechCallbacks) => Promise<void> | void;
  stop: () => void;
};

export type VoiceAction = 'navigate' | 'search' | 'post_job' | 'set_language' | 'go_back' | 'speak_only' | 'none';

export type InterpretResponse = {
  intent: string;
  action: VoiceAction;
  route?: string | null;
  params?: Record<string, any>;
  reply: string;
  reply_lang: string;
  tts_text: string;
  tts_lang: string;
  confidence: number;
};
