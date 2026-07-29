import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../api';
import { useApp } from '../state';
import { colors, radius } from '../theme';
import { Btn, Field, LangToggle } from '../ui';

export default function ForgotPassword() {
  const { navigate, showToast, t } = useApp();
  const [step, setStep] = useState<'username' | 'reset'>('username');
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [loading, setLoading] = useState(false);

  const startReset = async () => {
    if (!username.trim()) { showToast(t('fillAllFields')); return; }
    setLoading(true);
    try {
      const r = await api.forgotStart(username.trim());
      setCode(r.debug_code || '');
      setStep('reset');
      showToast(t('codeSent'));
    } catch (e: any) {
      showToast(e.message === 'Username not found' ? t('usernameNotFound') : e.message);
    } finally { setLoading(false); }
  };

  const doReset = async () => {
    if (pw.length < 4) { showToast(t('fillAllFields')); return; }
    if (pw !== pw2) { showToast(t('passwordsMismatch')); return; }
    setLoading(true);
    try {
      await api.forgotReset({ username: username.trim(), code, new_password: pw });
      showToast(t('passwordResetDone'));
      navigate('login');
    } catch (e: any) { showToast(e.message); } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.green50 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
        <View style={s.topBar}><LangToggle /></View>
        <View style={s.logo}>
          <Text style={{ fontSize: 50 }}>🔑</Text>
          <Text style={s.brand}>Kaam.pk</Text>
        </View>

        {step === 'username' ? (
          <View>
            <Text style={s.h2}>{t('forgotTitle')}</Text>
            <Text style={s.subtitle}>{t('forgotSub1')}</Text>
            <Field label={t('username')} placeholder="ahmed" value={username} onChangeText={setUsername} autoCapitalize="none" />
            <Btn title={t('continueBtn')} onPress={startReset} loading={loading} />
          </View>
        ) : (
          <View>
            <Text style={s.h2}>{t('forgotTitle')}</Text>
            <Text style={s.subtitle}>{t('forgotSub2')}</Text>
            <View style={s.note}><Text style={s.noteTxt}>{t('demoNote')}</Text></View>
            <Field label={t('otpCode')} placeholder="1234" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={4} style={{ textAlign: 'center', fontSize: 22, letterSpacing: 8 }} />
            <Field label={t('newPassword')} placeholder="••••••••" value={pw} onChangeText={setPw} secureTextEntry />
            <Field label={t('confirmPassword')} placeholder="••••••••" value={pw2} onChangeText={setPw2} secureTextEntry />
            <Btn title={t('resetBtn')} onPress={doReset} loading={loading} />
          </View>
        )}

        <TouchableOpacity onPress={() => navigate('login')} style={{ marginTop: 16 }}>
          <Text style={s.link}>← {t('loginBtn')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flexGrow: 1, backgroundColor: colors.green50, padding: 24, justifyContent: 'center' },
  topBar: { position: 'absolute', top: 44, right: 20, alignItems: 'flex-end' },
  logo: { alignItems: 'center', marginBottom: 20 },
  brand: { fontSize: 28, fontWeight: '800', color: colors.green700, marginTop: 4 },
  h2: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  subtitle: { color: colors.sub, textAlign: 'center', marginTop: 4, marginBottom: 18 },
  link: { color: colors.green, fontWeight: '700', textAlign: 'center' },
  note: { backgroundColor: '#fffbeb', borderColor: '#fde68a', borderWidth: 1, borderRadius: radius.md, padding: 10, marginBottom: 14 },
  noteTxt: { color: '#92400e', fontSize: 12, textAlign: 'center' },
});
