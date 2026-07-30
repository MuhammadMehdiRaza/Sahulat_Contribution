import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { useApp } from '../state';
import { colors, radius } from '../theme';
import { Badge, Btn, Card, Field, Header, Row, Screen } from '../ui';

export default function Bidding() {
  const { params, navigate, goBack, showToast, coords, t, n } = useApp();
  const worker = params.worker;
  const workerId = worker?.user_id || worker?.worker_id;
  const [target, setTarget] = useState(String(params.job?.budget_target || 2000));
  const [max, setMax] = useState(String(params.job?.budget_max || 3000));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [jobId, setJobId] = useState<string | undefined>(params.job?.id);

  const run = async () => {
    setLoading(true);
    try {
      let jid = jobId;
      if (!jid) {
        const cat = (worker?.skills && worker.skills[0]) || 'plumber';
        const job = await api.createJob({ category: cat, description: 'AI-negotiated job', lat: coords.lat, lng: coords.lng,
          address: 'My location', budget_target: Number(target), budget_max: Number(max) });
        jid = job.id; setJobId(job.id);
      }
      const r = await api.startBid({
        job_id: jid, worker_id: workerId,
        hirer_target: Number(target), hirer_max: Number(max),
        worker_min: worker?.rate_min ?? 1500, worker_target: worker?.rate_target ?? 2500,
      });
      setResult(r);
    } catch (e: any) { showToast(e.message); } finally { setLoading(false); }
  };

  useEffect(() => { if (params.autorun) run(); }, []);

  const proceed = () => navigate('bookingPayment', {
    worker, job: { id: jobId }, agreed_price: result.final_price, session_id: result.id,
  });

  const discussChat = async () => {
    try {
      const th = await api.createThread({ peer_id: workerId, job_id: jobId });
      navigate('chat', { threadId: th.id, peerName: worker?.full_name });
    } catch (e: any) { showToast(e.message); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={t('aiNegotiation')} subtitle={t('withName', { name: worker?.full_name || t('worker') })} onBack={goBack} />
      <Screen>
        <Card>
          <Text style={st.explain}>{t('bidExplain')}</Text>
          <Row style={{ gap: 12, marginTop: 12 }}>
            <View style={{ flex: 1 }}><Field label={t('yourTarget')} value={target} onChangeText={setTarget} keyboardType="number-pad" /></View>
            <View style={{ flex: 1 }}><Field label={t('yourMax')} value={max} onChangeText={setMax} keyboardType="number-pad" /></View>
          </Row>
          <Btn title={result ? t('rerun') : t('startNegotiation')} onPress={run} loading={loading} />
        </Card>

        {result && (
          <>
            <View style={[st.outcome, { backgroundColor: result.status === 'agreed' ? colors.green50 : '#fef2f2', borderColor: result.status === 'agreed' ? '#bbf7d0' : '#fecaca' }]}>
              <Text style={[st.outcomeT, { color: result.status === 'agreed' ? colors.green700 : colors.redDark }]}>
                {result.status === 'agreed' ? t('agreedAt', { price: n(result.final_price) }) : t('noAgreementRounds')}
              </Text>
              <Text style={st.outcomeS}>{result.status === 'agreed' ? t('settledMid') : t('adjustManual')}</Text>
            </View>

            <Text style={st.roundsH}>{t('negotiationRounds')}</Text>
            {result.rounds.map((r: any) => (
              <Card key={r.round_no} style={{ padding: 12 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={st.round}>{t('round')} {n(r.round_no)}</Text>
                  {r.converged ? <Badge label="✓" /> : <Text style={st.gap}>Δ PKR {n(r.gap)}</Text>}
                </Row>
                <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
                  <Text style={st.offer}>{t('hirerLbl')}: <Text style={{ fontWeight: '800' }}>PKR {n(r.hirer_offer)}</Text></Text>
                  <Text style={st.offer}>{t('workerLbl')}: <Text style={{ fontWeight: '800' }}>PKR {n(r.worker_offer)}</Text></Text>
                </Row>
              </Card>
            ))}

            {result.status === 'agreed'
              ? <Btn title={t('continuePay', { price: n(result.final_price) })} onPress={proceed} style={{ marginTop: 8 }} />
              : <Btn title={t('bookManual')} variant="outline" style={{ marginTop: 8 }}
                  onPress={() => navigate('bookingPayment', { worker, job: { id: jobId }, agreed_price: Number(max) })} />}

            <View style={st.discuss}>
              <Text style={st.discussTxt}>{t('discussPriceHint')}</Text>
            </View>
            <Btn title={t('discussChat')} variant="outline" style={{ marginTop: 10 }} onPress={discussChat} />
          </>
        )}
      </Screen>
    </View>
  );
}

const st = StyleSheet.create({
  explain: { color: colors.sub, lineHeight: 20, fontSize: 13 },
  outcome: { borderWidth: 1, borderRadius: radius.lg, padding: 16, marginBottom: 8 },
  outcomeT: { fontSize: 18, fontWeight: '800' },
  outcomeS: { color: colors.sub, marginTop: 4, fontSize: 13 },
  roundsH: { fontSize: 15, fontWeight: '800', color: colors.text, marginVertical: 10 },
  round: { fontWeight: '700', color: colors.text },
  gap: { color: colors.sub, fontSize: 12 },
  offer: { color: colors.text, fontSize: 13 },
  discuss: { backgroundColor: '#eff6ff', borderRadius: radius.md, padding: 12, marginTop: 14 },
  discussTxt: { color: '#1d4ed8', fontSize: 12, lineHeight: 18 },
});
