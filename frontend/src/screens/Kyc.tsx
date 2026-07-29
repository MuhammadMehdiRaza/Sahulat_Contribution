import React, { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { api } from '../api';
import { useApp } from '../state';
import { colors, radius } from '../theme';
import { Badge, Btn, Card, Field, Header, Row, Screen } from '../ui';

export default function Kyc() {
  const { user, goBack, showToast, t } = useApp();
  const [cnic, setCnic] = useState('3520212345671');
  const [name, setName] = useState(user?.full_name || '');
  const [dob, setDob] = useState('1990-01-01');
  const [issue, setIssue] = useState('2018-01-01');
  const [fp, setFp] = useState(true);
  const [portrait, setPortrait] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const submit = async () => {
    setLoading(true);
    try {
      const r = await api.kycSubmit({
        cnic, full_name: name, dob, card_issue_date: issue,
        fingerprint_b64: fp ? 'fp-capture' : null, portrait_b64: portrait ? 'portrait-capture' : null,
      });
      setResult(r);
      showToast(r.status === 'verified' ? t('verifiedToast') : r.status);
    } catch (e: any) { showToast(e.message); } finally { setLoading(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={t('kycTitle')} onBack={goBack} />
      <Screen>
        <View style={st.note}><Text style={st.noteTxt}>{t('kycNote')}</Text></View>
        <Field label={t('cnicLabel')} value={cnic} onChangeText={setCnic} keyboardType="number-pad" />
        <Field label={t('fullName')} value={name} onChangeText={setName} />
        <Row style={{ gap: 12 }}>
          <View style={{ flex: 1 }}><Field label={t('dobLbl')} value={dob} onChangeText={setDob} /></View>
          <View style={{ flex: 1 }}><Field label={t('issueLbl')} value={issue} onChangeText={setIssue} /></View>
        </Row>
        <Card>
          <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={st.bio}>{t('fingerprintLbl')}</Text>
            <Switch value={fp} onValueChange={setFp} trackColor={{ true: colors.green }} />
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={st.bio}>{t('portraitLbl')}</Text>
            <Switch value={portrait} onValueChange={setPortrait} trackColor={{ true: colors.green }} />
          </Row>
        </Card>
        <Btn title={t('submitVerify')} onPress={submit} loading={loading} />
        {result ? (
          <Card style={{ marginTop: 14 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={st.bio}>{t('resultLbl')}</Text>
              <Badge label={result.status} bg={result.status === 'verified' ? '#dcfce7' : '#fef3c7'}
                color={result.status === 'verified' ? colors.green700 : '#92400e'} />
            </Row>
            <Text style={{ color: colors.sub, marginTop: 6 }}>{t('biometricScore')}: {result.biometric_score} · {t('demographicMatch')}: {String(result.demographic_match)}</Text>
            {result.status === 'verified' ? <Btn title={t('backDash')} variant="outline" style={{ marginTop: 12 }} onPress={goBack} /> : null}
          </Card>
        ) : null}
      </Screen>
    </View>
  );
}

const st = StyleSheet.create({
  note: { backgroundColor: '#fffbeb', borderColor: '#fde68a', borderWidth: 1, borderRadius: radius.md, padding: 12, marginBottom: 16 },
  noteTxt: { color: '#92400e', fontSize: 12, lineHeight: 18 },
  bio: { fontWeight: '600', color: colors.text },
});
