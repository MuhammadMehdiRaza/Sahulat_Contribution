// Small date/time formatting helpers shared across screens.
// Backend timestamps are naive UTC; strings without a timezone are treated as UTC.
export function parseUTC(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z');
  return isNaN(d.getTime()) ? null : d;
}

export function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function fmtDate(s?: string | null): string {
  const d = parseUTC(s);
  return d ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

export function fmtDateTime(s?: string | null): string {
  const d = parseUTC(s);
  return d ? `${fmtDate(s)}, ${fmtTime(d)}` : '';
}

// "Today" / "Yesterday" / a date — callers pass the localized today/yesterday labels.
export function dayLabel(d: Date, today: string, yesterday: string): string {
  const k = d.toDateString();
  if (k === new Date().toDateString()) return today;
  if (k === new Date(Date.now() - 86400000).toDateString()) return yesterday;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// Compact label for lists: time if today, else Today/Yesterday/date.
export function relLabel(s: string | null | undefined, today: string, yesterday: string): string {
  const d = parseUTC(s);
  if (!d) return '';
  return d.toDateString() === new Date().toDateString() ? fmtTime(d) : dayLabel(d, today, yesterday);
}

// True if the given time is in the past (used for job deadlines).
export function isPast(s?: string | null): boolean {
  const d = parseUTC(s);
  return !!d && d.getTime() < Date.now();
}

// An ISO string N days from now (deadline pickers) — UTC.
export function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString();
}

// End of the given day (23:59:59), as an ISO string — a friendly "due by end of that day".
export function endOfDayISO(d: Date): string {
  const x = new Date(d);
  x.setHours(23, 59, 59, 0);
  return x.toISOString();
}

// Extend a deadline by N days from the later of (current deadline, now).
export function extendBy(currentIso: string | null | undefined, days: number): string {
  const cur = parseUTC(currentIso);
  const base = cur && cur.getTime() > Date.now() ? cur.getTime() : Date.now();
  return new Date(base + days * 86400000).toISOString();
}
