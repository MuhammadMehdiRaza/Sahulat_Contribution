import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../api';
import BottomNav from '../BottomNav';
import { endOfDayISO } from '../dates';
import { useApp } from '../state';
import { colors, radius, services } from '../theme';
import { Btn, DatePickerField, Field, Header, Screen } from '../ui';

export default function PostJob() {
  const { params, navigate, goBack, showToast, coords, place, locating, t } = useApp();
  const emergency = !!params?.emergency;
  const [category, setCategory] = useState(params?.category || 'plumber');
  const [description, setDescription] = useState('');
  const [target, setTarget] = useState('2000');
  const [max, setMax] = useState('3000');
  const [deadline, setDeadline] = useState(new Date(Date.now() + 3 * 86400000));  // default: 3 days out
  const [loading, setLoading] = useState(false);
  // The job is posted at the customer's current GPS location (workers are matched around it).
  const jobLoc = { lat: coords.lat, lng: coords.lng, label: place };

  const submit = async () => {
    setLoading(true);
    try {
      const job = await api.createJob({
        category, description, lat: jobLoc.lat, lng: jobLoc.lng, address: jobLoc.label,
        budget_target: Number(target), budget_max: Number(max), is_emergency: emergency,
        deadline: endOfDayISO(deadline),
      });
      if (emergency) {
        const res = await api.emergency(job.id);
        showToast(`${res.worker.full_name} · ${res.worker.distance_km} km`);
        navigate('bookings');
      } else {
        showToast(t('jobPosted'));
        navigate('serviceListing', { category, job });
      }
    } catch (e: any) { showToast(e.message); } finally { setLoading(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={emergency ? t('emergencyTitle') : t('postJobTitle')} onBack={goBack} />
      <Screen>
        <Text style={st.label}>{t('service')}</Text>
        <View style={st.cats}>
          {services.map((s) => (
            <TouchableOpacity key={s.key} onPress={() => setCategory(s.key)}
              style={[st.cat, category === s.key && st.catOn]}>
              <Text>{s.icon} {t('svc_' + s.key)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Field label={t('describeWork')} placeholder={t('describeHint')} value={description} onChangeText={setDescription} multiline />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><Field label={t('budgetTarget')} value={target} onChangeText={setTarget} keyboardType="number-pad" /></View>
          <View style={{ flex: 1 }}><Field label={t('budgetMax')} value={max} onChangeText={setMax} keyboardType="number-pad" /></View>
        </View>
        <Text style={st.label}>{t('jobLocationLbl')}</Text>
        <View style={st.jobLocRow}>
          <Text style={st.jobLocTxt}>📍 {locating ? t('locating') : place}</Text>
        </View>
        <Text style={st.jobLocHint}>{t('jobLocationHint')}</Text>

        <DatePickerField label={t('deadlineLbl')} value={deadline} minDate={new Date()} onChange={setDeadline} />

        <Btn title={emergency ? t('dispatchBtn') : t('postJobBtn')} onPress={submit} loading={loading} />
      </Screen>
      <BottomNav active="postJob" />
    </View>
  );
}

const st = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: colors.sub, marginBottom: 8 },
  cats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  cat: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  catOn: { borderColor: colors.green, backgroundColor: colors.green50 },
  jobLocRow: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13 },
  jobLocTxt: { color: colors.text, fontSize: 15, fontWeight: '600' },
  jobLocHint: { color: colors.sub, fontSize: 12, marginTop: 6, marginBottom: 16, lineHeight: 17 },
});
