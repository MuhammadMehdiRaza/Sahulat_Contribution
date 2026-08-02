// KaamConnect design tokens (matches the Figma "Kaam.pk" green theme).
export const colors = {
  green: '#16a34a',
  greenDark: '#15803d',
  green700: '#15803d',
  green100: '#dcfce7',
  green50: '#f0fdf4',
  red: '#ef4444',
  redDark: '#dc2626',
  amber: '#f59e0b',
  blue: '#2563eb',
  text: '#0f172a',      // slate-900 — richer, modern
  sub: '#475569',       // slate-600
  muted: '#94a3b8',     // slate-400
  border: '#e2e8f0',    // slate-200
  bg: '#f8fafc',        // slate-50 — cool, clean
  card: '#ffffff',
  white: '#ffffff',
  backdrop: '#e2e8f0',
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };
export const space = (n: number) => n * 4;

export const gradients = {
  header: ['#17a34a', '#0f9040', '#0c7a38'],
  green: ['#22c55e', '#16a34a'],
  emerald: ['#10b981', '#059669'],
};

export const shadow = {
  card: { shadowColor: '#0f172a', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  soft: { shadowColor: '#0f172a', shadowOpacity: 0.045, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  btn: { shadowColor: '#15803d', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  header: { shadowColor: '#0f172a', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
};

// Service category `key` doubles as the Icon name (see src/Icon.tsx).
export const services = [
  { key: 'plumber', name: 'Plumber', urdu: 'نلکے والا' },
  { key: 'electrician', name: 'Electrician', urdu: 'بجلی مستری' },
  { key: 'carpenter', name: 'Carpenter', urdu: 'ترکھان' },
  { key: 'cleaner', name: 'Cleaner', urdu: 'صفائی' },
  { key: 'cook', name: 'Cook', urdu: 'باورچی' },
  { key: 'household', name: 'Household', urdu: 'گھریلو' },
];

export const paymentMethods = [
  { key: 'escrow_easypaisa', name: 'Easypaisa (Escrow)', icon: 'phone' },
  { key: 'escrow_jazzcash', name: 'JazzCash (Escrow)', icon: 'phone' },
  { key: 'cod', name: 'Cash on Delivery', icon: 'cash' },
];
