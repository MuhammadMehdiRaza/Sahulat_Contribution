import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import Icon from '../Icon';
import { useApp } from '../state';
import { colors } from '../theme';
import { Badge, Btn, Card, EmptyState, Header, Row, Screen } from '../ui';

// Hirer reviews everyone interested in one job, then negotiates / chats with a pick.
export default function JobApplicants() {
  const { params, navigate, goBack, showToast, t, n } = useApp();
  const [job, setJob] = useState<any>(params.job || {});
  const [apps, setApps] = useState<any[] | null>(null);

  const chat = async (a: any) => {
    try {
      const th = await api.createThread({ peer_id: a.worker_id, job_id: params.job.id });
      navigate('chat', { threadId: th.id, peerName: a.full_name });
    } catch (e: any) { showToast(e.message); }
  };

  useEffect(() => {
    (async () => {
      // If we arrived from a notification we may only have the job id — fetch full details.
      if (job?.id && job.budget_target == null) {
        try { setJob(await api.getJob(job.id)); } catch {}
      }
      try { setApps(await api.jobInterests(params.job.id)); } catch { setApps([]); }
    })();
  }, [params.job?.id]);

  const badges = (b: any) => Object.entries(b || {}).filter(([, v]) => v).map(([k]) => k.toUpperCase());
  const booked = ['booked', 'completed', 'cancelled'].includes(job?.status);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={t('applicantsTitle')} subtitle={t('applicantsSub')} onBack={goBack} />
      <Screen>
        {booked ? (
          <Card style={{ backgroundColor: '#ede9fe', borderColor: '#ddd6fe' }}>
            <Text style={{ color: '#6d28d9', fontWeight: '800' }}>{t('jobBookedBanner')}</Text>
            {job.booking_id ? (
              <Btn title={t('viewBookingStatus')} style={{ marginTop: 10 }}
                onPress={() => navigate('bookingDetail', { bookingId: job.booking_id })} />
            ) : null}
          </Card>
        ) : null}
        {apps === null ? <ActivityIndicator color={colors.green} />
          : apps.length === 0 ? <EmptyState icon={<Icon name="interested" size={44} color={colors.muted} />} title={t('noApplicants')} />
          : apps.map((a) => (
            <Card key={a.worker_id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={st.name}>{a.full_name}</Text>
                <Badge label={a.availability === 'available' ? t('available') : t('busy')} />
              </Row>
              <Text style={st.skill}>{(a.skills || []).map((k: string) => t('svc_' + k)).join(', ')}</Text>
              <Row style={{ gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
                <Text style={st.meta}><Icon name="star" size={12} color={colors.amber} /> {n(Number(a.rating_avg).toFixed(1))} ({n(a.rating_count)})</Text>
                <Text style={st.meta}><Icon name="verified" size={12} color={colors.green} /> {n(a.jobs_completed)} {t('jobsDone')}</Text>
                {a.distance_km != null ? <Text style={st.meta}><Icon name="location" size={12} color={colors.sub} /> {n(a.distance_km)} km</Text> : null}
              </Row>
              <Row style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {badges(a.badges).map((b) => <Badge key={b} label={<><Icon name="check" size={11} color={colors.green700} /> {b}</>} bg="#dcfce7" color={colors.green700} />)}
              </Row>
              {a.message ? <Text style={st.note}>{t('workerMessage', { msg: a.message })}</Text> : null}

              {!booked && a.availability === 'available' ? (
                <Btn title={t('negotiateHire')} style={{ marginTop: 12 }}
                  onPress={() => navigate('bidding', { worker: a, job })} />
              ) : !booked ? (
                <Text style={st.busy}>{t('workerBusyShort')}</Text>
              ) : null}
              <Row style={{ gap: 10, marginTop: booked ? 12 : 10 }}>
                <Btn title={t('message')} variant="outline" style={{ flex: 1 }} onPress={() => chat(a)} />
                <Btn title={t('viewProfile')} variant="outline" style={{ flex: 1 }}
                  onPress={() => navigate('workerProfile', { worker: a, job })} />
              </Row>
            </Card>
          ))}
      </Screen>
    </View>
  );
}

const st = StyleSheet.create({
  name: { fontSize: 16, fontWeight: '800', color: colors.text },
  skill: { color: colors.sub, marginTop: 2 },
  meta: { color: colors.sub, fontSize: 12 },
  note: { color: colors.text, fontStyle: 'italic', marginTop: 10, backgroundColor: '#f8fafc', padding: 10, borderRadius: 10 },
  busy: { color: '#92400e', fontWeight: '600', fontSize: 13, marginTop: 12 },
});
