import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../api';
import BottomNav from '../BottomNav';
import { dayLabel, fmtTime, parseUTC, relLabel } from '../dates';
import { useApp } from '../state';
import { colors, radius } from '../theme';
import { Card, Header, Screen } from '../ui';

export default function Chat() {
  const { params } = useApp();
  if (params?.threadId) return <Conversation threadId={params.threadId} peerName={params.peerName} />;
  return <ThreadList />;
}

function ThreadList() {
  const { navigate, t } = useApp();
  const [threads, setThreads] = useState<any[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => { (async () => { try { setThreads(await api.threads()); } catch { setThreads([]); } })(); }, []);

  const filtered = useMemo(() => {
    if (!threads) return threads;
    const s = q.trim().toLowerCase();
    return s ? threads.filter((th) => (th.peer_name || '').toLowerCase().includes(s)) : threads;
  }, [threads, q]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={t('messagesTitle')} />
      <Screen>
        {threads && threads.length > 0 ? (
          <View style={st.search}>
            <Text style={{ fontSize: 15 }}>🔍</Text>
            <TextInput value={q} onChangeText={setQ} placeholder={t('searchChats')} placeholderTextColor={colors.muted} style={st.searchInput} />
            {q ? <TouchableOpacity onPress={() => setQ('')}><Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text></TouchableOpacity> : null}
          </View>
        ) : null}
        {threads === null ? null : threads.length === 0
          ? <Card><Text style={{ color: colors.sub }}>{t('noConversations')}</Text></Card>
          : (filtered || []).length === 0
          ? <Card><Text style={{ color: colors.sub }}>{t('noSearchResults')}</Text></Card>
          : (filtered || []).map((th) => {
            const name = th.peer_name || t('conversation');
            return (
              <Card key={th.id} onPress={() => navigate('chat', { threadId: th.id, peerName: name })}>
                <View style={st.avatarRow}>
                  <View style={st.avatar}><Text style={st.avatarTxt}>{(name[0] || '?').toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ flex: 1, marginRight: 8, fontWeight: '700', color: colors.text }} numberOfLines={1}>
                        {name}
                        {th.category ? <Text style={{ color: colors.sub, fontWeight: '400', fontSize: 12 }}>  ·  {t('svc_' + th.category)}</Text> : null}
                      </Text>
                      <Text style={{ color: colors.muted, fontSize: 11 }} numberOfLines={1}>{relLabel(th.last_at, t('today'), t('yesterday'))}</Text>
                    </View>
                    <Text style={{ color: colors.sub, fontSize: 13, marginTop: 2 }} numberOfLines={1}>
                      {th.last_message || t('sayHi')}
                    </Text>
                  </View>
                </View>
              </Card>
            );
          })}
      </Screen>
      <BottomNav active="chat" />
    </View>
  );
}

