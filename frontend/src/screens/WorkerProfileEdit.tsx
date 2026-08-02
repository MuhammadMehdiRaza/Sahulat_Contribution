import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon, { IconName } from '../Icon';
import { api } from '../api';
import { useApp } from '../state';
import { colors, radius, services } from '../theme';
import { Btn, Field, Header, Row, Screen } from '../ui';

// Lets a worker set their skills, rate band and work location so they appear in
// customers' nearby/radius searches with real data.
export default function WorkerProfileEdit() {
  const { goBack, showToast, coords, place, gotReal, refreshLocation, t } = useApp();
  const [skills, setSkills] = useState<string[]>([]);
  const [rateMin, setRateMin] = useState('');
  const [rateTarget, setRateTarget] = useState('');
  const [bio, setBio] = useState('');
  const [loc, setLoc] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p = await api.myProfile();
        setSkills(p.skills || []);
        setRateMin(p.rate_min != null ? String(p.rate_min) : '');
        setRateTarget(p.rate_target != null ? String(p.rate_target) : '');
        setBio(p.bio || '');
        if (p.base_lat != null && p.base_lng != null) setLoc({ lat: p.base_lat, lng: p.base_lng, label: place });
      } catch (e: any) { showToast(e.message); }
    })();
  }, []);

  const toggleSkill = (k: string) =>
    setSkills((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  const useMyLocation = async () => {
    const c = await refreshLocation();               // gets the real GPS fix (or null)
    if (c) setLoc({ lat: c.lat, lng: c.lng, label: '' });
    else if (gotReal) setLoc({ lat: coords.lat, lng: coords.lng, label: '' });
    else showToast(t('locApprox'));                  // couldn't read location (permission off / web blocked)
  };

  const save = async () => {
    if (skills.length === 0) { showToast(t('pickSkill')); return; }
    if (!loc) { showToast(t('setLocationFirst')); return; }
    setLoading(true);
    try {
      await api.updateWorker({
        skills, bio, base_lat: loc.lat, base_lng: loc.lng, service_radius_km: 10,
        rate_min: rateMin ? Number(rateMin) : null,
        rate_target: rateTarget ? Number(rateTarget) : null,
      });
      try { await api.recordLocation(loc.lat, loc.lng); } catch {}  // also feed live matching
      showToast(t('profileSaved'));
      goBack();
    } catch (e: any) { showToast(e.message); } finally { setLoading(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={t('workerProfileTitle')} subtitle={t('workerProfileSub')} onBack={goBack} />
      <Screen>
        <Text style={st.label}>{t('skillsLbl')}</Text>
        <View style={st.chips}>
          {services.map((s) => (
            <TouchableOpacity key={s.key} onPress={() => toggleSkill(s.key)}
              style={[st.chip, skills.includes(s.key) && st.chipOn]}>
              <Text style={skills.includes(s.key) ? st.chipTxtOn : st.chipTxt}><Icon name={s.key as IconName} size={16} color={skills.includes(s.key) ? colors.green700 : colors.text} /> {t('svc_' + s.key)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Row style={{ gap: 12 }}>
          <View style={{ flex: 1 }}><Field label={t('rateMin')} value={rateMin} onChangeText={setRateMin} keyboardType="number-pad" placeholder="1500" /></View>
          <View style={{ flex: 1 }}><Field label={t('rateMax')} value={rateTarget} onChangeText={setRateTarget} keyboardType="number-pad" placeholder="2500" /></View>
        </Row>

        <Field label={t('bioLbl')} value={bio} onChangeText={setBio} placeholder={t('bioHint')} multiline />

        <Text style={st.label}>{t('workLocation')}</Text>
        <Btn title={t('useMyLocation')} variant="outline" onPress={useMyLocation} />
        <View style={[st.status, loc ? st.statusOn : st.statusOff, { marginTop: 10 }]}>
          <Text style={loc ? st.statusOnTxt : st.statusOffTxt}>
            {loc ? <><Icon name="verified" size={13} color={colors.green700} /> {t('locationSetTo', { place: loc.label || place })}</> : <><Icon name="warning" size={13} color={colors.red} /> {t('noLocationSet')}</>}
          </Text>
        </View>
        <Text style={st.hint}>{t('workerLocationHint')}</Text>

        <Btn title={t('saveProfile')} onPress={save} loading={loading} style={{ marginTop: 8 }} />
      </Screen>
    </View>
  );
}

const st = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: colors.sub, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  chipOn: { borderColor: colors.green, backgroundColor: colors.green50 },
  chipTxt: { color: colors.text }, chipTxtOn: { color: colors.green700, fontWeight: '700' },
  status: { borderRadius: radius.md, padding: 10, borderWidth: 1 },
  statusOn: { backgroundColor: colors.green50, borderColor: '#bbf7d0' },
  statusOff: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  statusOnTxt: { color: colors.green700, fontWeight: '700', fontSize: 13 },
  statusOffTxt: { color: '#92400e', fontWeight: '600', fontSize: 13 },
  hint: { color: colors.sub, fontSize: 12, marginTop: 8, marginBottom: 4, lineHeight: 17 },
});
