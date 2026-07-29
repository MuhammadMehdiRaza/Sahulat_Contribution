import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api';
import BottomNav from '../BottomNav';
import { useApp } from '../state';
import { colors, radius } from '../theme';
import { Badge, Btn, Card, EmptyState, Header, Row, Screen, StatusTimeline, TaskBanner } from '../ui';

const STEP_INDEX: Record<string, number> = { pending_approval: 0, confirmed: 1, in_progress: 2, completed: 3 };

export default function Bookings() {
  const { user, navigate, showToast, t, n } = useApp();
  const [items, setItems] = useState<any[] | null>(null);
  const load = async () => { try { setItems(await api.listBookings()); } catch { setItems([]); } };
  useEffect(() => { load(); }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={t('navBookings')} subtitle={user?.role === 'worker' ? t('bookingsTitleW') : t('bookingsTitleH')} />
      <Screen>
        {items === null ? null : items.length === 0
          ? <EmptyState icon="📋" title={t('noBookings')} />
          : items.map((b) => <BookingCard key={b.id} b={b} role={user.role} reload={load} navigate={navigate} showToast={showToast} t={t} n={n} />)}
      </Screen>
      <BottomNav active="bookings" />
    </View>
  );
}

function nextStep(b: any, isWorker: boolean, t: any) {
  if (b.status === 'cancelled') return null;
  if (isWorker) {
    if (b.status === 'pending_approval') return { tone: 'amber', text: t('nextWorkerConfirm') };
    if (b.status === 'confirmed') return { tone: 'blue', text: t('nextWorkerStart') };
    if (b.status === 'in_progress') return { tone: 'blue', text: t('nextWorkerComplete') };
  } else {
    if (b.status === 'pending_approval') return { tone: 'amber', text: t('nextHirerWait') };
    if (b.status === 'confirmed') return b.payment_method === 'cod' ? { tone: 'amber', text: t('nextHirerCod') } : { tone: 'blue', text: t('nextHirerProgress') };
    if (b.status === 'in_progress') return { tone: 'blue', text: t('nextHirerProgress') };
    if (b.status === 'completed') return { tone: 'green', text: t('nextHirerRate') };
  }
  return null;
}

function BookingCard({ b, role, reload, navigate, showToast, t, n }: any) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const isWorker = role === 'worker';
  const act = async (fn: () => Promise<any>) => {
    setBusy(true);
    try { await fn(); await reload(); } catch (e: any) { showToast(e.message); } finally { setBusy(false); }
  };
  const hint = nextStep(b, isWorker, t);
  const timelineSteps = [{ label: t('stPending') }, { label: t('stConfirmed') }, { label: t('stInProgress') }, { label: t('stCompleted') }];

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <Text style={st.title}>PKR {n(b.agreed_price)}</Text>
        <Badge label={b.payment_method.replace('_', ' ')} bg="#f1f5f9" color={colors.sub} />
      </Row>

      {b.status === 'cancelled'
        ? <Badge label={t('cancel')} bg="#fee2e2" color={colors.redDark} />
        : <StatusTimeline steps={timelineSteps} current={STEP_INDEX[b.status] ?? 0} />}

      {hint ? <View style={{ marginTop: 14 }}><TaskBanner icon="ℹ️" tone={hint.tone} title={hint.text} /></View> : null}

      {isWorker && b.status === 'pending_approval' && <Btn title={t('confirmBooking')} onPress={() => act(() => api.confirmBooking(b.id))} loading={busy} />}
      {isWorker && b.status === 'confirmed' && <Btn title={t('startJob')} onPress={() => act(() => api.startBooking(b.id))} loading={busy} />}
      {isWorker && b.status === 'in_progress' && b.payment_method === 'cod' && (
        <View>
          <TextInput value={pin} onChangeText={setPin} placeholder={t('enterPin')} placeholderTextColor={colors.muted} style={st.pin} keyboardType="number-pad" />
          <Btn title={t('completePin')} onPress={() => act(() => api.completeBooking(b.id, pin))} loading={busy} />
        </View>
      )}
      {isWorker && b.status === 'in_progress' && b.payment_method !== 'cod' &&
        <Btn title={t('completeEscrow')} onPress={() => act(() => api.completeBooking(b.id))} loading={busy} />}

      {!isWorker && b.status === 'confirmed' && b.payment_method === 'cod' &&
        <Btn title={t('collectCod')} onPress={() => act(async () => { const r = await api.codCollectFee(b.id); showToast(t('releasePin', { pin: r.release_pin })); })} loading={busy} />}
      {!isWorker && b.status === 'completed' && <Btn title={t('rateWorkerBtn')} onPress={() => navigate('rating', { booking: b })} />}

      {(b.status === 'pending_approval' || b.status === 'confirmed') &&
        <Btn title={t('cancel')} variant="outline" style={{ marginTop: 10 }} onPress={() => act(() => api.cancelBooking(b.id, 'cancelled by user'))} loading={busy} />}
    </Card>
  );
}

const st = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  pin: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10, outlineStyle: 'none' as any },
});
