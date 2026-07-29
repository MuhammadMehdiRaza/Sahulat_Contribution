// App-wide auth + navigation state (mirrors the Figma App.tsx state-machine navigator).
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setAuthToken } from './api';
import { isRTL, Lang, localizeNum, makeT } from './i18n';

type NavEntry = { screen: string; params: any };
type Ctx = {
  token: string | null;
  user: any | null;
  screen: string;
  params: any;
  navigate: (screen: string, params?: any) => void;
  goBack: () => void;
  canGoBack: boolean;
  login: (token: string, user: any) => void;
  setUser: (u: any) => void;
  logout: () => void;
  toast: string | null;
  showToast: (m: string) => void;
  language: Lang;
  setLanguage: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  n: (v: string | number) => string;
  rtl: boolean;
};

const AppCtx = createContext<Ctx>(null as any);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUserState] = useState<any | null>(null);
  const [screen, setScreen] = useState('onboarding');
  const [params, setParams] = useState<any>({});
  const [history, setHistory] = useState<NavEntry[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [language, setLanguageState] = useState<Lang>('en');

  const navigate = useCallback((s: string, p: any = {}) => {
    setHistory((h) => [...h, { screen, params }]);
    setScreen(s);
    setParams(p);
  }, [screen, params]);

  const goBack = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setScreen(prev.screen);
      setParams(prev.params);
      return h.slice(0, -1);
    });
  }, []);

  const login = useCallback((t: string, u: any) => {
    setAuthToken(t);
    setToken(t);
    setUserState(u);
    if (u.language) setLanguageState(u.language);
    setHistory([]);
    setScreen(u.role === 'worker' ? 'workerDashboard' : 'home');
    setParams({});
  }, []);

  const setLanguage = useCallback((l: Lang) => {
    setLanguageState(l);
    api.setLanguage(l).catch(() => {});
  }, []);
  const t = useMemo(() => makeT(language), [language]);
  const n = useMemo(() => (v: string | number) => localizeNum(v, language), [language]);
  const rtl = isRTL(language);

  const logout = useCallback(() => {
    setAuthToken(null);
    setToken(null);
    setUserState(null);
    setHistory([]);
    setScreen('login');
    setParams({});
  }, []);

  const showToast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  }, []);

  // Demo convenience: ?demo=hirer|worker auto-logs-in (one-click demo / screenshots).
  useEffect(() => {
    if (typeof window === 'undefined' || !window.location) return; // web-only demo links; skip on native
    const p = new URLSearchParams(window.location.search);
    const demo = p.get('demo');
    const langParam = p.get('lang') as Lang | null;
    if (langParam) setLanguageState(langParam);
    const start = p.get('start');
    if (start) { setScreen(start); setParams({}); }
    if (demo !== 'hirer' && demo !== 'worker') return;
    (async () => {
      try {
        const phone = demo === 'worker' ? '03211000001' : '03007000001';
        const r1 = await api.requestOtp(phone);
        const r2 = await api.verify({ phone, code: r1.debug_code, role: demo, full_name: demo === 'worker' ? 'Muhammad Ahmed' : 'Demo Customer', language: langParam || 'en' });
        login(r2.access_token, r2.user);
        const scr = p.get('screen');
        if (scr === 'bidding') {
          const ws = await api.matchWorkers(31.5204, 74.3587, 'plumber', 15);
          if (ws && ws.length) setTimeout(() => { setScreen('bidding'); setParams({ worker: ws[0], autorun: true }); }, 60);
        } else if (scr) {
          setTimeout(() => { setScreen(scr); setParams({}); }, 60);
        }
      } catch (e) { /* backend offline */ }
    })();
  }, []);

  return (
    <AppCtx.Provider
      value={{ token, user, screen, params, navigate, goBack, canGoBack: history.length > 0,
        login, setUser: setUserState, logout, toast, showToast, language, setLanguage, t, n, rtl }}
    >
      {children}
    </AppCtx.Provider>
  );
}
