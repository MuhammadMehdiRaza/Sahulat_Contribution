import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../api';
import BottomNav from '../BottomNav';
import { useApp } from '../state';
import { colors, gradients, radius, services, shadow } from '../theme';
import { Badge, Card, LangToggle, LocationBanner, RadiusPicker, Row, Screen } from '../ui';

export default function Home() {
  const { navigate, showToast, coords, place, locating, t, n } = useApp();
  const [q, setQ] = useState('');
  const [workers, setWorkers] = useState<any[] | null>(null);
  const [radius, setRadius] = useState(15);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try { setWorkers(await api.matchWorkers(coords.lat, coords.lng, '', radius)); } catch { setWorkers([]); }
    })();
  }, [radius, coords.lat, coords.lng]);
  useEffect(() => { api.wallet().then((w) => setBalance(w.balance)).catch(() => {}); }, []);

  const search = async () => {
    if (!q.trim()) return;
    try {
      const r = await api.nlSearch({ query: q });
      if (r.category) navigate('serviceListing', { category: r.category });
      else showToast(t('searchHint'));
    } catch (e: any) { showToast(e.message); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen pad={false}>
        <LinearGradient colors={gradients.header as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[st.header, shadow.header]}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={st.hi}>{t('greeting')}</Text>
            <Row style={{ gap: 10 }}>
              <LangToggle light />
              <TouchableOpacity onPress={() => navigate('notifications')}><Text style={{ fontSize: 22 }}>🔔</Text></TouchableOpacity>
            </Row>
          </Row>
          <Row style={{ gap: 6, marginTop: 8 }}><Text style={{ color: '#fff' }}>📍</Text><Text style={st.city}>{locating ? t('locating') : place}</Text></Row>
          <Row style={st.search}>
            <Text style={{ fontSize: 16 }}>🔍</Text>
            <TextInput value={q} onChangeText={setQ} placeholder={t('searchPlaceholder')}
              placeholderTextColor={colors.muted} style={st.searchInput} onSubmitEditing={search} />
            <TouchableOpacity onPress={search}><Text style={{ color: colors.green, fontWeight: '700', fontSize: 18 }}>➜</Text></TouchableOpacity>
          </Row>
        </LinearGradient>

        <View style={{ padding: 16 }}>
          <LocationBanner />
          <View style={st.trust}>
            <Text style={{ fontSize: 24 }}>✅</Text>
            <View style={{ flex: 1 }}>
              <Text style={st.trustT}>{t('trustTitle')}</Text>
              <Text style={st.trustS}>{t('trustSub')}</Text>
            </View>
          </View>

          <Card onPress={() => navigate('wallet')} style={{ marginTop: 14 }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={st.myJobsT}>💳  {t('walletBalance')}</Text>
                <Text style={st.walletBal}>PKR {n(balance ?? 0)}</Text>
              </View>
              <Text style={st.addLink}>{t('addMoney')}</Text>
            </Row>
          </Card>

          <Card onPress={() => navigate('myJobs')} style={{ marginTop: 12 }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={st.myJobsT}>{t('myPostedJobsCard')}</Text>
                <Text style={st.myJobsS}>{t('myPostedJobsSub')}</Text>
              </View>
              <Text style={{ color: colors.green, fontWeight: '800', fontSize: 20 }}>›</Text>
            </Row>
          </Card>

          <Text style={st.h2}>{t('popularServices')}</Text>
          <View style={st.grid}>
            {services.map((sv) => (
              <TouchableOpacity key={sv.key} style={st.svc} onPress={() => navigate('serviceListing', { category: sv.key })}>
                <Text style={{ fontSize: 30 }}>{sv.icon}</Text>
                <Text style={st.svcName}>{t('svc_' + sv.key)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={st.h2}>{t('topWorkers')}</Text>
          <RadiusPicker value={radius} onChange={setRadius} />
          {workers === null ? <ActivityIndicator color={colors.green} />
            : workers.length === 0 ? (
              <Card><Text style={{ color: colors.sub }}>{t('noWorkersHome')}</Text></Card>
            ) : workers.map((w) => (
              <Card key={w.worker_id} onPress={() => navigate('workerProfile', { worker: w })}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={st.wName}>{w.full_name}</Text>
                  <Badge label={w.availability === 'available' ? t('available') : t('busy')} />
                </Row>
                <Text style={st.wSkill}>{(w.skills || []).map((k: string) => t('svc_' + k)).join(', ') || t('worker')}</Text>
                <Row style={{ gap: 14, marginTop: 6 }}>
                  <Text style={st.meta}>⭐ {n(Number(w.rating_avg).toFixed(1))}</Text>
                  <Text style={st.meta}>✅ {n(w.jobs_completed)} {t('jobsDone')}</Text>
                  <Text style={st.meta}>📍 {n(w.distance_km)} km</Text>
                </Row>
              </Card>
            ))}
        </View>
      </Screen>
      <BottomNav active="home" />
    </View>
  );
}

const st = StyleSheet.create({
  header: { paddingTop: 46, paddingHorizontal: 16, paddingBottom: 22, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  hi: { color: '#fff', fontSize: 19, fontWeight: '800' },
  city: { color: '#fff', fontWeight: '700', fontSize: 15 },
  search: { backgroundColor: '#fff', borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 4, marginTop: 12, gap: 8 },
  searchInput: { flex: 1, paddingVertical: 10, color: colors.text, outlineStyle: 'none' as any },
  trust: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.green50, borderColor: '#bbf7d0',
    borderWidth: 1, borderRadius: radius.md, padding: 14, marginTop: 14 },
  trustT: { fontWeight: '700', color: colors.green700 },
  trustS: { color: colors.sub, fontSize: 12 },
  myJobsT: { fontWeight: '800', color: colors.text, fontSize: 15 },
  myJobsS: { color: colors.sub, fontSize: 12, marginTop: 2 },
  walletBal: { color: colors.green700, fontSize: 20, fontWeight: '800', marginTop: 2 },
  addLink: { color: colors.green, fontWeight: '700', fontSize: 13 },
  h2: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 22, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  svc: { width: '31%', backgroundColor: '#fff', borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.border },
  svcName: { fontSize: 12, fontWeight: '600', color: colors.text },
  wName: { fontSize: 16, fontWeight: '700', color: colors.text },
  wSkill: { color: colors.sub, marginTop: 2 },
  meta: { color: colors.sub, fontSize: 12 },
});
