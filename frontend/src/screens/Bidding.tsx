import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { useApp } from '../state';
import { colors } from '../theme';
import { Header, Screen } from '../ui';

export default function Bidding() {
  const { params, navigate, goBack, showToast, coords, t } = useApp();
  const worker = params.worker;
  const workerId = worker?.user_id || worker?.worker_id || worker?.id;

  useEffect(() => {
    (async () => {
      try {
        let jid = params.job?.id;
        if (!jid && workerId) {
          const cat = (worker?.skills && worker.skills[0]) || 'plumber';
          const job = await api.createJob({
            category: cat,
            description: 'AI-negotiated job',
            lat: coords.lat,
            lng: coords.lng,
            address: 'My location',
            budget_target: params.job?.budget_target || 2000,
            budget_max: params.job?.budget_max || 3000,
          });
          jid = job.id;
        }

        if (workerId) {
          const th = await api.createThread({ peer_id: workerId, job_id: jid });
          navigate('chat', {
            threadId: th.id,
            peerName: worker?.full_name || t('worker'),
            autoAi: true,
            hirer_target: params.job?.budget_target || 2000,
            hirer_max: params.job?.budget_max || 3000,
          });
        } else {
          goBack();
        }
      } catch (e: any) {
        showToast(e.message);
        goBack();
      }
    })();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={t('aiNegotiation')} subtitle={t('withName', { name: worker?.full_name || t('worker') })} onBack={goBack} />
      <Screen style={st.center}>
        <ActivityIndicator size="large" color={colors.green} />
        <Text style={st.loadingTxt}>Opening AI Negotiation in Chat... 🤖</Text>
      </Screen>
    </View>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, minHeight: 300 },
  loadingTxt: { marginTop: 16, fontSize: 15, fontWeight: '700', color: colors.text, textAlign: 'center' },
});
