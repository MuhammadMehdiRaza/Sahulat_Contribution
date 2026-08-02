import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from '../Icon';
import { api } from '../api';
import { useApp } from '../state';
import { colors, radius } from '../theme';
import { Btn, Field, LangToggle } from '../ui';

export default function Signup() {
  const { navigate, goBack, canGoBack, showToast, language, t } = useApp();
  const [role, setRole] = useState<'hirer' | 'worker'>('hirer');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!fullName.trim() || !username.trim() || password.length < 4 || phone.length < 10) { showToast(t('fillAllFields')); return; }
    setLoading(true);
    try {
      await api.signup({ username, password, full_name: fullName, phone, role, language });
      showToast(t('accountCreated'));
      navigate('login');
    } catch (e: any) { showToast(e.message); } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.green50 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
      <View style={s.topBar}>
        {canGoBack ? (
          <TouchableOpacity onPress={goBack} style={s.backBtn}><Text style={s.backTxt}><Icon name="back" size={14} color={colors.green700} /> {t('back')}</Text></TouchableOpacity>
        ) : <View />}
        <LangToggle />
      </View>
      <View style={s.logo}>
        <Text style={{ fontSize: 46 }}>🇵🇰</Text>
        <Text style={s.brand}>Kaam.pk</Text>
      </View>
      <Text style={s.h2}>{t('signupTitle')}</Text>
      <Text style={s.subtitle}>{t('signupSubtitle')}</Text>

      <Text style={s.roleLabel}>{t('iWantTo')}</Text>
      <View style={s.roleRow}>
        <TouchableOpacity style={[s.roleBtn, role === 'hirer' && s.roleOn]} onPress={() => setRole('hirer')}>
          <Icon name="person" size={26} color={colors.green} />
          <Text style={s.roleTxt}>{t('findWorkers')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.roleBtn, role === 'worker' && s.roleOn]} onPress={() => setRole('worker')}>
          <Icon name="worker" size={26} color={colors.green} />
          <Text style={s.roleTxt}>{t('findWork')}</Text>
        </TouchableOpacity>
      </View>

      <Field label={t('fullName')} placeholder="Ahmed Ali" value={fullName} onChangeText={setFullName} />
      <Field label={t('username')} placeholder="ahmed" value={username} onChangeText={setUsername} autoCapitalize="none" />
      <Field label={t('password')} placeholder="••••••••" value={password} onChangeText={setPassword} secureTextEntry />
      <Field label={t('phone')} placeholder="03XX XXXXXXX" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={12} />
      <Btn title={t('signupBtn')} onPress={submit} loading={loading} />
      <TouchableOpacity onPress={() => navigate('login')} style={{ marginTop: 16, marginBottom: 20 }}>
        <Text style={s.link}>{t('haveAccount')}</Text>
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 24, paddingTop: 80, justifyContent: 'center', flexGrow: 1 },
  topBar: { position: 'absolute', top: 44, right: 20, left: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 5 },
  backBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: '#fff', borderWidth: 1.2, borderColor: '#bbf7d0' },
  backTxt: { color: colors.green700, fontWeight: '800', fontSize: 14 },
  logo: { alignItems: 'center', marginBottom: 12 },
  brand: { fontSize: 26, fontWeight: '800', color: colors.green700, marginTop: 4 },
  h2: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  subtitle: { color: colors.sub, textAlign: 'center', marginTop: 4, marginBottom: 18 },
  roleLabel: { fontSize: 13, fontWeight: '600', color: colors.sub, marginBottom: 8 },
  roleRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  roleBtn: { flex: 1, backgroundColor: '#fff', borderWidth: 2, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: 16, alignItems: 'center', gap: 4 },
  roleOn: { borderColor: colors.green, backgroundColor: colors.green50 },
  roleTxt: { fontSize: 12, fontWeight: '700', color: colors.text, textAlign: 'center' },
  link: { color: colors.green, fontWeight: '700', textAlign: 'center' },
});
