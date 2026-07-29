// Premium shared UI primitives — gradient headers, elevated cards/buttons, flow components.
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useApp } from './state';
import { colors, gradients, radius, shadow } from './theme';

export function Btn({ title, onPress, variant = 'primary', disabled, loading, style }: any) {
  const disabledStyle = disabled ? { opacity: 0.5 } : null;
  if (variant === 'primary') {
    return (
      <TouchableOpacity onPress={disabled || loading ? undefined : onPress} activeOpacity={0.9}
        style={[shadow.btn, { borderRadius: radius.md }, disabledStyle, style]}>
        <LinearGradient colors={gradients.green as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[s.btn, { borderRadius: radius.md }]}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={[s.btnText, { color: '#fff' }]}>{title}</Text>}
        </LinearGradient>
      </TouchableOpacity>
    );
  }
  const bg = variant === 'danger' ? colors.red : variant === 'outline' ? '#fff' : colors.green;
  const fg = variant === 'outline' ? colors.green : '#fff';
  const border = variant === 'outline' ? { borderWidth: 1.5, borderColor: '#bbf7d0' } : null;
  return (
    <TouchableOpacity onPress={disabled || loading ? undefined : onPress} activeOpacity={0.85}
      style={[s.btn, { backgroundColor: bg, borderRadius: radius.md }, border, variant === 'danger' ? shadow.soft : null, disabledStyle, style]}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, { color: fg }]}>{title}</Text>}
    </TouchableOpacity>
  );
}

export function Card({ children, style, onPress }: any) {
  const inner = <View style={[s.card, style]}>{children}</View>;
  return onPress ? <TouchableOpacity activeOpacity={0.85} onPress={onPress}>{inner}</TouchableOpacity> : inner;
}

export function Badge({ label, color = colors.green700, bg = colors.green100, style }: any) {
  return <View style={[s.badge, { backgroundColor: bg }, style]}><Text style={[s.badgeText, { color }]}>{label}</Text></View>;
}

export function Field({ label, style, ...props }: any) {
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput placeholderTextColor={colors.muted} style={[s.input, style]} {...props} />
    </View>
  );
}

export function Header({ title, subtitle, onBack, right }: any) {
  const { rtl } = useApp();
  return (
    <LinearGradient colors={gradients.header as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.header, shadow.header]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={s.backBtn}><Text style={s.backTxt}>{rtl ? '›' : '‹'}</Text></TouchableOpacity>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{title}</Text>
          {subtitle ? <Text style={s.headerSub}>{subtitle}</Text> : null}
        </View>
        {right || <LangToggle light />}
      </View>
    </LinearGradient>
  );
}

// Quick language switcher shown in headers / auth screens (cycles EN → اردو → RU).
export function LangToggle({ light }: { light?: boolean }) {
  const { language, setLanguage } = useApp();
  const order: any = ['en', 'ur', 'roman_ur'];
  const label: any = { en: 'EN', ur: 'اردو', roman_ur: 'RU' };
  return (
    <TouchableOpacity onPress={() => setLanguage(order[(order.indexOf(language) + 1) % 3])}
      style={[s.langToggle, light ? s.langToggleLight : s.langToggleDark]}>
      <Text style={{ fontSize: 13, fontWeight: '800', color: light ? '#fff' : colors.green700 }}>🌐 {label[language]}</Text>
    </TouchableOpacity>
  );
}

export function Screen({ children, scroll = true, pad = true, style }: any) {
  const content = <View style={[pad ? s.pad : null, style]}>{children}</View>;
  if (!scroll) return <View style={{ flex: 1, backgroundColor: colors.bg }}>{content}</View>;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 96 }}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {content}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Toast({ msg }: any) {
  return <View style={[s.toast, shadow.header]}><Text style={s.toastTxt}>{msg}</Text></View>;
}

export function Loading() {
  return <View style={s.loading}><ActivityIndicator size="large" color={colors.green} /></View>;
}

export function Row({ children, style }: any) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

// Step progress bar for multi-step flows (onboarding, login).
export function Steps({ total, current }: { total: number; current: number }) {
  return (
    <View style={s.steps}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[s.step, i === current ? s.stepOn : i < current ? s.stepDone : null]} />
      ))}
    </View>
  );
}

