import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../api';
import BottomNav from '../BottomNav';
import { useApp } from '../state';
import { colors, radius } from '../theme';
import { Card, Header, Screen } from '../ui';

export default function Chat() {
  const { params, navigate, goBack, user, t } = useApp();
  if (params?.threadId) return <Conversation threadId={params.threadId} peerName={params.peerName} goBack={goBack} userId={user?.id} t={t} />;
  return <ThreadList navigate={navigate} t={t} />;
}

function ThreadList({ navigate, t }: any) {
  const [threads, setThreads] = useState<any[] | null>(null);
  useEffect(() => { (async () => { try { setThreads(await api.threads()); } catch { setThreads([]); } })(); }, []);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={t('messagesTitle')} />
      <Screen>
        {threads === null ? null : threads.length === 0
          ? <Card><Text style={{ color: colors.sub }}>{t('noConversations')}</Text></Card>
          : threads.map((th) => (
            <Card key={th.id} onPress={() => navigate('chat', { threadId: th.id, peerName: t('conversation') })}>
              <Text style={{ fontWeight: '700', color: colors.text }}>{t('conversation')} #{th.id.slice(0, 8)}</Text>
            </Card>
          ))}
      </Screen>
      <BottomNav active="chat" />
    </View>
  );
}

function Conversation({ threadId, peerName, goBack, userId, t }: any) {
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState('');
  const load = async () => { try { setMsgs(await api.messages(threadId)); } catch {} };
  useEffect(() => { load(); }, [threadId]);
  const send = async () => {
    if (!text.trim()) return;
    try { await api.sendMessage(threadId, { type: 'text', body: text, lang: 'en' }); setText(''); load(); } catch {}
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={peerName || t('messagesTitle')} onBack={goBack} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {msgs.length === 0 ? <Text style={{ color: colors.sub, textAlign: 'center', marginTop: 20 }}>{t('sayHi')}</Text> : null}
        {msgs.map((m) => {
          const mine = m.sender_id === userId;
          return (
            <View key={m.id} style={[st.bubble, mine ? st.mine : st.theirs]}>
              <Text style={mine ? st.mineT : st.theirT}>{m.body}</Text>
            </View>
          );
        })}
      </ScrollView>
      <View style={st.inputRow}>
        <TextInput value={text} onChangeText={setText} placeholder={t('typeMessage')} placeholderTextColor={colors.muted}
          style={st.input} onSubmitEditing={send} />
        <TouchableOpacity onPress={send} style={st.sendBtn}><Text style={{ color: '#fff', fontWeight: '700' }}>{t('send')}</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  bubble: { maxWidth: '78%', padding: 12, borderRadius: radius.lg, marginBottom: 10 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.green },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border },
  mineT: { color: '#fff' }, theirT: { color: colors.text },
  inputRow: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: '#fff' },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10, outlineStyle: 'none' as any },
  sendBtn: { backgroundColor: colors.green, borderRadius: radius.pill, paddingHorizontal: 18, justifyContent: 'center' },
});
