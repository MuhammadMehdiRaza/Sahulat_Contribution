import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { useApp } from '../state';
import { colors } from '../theme';
import { Badge, Btn, Card, Header, Row, Screen } from '../ui';
import { LAT, LNG } from './Home';

export default function ServiceListing() {
  const { params, navigate, goBack, t, n } = useApp();
  const category = params.category;
  const [workers, setWorkers] = useState<any[] | null>(null);

  useEffect(() => {
    (async () => {
      try { setWorkers(await api.matchWorkers(LAT, LNG, category, 15)); } catch { setWorkers([]); }
    })();
  }, [category]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={t('workersNear', { cat: t('svc_' + category) })} subtitle={t('within15')} onBack={goBack} />
      <Screen>
        <Btn title={t('postJobInstead')} variant="outline" onPress={() => navigate('postJob', { category })} style={{ marginBottom: 14 }} />
        {workers === null ? <ActivityIndicator color={colors.green} />
          : workers.length === 0 ? (
            <Card><Text style={{ color: colors.sub }}>{t('noWorkersCat', { cat: t('svc_' + category) })}</Text></Card>
          ) : workers.map((w) => (
            <Card key={w.worker_id} onPress={() => navigate('workerProfile', { worker: w })}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={st.name}>{w.full_name}</Text>
                <Badge label={`${n(w.distance_km)} km`} bg="#e0f2fe" color="#0369a1" />
              </Row>
              <Text style={st.skill}>{(w.skills || []).map((k: string) => t('svc_' + k)).join(', ')}</Text>
              <Row style={{ gap: 14, marginTop: 6 }}>
                <Text style={st.meta}>⭐ {n(Number(w.rating_avg).toFixed(1))}</Text>
                <Text style={st.meta}>✅ {n(w.jobs_completed)} {t('jobsDone')}</Text>
                <Badge label={w.availability === 'available' ? t('available') : t('busy')} />
              </Row>
            </Card>
          ))}
      </Screen>
    </View>
  );
}

const st = StyleSheet.create({
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  skill: { color: colors.sub, marginTop: 2 },
  meta: { color: colors.sub, fontSize: 12 },
});