// Horizontal booking status timeline with the current step highlighted.
export function StatusTimeline({ steps, current }: { steps: { label: string }[]; current: number }) {
  return (
    <View style={s.timeline}>
      {steps.map((st, i) => {
        const done = i < current, active = i === current;
        return (
          <View key={st.label} style={s.tlItem}>
            <View style={s.tlRow}>
              {i > 0 ? <View style={[s.tlLine, i <= current && s.tlLineOn]} /> : <View style={{ flex: 1 }} />}
              <View style={[s.tlDot, done && s.tlDotDone, active && s.tlDotActive]}>
                <Text style={s.tlDotTxt}>{done ? '✓' : i + 1}</Text>
              </View>
              {i < steps.length - 1 ? <View style={[s.tlLine, i < current && s.tlLineOn]} /> : <View style={{ flex: 1 }} />}
            </View>
            <Text style={[s.tlLabel, (done || active) && { color: colors.green700, fontWeight: '700' }]}>{st.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function EmptyState({ icon = '📭', title, subtitle }: any) {
  return (
    <View style={s.empty}>
      <Text style={{ fontSize: 44, marginBottom: 8 }}>{icon}</Text>
      <Text style={s.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={s.emptySub}>{subtitle}</Text> : null}
    </View>
  );
}

// Actionable highlighted banner (worker pending actions, post-booking next step).
export function TaskBanner({ icon = '👉', title, subtitle, tone = 'green', action, onAction }: any) {
  const tones: any = {
    green: { bg: colors.green50, border: '#bbf7d0', fg: colors.green700 },
    amber: { bg: '#fffbeb', border: '#fde68a', fg: '#92400e' },
    blue: { bg: '#eff6ff', border: '#bfdbfe', fg: '#1d4ed8' },
  };
  const c = tones[tone] || tones.green;
  return (
    <View style={[s.banner, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={{ fontSize: 22 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[s.bannerTitle, { color: c.fg }]}>{title}</Text>
        {subtitle ? <Text style={s.bannerSub}>{subtitle}</Text> : null}
      </View>
      {action ? <TouchableOpacity onPress={onAction} style={[s.bannerBtn, { backgroundColor: c.fg }]}><Text style={s.bannerBtnTxt}>{action}</Text></TouchableOpacity> : null}
    </View>
  );
}

const s = StyleSheet.create({
  btn: { paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#f1f5f9', ...shadow.card },
  badge: { paddingHorizontal: 11, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', color: colors.sub, marginBottom: 6 },
  input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: colors.text, outlineStyle: 'none' as any },
  header: { paddingTop: 46, paddingBottom: 20, paddingHorizontal: 16, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  headerTitle: { color: '#fff', fontSize: 21, fontWeight: '800' },
  headerSub: { color: '#dcfce7', fontSize: 13, marginTop: 3 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 8, backgroundColor: 'rgba(255,255,255,0.18)' },
  langToggle: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1.2 },
  langToggleLight: { backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.5)' },
  langToggleDark: { backgroundColor: '#fff', borderColor: '#bbf7d0' },
  backTxt: { color: '#fff', fontSize: 28, lineHeight: 30, marginTop: -3 },
  pad: { padding: 16 },
  toast: { position: 'absolute', bottom: 104, left: 20, right: 20, backgroundColor: '#0f172a', padding: 14, borderRadius: radius.md, alignItems: 'center' },
  toastTxt: { color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, paddingVertical: 60 },
  steps: { flexDirection: 'row', justifyContent: 'center', gap: 7 },
  step: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#d1fae5' },
  stepOn: { width: 28, backgroundColor: colors.green },
  stepDone: { backgroundColor: colors.green },
  timeline: { flexDirection: 'row', marginVertical: 4 },
  tlItem: { flex: 1, alignItems: 'center' },
  tlRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  tlLine: { flex: 1, height: 3, backgroundColor: '#e2e8f0' },
  tlLineOn: { backgroundColor: colors.green },
  tlDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  tlDotDone: { backgroundColor: colors.green },
  tlDotActive: { backgroundColor: colors.green, transform: [{ scale: 1.12 }] },
  tlDotTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  tlLabel: { fontSize: 10, color: colors.muted, marginTop: 4, textAlign: 'center' },
  empty: { alignItems: 'center', paddingVertical: 30, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptySub: { fontSize: 13, color: colors.sub, textAlign: 'center', marginTop: 4, lineHeight: 19 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: radius.lg, padding: 14, marginBottom: 12 },
  bannerTitle: { fontWeight: '800', fontSize: 14 },
  bannerSub: { color: colors.sub, fontSize: 12, marginTop: 2 },
  bannerBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  bannerBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
