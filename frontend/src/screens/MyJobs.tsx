import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { fmtDate, isPast } from '../dates';
import { useApp } from '../state';
import { colors } from '../theme';
import { Badge, Btn, Card, EmptyState, Header, Row, Screen } from '../ui';

// Order + labels for the status sections shown to the hirer.
const SECTIONS = ['posted', 'bidding', 'booked', 'completed', 'cancelled'] as const;
const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  posted: { bg: '#dcfce7', fg: colors.green700 }, bidding: { bg: '#e0f2fe', fg: '#0369a1' },
  booked: { bg: '#ede9fe', fg: '#6d28d9' }, completed: { bg: '#f1f5f9', fg: colors.sub },
  cancelled: { bg: '#fee2e2', fg: colors.redDark },
};

export default function MyJobs() {
  const { navigate, goBack, t, n } = useApp();
  const [jobs, setJobs] = useState<any[] | null>(null);
  const load = async () => { try { setJobs(await api.listJobs()); } catch { setJobs([]); } };
  useEffect(() => { load(); }, []);

  const secLabel: Record<string, string> = {
    posted: t('jobsecPosted'), bidding: t('jobsecBidding'), booked: t('jobsecBooked'),
    completed: t('jobsecCompleted'), cancelled: t('jobsecCancelled'),
  };

  const open = (j: any) => {
    if ((j.status === 'booked' || j.status === 'completed') && j.booking_id) {
      navigate('bookingDetail', { bookingId: j.booking_id });
    } else if (j.status !== 'cancelled') {
      navigate('jobApplicants', { job: j });
    }
  };

  const card = (j: any) => {
    const sc = STATUS_STYLE[j.status] || STATUS_STYLE.posted;
    const count = j.interested_count || 0;
    const openForInterest = j.status === 'posted' || j.status === 'bidding';
    const hasStatus = (j.status === 'booked' || j.status === 'completed') && j.booking_id;
    return (
      <Card key={j.id} onPress={j.status === 'cancelled' ? undefined : () => open(j)}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={st.cat}>{t('svc_' + j.category)}</Text>
          <Badge label={secLabel[j.status] || j.status} bg={sc.bg} color={sc.fg} />
        </Row>
        {j.created_at ? <Text style={st.date}>📅 {fmtDate(j.created_at)}</Text> : null}
        {j.deadline && j.status !== 'completed' && j.status !== 'cancelled' ? (
          <Text style={[st.date, isPast(j.deadline) && { color: colors.redDark, fontWeight: '700' }]}>
            ⏰ {isPast(j.deadline) ? t('overdue') : t('dueBy', { date: fmtDate(j.deadline) })}
          </Text>
        ) : null}
        {j.description ? <Text style={st.desc} numberOfLines={2}>{j.description}</Text> : null}
        <Text style={st.budget}>PKR {n(j.budget_target)}–{n(j.budget_max)}</Text>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          {openForInterest
            ? (count > 0
                ? <Badge label={t('interestedN', { n: n(count) })} bg="#dcfce7" color={colors.green700} />
                : <Text style={st.none}>{t('noInterestYet')}</Text>)
            : <View />}
          {openForInterest ? <Text style={st.link}>{t('viewApplicants')}</Text>
            : hasStatus ? <Text style={st.link}>{t('viewStatus')}</Text> : null}
        </Row>
      </Card>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={t('myJobsTitle')} subtitle={t('myJobsSub')} onBack={goBack} />
      <Screen>
        <Btn title={t('postNewJob')} variant="outline" onPress={() => navigate('postJob')} style={{ marginBottom: 14 }} />
        {jobs === null ? null : jobs.length === 0 ? (
          <EmptyState icon="📋" title={t('noPostedJobs')} />
        ) : SECTIONS.map((status) => {
          const group = jobs.filter((j) => j.status === status);
          if (group.length === 0) return null;
          return (
            <View key={status}>
              <Text style={st.section}>{secLabel[status]}</Text>
              {group.map(card)}
            </View>
          );
        })}
      </Screen>
    </View>
  );
}

const st = StyleSheet.create({
  section: { fontSize: 14, fontWeight: '800', color: colors.sub, marginTop: 10, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  cat: { fontSize: 16, fontWeight: '800', color: colors.text },
  date: { color: colors.muted, fontSize: 12, marginTop: 4 },
  desc: { color: colors.sub, marginTop: 6, lineHeight: 19 },
  budget: { color: colors.green700, fontWeight: '700', marginTop: 8, fontSize: 13 },
  none: { color: colors.muted, fontSize: 13 },
  link: { color: colors.green, fontWeight: '700', fontSize: 13 },
});
