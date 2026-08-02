import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from '../Icon';
import { api } from '../api';
import { fmtDate, fmtDateTime, isPast } from '../dates';
import { useApp } from '../state';
import { colors, radius } from '../theme';
import { Badge, Btn, Card, Field, Header, Row, Screen } from '../ui';

// Worker view of a single open job — read the details and tap "I'm Interested".
export default function JobDetail() {
  const { params, goBack, showToast, t, n } = useApp();
  const job = params.job || {};
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(!!job.my_interest);
  const [loading, setLoading] = useState(false);

  const express = async () => {
    setLoading(true);
    try {
      await api.expressInterest(job.id, note);
      setSent(true);
      showToast(t('interestSentToast'));
    } catch (e: any) { showToast(e.message); } finally { setLoading(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={t('jobDetailTitle')} subtitle={t('svc_' + job.category)} onBack={goBack} />
      <Screen>
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={st.cat}>{t('svc_' + job.category)}</Text>
            {job.is_emergency
              ? <Badge label={t('emergency')} bg="#fee2e2" color={colors.redDark} />
              : job.distance_km != null
                ? <Badge label={t('kmAway', { km: n(job.distance_km) })} bg="#e0f2fe" color="#0369a1" />
                : null}
          </Row>
          {job.created_at ? <Text style={st.date}><Icon name="calendar" size={12} color={colors.muted} /> {t('postedOn', { date: fmtDate(job.created_at) })}</Text> : null}
          {job.deadline ? (
            <Text style={[st.date, isPast(job.deadline) && { color: colors.redDark, fontWeight: '700' }]}>
              <Icon name="time" size={12} color={isPast(job.deadline) ? colors.redDark : colors.muted} /> {isPast(job.deadline) ? t('overdue') : t('dueBy', { date: fmtDateTime(job.deadline) })}
            </Text>
          ) : null}
          {job.description ? <Text style={st.desc}>{job.description}</Text> : null}
          <Row style={{ gap: 22, marginTop: 14, flexWrap: 'wrap' }}>
            <View>
              <Text style={st.k}>{t('budgetLbl')}</Text>
              <Text style={st.v}>PKR {n(job.budget_target ?? '—')}–{n(job.budget_max ?? '—')}</Text>
            </View>
            {job.address ? (
              <View style={{ flex: 1 }}>
                <Text style={st.k}>{t('address')}</Text>
                <Text style={st.v}>{job.address}</Text>
              </View>
            ) : null}
          </Row>
        </Card>

        <View style={st.explain}><Text style={st.explainTxt}>{t('interestExplain')}</Text></View>

        {!sent ? (
          <Field label={t('interestNoteLabel')} placeholder={t('interestNoteHint')}
            value={note} onChangeText={setNote} multiline />
        ) : null}
        <Btn title={sent ? t('interestSentBtn') : t('imInterested')} onPress={express} loading={loading} disabled={sent} />
      </Screen>
    </View>
  );
}

const st = StyleSheet.create({
  cat: { fontSize: 18, fontWeight: '800', color: colors.text },
  date: { color: colors.muted, fontSize: 12, marginTop: 8 },
  desc: { color: colors.sub, marginTop: 10, lineHeight: 20 },
  k: { color: colors.sub, fontSize: 12, marginBottom: 2 },
  v: { fontWeight: '700', color: colors.text },
  explain: { backgroundColor: colors.green50, borderColor: '#bbf7d0', borderWidth: 1, borderRadius: radius.md, padding: 14, marginBottom: 14 },
  explainTxt: { color: colors.green700, fontSize: 13, lineHeight: 19 },
});
