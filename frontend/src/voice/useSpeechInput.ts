// Speech-to-text on the WEB build.
//  - English: the browser Web Speech API (fast, keyless, streams interim text).
//  - Urdu / Roman-Urdu: browser recognition is unreliable for Urdu, so we RECORD the audio
//    (MediaRecorder) and send it to the backend /voice/transcribe (offline Whisper).
// If the backend replies `demo: true`, the real Whisper server isn't running -> surface 'demo'.
// Metro resolves this file on web; native uses useSpeechInput.native.ts.
import { useCallback, useRef, useState } from 'react';
import { api } from '../api';
import type { Lang } from '../i18n';
import type { SpeechCallbacks, SpeechInput } from './types';

function getRecognitionCtor(): any {
  const g: any = globalThis as any;
  return g.SpeechRecognition || g.webkitSpeechRecognition || null;
}
function canRecord(): boolean {
  const g: any = globalThis as any;
  return typeof g.MediaRecorder !== 'undefined' && !!(g.navigator && g.navigator.mediaDevices && g.navigator.mediaDevices.getUserMedia);
}
function blobToBase64(blob: any): Promise<string> {
  return new Promise((resolve) => {
    const g: any = globalThis as any;
    const fr = new g.FileReader();
    fr.onloadend = () => {
      const s = String(fr.result || '');
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : '');   // strip the data: URL prefix
    };
    fr.onerror = () => resolve('');
    fr.readAsDataURL(blob);
  });
}

export function useSpeechInput(): SpeechInput {
  const [recording, setRecording] = useState(false);
  const recRef = useRef<any>(null);        // SpeechRecognition (English)
  const mediaRef = useRef<any>(null);      // MediaRecorder (Urdu / Roman)
  const streamRef = useRef<any>(null);
  const chunksRef = useRef<any[]>([]);
  const cbsRef = useRef<SpeechCallbacks | null>(null);
  const finalRef = useRef('');
  const supported = !!getRecognitionCtor() || canRecord();

  // --- English -> Web Speech API ---
  const startWebSpeech = (cbs: SpeechCallbacks) => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) { startRecording(cbs); return; }  // no Web Speech -> fall back to record+Whisper
    let rec: any;
    try { rec = new Ctor(); } catch { startRecording(cbs); return; }
    recRef.current = rec; cbsRef.current = cbs; finalRef.current = '';
    rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    rec.onresult = (ev: any) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const seg = ev.results[i];
        if (seg.isFinal) finalRef.current += seg[0].transcript; else interim += seg[0].transcript;
      }
      cbsRef.current?.onPartial?.((finalRef.current + interim).trim());
    };
    rec.onerror = (ev: any) => {
      setRecording(false);
      const raw = ev?.error || 'error';
      cbsRef.current?.onError(raw === 'not-allowed' || raw === 'service-not-allowed' ? 'permission' : raw === 'no-speech' ? 'empty' : raw);
    };
    rec.onend = () => {
      setRecording(false);
      const txt = finalRef.current.trim();
      if (txt) cbsRef.current?.onResult(txt); else cbsRef.current?.onError('empty');
    };
    try { rec.start(); setRecording(true); } catch { setRecording(false); cbs.onError('start-failed'); }
  };

  // --- Urdu / Roman-Urdu -> record audio, transcribe on the backend (Whisper) ---
  const startRecording = async (cbs: SpeechCallbacks) => {
    if (!canRecord()) { cbs.onError('unsupported'); return; }
    cbsRef.current = cbs; chunksRef.current = [];
    const g: any = globalThis as any;
    let stream: any;
    try { stream = await g.navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { cbs.onError('permission'); return; }
    streamRef.current = stream;
    let mr: any;
    try { mr = new g.MediaRecorder(stream); }
    catch { stream.getTracks().forEach((t: any) => t.stop()); cbs.onError('unsupported'); return; }
    mediaRef.current = mr;
    mr.ondataavailable = (e: any) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = async () => {
      try { streamRef.current?.getTracks().forEach((t: any) => t.stop()); } catch { /* ignore */ }
      try {
        const blob = new g.Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        const b64 = await blobToBase64(blob);
        if (!b64) { cbs.onError('empty'); return; }
        const r = await api.voiceTranscribe({ voice_b64: b64, lang: 'ur' });
        if (r?.demo) { cbs.onError('demo'); return; }     // real Whisper server not running
        const text = (r?.text || '').trim();
        if (text) cbs.onResult(text); else cbs.onError('empty');
      } catch { cbs.onError('stt-failed'); }
    };
    try { mr.start(); setRecording(true); } catch { setRecording(false); cbs.onError('start-failed'); }
  };

  const start = useCallback((lang: Lang, cbs: SpeechCallbacks) => {
    finalRef.current = '';
    if (lang === 'en') startWebSpeech(cbs);
    else startRecording(cbs);
  }, []);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* already stopped */ }
    try { if (mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop(); } catch { /* ignore */ }
    setRecording(false);
  }, []);

  return { recording, supported, start, stop };
}
