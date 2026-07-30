import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import BottomNav from '../BottomNav';
import { relLabel } from '../dates';
import { useApp } from '../state';
import { colors } from '../theme';
import { Card, Header, Row, Screen } from '../ui';

export default function Notifications() {
  const { goBack, navigate, t } = useApp();
  const [items, setItems] = useState<any[] | null>(null);
  const load = async () => { try { setItems(await api.notifications()); } catch { setItems([]); } };
  useEffect(() => { load(); }, []);

  // Tapping a notification marks it read and jumps to the relevant screen.
  const open = async (note: any) => {
    try { if (!note.read_at) await api.readNotification(note.id); } catch {}
    const data = note.data || {};
    if (note.type === 'job_interest' && data.job_id) navigate('jobApplicants', { job: { id: data.job_id } });
    else if (note.type === 'job_posted') navigate('myJobs');
    else if ((note.type === 'price_offer' || note.type === 'price_locked') && data.thread_id) navigate('chat', { threadId: data.thread_id });
    else if (['booking_offer', 'booking_confirmed', 'booking_completed', 'booking_cancelled',
              'emergency_dispatch', 'bid_update', 'rating_received'].includes(note.type)) navigate('bookings');
    else load();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={t('notificationsTitle')} onBack={goBack} />
      <Screen>
        {items === null ? null : items.length === 0
          ? <Card><Text style={{ color: colors.sub }}>{t('noNotifications')}</Text></Card>
          : items.map((n) => (
            <Card key={n.id} onPress={() => open(n)} style={n.read_at ? { opacity: 0.6 } : null}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={st.title}>{n.title}</Text>
                {!n.read_at ? <View style={st.dot} /> : null}
              </Row>
              <Text style={st.body}>{n.body}</Text>
              {n.created_at ? <Text style={st.time}>{relLabel(n.created_at, t('today'), t('yesterday'))}</Text> : null}
            </Card>
          ))}
      </Screen>
      <BottomNav active="notifications" />
    </View>
  );
}

const st = StyleSheet.create({
  title: { fontWeight: '700', color: colors.text },
  body: { color: colors.sub, marginTop: 4, fontSize: 13 },
  time: { color: colors.muted, fontSize: 11, marginTop: 6 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.red },
});
