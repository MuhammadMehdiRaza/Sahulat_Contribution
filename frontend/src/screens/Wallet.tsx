import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../api';
import Icon, { IconName } from '../Icon';
import { fmtDateTime } from '../dates';
import { useApp } from '../state';
import { colors, radius } from '../theme';
import { Btn, Card, Header, Row, Screen } from '../ui';

const PROVIDERS = [
  { key: 'easypaisa', label: 'Easypaisa', icon: 'phone' },
  { key: 'jazzcash', label: 'JazzCash', icon: 'phone' },
];

export default function Wallet() {
  const { goBack, showToast, t, n } = useApp();
  const [wallet, setWallet] = useState<any | null>(null);
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState('');
  const [provider, setProvider] = useState('easypaisa');
  const [busy, setBusy] = useState(false);

  const load = async () => { try { setWallet(await api.wallet()); } catch (e: any) { showToast(e.message); } };
  useEffect(() => { load(); }, []);

  const topup = async (preset?: number) => {
    const val = preset ?? Number(amount);
    if (!val || val <= 0) { showToast(t('topupAmount')); return; }
    setBusy(true);
    try { await api.topupWallet(val, provider); setAmount(''); setAdding(false); showToast(t('topupDone')); await load(); }
    catch (e: any) { showToast(e.message); } finally { setBusy(false); }
  };
  const QUICK = [500, 1000, 2000, 5000];

  const txnLabel = (type: string, memo: string) =>
    ({ bonus: t('txn_bonus'), topup: t('txn_topup'), hold: t('txn_hold'), refund: t('txn_refund'), payout: t('txn_payout') } as any)[type] || memo || type;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={t('walletTitle')} onBack={goBack} />
      <Screen>
        <Card style={{ backgroundColor: colors.green700, borderColor: colors.green700 }}>
          <Text style={st.balLbl}>{t('walletBalance')}</Text>
          <Text style={st.bal}>PKR {n(wallet?.balance ?? 0)}</Text>
        </Card>

        {!adding ? (
          <Btn title={t('addMoney')} onPress={() => setAdding(true)} />
        ) : (
          <Card>
            <Text style={st.h}>{t('topupVia')}</Text>
            <Row style={{ gap: 10, marginBottom: 12 }}>
              {PROVIDERS.map((p) => (
                <TouchableOpacity key={p.key} onPress={() => setProvider(p.key)} style={[st.prov, provider === p.key && st.provOn]}>
                  <Icon name={p.icon as IconName} size={20} color={colors.text} />
                  <Text style={st.provTxt}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </Row>
            <Text style={st.quickLbl}>{t('quickAdd')}</Text>
            <View style={st.quickRow}>
              {QUICK.map((v) => (
                <TouchableOpacity key={v} onPress={() => topup(v)} disabled={busy} style={st.quick}>
                  <Text style={st.quickTxt}>+{n(v)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder={t('topupAmount')}
              placeholderTextColor={colors.muted} style={st.input} />
            <View style={st.note}><Text style={st.noteTxt}>{t('topupNote')}</Text></View>
            <Btn title={t('addMoney')} onPress={() => topup()} loading={busy} />
            <Btn title={t('cancel')} variant="outline" style={{ marginTop: 10 }} onPress={() => setAdding(false)} />
          </Card>
        )}

        <Text style={st.section}>{t('walletHistory')}</Text>
        {wallet == null ? null : (wallet.transactions || []).length === 0 ? (
          <Card><Text style={{ color: colors.sub }}>{t('noTxns')}</Text></Card>
        ) : (wallet.transactions || []).map((tx: any, i: number) => {
          const credit = tx.direction === 'credit';
          return (
            <Card key={i} style={{ paddingVertical: 12 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={st.txnT}>{txnLabel(tx.type, tx.memo)}</Text>
                  {tx.created_at ? <Text style={st.txnD}>{fmtDateTime(tx.created_at)}</Text> : null}
                </View>
                <Text style={[st.txnA, { color: credit ? colors.green700 : colors.redDark }]}>
                  {credit ? '+' : '−'} PKR {n(tx.amount)}
                </Text>
              </Row>
            </Card>
          );
        })}
      </Screen>
    </View>
  );
}

const st = StyleSheet.create({
  balLbl: { color: '#dcfce7', fontSize: 13, fontWeight: '600' },
  bal: { color: '#fff', fontSize: 30, fontWeight: '800', marginTop: 4 },
  h: { fontWeight: '800', color: colors.text, fontSize: 15, marginBottom: 10 },
  prov: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, padding: 12, backgroundColor: '#fff' },
  provOn: { borderColor: colors.green, backgroundColor: colors.green50 },
  provTxt: { fontWeight: '700', color: colors.text },
  quickLbl: { color: colors.sub, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  quick: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.md, borderWidth: 1.2, borderColor: '#bbf7d0', backgroundColor: colors.green50 },
  quickTxt: { color: colors.green700, fontWeight: '800', fontSize: 13 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, marginBottom: 12, outlineStyle: 'none' as any },
  note: { backgroundColor: '#fffbeb', borderColor: '#fde68a', borderWidth: 1, borderRadius: radius.md, padding: 10, marginBottom: 14 },
  noteTxt: { color: '#92400e', fontSize: 12, lineHeight: 17 },
  section: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 20, marginBottom: 12 },
  txnT: { fontWeight: '700', color: colors.text },
  txnD: { color: colors.muted, fontSize: 12, marginTop: 2 },
  txnA: { fontWeight: '800', fontSize: 15 },
});