function Conversation({ threadId, peerName }: any) {
  const { user, navigate, goBack, showToast, t, n } = useApp();
  const userId = user?.id;
  const [msgs, setMsgs] = useState<any[]>([]);
  const [offer, setOffer] = useState<any | null>(null);
  const [text, setText] = useState('');
  const [amount, setAmount] = useState('');
  const [showAmount, setShowAmount] = useState(false);
  const scroller = useRef<ScrollView>(null);

  const load = async () => {
    try { setMsgs(await api.messages(threadId)); } catch {}
    try { setOffer(await api.getOffer(threadId)); } catch {}
  };
  useEffect(() => {
    load();
    const id = setInterval(load, 3500);  // light polling so the other side's messages/offers appear
    return () => clearInterval(id);
  }, [threadId]);

  const send = async () => {
    if (!text.trim()) return;
    try { await api.sendMessage(threadId, { type: 'text', body: text, lang: 'en' }); setText(''); load(); } catch {}
  };

  const sendOffer = async () => {
    const val = Number(amount);
    if (!val || val <= 0) { showToast(t('enterAmount')); return; }
    try { await api.makeOffer(threadId, val); setShowAmount(false); setAmount(''); showToast(t('offerSent')); load(); }
    catch (e: any) { showToast(e.message); }
  };

  const accept = async () => {
    try { await api.acceptOffer(threadId); showToast(t('priceLockedToast')); load(); }
    catch (e: any) { showToast(e.message); }
  };

  // Idempotent: books once from the locked price (pays from wallet). Tapping again
  // returns the same booking instead of creating a duplicate.
  const proceedPay = async () => {
    try {
      const r = await api.bookFromThread(threadId);
      showToast(t('bookingCreated'));
      load();
      navigate('bookingDetail', { bookingId: r.booking_id });
    } catch (e: any) {
      const msg = e.message || '';
      if (msg.toLowerCase().includes('insufficient')) { showToast(t('insufficientWarn')); navigate('wallet'); }
      else showToast(msg);
    }
  };

  const iAmHirer = offer && userId === offer.hirer_id;
  const name = peerName || offer?.peer_name || t('conversation');
  const openAmount = (prefill?: number) => { setAmount(prefill ? String(prefill) : ''); setShowAmount(true); };

  // ---- price bar shown above the input ----
  const renderOfferBar = () => {
    if (!offer) return null;
    if (offer.locked) {
      const booked = !!offer.booking_id;
      return (
        <View style={[st.offerBar, { borderColor: '#bbf7d0', backgroundColor: colors.green50 }]}>
          <Text style={[st.offerTitle, { color: colors.green700 }]}>
            {booked ? t('bookingCreatedChat') : t('priceLocked', { price: n(offer.amount) })}
          </Text>
          {booked
            ? <TouchableOpacity onPress={() => navigate('bookingDetail', { bookingId: offer.booking_id })} style={[st.offerBtn, { marginTop: 8, alignSelf: 'flex-start' }]}><Text style={st.offerBtnTxt}>{t('viewStatus')}</Text></TouchableOpacity>
            : iAmHirer
              ? <TouchableOpacity onPress={proceedPay} style={[st.offerBtn, { marginTop: 8, alignSelf: 'flex-start' }]}><Text style={st.offerBtnTxt}>{t('proceedPayment')}</Text></TouchableOpacity>
              : <Text style={st.offerSub}>{t('waitingBooking')}</Text>}
        </View>
      );
    }
    // Price negotiation is only offered while the worker is online.
    if (!offer.worker_available) {
      return (
        <View style={st.offerBar}>
          <Text style={st.offerSub}>💬 {t('priceWhenOnline', { name })}</Text>
        </View>
      );
    }
    if (showAmount) {
      return (
        <View style={st.offerBar}>
          <Text style={st.offerTitle}>{t('enterAmount')}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TextInput value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="2500"
              placeholderTextColor={colors.muted} style={st.amountInput} />
            <TouchableOpacity onPress={sendOffer} style={st.offerBtn}><Text style={st.offerBtnTxt}>{t('sendOffer')}</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAmount(false)} style={st.offerBtnGhost}><Text style={st.offerBtnGhostTxt}>{t('cancel')}</Text></TouchableOpacity>
          </View>
        </View>
      );
    }
    if (offer.status === 'pending') {
      const mine = offer.proposed_by === userId;
      if (mine) {
        return (
          <View style={st.offerBar}>
            <Text style={st.offerTitle}>{t('youProposed', { price: n(offer.amount), name })}</Text>
            <TouchableOpacity onPress={() => openAmount(offer.amount)} style={[st.offerBtnGhost, { marginTop: 8, alignSelf: 'flex-start' }]}>
              <Text style={st.offerBtnGhostTxt}>{t('changePrice')}</Text>
            </TouchableOpacity>
          </View>
        );
      }
      return (
        <View style={st.offerBar}>
          <Text style={st.offerTitle}>{t('peerProposed', { name, price: n(offer.amount) })}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TouchableOpacity onPress={accept} style={st.offerBtn}><Text style={st.offerBtnTxt}>{t('acceptPrice', { price: n(offer.amount) })}</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => openAmount(offer.amount)} style={st.offerBtnGhost}><Text style={st.offerBtnGhostTxt}>{t('counterPrice')}</Text></TouchableOpacity>
          </View>
        </View>
      );
    }
    // no offer yet
    return (
      <View style={st.offerBar}>
        <TouchableOpacity onPress={() => openAmount()} style={[st.offerBtn, { alignSelf: 'flex-start' }]}>
          <Text style={st.offerBtnTxt}>{t('proposePrice')}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  let lastDay = '';
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={name} onBack={goBack} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}
          keyboardShouldPersistTaps="handled" onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}>
          {msgs.length === 0 ? <Text style={{ color: colors.sub, textAlign: 'center', marginTop: 20 }}>{t('sayHi')}</Text> : null}
          {msgs.map((m) => {
            const d = parseUTC(m.created_at) || new Date();
            const dk = d.toDateString();
            const showSep = dk !== lastDay; lastDay = dk;
            const sep = showSep ? <View style={st.sep}><Text style={st.sepTxt}>{dayLabel(d, t('today'), t('yesterday'))}</Text></View> : null;
            if (m.type === 'system') {
              return (
                <View key={m.id}>
                  {sep}
                  <View style={st.sysWrap}><Text style={st.sysTxt}>{m.body}</Text></View>
                </View>
              );
            }
            const mine = m.sender_id === userId;
            return (
              <View key={m.id}>
                {sep}
                <View style={[st.bubble, mine ? st.mine : st.theirs]}>
                  <Text style={mine ? st.mineT : st.theirT}>{m.body}</Text>
                  <Text style={[st.time, { color: mine ? 'rgba(255,255,255,0.75)' : colors.muted }]}>{fmtTime(d)}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>

        {renderOfferBar()}

        <View style={st.inputRow}>
          <TextInput value={text} onChangeText={setText} placeholder={t('typeMessage')} placeholderTextColor={colors.muted}
            style={st.input} onSubmitEditing={send} returnKeyType="send" />
          <TouchableOpacity onPress={send} style={st.sendBtn}><Text style={{ color: '#fff', fontWeight: '700' }}>{t('send')}</Text></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const st = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 12 },
  searchInput: { flex: 1, paddingVertical: 2, color: colors.text, outlineStyle: 'none' as any },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.green100, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: colors.green700, fontWeight: '800', fontSize: 18 },
  bubble: { maxWidth: '80%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.lg, marginBottom: 10 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.green },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border },
  mineT: { color: '#fff' }, theirT: { color: colors.text },
  time: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  sep: { alignItems: 'center', marginVertical: 10 },
  sepTxt: { fontSize: 11, color: colors.sub, backgroundColor: '#e5e7eb', paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, overflow: 'hidden' },
  sysWrap: { alignItems: 'center', marginVertical: 8 },
  sysTxt: { fontSize: 12, color: '#92400e', backgroundColor: '#fffbeb', borderColor: '#fde68a', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, textAlign: 'center', overflow: 'hidden' },
  offerBar: { backgroundColor: '#f8fafc', borderTopWidth: 1, borderTopColor: colors.border, padding: 12 },
  offerTitle: { fontWeight: '700', color: colors.text, fontSize: 14 },
  offerSub: { color: colors.sub, fontSize: 12, marginTop: 4 },
  amountInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#fff', outlineStyle: 'none' as any },
  offerBtn: { backgroundColor: colors.green, borderRadius: radius.md, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center', paddingVertical: 10 },
  offerBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  offerBtnGhost: { backgroundColor: '#fff', borderWidth: 1.2, borderColor: '#bbf7d0', borderRadius: radius.md, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center', paddingVertical: 10 },
  offerBtnGhostTxt: { color: colors.green700, fontWeight: '700', fontSize: 13 },
  inputRow: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: '#fff' },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10, outlineStyle: 'none' as any },
  sendBtn: { backgroundColor: colors.green, borderRadius: radius.pill, paddingHorizontal: 18, justifyContent: 'center' },
});
