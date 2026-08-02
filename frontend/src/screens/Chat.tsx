import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../api';
import Icon from '../Icon';
import BottomNav from '../BottomNav';
import { dayLabel, fmtTime, parseUTC, relLabel } from '../dates';
import { useApp } from '../state';
import { colors, radius } from '../theme';
import { Card, Header, Screen } from '../ui';
import MicButton from '../voice/MicButton';

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
            <Icon name="search" size={15} color={colors.muted} />
            <TextInput value={q} onChangeText={setQ} placeholder={t('searchChats')} placeholderTextColor={colors.muted} style={st.searchInput} />
            {q ? <TouchableOpacity onPress={() => setQ('')}><Icon name="close" size={16} color={colors.muted} /></TouchableOpacity> : null}
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
  const { user, navigate, goBack, showToast, t, n, language, params } = useApp();
  const userId = user?.id;
  const [msgs, setMsgs] = useState<any[]>([]);
  const [offer, setOffer] = useState<any | null>(null);
  const [text, setText] = useState('');
  const [amount, setAmount] = useState('');
  const [showAmount, setShowAmount] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const scroller = useRef<ScrollView>(null);
  // Guard: only auto-trigger negotiation once per mount, not on every re-render
  const aiTriggered = useRef(false);

  const load = async () => {
    try { setMsgs(await api.messages(threadId)); } catch {}
    try { setOffer(await api.getOffer(threadId)); } catch {}
  };

  const runAiNegotiation = async () => {
    // Don't re-run if already has negotiation messages or already running
    if (aiLoading) return;
    setAiLoading(true);
    try {
      await api.aiNegotiateInChat(threadId, {
        hirer_target: params?.hirer_target ?? undefined,
        hirer_max: params?.hirer_max ?? undefined,
      });
      showToast('✅ AI Negotiation complete!');
      await load();
    } catch (e: any) {
      showToast(e.message || 'Negotiation error');
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Auto-trigger AI negotiation exactly once when navigated here with autoAi flag
    if (params?.autoAi && !aiTriggered.current) {
      aiTriggered.current = true;
      runAiNegotiation();
    }
    const id = setInterval(load, 3500);  // light polling so the other side's messages/offers appear
    return () => clearInterval(id);
  }, [threadId]);

  const send = async () => {
    if (!text.trim()) return;
    try { await api.sendMessage(threadId, { type: 'text', body: text, lang: language }); setText(''); load(); } catch {}
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

  // Idempotent: books once from the locked price (pays from wallet).
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
          <Text style={st.offerSub}><Icon name="chat" size={12} color={colors.sub} /> {t('priceWhenOnline', { name })}</Text>
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
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={runAiNegotiation} style={[st.offerBtn, { backgroundColor: '#4f46e5', flex: 1.2 }]}>
            <Text style={st.offerBtnTxt}>{aiLoading ? '🤖 Negotiating...' : '🤖 Start AI Negotiation'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openAmount()} style={[st.offerBtnGhost, { flex: 1 }]}>
            <Text style={st.offerBtnGhostTxt}>{t('proposePrice')}</Text>
          </TouchableOpacity>
        </View>
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
          {aiLoading ? (
            <View style={st.aiLoadingBanner}>
              <ActivityIndicator color="#4f46e5" size="small" />
              <Text style={st.aiLoadingTxt}>🤖 Customer Agent & Worker Agent Negotiating in Real-Time...</Text>
            </View>
          ) : null}
          {msgs.length === 0 && !aiLoading ? <Text style={{ color: colors.sub, textAlign: 'center', marginTop: 20 }}>{t('sayHi')}</Text> : null}
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

            if (m.type === 'ai_agent') {
              const isCust = m.body.includes('Customer Agent');
              return (
                <View key={m.id}>
                  {sep}
                  <View style={[st.aiBubble, isCust ? st.aiCust : st.aiWork]}>
                    <View style={st.aiBadgeRow}>
                      <Text style={st.aiBadgeTxt}>{isCust ? '🤖 CUSTOMER AGENT' : '👷 WORKER AGENT'}</Text>
                      <Text style={st.aiTag}>AgenticPay Local HF</Text>
                    </View>
                    <Text style={st.aiBody}>{m.body.replace(/^(🤖 Customer Agent:|👷 Worker Agent:)\s*/, '')}</Text>
                    <Text style={st.time}>{fmtTime(d)}</Text>
                  </View>
                </View>
              );
            }

            if (m.type === 'ai_analytics') {
              let analytics: any = {};
              try { analytics = JSON.parse(m.body); } catch {}
              return (
                <View key={m.id} style={st.analyticsCard}>
                  {sep}
                  <Text style={st.analyticsHeader}>🎉 AI Negotiation Settled!</Text>
                  <View style={st.analyticsGrid}>
                    <View style={st.analyticsItem}>
                      <Text style={st.analyticsLabel}>🎯 Agreed Price</Text>
                      <Text style={st.analyticsVal}>PKR {n(analytics.final_price || 0)}</Text>
                    </View>
                    <View style={st.analyticsItem}>
                      <Text style={st.analyticsLabel}>💰 Saved</Text>
                      <Text style={[st.analyticsVal, { color: colors.green700 }]}>PKR {n(analytics.savings || 0)}</Text>
                    </View>
                    <View style={st.analyticsItem}>
                      <Text style={st.analyticsLabel}>⏱️ Duration</Text>
                      <Text style={st.analyticsVal}>{analytics.duration_sec || 0.8}s</Text>
                    </View>
                    <View style={st.analyticsItem}>
                      <Text style={st.analyticsLabel}>⭐ Win-Win</Text>
                      <Text style={st.analyticsVal}>{analytics.satisfaction_score || '98%'}</Text>
                    </View>
                  </View>
                  {iAmHirer ? (
                    <TouchableOpacity onPress={proceedPay} style={[st.offerBtn, { marginTop: 12 }]}>
                      <Text style={st.offerBtnTxt}>💳 Proceed to Payment (PKR {n(analytics.final_price)})</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={{ marginTop: 12, backgroundColor: '#dcfce7', padding: 10, borderRadius: 8, alignItems: 'center' }}>
                      <Text style={{ color: colors.green700, fontWeight: '700' }}>✅ Price Agreed at PKR {n(analytics.final_price)} — Waiting for Customer Payment</Text>
                    </View>
                  )}
                </View>
              );
            }

            if (m.type === 'ai_failure') {
              let fail: any = {};
              try { fail = JSON.parse(m.body); } catch {}
              return (
                <View key={m.id} style={st.failureCard}>
                  {sep}
                  <Text style={st.failureHeader}>⚠️ AI Negotiation Unsettled</Text>
                  <Text style={st.failureBody}>{fail.failure_reason || 'No agreement reached within maximum rounds.'}</Text>
                  <TouchableOpacity onPress={runAiNegotiation} style={[st.offerBtn, { backgroundColor: '#d97706', marginTop: 10 }]}>
                    <Text style={st.offerBtnTxt}>🔄 Restart Negotiation</Text>
                  </TouchableOpacity>
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
          <MicButton size={22} style={{ justifyContent: 'center', paddingHorizontal: 2 }}
            onText={(txt) => setText((prev) => (prev ? prev + ' ' : '') + txt)} />
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
  aiBubble: { maxWidth: '85%', paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.lg, marginBottom: 10 },
  aiCust: { alignSelf: 'flex-start', backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#c7d2fe' },
  aiWork: { alignSelf: 'flex-end', backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' },
  aiBadgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 4 },
  aiBadgeTxt: { fontSize: 10, fontWeight: '800', color: '#3730a3' },
  aiTag: { fontSize: 9, color: colors.sub, fontStyle: 'italic' },
  aiBody: { fontSize: 13, color: colors.text, fontStyle: 'italic', marginTop: 2 },
  analyticsCard: { backgroundColor: '#f0fdf4', borderColor: '#86efac', borderWidth: 1.5, borderRadius: radius.lg, padding: 14, marginVertical: 12 },
  analyticsHeader: { fontSize: 16, fontWeight: '800', color: colors.green700, textAlign: 'center', marginBottom: 10 },
  analyticsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  analyticsItem: { width: '48%', backgroundColor: '#fff', padding: 8, borderRadius: radius.md, borderWidth: 1, borderColor: '#dcfce7' },
  analyticsLabel: { fontSize: 11, color: colors.sub, fontWeight: '600' },
  analyticsVal: { fontSize: 14, fontWeight: '800', color: colors.text, marginTop: 2 },
  failureCard: { backgroundColor: '#fffbeb', borderColor: '#fde68a', borderWidth: 1.5, borderRadius: radius.lg, padding: 14, marginVertical: 12 },
  failureHeader: { fontSize: 15, fontWeight: '800', color: '#b45309', textAlign: 'center' },
  failureBody: { fontSize: 12, color: colors.text, marginTop: 6, lineHeight: 18 },
  aiLoadingBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#eef2ff', borderColor: '#c7d2fe', borderWidth: 1.5, borderRadius: radius.md, padding: 12, marginBottom: 14 },
  aiLoadingTxt: { fontSize: 12, fontWeight: '700', color: '#3730a3', flex: 1 },
});
