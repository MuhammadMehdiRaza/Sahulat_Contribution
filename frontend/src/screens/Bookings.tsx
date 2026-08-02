import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import BottomNav from '../BottomNav';
import Icon from '../Icon';
import { fmtDate, isPast } from '../dates';
import { useApp } from '../state';
import { colors } from '../theme';
import { Badge, Card, EmptyState, Header, Row, Screen } from '../ui';

const ACTIVE = ['pending_approval', 'confirmed', 'in_progress'];

function statusChip(status: string, t: any) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    pending_approval: { label: t('stPending'), bg: '#fef3c7', fg: '#92400e' },
    confirmed: { label: t('stConfirmed'), bg: '#e0f2fe', fg: '#0369a1' },
    in_progress: { label: t('stInProgress'), bg: '#dbeafe', fg: '#1d4ed8' },
    completed: { label: t('stCompleted'), bg: '#dcfce7', fg: colors.green700 },
    cancelled: { label: t('cancel'), bg: '#fee2e2', fg: colors.redDark },
  };
  return map[status] || { label: status, bg: '#f1f5f9', fg: colors.sub };
}

export default function Bookings() {
  const { user, navigate, t, n } = useApp();
  const [items, setItems] = useState<any[] | null>(null);
  const load = async () => { try { setItems(await api.listBookings()); } catch { setItems([]); } };
  useEffect(() => { load(); }, []);

  const isWorker = user?.role === 'worker';
  const active = (items || []).filter((b) => ACTIVE.includes(b.status));
  const past = (items || []).filter((b) => !ACTIVE.includes(b.status));

  const card = (b: any) => {
    const s = statusChip(b.status, t);
    const peer = isWorker ? b.hirer_name : b.worker_name;
    return (
      <Card key={b.id} onPress={() => navigate('bookingDetail', { booking: b })}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={st.cat}>{b.category ? t('svc_' + b.category) : t('navBookings')}</Text>
          <Badge label={s.label} bg={s.bg} color={s.fg} />
        </Row>
        {peer ? <Text style={st.peer}>{t('withPeer', { name: peer })}</Text> : null}
        {b.created_at ? <Text style={st.date}><Icon name="calendar" size={12} color={colors.muted} /> {fmtDate(b.created_at)}</Text> : null}
        {b.deadline && ACTIVE.includes(b.status) ? (
          <Text style={[st.date, isPast(b.deadline) && { color: colors.redDark, fontWeight: '700' }]}>
            <Icon name="time" size={12} color={isPast(b.deadline) ? colors.redDark : colors.muted} /> {isPast(b.deadline) ? t('overdue') : t('dueBy', { date: fmtDate(b.deadline) })}
          </Text>
        ) : null}
        <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <Text style={st.price}>PKR {n(b.agreed_price)}</Text>
          <Text style={st.link}>{t('viewStatus')}</Text>
        </Row>
      </Card>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={t('navBookings')} subtitle={isWorker ? t('bookingsTitleW') : t('bookingsTitleH')} />
      <Screen>
        {items === null ? null : items.length === 0 ? (
          <EmptyState icon={<Icon name="bookings" size={44} color={colors.muted} />} title={t('noBookings')} />
        ) : (
          <>
            {active.length > 0 && <Text style={st.section}>{t('bookingsActive')}</Text>}
            {active.map(card)}
            {past.length > 0 && <Text style={st.section}>{t('bookingsPast')}</Text>}
            {past.map(card)}
          </>
        )}
      </Screen>
      <BottomNav active="bookings" />
    </View>
  );
}

const st = StyleSheet.create({
  section: { fontSize: 14, fontWeight: '800', color: colors.sub, marginTop: 10, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  cat: { fontSize: 16, fontWeight: '800', color: colors.text },
  peer: { color: colors.sub, marginTop: 3 },
  date: { color: colors.muted, fontSize: 12, marginTop: 4 },
  price: { fontSize: 17, fontWeight: '800', color: colors.text },
  link: { color: colors.green, fontWeight: '700', fontSize: 13 },
});
