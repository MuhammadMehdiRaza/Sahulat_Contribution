import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api';
import Icon from '../Icon';
import { endOfDayISO, fmtDateTime, isPast, parseUTC } from '../dates';
import { useApp } from '../state';
import { colors, radius } from '../theme';
import { Badge, Btn, Card, DatePickerField, Header, Loading, Row, Screen, StatusTimeline, TaskBanner } from '../ui';

const STEP_INDEX: Record<string, number> = { pending_approval: 0, confirmed: 1, in_progress: 2, completed: 3 };

// The current-status message: what's happening right now and what to do next.
function statusHint(b: any, isWorker: boolean, t: any) {
  const map: Record<string, { tone: string; text: string }> = isWorker
    ? {
        pending_approval: { tone: 'amber', text: t('nextWorkerConfirm') },
        confirmed: { tone: 'blue', text: t('nextWorkerStart') },
        in_progress: { tone: 'blue', text: t('nextWorkerComplete') },
        completed: { tone: 'green', text: t('nextHirerRate') },
      }
    : {
        pending_approval: { tone: 'amber', text: t('nextHirerWait') },
        confirmed: { tone: 'blue', text: b.payment_method === 'cod' ? t('nextHirerCod') : t('nextHirerProgress') },
        in_progress: { tone: 'blue', text: t('nextHirerProgress') },
        completed: { tone: 'green', text: t('nextHirerRate') },
      };
  return map[b.status] || null;
}

