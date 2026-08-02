// Global Voice Assistant overlay (BO-4): a floating mic on every screen. Tap it and speak an
// Urdu/English/Roman-Urdu command; the app navigates/searches/acts and speaks a reply back.
// Mounted once in App.tsx (auth-gated). Positioned inside the phone frame, above the bottom nav.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from '../Icon';
import { useApp } from '../state';
import { colors, radius, shadow } from '../theme';
import { useVoice } from './useVoice';

export default function VoiceAssistant() {
  const { t, rtl, screen, params, language } = useApp();
  const voice = useVoice();
  const [open, setOpen] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;

  // pulse the mic while listening
  useEffect(() => {
    if (voice.state === 'listening') {
      const anim = Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 650, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ]));
      anim.start();
      return () => anim.stop();
    }
    pulse.setValue(0);
  }, [voice.state, pulse]);

  // auto-dismiss the sheet a few seconds after a reply settles
  useEffect(() => {
    if (open && voice.state === 'idle' && voice.reply) {
      const id = setTimeout(() => setOpen(false), 4500);
      return () => clearTimeout(id);
    }
  }, [open, voice.state, voice.reply]);

  // Speech-to-text produces Urdu script, not Roman letters, so voice is disabled in Roman-Urdu mode.
  if (language === 'roman_ur') return null;
  // The chat conversation screen has its own inline mic — don't cover its input row.
  if (screen === 'chat' && params?.threadId) return null;

  const onFab = () => {
    if (voice.state === 'listening') { voice.stop(); return; }
    setOpen(true);
    voice.start();
  };

  const label =
    voice.state === 'listening' ? t('voiceListening')
      : voice.state === 'thinking' ? t('voiceThinking')
        : voice.state === 'speaking' ? t('voiceSpeaking')
          : t('voiceTapSpeak');

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] });
  const side = rtl ? { left: 16 } : { right: 16 };
  const sheetSide = rtl ? { left: 14 } : { right: 14 };

  return (
    <>
      {open ? (
        <View style={[st.sheet, sheetSide]}>
          <View style={st.head}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="mic" size={16} color={colors.green} />
              <Text style={st.title}>{t('voiceTitle')}</Text>
            </View>
            <TouchableOpacity onPress={() => { voice.stop(); setOpen(false); }} accessibilityLabel="Close">
              <Icon name="close" size={16} color={colors.muted} style={{ paddingHorizontal: 4 }} />
            </TouchableOpacity>
          </View>
          <Text style={[st.state, rtl && st.rtl]}>{label}</Text>
          {voice.transcript
            ? <Text style={[st.transcript, rtl && st.rtl]}>“{voice.transcript}”</Text>
            : <Text style={[st.hint, rtl && st.rtl]}>{t('voiceExamples')}</Text>}
          {voice.reply ? <Text style={[st.reply, rtl && st.rtl]}>{voice.reply}</Text> : null}
        </View>
      ) : null}

      <Animated.View style={[st.fabWrap, side, { transform: [{ scale }] }]}>
        <TouchableOpacity activeOpacity={0.85} onPress={onFab}
          style={[st.fab, shadow.btn, voice.state === 'listening' && st.fabActive]}
          accessibilityRole="button" accessibilityLabel={t('voiceTitle')}>
          <Icon name={voice.state === 'listening' ? 'stop' : 'mic'} size={24} color="#fff" />
        </TouchableOpacity>
      </Animated.View>
    </>
  );
}

const st = StyleSheet.create({
  fabWrap: { position: 'absolute', bottom: 118, zIndex: 60 },
  fab: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  fabActive: { backgroundColor: colors.red },
  fabIcon: { fontSize: 24, color: '#fff' },
  sheet: {
    position: 'absolute', bottom: 186, maxWidth: 320, minWidth: 236,
    backgroundColor: '#fff', borderRadius: radius.lg, padding: 14,
    borderWidth: 1, borderColor: colors.border, zIndex: 60,
    shadowColor: '#0f172a', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { fontWeight: '800', color: colors.text },
  close: { color: colors.muted, fontSize: 16, paddingHorizontal: 4 },
  state: { color: colors.green700, fontWeight: '700', fontSize: 13 },
  transcript: { color: colors.text, fontSize: 15, marginTop: 6 },
  hint: { color: colors.sub, fontSize: 12, marginTop: 6, lineHeight: 17 },
  reply: { color: colors.text, fontSize: 14, marginTop: 8, backgroundColor: colors.green50, padding: 8, borderRadius: radius.sm },
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
});
