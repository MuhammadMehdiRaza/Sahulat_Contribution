// Speech-to-text on the WEB build, via the browser Web Speech API (webkitSpeechRecognition).
// Keyless, streams interim results, supports ur-PK / en-US. Chrome/Edge on a secure context only.
// Metro resolves this file on web; native uses useSpeechInput.native.ts.
import { useCallback, useRef, useState } from 'react';
import type { Lang } from '../i18n';
import type { SpeechCallbacks, SpeechInput } from './types';

function getRecognitionCtor(): any {
  const g: any = globalThis as any;
  return g.SpeechRecognition || g.webkitSpeechRecognition || null;
}

export function useSpeechInput(): SpeechInput {
  const [recording, setRecording] = useState(false);
  const recRef = useRef<any>(null);
  const cbsRef = useRef<SpeechCallbacks | null>(null);
  const finalRef = useRef('');
  const supported = !!getRecognitionCtor();

  const start = useCallback((lang: Lang, cbs: SpeechCallbacks) => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) { cbs.onError('unsupported'); return; }
    let rec: any;
    try { rec = new Ctor(); } catch { cbs.onError('unsupported'); return; }
    recRef.current = rec;
    cbsRef.current = cbs;
    finalRef.current = '';
    rec.lang = lang === 'en' ? 'en-US' : 'ur-PK';   // Urdu + Roman-Urdu both map to ur-PK
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (ev: any) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const seg = ev.results[i];
        if (seg.isFinal) finalRef.current += seg[0].transcript;
        else interim += seg[0].transcript;
      }
      cbsRef.current?.onPartial?.((finalRef.current + interim).trim());
    };
    rec.onerror = (ev: any) => {
      setRecording(false);
      const raw = ev?.error || 'error';
      const code = raw === 'not-allowed' || raw === 'service-not-allowed' ? 'permission'
        : raw === 'no-speech' ? 'empty' : raw;
      cbsRef.current?.onError(code);
    };
    rec.onend = () => {
      setRecording(false);
      const text = finalRef.current.trim();
      if (text) cbsRef.current?.onResult(text);
      else cbsRef.current?.onError('empty');
    };
    try { rec.start(); setRecording(true); }
    catch { setRecording(false); cbs.onError('start-failed'); }
  }, []);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* already stopped */ }
  }, []);

  return { recording, supported, start, stop };
}
