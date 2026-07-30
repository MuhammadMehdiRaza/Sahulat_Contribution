import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../api';
import { useApp } from '../state';
import { colors, paymentMethods, radius } from '../theme';
import { Btn, Card, Header, Row, Screen } from '../ui';

export default function BookingPayment() {
  const { params, navigate, goBack, showToast, coords, t, n } = useApp();
  const worker = params.worker;
  const workerId = worker?.user_id || worker?.worker_id;
  const price = Number(params.agreed_price || worker?.rate_target || 2000);
  const fee = Math.round(price * 0.1 * 100) / 100;
  const [method, setMethod] = useState('escrow_easypaisa');
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => { api.wallet().then((w) => setBalance(w.balance)).catch(() => {}); }, []);
  const usesWallet = method !== 'cod';
  const insufficient = usesWallet && balance != null && balance < price;

  const confirm = async () => {
    setLoading(true);
    try {
      let jobId = params.job?.id;
      if (!jobId) {
        const cat = (worker?.skills && worker.skills[0]) || 'plumber';
        const job = await api.createJob({ category: cat, description: 'Direct booking', lat: coords.lat, lng: coords.lng,
          address: 'My location', budget_target: price, budget_max: price });
        jobId = job.id;
      }
      const booking = await api.createBooking({
        job_id: jobId, worker_id: workerId, agreed_price: price,
        payment_method: method, session_id: params.session_id,
      });
      showToast(t('bookingCreated'));
      navigate('bookings', { highlight: booking.id });
    } catch (e: any) {
      const msg = e.message || '';
      if (msg.toLowerCase().includes('already has a booking')) { showToast(t('bookingExists')); navigate('bookings'); }
      else if (msg.toLowerCase().includes('insufficient')) { showToast(t('insufficientWarn')); navigate('wallet'); }
      else showToast(msg);
    } finally { setLoading(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={t('confirmPay')} onBack={goBack} />
      <Screen>
        <Card>
          <Text style={st.h}>{t('bookingSummary')}</Text>
          <Row style={st.line}><Text style={st.k}>{t('workerRow')}</Text><Text style={st.v}>{worker?.full_name}</Text></Row>
          <Row style={st.line}><Text style={st.k}>{t('agreedPrice')}</Text><Text style={st.v}>PKR {n(price)}</Text></Row>
          <Row style={st.line}><Text style={st.k}>{t('platformFee')}</Text><Text style={st.v}>PKR {n(fee)}</Text></Row>
          <Row style={st.line}><Text style={st.k}>{t('workerReceives')}</Text><Text style={[st.v, { color: colors.green700 }]}>PKR {n(price - fee)}</Text></Row>
        </Card>

        <Text style={st.section}>{t('paymentMethod')}</Text>
        {paymentMethods.map((m) => (
          <TouchableOpacity key={m.key} onPress={() => setMethod(m.key)} style={[st.method, method === m.key && st.methodOn]}>
            <Text style={{ fontSize: 22 }}>{m.icon}</Text>
            <Text style={st.methodName}>{m.name}</Text>
            {method === m.key ? <Text style={st.tick}>✓</Text> : null}
          </TouchableOpacity>
        ))}
        <View style={st.info}>
          <Text style={st.infoTxt}>{method === 'cod' ? t('codInfo') : t('escrowInfo')}</Text>
        </View>

        {usesWallet ? (
          <Row style={[st.walletRow, insufficient && { borderColor: '#fecaca', backgroundColor: '#fef2f2' }]}>
            <Text style={{ fontSize: 18 }}>💳</Text>
            <Text style={st.walletTxt}>{t('paidFromWallet')} · {t('walletBalance')}: PKR {n(balance ?? 0)}</Text>
          </Row>
        ) : null}

        {insufficient ? (
          <>
            <Text style={st.warn}>{t('insufficientWarn')}</Text>
            <Btn title={t('addMoney')} onPress={() => navigate('wallet')} />
          </>
        ) : (
          <Btn title={t('confirmBookingBtn')} onPress={confirm} loading={loading} />
        )}
      </Screen>
    </View>
  );
}

const st = StyleSheet.create({
  h: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 10 },
  line: { justifyContent: 'space-between', marginBottom: 8 },
  k: { color: colors.sub }, v: { fontWeight: '700', color: colors.text },
  section: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 8, marginBottom: 10 },
  method: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderWidth: 2, borderColor: colors.border,
    borderRadius: radius.md, padding: 14, marginBottom: 10 },
  methodOn: { borderColor: colors.green, backgroundColor: colors.green50 },
  methodName: { fontWeight: '600', color: colors.text },
  tick: { marginStart: 'auto', color: colors.green, fontWeight: '800' },
  info: { backgroundColor: '#eff6ff', borderRadius: radius.md, padding: 12, marginBottom: 16 },
  infoTxt: { color: '#1d4ed8', fontSize: 12, lineHeight: 18 },
  walletRow: { gap: 10, backgroundColor: colors.green50, borderColor: '#bbf7d0', borderWidth: 1, borderRadius: radius.md, padding: 12, marginBottom: 12 },
  walletTxt: { color: colors.green700, fontWeight: '600', fontSize: 13, flex: 1 },
  warn: { color: colors.redDark, fontWeight: '600', fontSize: 13, marginBottom: 10, textAlign: 'center' },
});
