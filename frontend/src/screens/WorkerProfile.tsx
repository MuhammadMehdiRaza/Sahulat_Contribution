import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { useApp } from '../state';
import { colors } from '../theme';
import { Badge, Btn, Card, Header, Loading, Row, Screen } from '../ui';

export default function WorkerProfile() {
  const { params, navigate, goBack, showToast, t, n } = useApp();
  const id = params.worker?.worker_id || params.worker?.user_id;
  const [w, setW] = useState<any | null>(null);

  useEffect(() => { (async () => { try { setW(await api.publicWorker(id)); } catch (e: any) { showToast(e.message); } })(); }, [id]);
  if (!w) return <View style={{ flex: 1 }}><Header title={t('worker')} onBack={goBack} /><Loading /></View>;

  const badges = Object.entries(w.badges || {}).filter(([, v]) => v).map(([k]) => k.toUpperCase());
  const message = async () => {
    try { const th = await api.createThread({ peer_id: id }); navigate('chat', { threadId: th.id, peerName: w.full_name }); }
    catch (e: any) { showToast(e.message); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={w.full_name} subtitle={(w.skills || []).map((k: string) => t('svc_' + k)).join(', ')} onBack={goBack} />
      <Screen>
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={st.big}>⭐ {n(Number(w.rating_avg).toFixed(1))} <Text style={st.sub}>({n(w.rating_count)})</Text></Text>
            <Badge label={w.availability === 'available' ? t('available') : w.availability} />
          </Row>
          <Row style={{ gap: 18, marginTop: 10 }}>
            <View><Text style={st.stat}>{n(w.jobs_completed)}</Text><Text style={st.statL}>{t('jobsDone')}</Text></View>
            <View><Text style={st.stat}>PKR {n(w.rate_min ?? '—')}–{n(w.rate_target ?? '—')}</Text><Text style={st.statL}>{t('rateBand')}</Text></View>
          </Row>
          {w.bio ? <Text style={st.bio}>{w.bio}</Text> : null}
          <Row style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {badges.length ? badges.map((b) => <Badge key={b} label={`✓ ${b}`} bg="#dcfce7" color={colors.green700} />)
              : <Text style={st.sub}>{t('noBadges')}</Text>}
          </Row>
        </Card>

        <Btn title={t('negotiate')} onPress={() => navigate('bidding', { worker: w, job: params.job })} />
        <Btn title={t('bookNow')} variant="outline" style={{ marginTop: 10 }}
          onPress={() => navigate('bookingPayment', { worker: w, job: params.job, agreed_price: w.rate_target || 2000 })} />
        <Btn title={t('message')} variant="outline" style={{ marginTop: 10 }} onPress={message} />
      </Screen>
    </View>
  );
}

const st = StyleSheet.create({
  big: { fontSize: 20, fontWeight: '800', color: colors.text },
  sub: { color: colors.sub, fontWeight: '400', fontSize: 13 },
  stat: { fontSize: 16, fontWeight: '800', color: colors.green700 },
  statL: { color: colors.sub, fontSize: 12 },
  bio: { color: colors.sub, marginTop: 12, lineHeight: 20 },
});
