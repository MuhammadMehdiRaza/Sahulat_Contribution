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
  text: '#111827',
  sub: '#6b7280',
  muted: '#9ca3af',
  border: '#e5e7eb',
  bg: '#f9fafb',
  card: '#ffffff',
  white: '#ffffff',
  backdrop: '#e5e7eb',
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

export const services = [
  { key: 'plumber', name: 'Plumber', urdu: 'نلکے والا', icon: '🔧' },
  { key: 'electrician', name: 'Electrician', urdu: 'بجلی مستری', icon: '⚡' },
  { key: 'carpenter', name: 'Carpenter', urdu: 'ترکھان', icon: '🪚' },
  { key: 'cleaner', name: 'Cleaner', urdu: 'صفائی', icon: '🧹' },
  { key: 'cook', name: 'Cook', urdu: 'باورچی', icon: '🍳' },
  { key: 'household', name: 'Household', urdu: 'گھریلو', icon: '🏠' },
];

export const paymentMethods = [
  { key: 'escrow_easypaisa', name: 'Easypaisa (Escrow)', icon: '📱' },
  { key: 'escrow_jazzcash', name: 'JazzCash (Escrow)', icon: '📱' },
  { key: 'cod', name: 'Cash on Delivery', icon: '💵' },
];
