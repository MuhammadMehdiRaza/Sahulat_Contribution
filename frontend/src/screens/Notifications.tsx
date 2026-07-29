import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import BottomNav from '../BottomNav';
import { useApp } from '../state';
import { colors } from '../theme';
import { Card, Header, Row, Screen } from '../ui';

export default function Notifications() {
  const { goBack, t } = useApp();
  const [items, setItems] = useState<any[] | null>(null);
  const load = async () => { try { setItems(await api.notifications()); } catch { setItems([]); } };
  useEffect(() => { load(); }, []);
  const read = async (id: string) => { try { await api.readNotification(id); load(); } catch {} };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={t('notificationsTitle')} onBack={goBack} />
      <Screen>
        {items === null ? null : items.length === 0
          ? <Card><Text style={{ color: colors.sub }}>{t('noNotifications')}</Text></Card>
          : items.map((n) => (
            <Card key={n.id} onPress={() => read(n.id)} style={n.read_at ? { opacity: 0.6 } : null}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={st.title}>{n.title}</Text>
                {!n.read_at ? <View style={st.dot} /> : null}
              </Row>
              <Text style={st.body}>{n.body}</Text>
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
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.red },
});
