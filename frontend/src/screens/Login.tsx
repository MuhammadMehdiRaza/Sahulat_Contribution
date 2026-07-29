import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../api';
import { useApp } from '../state';
import { colors, radius } from '../theme';
import { Btn, Field, LangToggle } from '../ui';

export default function Login() {
  const { login, navigate, showToast, t } = useApp();
  const [step, setStep] = useState<'creds' | 'otp'>('creds');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const submitCreds = async () => {
    if (!username.trim() || !password.trim() || phone.length < 10) { showToast(t('fillAllFields')); return; }
    setLoading(true);
    try {
      const r = await api.login({ username, password, phone });
      setCode(r.debug_code || '');
      setStep('otp');
      showToast(t('otpSent'));
    } catch (e: any) { showToast(e.message); } finally { setLoading(false); }
  };

  const verify = async () => {
    setLoading(true);
    try {
      const r = await api.loginVerify({ phone, code });
      login(r.access_token, r.user);
    } catch (e: any) { showToast(e.message); } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.green50 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
      <View style={s.topBar}><LangToggle /></View>
      <View style={s.logo}>
        <Text style={{ fontSize: 52 }}>🇵🇰</Text>
        <Text style={s.brand}>Kaam.pk</Text>
      </View>

      {step === 'creds' ? (
        <View>
          <Text style={s.h2}>{t('loginTitle')}</Text>
          <Text style={s.subtitle}>{t('loginSubtitle')}</Text>
          <Field label={t('username')} placeholder="ahmed" value={username} onChangeText={setUsername} autoCapitalize="none" />
          <Field label={t('password')} placeholder="••••••••" value={password} onChangeText={setPassword} secureTextEntry />
          <Field label={t('phone')} placeholder="03XX XXXXXXX" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={12} />
          <Btn title={t('loginBtn')} onPress={submitCreds} loading={loading} />
          <TouchableOpacity onPress={() => navigate('signup')} style={{ marginTop: 16 }}>
            <Text style={s.link}>{t('noAccount')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          <Text style={s.h2}>{t('verifyOtp')}</Text>
          <Text style={s.subtitle}>{t('otpSentTo', { phone })}</Text>
          <View style={s.note}><Text style={s.noteTxt}>{t('twoFactorNote')}</Text></View>
          <Field label={t('otpCode')} placeholder="1234" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={4}
            style={{ textAlign: 'center', fontSize: 24, letterSpacing: 8 }} />
          <Btn title={t('verifyContinue')} onPress={verify} loading={loading} />
          <TouchableOpacity onPress={() => setStep('creds')} style={{ marginTop: 14 }}>
            <Text style={s.link}>{t('back')}</Text>
          </TouchableOpacity>
        </View>
      )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flexGrow: 1, backgroundColor: colors.green50, padding: 24, justifyContent: 'center' },
  topBar: { position: 'absolute', top: 44, right: 20, left: 20, alignItems: 'flex-end' },
  logo: { alignItems: 'center', marginBottom: 20 },
  brand: { fontSize: 28, fontWeight: '800', color: colors.green700, marginTop: 4 },
  h2: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  subtitle: { color: colors.sub, textAlign: 'center', marginTop: 4, marginBottom: 18 },
  link: { color: colors.green, fontWeight: '700', textAlign: 'center' },
  note: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderWidth: 1, borderRadius: radius.md, padding: 10, marginBottom: 14 },
  noteTxt: { color: '#1d4ed8', fontSize: 12, textAlign: 'center' },
});
