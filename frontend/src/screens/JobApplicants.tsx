import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import Icon from '../Icon';
import { useApp } from '../state';
import { colors } from '../theme';
import { Badge, Btn, Card, EmptyState, Header, Row, Screen } from '../ui';

// Hirer reviews everyone interested in one job, then negotiates / chats with a pick.
export default function JobApplicants() {
  const { params, navigate, goBack, showToast, coords, t, n } = useApp();
  const [job, setJob] = useState<any>(params.job || {});
  const [apps, setApps] = useState<any[] | null>(null);
  const [nearbyWorkers, setNearbyWorkers] = useState<any[] | null>(null);

  const chat = async (peer_id: string, name: string) => {
    try {
      const th = await api.createThread({ peer_id, job_id: job.id || params.job?.id });
      navigate('chat', { threadId: th.id, peerName: name });
    } catch (e: any) { showToast(e.message); }
  };

  const startInChatNegotiation = async (peer_id: string, name: string) => {
    try {
      showToast('Opening AI Negotiation in Chat... 🤖');
      const th = await api.createThread({ peer_id, job_id: job.id || params.job?.id });
      navigate('chat', { threadId: th.id, peerName: name, autoAi: true });
    } catch (e: any) { showToast(e.message); }
  };

  useEffect(() => {
    (async () => {
      let currentJob = job;
      if (job?.id && job.budget_target == null) {
        try {
          currentJob = await api.getJob(job.id);
          setJob(currentJob);
        } catch {}
      }
      const jid = currentJob?.id || params.job?.id;
      if (jid) {
        try { setApps(await api.jobInterests(jid)); } catch { setApps([]); }
      } else {
        setApps([]);
      }

      const cat = currentJob?.category || 'plumber';
      const lat = currentJob?.lat || coords.lat;
      const lng = currentJob?.lng || coords.lng;
      try {
        const matched = await api.matchWorkers(lat, lng, cat, 1000);
        setNearbyWorkers(matched || []);
      } catch {
        setNearbyWorkers([]);
      }
    })();
  }, [params.job?.id]);

  const badges = (b: any) => Object.entries(b || {}).filter(([, v]) => v).map(([k]) => k.toUpperCase());
  const booked = ['booked', 'completed', 'cancelled'].includes(job?.status);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={t('applicantsTitle')} subtitle={job?.category ? `${t('svc_' + job.category)} · PKR ${n(job.budget_target || 2000)}` : t('applicantsSub')} onBack={goBack} />
      <Screen>
        {booked ? (
          <Card style={{ backgroundColor: '#ede9fe', borderColor: '#ddd6fe', marginBottom: 12 }}>
            <Text style={{ color: '#6d28d9', fontWeight: '800' }}>{t('jobBookedBanner')}</Text>
            {job.booking_id ? (
              <Btn title={t('viewBookingStatus')} style={{ marginTop: 10 }}
                onPress={() => navigate('bookingDetail', { bookingId: job.booking_id })} />
            ) : null}
          </Card>
        ) : null}
        {/* Section 1: Interested Applicants */}
        {apps === null ? (
          <ActivityIndicator color={colors.green} />
        ) : apps.length > 0 ? (
          <View>
            <Text style={st.sectionHeader}>🙋 {t('interestedApplicants') || 'Interested Applicants'} ({n(apps.length)})</Text>
            {apps.map((a) => (
              <Card key={a.worker_id} style={{ marginBottom: 12 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={st.name}>{a.full_name}</Text>
                  <Badge label={a.availability === 'available' ? t('available') : t('busy')} />
                </Row>
                <Text style={st.skill}>{(a.skills || []).map((k: string) => t('svc_' + k)).join(', ')}</Text>
                <Row style={{ gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
                  <Text style={st.meta}><Icon name="star" size={12} color={colors.amber} /> {n(Number(a.rating_avg || 4.8).toFixed(1))} ({n(a.rating_count || 50)})</Text>
                  <Text style={st.meta}><Icon name="verified" size={12} color={colors.green} /> {n(a.jobs_completed || 50)} {t('jobsDone')}</Text>
                  {a.distance_km != null ? <Text style={st.meta}><Icon name="location" size={12} color={colors.sub} /> {n(a.distance_km)} km</Text> : null}
                </Row>
                {badges(a.badges).length > 0 ? (
                  <Row style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    {badges(a.badges).map((b) => <Badge key={b} label={<><Icon name="check" size={11} color={colors.green700} /> {b}</>} bg="#dcfce7" color={colors.green700} />)}
                  </Row>
                ) : null}
                {a.message ? <Text style={st.note}>{t('workerMessage', { msg: a.message })}</Text> : null}

                {!booked && a.availability === 'available' ? (
                  <Btn title={`🤖 ${t('negotiateHire')}`} style={{ marginTop: 12 }}
                    onPress={() => startInChatNegotiation(a.worker_id, a.full_name)} />
                ) : !booked ? (
                  <Text style={st.busy}>{t('workerBusyShort')}</Text>
                ) : null}
                <Row style={{ gap: 10, marginTop: booked ? 12 : 10 }}>
                  <Btn title={t('message')} variant="outline" style={{ flex: 1 }} onPress={() => chat(a.worker_id, a.full_name)} />
                  <Btn title={t('viewProfile')} variant="outline" style={{ flex: 1 }}
                    onPress={() => navigate('workerProfile', { worker: a, job })} />
                </Row>
              </Card>
            ))}
          </View>
        ) : (
          <EmptyState icon={<Icon name="interested" size={44} color={colors.muted} />} title={t('noApplicants')} />
        )}

        {/* Section 2: Registered Workers Available */}
        <Text style={st.sectionHeader}>👷 Registered Workers Available</Text>
        {nearbyWorkers === null ? <ActivityIndicator color={colors.green} />
          : nearbyWorkers.length === 0 ? <EmptyState icon={<Icon name="worker" size={44} color={colors.muted} />} title="No registered workers available in your area yet" />
          : nearbyWorkers.map((w) => {
              const wid = w.worker_id || w.id || w.user_id;
              return (
                <Card key={wid} style={{ marginBottom: 12 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text style={st.name}>{w.full_name}</Text>
                    <Badge label={w.availability === 'available' ? t('available') : t('busy')} />
                  </Row>
                  <Text style={st.skill}>{(w.skills || [job?.category || 'plumber']).map((k: string) => t('svc_' + k)).join(', ')}</Text>
                  <Row style={{ gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
                    <Text style={st.meta}><Icon name="star" size={12} color={colors.amber} /> {n(Number(w.rating_avg || 4.8).toFixed(1))} ({n(w.rating_count || 100)})</Text>
                    <Text style={st.meta}><Icon name="verified" size={12} color={colors.green} /> {n(w.jobs_completed || 100)} {t('jobsDone')}</Text>
                    {w.distance_km != null ? <Text style={st.meta}><Icon name="location" size={12} color={colors.sub} /> {n(w.distance_km)} km</Text> : null}
                  </Row>
                  {!booked && w.availability === 'available' ? (
                    <Btn title={`🤖 ${t('negotiateHire')}`} style={{ marginTop: 12 }}
                      onPress={() => startInChatNegotiation(wid, w.full_name)} />
                  ) : !booked ? (
                    <Text style={st.busy}>{t('workerBusyShort')}</Text>
                  ) : null}
                  <Row style={{ gap: 10, marginTop: booked ? 12 : 10 }}>
                    <Btn title={t('message')} variant="outline" style={{ flex: 1 }} onPress={() => chat(wid, w.full_name)} />
                    <Btn title={t('viewProfile')} variant="outline" style={{ flex: 1 }}
                      onPress={() => navigate('workerProfile', { worker: w, job })} />
                  </Row>
                </Card>
              );
            })}
      </Screen>
    </View>
  );
}

const st = StyleSheet.create({
  sectionHeader: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 14, marginBottom: 10 },
  name: { fontSize: 16, fontWeight: '800', color: colors.text },
  skill: { color: colors.sub, marginTop: 2 },
  meta: { color: colors.sub, fontSize: 12 },
  note: { color: colors.text, fontStyle: 'italic', marginTop: 10, backgroundColor: '#f8fafc', padding: 10, borderRadius: 10 },
  busy: { color: '#92400e', fontWeight: '600', fontSize: 13, marginTop: 12 },
});
