// API client for the KaamConnect FastAPI backend.
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Resolve the backend base URL automatically so it works on web AND on a real phone
// (a phone can't use "localhost" — that's the phone itself; we use the dev machine's IP).
function resolveApiBase(): string {
  if (typeof window !== 'undefined' && (window as any).__API_BASE__) return (window as any).__API_BASE__;
  if (Platform.OS === 'web') return 'http://localhost:8000/api/v1';
  const hostUri: string | undefined =
    (Constants as any).expoConfig?.hostUri ||
    (Constants as any).expoGoConfig?.debuggerHost ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
    (Constants as any).manifest?.debuggerHost;
  const host = hostUri ? hostUri.split(':')[0] : 'localhost';
  return `http://${host}:8000/api/v1`;
}

export const API_BASE = resolveApiBase();

let TOKEN: string | null = null;
export function setAuthToken(t: string | null) {
  TOKEN = t;
}

async function req(path: string, opts: any = {}) {
  const headers: any = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
  const res = await fetch(API_BASE + path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = data && data.detail ? (typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)) : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

const qs = (o: Record<string, any>) =>
  Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

export const api = {
  // auth
  requestOtp: (phone: string, channel = 'sms') => req('/auth/otp/request', { method: 'POST', body: { phone, channel } }),
  verify: (body: any) => req('/auth/verify', { method: 'POST', body }),
  signup: (body: any) => req('/auth/signup', { method: 'POST', body }),
  login: (body: any) => req('/auth/login', { method: 'POST', body }),
  loginVerify: (body: any) => req('/auth/login/verify', { method: 'POST', body }),
  forgotStart: (username: string) => req('/auth/forgot/start', { method: 'POST', body: { username } }),
  forgotReset: (body: any) => req('/auth/forgot/reset', { method: 'POST', body }),
  me: () => req('/auth/me'),
  setLanguage: (language: string) => req('/auth/me/language', { method: 'PATCH', body: { language } }),
  // profiles
  myProfile: () => req('/profiles/me'),
  updateWorker: (body: any) => req('/profiles/me/worker', { method: 'PUT', body }),
  setAvailability: (availability: string) => req('/profiles/me/worker/availability', { method: 'PATCH', body: { availability } }),
  updateHirer: (body: any) => req('/profiles/me/hirer', { method: 'PUT', body }),
  publicWorker: (id: string) => req(`/profiles/workers/${id}`),
  myRatings: () => req('/profiles/me/ratings'),
  // kyc
  kycSubmit: (body: any) => req('/kyc/submit', { method: 'POST', body }),
  kycStatus: () => req('/kyc/status'),
  // jobs
  createJob: (body: any) => req('/jobs', { method: 'POST', body }),
  listJobs: () => req('/jobs'),
  nearbyJobs: (lat: number, lng: number, radius_km: number, category?: string) =>
    req(`/jobs/nearby?${qs({ lat, lng, radius_km, category })}`),
  nlSearch: (body: any) => req('/jobs/search/nl', { method: 'POST', body }),
  cancelJob: (id: string) => req(`/jobs/${id}/cancel`, { method: 'PATCH' }),
  // matching
  matchWorkers: (lat: number, lng: number, category: string, radius_km: number) =>
    req(`/matching/workers?${qs({ lat, lng, category, radius_km })}`),
  emergency: (job_id: string) => req('/matching/emergency', { method: 'POST', body: { job_id } }),
  recordLocation: (lat: number, lng: number) => req('/matching/locations', { method: 'POST', body: { lat, lng } }),
  // bidding
  startBid: (body: any) => req('/bidding/start', { method: 'POST', body }),
  getSession: (id: string) => req(`/bidding/sessions/${id}`),
  acceptBid: (id: string) => req(`/bidding/sessions/${id}/accept`, { method: 'POST' }),
  // bookings
  createBooking: (body: any) => req('/bookings', { method: 'POST', body }),
  confirmBooking: (id: string) => req(`/bookings/${id}/confirm`, { method: 'POST' }),
  startBooking: (id: string) => req(`/bookings/${id}/start`, { method: 'POST' }),
  completeBooking: (id: string, pin?: string) => req(`/bookings/${id}/complete`, { method: 'POST', body: { pin } }),
  cancelBooking: (id: string, reason = '') => req(`/bookings/${id}/cancel`, { method: 'POST', body: { reason } }),
  rateBooking: (id: string, stars: number, comment = '') => req(`/bookings/${id}/rate`, { method: 'POST', body: { stars, comment } }),
  listBookings: () => req('/bookings'),
  // payments
  wallet: () => req('/payments/me/wallet'),
  codCollectFee: (booking_id: string) => req('/payments/cod/collect-fee', { method: 'POST', body: { booking_id } }),
  transactions: (id: string) => req(`/payments/bookings/${id}/transactions`),
  // chat
  threads: () => req('/chat/threads'),
  createThread: (body: any) => req('/chat/threads', { method: 'POST', body }),
  messages: (id: string) => req(`/chat/threads/${id}/messages`),
  sendMessage: (id: string, body: any) => req(`/chat/threads/${id}/messages`, { method: 'POST', body }),
  // notifications
  notifications: () => req('/notifications'),
  readNotification: (id: string) => req(`/notifications/${id}/read`, { method: 'POST' }),
  registerDevice: (body: any) => req('/notifications/devices', { method: 'POST', body }),
};
