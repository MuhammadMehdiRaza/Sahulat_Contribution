import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon, { IconName } from './Icon';
import { useApp } from './state';
import { colors } from './theme';

export default function BottomNav({ active }: { active: string }) {
  const { user, navigate, t } = useApp();
  const items: { k: string; i: IconName; l: string }[] = user?.role === 'worker'
    ? [{ k: 'workerDashboard', i: 'home', l: t('navHome') }, { k: 'bookings', i: 'bookings', l: t('navJobs') },
       { k: 'chat', i: 'chat', l: t('navChat') }, { k: 'notifications', i: 'bell', l: t('navAlerts') }, { k: 'settings', i: 'settings', l: t('navSettings') }]
    : [{ k: 'home', i: 'home', l: t('navHome') }, { k: 'postJob', i: 'add', l: t('navPost') },
       { k: 'bookings', i: 'bookings', l: t('navBookings') }, { k: 'chat', i: 'chat', l: t('navChat') }, { k: 'settings', i: 'settings', l: t('navSettings') }];
  return (
    <View style={st.wrap}>
      {items.map((it) => {
        const on = active === it.k;
        const name = (on ? it.i : `${it.i}O`) as IconName;   // filled when active, outline when not
        return (
          <TouchableOpacity key={it.k} style={st.item} onPress={() => navigate(it.k)}>
            <Icon name={name} size={22} color={on ? colors.green : colors.muted} />
            <Text style={[st.lbl, { color: on ? colors.green : colors.muted }]}>{it.l}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row',
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 8, paddingBottom: 12 },
  item: { flex: 1, alignItems: 'center', gap: 3 },
  lbl: { fontSize: 11, fontWeight: '600' },
});
