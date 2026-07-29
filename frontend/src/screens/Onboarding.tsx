import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LANGUAGES } from '../i18n';
import { useApp } from '../state';
import { colors, radius } from '../theme';
import { Btn, Steps } from '../ui';

export default function Onboarding() {
  const { navigate, setLanguage, language, t } = useApp();
  const [step, setStep] = useState(0); // 0 = language, 1..3 = slides
  const [picked, setPicked] = useState(false);
  const slides = [
    { icon: '🏠', title: t('onboard1Title'), desc: t('onboard1Desc') },
    { icon: '✅', title: t('onboard2Title'), desc: t('onboard2Desc') },
    { icon: '⚡', title: t('onboard3Title'), desc: t('onboard3Desc') },
  ];
  const next = () => {
    if (step === 0 && !picked) return;
    if (step < 3) setStep(step + 1);
    else navigate('login');
  };
  return (
    <View style={s.wrap}>
      {step === 0 ? (
        <View style={s.center}>
          <Text style={s.flag}>🇵🇰</Text>
          <Text style={s.brand}>Kaam.pk</Text>
          <Text style={s.sub}>{t('chooseLanguage')}</Text>
          {LANGUAGES.map((l) => (
            <TouchableOpacity key={l.id} onPress={() => { setLanguage(l.id); setPicked(true); }}
              style={[s.lang, language === l.id && picked && s.langActive]}>
              <Text style={{ fontSize: 26 }}>{l.flag}</Text>
              <Text style={s.langName}>{l.name}</Text>
              {language === l.id && picked ? <Text style={s.check}>✓</Text> : null}
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={s.center}>
          <Text style={s.slideIcon}>{slides[step - 1].icon}</Text>
          <Text style={s.slideTitle}>{slides[step - 1].title}</Text>
          <Text style={s.slideDesc}>{slides[step - 1].desc}</Text>
        </View>
      )}
      <View style={{ marginBottom: 14 }}><Steps total={4} current={step} /></View>
      <View style={{ padding: 16 }}>
        <Btn title={step === 3 ? t('getStarted') : t('next')} onPress={next} disabled={step === 0 && !picked} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.green50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  flag: { fontSize: 64, marginBottom: 12 },
  brand: { fontSize: 34, fontWeight: '800', color: colors.green700, marginBottom: 6 },
  sub: { color: colors.sub, marginBottom: 20, textAlign: 'center' },
  lang: { flexDirection: 'row', alignItems: 'center', gap: 14, width: '100%', padding: 16, borderRadius: radius.lg,
    borderWidth: 2, borderColor: colors.border, backgroundColor: '#fff', marginBottom: 12 },
  langActive: { borderColor: colors.green, backgroundColor: colors.green50 },
  langName: { fontSize: 17, fontWeight: '600', color: colors.text },
  check: { marginStart: 'auto', color: colors.green, fontSize: 18, fontWeight: '800' },
  slideIcon: { fontSize: 88, marginBottom: 24 },
  slideTitle: { fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 8 },
  slideDesc: { color: colors.sub, textAlign: 'center', fontSize: 15, maxWidth: 300 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 26, backgroundColor: colors.green },
});
