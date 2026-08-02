import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from '../Icon';
import { api } from '../api';
import { fmtDate } from '../dates';
import { useApp } from '../state';
import { colors } from '../theme';
import { Badge, Btn, Card, Header, Loading, Row, Screen } from '../ui';

export default function WorkerProfile() {
  const { params, navigate, goBack, showToast, t, n } = useApp();
  const id = params.worker?.worker_id || params.worker?.user_id;
  const [w, setW] = useState<any | null>(null);
  const [reviews, setReviews] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try { setW(await api.publicWorker(id)); } catch (e: any) { showToast(e.message); }
      try { setReviews(await api.workerReviews(id)); } catch {}
    })();
  }, [id]);
  if (!w) return <View style={{ flex: 1 }}><Header title={t('worker')} onBack={goBack} /><Loading /></View>;
  const written = reviews.filter((r) => (r.comment || '').trim());
  const jobBooked = ['booked', 'completed', 'cancelled'].includes(params.job?.status);
  const available = w.availability === 'available';  // offline/busy workers → message only

  const badges = Object.entries(w.badges || {}).filter(([, v]) => v).map(([k]) => k.toUpperCase());
  const message = async () => {
    try { const th = await api.createThread({ peer_id: id, job_id: params.job?.id }); navigate('chat', { threadId: th.id, peerName: w.full_name }); }
    catch (e: any) { showToast(e.message); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={w.full_name} subtitle={(w.skills || []).map((k: string) => t('svc_' + k)).join(', ')} onBack={goBack} />
      <Screen>
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={st.big}><Icon name="star" size={20} color={colors.amber} /> {n(Number(w.rating_avg).toFixed(1))} <Text style={st.sub}>({n(w.rating_count)})</Text></Text>
            <Badge label={w.availability === 'available' ? t('available') : w.availability} />
          </Row>
          <Row style={{ gap: 18, marginTop: 10 }}>
            <View><Text style={st.stat}>{n(w.jobs_completed)}</Text><Text style={st.statL}>{t('jobsDone')}</Text></View>
            <View><Text style={st.stat}>PKR {n(w.rate_min ?? '—')}–{n(w.rate_target ?? '—')}</Text><Text style={st.statL}>{t('rateBand')}</Text></View>
          </Row>
          {w.bio ? <Text style={st.bio}>{w.bio}</Text> : null}
          <Row style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {badges.length ? badges.map((b) => <Badge key={b} label={<><Icon name="check" size={12} color={colors.green700} /> {b}</>} bg="#dcfce7" color={colors.green700} />)
              : <Text style={st.sub}>{t('noBadges')}</Text>}
          </Row>
        </Card>

        {jobBooked ? (
          <View style={st.bookedNote}><Text style={st.bookedNoteTxt}>{t('alreadyBookedNote')}</Text></View>
        ) : available ? (
          <>
            <Btn title={t('negotiate')} onPress={() => navigate('bidding', { worker: w, job: params.job })} />
            <Btn title={t('bookNow')} variant="outline" style={{ marginTop: 10 }}
              onPress={() => navigate('bookingPayment', { worker: w, job: params.job, agreed_price: w.rate_target || 2000 })} />
          </>
        ) : (
          <View style={st.busyNote}><Text style={st.busyNoteTxt}>{t('workerBusyNote')}</Text></View>
        )}
        <Btn title={t('message')} variant="outline" style={{ marginTop: 10 }} onPress={message} />

        <Text style={st.reviewsH}>{t('reviewsTitle')}</Text>
        {written.length === 0 ? (
          <Text style={st.sub}>{t('noReviews')}</Text>
        ) : written.map((r) => (
          <Card key={r.id} style={{ padding: 12 }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={st.reviewer} numberOfLines={1}>{r.rater_name}</Text>
              <Text style={st.stars}>{Array.from({ length: r.stars }).map((_, i) => <Icon key={i} name="star" size={12} color={colors.amber} />)}</Text>
            </Row>
            {r.created_at ? <Text style={st.reviewDate}>{fmtDate(r.created_at)}</Text> : null}
            <Text style={st.reviewTxt}>{r.comment}</Text>
          </Card>
        ))}
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
  reviewsH: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 22, marginBottom: 12 },
  reviewer: { fontWeight: '700', color: colors.text, fontSize: 13, flex: 1, marginRight: 8 },
  stars: { fontSize: 12 },
  reviewDate: { color: colors.muted, fontSize: 11, marginTop: 2 },
  reviewTxt: { color: colors.sub, marginTop: 6, lineHeight: 19 },
  bookedNote: { backgroundColor: '#ede9fe', borderColor: '#ddd6fe', borderWidth: 1, borderRadius: 12, padding: 14 },
  bookedNoteTxt: { color: '#6d28d9', fontWeight: '600', lineHeight: 19 },
  busyNote: { backgroundColor: '#fffbeb', borderColor: '#fde68a', borderWidth: 1, borderRadius: 12, padding: 14 },
  busyNoteTxt: { color: '#92400e', fontWeight: '600', lineHeight: 19 },
});

