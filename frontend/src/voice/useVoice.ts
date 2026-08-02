// Orchestrator hook for the global Voice Assistant: listen -> transcribe -> interpret (backend)
// -> execute the action -> speak the reply. Composes the platform STT engine, the TTS helper,
// and the app's navigation handles from useApp().
import { useCallback, useState } from 'react';
import { api } from '../api';
import { useApp } from '../state';
import { executeVoiceAction } from './executor';
import { speak, stopSpeaking } from './tts';
import type { InterpretResponse, VoiceState } from './types';
import { useSpeechInput } from './useSpeechInput';

export function useVoice() {
  const { language, navigate, goBack, setLanguage, showToast, t } = useApp();
  const speech = useSpeechInput();
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');

  const messageFor = useCallback((code: string) => {
    if (code === 'permission') return t('voiceMicDenied');
    if (code === 'unsupported') return t('voiceUnsupported');
    if (code === 'demo') return t('voiceUnavailableLang');
    if (code === 'empty' || code === 'no-audio') return t('voiceNoSpeech');
    return t('voiceError');
  }, [t]);

  const handleResult = useCallback(async (text: string) => {
    setTranscript(text);
    setState('thinking');
    try {
      const res: InterpretResponse = await api.voiceInterpret({ text, lang: language });
      setReply(res.reply || '');
      setState('speaking');
      executeVoiceAction(res, { navigate, goBack, setLanguage, showToast });
      speak(res.tts_text, res.tts_lang);
      setState('idle');
    } catch {
      setReply(t('voiceError'));
      showToast(t('voiceError'));
      setState('error');
    }
  }, [language, navigate, setLanguage, showToast, t]);

  const start = useCallback(async () => {
    stopSpeaking();
    setTranscript('');
    setReply('');
    if (!speech.supported) { setState('error'); showToast(t('voiceUnsupported')); return; }
    setState('listening');
    await speech.start(language, {
      onPartial: (txt) => setTranscript(txt),
      onResult: (txt) => handleResult(txt),
      onError: (code) => { const m = messageFor(code); setReply(m); setState('idle'); showToast(m); },
    });
  }, [language, speech, handleResult, showToast, t, messageFor]);

  const stop = useCallback(() => { speech.stop(); }, [speech]);

  return { state, transcript, reply, recording: speech.recording, supported: speech.supported, start, stop };
}
