import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import Icon from '../Icon';
import { useApp } from '../state';
import { colors } from '../theme';
import { Badge, Btn, Card, Header, Row, Screen } from '../ui';

export default function ServiceListing() {
  const { params, navigate, goBack, showToast, coords, t, n } = useApp();
  const category = params.category;
  const justPosted = !!params.job;   // arrived here right after posting a job
  const [workers, setWorkers] = useState<any[] | null>(null);

  useEffect(() => {
    (async () => {
      try { setWorkers(await api.matchWorkers(coords.lat, coords.lng, category, 15)); } catch { setWorkers([]); }
    })();
  }, [category, coords.lat, coords.lng]);

  const startInChatNegotiation = async (w: any) => {
    try {
      const wid = w.worker_id || w.user_id || w.id;
      showToast('Opening AI Negotiation in Chat... 🤖');
      const th = await api.createThread({ peer_id: wid, job_id: params.job?.id });
      navigate('chat', { threadId: th.id, peerName: w.full_name, autoAi: true });
    } catch (e: any) { showToast(e.message); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={t('workersNear', { cat: t('svc_' + category) })} subtitle={t('within15')} onBack={goBack} />
      <Screen>
        {justPosted
          ? <Card style={{ backgroundColor: colors.green50, borderColor: '#bbf7d0' }}>
              <Text style={{ color: colors.green700, fontWeight: '700' }}>{t('jobLiveTitle')}</Text>
              <Text style={{ color: colors.sub, marginTop: 4, fontSize: 13 }}>{t('jobLiveSub')}</Text>
            </Card>
          : <Btn title={t('postJobInstead')} variant="outline" onPress={() => navigate('postJob', { category })} style={{ marginBottom: 14 }} />}
        {workers === null ? <ActivityIndicator color={colors.green} />
          : workers.length === 0 ? (
            <Card><Text style={{ color: colors.sub }}>{t(justPosted ? 'noWorkersPosted' : 'noWorkersCat', { cat: t('svc_' + category) })}</Text></Card>
          ) : workers.map((w) => (
            <Card key={w.worker_id} onPress={() => navigate('workerProfile', { worker: w, job: params.job })}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={st.name}>{w.full_name}</Text>
                <Badge label={`${n(w.distance_km)} km`} bg="#e0f2fe" color="#0369a1" />
              </Row>
              <Text style={st.skill}>{(w.skills || []).map((k: string) => t('svc_' + k)).join(', ')}</Text>
              <Row style={{ gap: 14, marginTop: 6 }}>
                <Text style={st.meta}><Icon name="star" size={12} color={colors.amber} /> {n(Number(w.rating_avg).toFixed(1))}</Text>
                <Text style={st.meta}><Icon name="verified" size={12} color={colors.green} /> {n(w.jobs_completed)} {t('jobsDone')}</Text>
                <Badge label={w.availability === 'available' ? t('available') : t('busy')} />
              </Row>
              <Btn title="🤖 Negotiate & Hire" style={{ marginTop: 10 }}
                onPress={() => startInChatNegotiation(w)} />
            </Card>
          ))}
      </Screen>
    </View>
  );
}

const st = StyleSheet.create({
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  skill: { color: colors.sub, marginTop: 2 },
  meta: { color: colors.sub, fontSize: 12 },
});
