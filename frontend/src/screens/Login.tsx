import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../api';
import { useApp } from '../state';
import { colors, radius } from '../theme';
import { Btn, Field, LangToggle } from '../ui';

export default function Login() {
  const { login, navigate, goBack, canGoBack, showToast, t } = useApp();
  const [step, setStep] = useState<'creds' | 'otp'>('creds');
  const [role, setRole] = useState<'hirer' | 'worker'>('hirer');
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
      <View style={s.topBar}>
        {canGoBack ? (
          <TouchableOpacity onPress={goBack} style={s.backBtn}><Text style={s.backTxt}>‹ {t('back')}</Text></TouchableOpacity>
        ) : <View />}
        <LangToggle />
      </View>
      <View style={s.logo}>
        <Text style={{ fontSize: 52 }}>🇵🇰</Text>
        <Text style={s.brand}>Kaam.pk</Text>
      </View>

      {step === 'creds' ? (
        <View>
          <Text style={s.h2}>{t('loginTitle')}</Text>
          <Text style={s.subtitle}>{t('loginSubtitle')}</Text>

          {/* Role selector: shows the user who they're logging in as */}
          <Text style={s.roleLabel}>{t('whoRole')}</Text>
          <View style={s.roleRow}>
            <TouchableOpacity style={[s.roleBtn, role === 'hirer' && s.roleOn]} onPress={() => setRole('hirer')}>
              <Text style={{ fontSize: 24 }}>👤</Text>
              <Text style={[s.roleTxt, role === 'hirer' && s.roleTxtOn]}>{t('findWorkers')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.roleBtn, role === 'worker' && s.roleOn]} onPress={() => setRole('worker')}>
              <Text style={{ fontSize: 24 }}>👷</Text>
              <Text style={[s.roleTxt, role === 'worker' && s.roleTxtOn]}>{t('findWork')}</Text>
            </TouchableOpacity>
          </View>

          <Field label={t('username')} placeholder="ahmed" value={username} onChangeText={setUsername} autoCapitalize="none" />
          <Field label={t('password')} placeholder="••••••••" value={password} onChangeText={setPassword} secureTextEntry />
          <Field label={t('phone')} placeholder="03XX XXXXXXX" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={12} />
          <Btn title={t('loginBtn')} onPress={submitCreds} loading={loading} />
          <TouchableOpacity onPress={() => navigate('forgotPassword')} style={{ marginTop: 14 }}>
            <Text style={s.link}>{t('forgotLink')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigate('signup')} style={{ marginTop: 12 }}>
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
  wrap: { flexGrow: 1, backgroundColor: colors.green50, padding: 24, paddingTop: 84, justifyContent: 'center' },
  topBar: { position: 'absolute', top: 44, right: 20, left: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: '#fff', borderWidth: 1.2, borderColor: '#bbf7d0' },
  backTxt: { color: colors.green700, fontWeight: '800', fontSize: 14 },
  logo: { alignItems: 'center', marginBottom: 20 },
  brand: { fontSize: 28, fontWeight: '800', color: colors.green700, marginTop: 4 },
  h2: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  subtitle: { color: colors.sub, textAlign: 'center', marginTop: 4, marginBottom: 18 },
  roleLabel: { fontSize: 13, fontWeight: '600', color: colors.sub, marginBottom: 8 },
  roleRow: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  roleBtn: { flex: 1, backgroundColor: '#fff', borderWidth: 2, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center', gap: 4 },
  roleOn: { borderColor: colors.green, backgroundColor: colors.green50 },
  roleTxt: { fontSize: 12, fontWeight: '700', color: colors.sub, textAlign: 'center' },
  roleTxtOn: { color: colors.green700 },
  link: { color: colors.green, fontWeight: '700', textAlign: 'center' },
  note: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderWidth: 1, borderRadius: radius.md, padding: 10, marginBottom: 14 },
  noteTxt: { color: '#1d4ed8', fontSize: 12, textAlign: 'center' },
});
