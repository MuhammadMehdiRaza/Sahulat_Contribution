import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useApp } from './state';
import { colors } from './theme';

export default function BottomNav({ active }: { active: string }) {
  const { user, navigate, t } = useApp();
  const items = user?.role === 'worker'
    ? [{ k: 'workerDashboard', i: '🏠', l: t('navHome') }, { k: 'bookings', i: '📋', l: t('navJobs') },
       { k: 'chat', i: '💬', l: t('navChat') }, { k: 'notifications', i: '🔔', l: t('navAlerts') }, { k: 'settings', i: '⚙️', l: t('navSettings') }]
    : [{ k: 'home', i: '🏠', l: t('navHome') }, { k: 'postJob', i: '➕', l: t('navPost') },
       { k: 'bookings', i: '📋', l: t('navBookings') }, { k: 'chat', i: '💬', l: t('navChat') }, { k: 'settings', i: '⚙️', l: t('navSettings') }];
  return (
    <View style={st.wrap}>
      {items.map((it) => (
        <TouchableOpacity key={it.k} style={st.item} onPress={() => navigate(it.k)}>
          <Text style={st.icon}>{it.i}</Text>
          <Text style={[st.lbl, { color: active === it.k ? colors.green : colors.muted }]}>{it.l}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row',
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 8, paddingBottom: 12 },
  item: { flex: 1, alignItems: 'center', gap: 2 },
  icon: { fontSize: 20 },
  lbl: { fontSize: 11, fontWeight: '600' },
});