export default function BookingDetail() {
  const { params, navigate, goBack, showToast, user, t, n } = useApp();
  const [b, setB] = useState<any | null>(params.booking || null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const isWorker = user?.role === 'worker';

  const reload = async () => {
    const id = b?.id || params.bookingId;
    if (!id) return;
    try { setB(await api.getBooking(id)); } catch (e: any) { showToast(e.message); }
  };
  useEffect(() => { reload(); }, []);

  if (!b) return <View style={{ flex: 1 }}><Header title={t('bookingDetailTitle')} onBack={goBack} /><Loading /></View>;

  const act = async (fn: () => Promise<any>) => {
    setBusy(true);
    try { await fn(); await reload(); } catch (e: any) { showToast(e.message); } finally { setBusy(false); }
  };

  const peerName = isWorker ? b.hirer_name : b.worker_name;
  const hint = b.status === 'cancelled' ? null : statusHint(b, isWorker, t);
  const timelineSteps = [{ label: t('stPending') }, { label: t('stConfirmed') }, { label: t('stInProgress') }, { label: t('stCompleted') }];
  const statusLabel: Record<string, string> = {
    pending_approval: t('stPending'), confirmed: t('stConfirmed'), in_progress: t('stInProgress'),
    completed: t('stCompleted'), cancelled: t('cancel'),
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={t('bookingDetailTitle')} subtitle={b.category ? t('svc_' + b.category) : undefined} onBack={goBack} />
      <Screen>
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={st.price}>PKR {n(b.agreed_price)}</Text>
            <Badge label={statusLabel[b.status] || b.status}
              bg={b.status === 'cancelled' ? '#fee2e2' : b.status === 'completed' ? '#f1f5f9' : '#dcfce7'}
              color={b.status === 'cancelled' ? colors.redDark : b.status === 'completed' ? colors.sub : colors.green700} />
          </Row>
          {peerName ? <Text style={st.peer}>{t('withPeer', { name: peerName })}</Text> : null}
          <Row style={{ gap: 18, marginTop: 10, flexWrap: 'wrap' }}>
            <View><Text style={st.k}>{t('platformFee')}</Text><Text style={st.v}>PKR {n(b.platform_fee)}</Text></View>
            <View><Text style={st.k}>{t('paymentMethod')}</Text><Text style={st.v}>{b.payment_method.replace('_', ' ')}</Text></View>
          </Row>
          <View style={st.dates}>
            {b.created_at ? <Text style={st.dateLine}><Icon name="calendar" size={12} color={colors.sub} /> {t('bookedOn', { date: fmtDateTime(b.created_at) })}</Text> : null}
            {b.deadline ? (
              <Text style={[st.dateLine, isPast(b.deadline) && b.status !== 'completed' && { color: colors.redDark, fontWeight: '700' }]}>
                <Icon name="time" size={12} color={isPast(b.deadline) && b.status !== 'completed' ? colors.redDark : colors.sub} /> {isPast(b.deadline) && b.status !== 'completed' ? t('overdue') : t('dueBy', { date: fmtDateTime(b.deadline) })}
              </Text>
            ) : null}
            {b.started_at ? <Text style={st.dateLine}><Icon name="play" size={12} color={colors.sub} /> {t('startedOn', { date: fmtDateTime(b.started_at) })}</Text> : null}
            {b.completed_at ? <Text style={st.dateLine}><Icon name="verified" size={12} color={colors.green} /> {t('completedOn', { date: fmtDateTime(b.completed_at) })}</Text> : null}
          </View>
        </Card>

        {/* Customer can extend the deadline (calendar) while the booking is still active */}
        {!isWorker && b.deadline && ['pending_approval', 'confirmed', 'in_progress'].includes(b.status) ? (
          <Card>
            <Text style={st.extendH}>{t('extendDeadline')}</Text>
            <View style={{ marginTop: 10 }}>
              <DatePickerField
                value={parseUTC(b.deadline) || new Date()}
                minDate={new Date(Math.max(Date.now(), (parseUTC(b.deadline)?.getTime() || 0)) + 86400000)}
                onChange={(d) => act(() => api.extendDeadline(b.job_id, endOfDayISO(d)))} />
            </View>
          </Card>
        ) : null}

        <Text style={st.section}>{t('statusNow')}</Text>
        {b.status === 'cancelled'
          ? <Badge label={t('cancel')} bg="#fee2e2" color={colors.redDark} />
          : <StatusTimeline steps={timelineSteps} current={STEP_INDEX[b.status] ?? 0} />}
        {hint ? <View style={{ marginTop: 14 }}><TaskBanner icon="info" tone={hint.tone} title={hint.text} /></View> : null}

        {/* actions for the current status */}
        {isWorker && b.status === 'pending_approval' && <Btn title={t('confirmBooking')} onPress={() => act(() => api.confirmBooking(b.id))} loading={busy} style={{ marginTop: 6 }} />}
        {isWorker && b.status === 'confirmed' && <Btn title={t('startJob')} onPress={() => act(() => api.startBooking(b.id))} loading={busy} style={{ marginTop: 6 }} />}
        {isWorker && b.status === 'in_progress' && b.payment_method === 'cod' && (
          <View style={{ marginTop: 6 }}>
            <TextInput value={pin} onChangeText={setPin} placeholder={t('enterPin')} placeholderTextColor={colors.muted} style={st.pin} keyboardType="number-pad" />
            <Btn title={t('completePin')} onPress={() => act(() => api.completeBooking(b.id, pin))} loading={busy} />
          </View>
        )}
        {isWorker && b.status === 'in_progress' && b.payment_method !== 'cod' &&
          <Btn title={t('completeEscrow')} onPress={() => act(() => api.completeBooking(b.id))} loading={busy} style={{ marginTop: 6 }} />}

        {!isWorker && b.status === 'confirmed' && b.payment_method === 'cod' &&
          <Btn title={t('collectCod')} onPress={() => act(async () => { const r = await api.codCollectFee(b.id); showToast(t('releasePin', { pin: r.release_pin })); })} loading={busy} style={{ marginTop: 6 }} />}
        {b.status === 'completed' && (
          b.rated
            ? <View style={st.rated}><Text style={st.ratedTxt}>{t('youRated')} {Array.from({ length: b.my_rating || 0 }).map((_, i) => <Icon key={i} name="star" size={16} color={colors.amber} />)}</Text></View>
            : <Btn title={isWorker ? t('rateCustomerBtn') : t('rateWorkerBtn')} style={{ marginTop: 6 }}
                onPress={() => navigate('rating', isWorker ? { booking: b, rateeRole: 'hirer' } : { booking: b })} />
        )}

        {(b.status === 'pending_approval' || b.status === 'confirmed') &&
          <Btn title={t('cancel')} variant="outline" style={{ marginTop: 10 }} onPress={() => act(() => api.cancelBooking(b.id, 'cancelled by user'))} loading={busy} />}
      </Screen>
    </View>
  );
}

const st = StyleSheet.create({
  price: { fontSize: 22, fontWeight: '800', color: colors.text },
  peer: { color: colors.sub, marginTop: 4 },
  k: { color: colors.sub, fontSize: 12, marginBottom: 2 },
  v: { fontWeight: '700', color: colors.text, textTransform: 'capitalize' },
  section: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 18, marginBottom: 12 },
  pin: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10, outlineStyle: 'none' as any },
  dates: { marginTop: 12, gap: 4 },
  dateLine: { color: colors.sub, fontSize: 12 },
  extendH: { fontWeight: '800', color: colors.text, fontSize: 14 },
  rated: { backgroundColor: colors.green50, borderColor: '#bbf7d0', borderWidth: 1, borderRadius: radius.md, padding: 12, marginTop: 6 },
  ratedTxt: { color: colors.green700, fontWeight: '700' },
});
