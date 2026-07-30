import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { api } from '../api';
import BottomNav from '../BottomNav';
import { useApp } from '../state';
import { colors } from '../theme';
import { Badge, Btn, Card, Header, LocationBanner, RadiusPicker, Row, Screen, TaskBanner } from '../ui';

export default function WorkerDashboard() {
  const { user, navigate, showToast, coords, t, n } = useApp();
  const [profile, setProfile] = useState<any | null>(null);
  const [kyc, setKyc] = useState<any | null>(null);
  const [wallet, setWallet] = useState<any | null>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [radius, setRadius] = useState(15);
  const [pending, setPending] = useState(0);
  const available = profile?.availability === 'available';
  const verified = kyc?.badges?.cnic;

  const load = async () => {
    try { setProfile(await api.myProfile()); } catch {}
    try { setKyc(await api.kycStatus()); } catch {}
    try { setWallet(await api.wallet()); } catch {}
    try {
      const bs = await api.listBookings();
      setPending(bs.filter((b: any) => ['pending_approval', 'confirmed', 'in_progress'].includes(b.status)).length);
    } catch {}
  };
  const loadJobs = async () => { try { setJobs(await api.nearbyJobs(coords.lat, coords.lng, radius)); } catch {} };
  useEffect(() => { load(); }, []);
  useEffect(() => { loadJobs(); }, [radius, coords.lat, coords.lng]);

  const toggle = async (val: boolean) => {
    try {
      await api.setAvailability(val ? 'available' : 'offline');
      if (val) await api.recordLocation(coords.lat, coords.lng);
      setProfile((p: any) => ({ ...p, availability: val ? 'available' : 'offline' }));
      showToast(val ? t('nowAvailable') : t('nowOffline'));
    } catch (e: any) { showToast(e.message); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={t('dashGreeting', { name: user?.full_name?.split(' ')[0] || t('worker') })} subtitle={t('workerDash')} />
      <Screen>
        <LocationBanner />
        {/* Task-driven banners: the worker sees exactly what to do next */}
        {!verified && <TaskBanner icon="🪪" tone="amber" title={t('bannerKycTitle')} subtitle={t('bannerKycSub')} action={t('confirm')} onAction={() => navigate('kyc')} />}
        {verified && !available && <TaskBanner icon="📡" tone="blue" title={t('bannerOfflineTitle')} subtitle={t('bannerOfflineSub')} action={t('goOnline')} onAction={() => toggle(true)} />}
        {pending > 0 && <TaskBanner icon="📋" tone="green" title={t('bannerJobsTitle', { n: n(pending) })} subtitle={t('bannerJobsSub')} action={t('reviewLbl')} onAction={() => navigate('bookings')} />}

        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <Text style={st.availT}>{t('availabilityLbl')}</Text>
              <Text style={st.availS}>{available ? t('availForJobs') : t('youAreOffline')}</Text>
            </View>
            <Switch value={available} onValueChange={toggle} trackColor={{ true: colors.green }} />
          </Row>
        </Card>

        <Row style={{ gap: 12 }}>
          <Card style={{ flex: 1 }}>
            <Text style={st.cardH}>{t('identityKyc')}</Text>
            <Badge label={verified ? `✓ ${t('verified')}` : (kyc?.status || t('pending'))} style={{ marginTop: 8 }}
              bg={verified ? '#dcfce7' : '#fef3c7'} color={verified ? colors.green700 : '#92400e'} />
          </Card>
          <Card style={{ flex: 1 }}>
            <Text style={st.cardH}>{t('walletLbl')}</Text>
            <Text style={st.balance}>PKR {n(wallet?.balance ?? 0)}</Text>
          </Card>
        </Row>

        <Text style={st.section}>{t('nearbyJobsLbl')}</Text>
        <RadiusPicker value={radius} onChange={setRadius} />
        {jobs.length === 0 ? <Card><Text style={{ color: colors.sub }}>{t('noJobsNearby')}</Text></Card>
          : jobs.map((j) => (
            <Card key={j.id} onPress={() => navigate('jobDetail', { job: j })}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={st.jobCat}>{t('svc_' + j.category)}</Text>
                <Badge label={`${n(j.distance_km)} km`} bg="#e0f2fe" color="#0369a1" />
              </Row>
              <Text style={{ color: colors.sub, marginTop: 4 }}>{j.description || ''}</Text>
              <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                <Text style={st.budget}>PKR {n(j.budget_target)}–{n(j.budget_max)}</Text>
                {j.my_interest ? <Badge label={t('interestSentBtn')} bg="#dcfce7" color={colors.green700} /> : null}
              </Row>
            </Card>
          ))}
        <Btn title={t('viewBookings')} variant="outline" style={{ marginTop: 6 }} onPress={() => navigate('bookings')} />
      </Screen>
      <BottomNav active="workerDashboard" />
    </View>
  );
}

const st = StyleSheet.create({
  availT: { fontWeight: '800', color: colors.text, fontSize: 16 },
  availS: { color: colors.sub, fontSize: 13, marginTop: 2 },
  cardH: { fontWeight: '800', color: colors.text, fontSize: 14 },
  balance: { fontSize: 22, fontWeight: '800', color: colors.green700, marginTop: 6 },
  section: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 18, marginBottom: 10 },
  jobCat: { fontWeight: '700', color: colors.text },
  budget: { color: colors.green700, fontWeight: '600', marginTop: 6, fontSize: 13 },
});
