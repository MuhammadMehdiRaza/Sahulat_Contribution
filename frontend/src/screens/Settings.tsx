import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import BottomNav from '../BottomNav';
import Icon from '../Icon';
import { LANGUAGES } from '../i18n';
import { useApp } from '../state';
import { colors, radius } from '../theme';
import { Badge, Btn, Card, Header, Row, Screen } from '../ui';

const LANG_NAME: Record<string, string> = { en: 'English', ur: 'اردو', roman_ur: 'Roman Urdu' };

export default function Settings() {
  const { user, logout, navigate, language, setLanguage, t } = useApp();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={t('settingsTitle')} />
      <Screen>
        <Card>
          <Text style={st.name}>{user?.full_name}</Text>
          <Text style={st.sub}>{user?.phone}</Text>
          <Row style={{ gap: 8, marginTop: 10 }}>
            <Badge label={user?.role === 'worker' ? t('worker') : t('customer')} />
            <Badge label={LANG_NAME[language] || language} bg="#e0f2fe" color="#0369a1" />
            <Badge label={user?.status} bg="#f3f4f6" color={colors.sub} />
          </Row>
        </Card>

        <Card>
          <Text style={st.cardH}>{t('languageLbl')}</Text>
          {LANGUAGES.map((l) => (
            <TouchableOpacity key={l.id} onPress={() => setLanguage(l.id)} style={[st.lang, language === l.id && st.langOn]}>
              <Text style={{ fontSize: 20 }}>{l.flag}</Text>
              <Text style={st.langName}>{l.name}</Text>
              {language === l.id ? <Icon name="check" size={16} color={colors.green} style={{ marginStart: 'auto' }} /> : null}
            </TouchableOpacity>
          ))}
        </Card>

        <Card onPress={() => navigate('wallet')}><Text style={st.row}>{t('walletRow')}</Text></Card>
        <Card onPress={() => navigate('notifications')}><Text style={st.row}>{t('notificationsRow')}</Text></Card>
        <Card onPress={() => navigate('bookings')}><Text style={st.row}>{t('myBookings')}</Text></Card>
        {user?.role === 'worker'
          ? <>
              <Card onPress={() => navigate('workerProfileEdit')}><Text style={st.row}>{t('myWorkProfileRow')}</Text></Card>
              <Card onPress={() => navigate('kyc')}><Text style={st.row}>{t('identityKycRow')}</Text></Card>
              <Card onPress={() => navigate('home')}><Text style={[st.row, { color: colors.green700 }]}>👤 Switch to Customer View (Find Workers)</Text></Card>
            </>
          : <>
              <Card onPress={() => navigate('postJob')}><Text style={st.row}>{t('postJobRow')}</Text></Card>
              <Card onPress={() => navigate('workerDashboard')}><Text style={[st.row, { color: colors.green700 }]}>👷 Switch to Worker View (Find Work)</Text></Card>
            </>}

        <Btn title={t('logout')} variant="danger" onPress={logout} style={{ marginTop: 8 }} />
        <Text style={st.footer}>{t('footer')}</Text>
      </Screen>
      <BottomNav active="settings" />
    </View>
  );
}

const st = StyleSheet.create({
  name: { fontSize: 18, fontWeight: '800', color: colors.text },
  sub: { color: colors.sub, marginTop: 2 },
  cardH: { fontWeight: '800', color: colors.text, fontSize: 15, marginBottom: 8 },
  lang: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  langOn: {},
  langName: { fontSize: 15, color: colors.text },
  tick: { marginStart: 'auto', color: colors.green, fontWeight: '800', fontSize: 16 },
  row: { fontSize: 15, fontWeight: '600', color: colors.text },
  footer: { textAlign: 'center', color: colors.muted, fontSize: 12, marginTop: 20 },
});
