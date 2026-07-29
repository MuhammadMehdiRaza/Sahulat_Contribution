import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../api';
import { useApp } from '../state';
import { colors } from '../theme';
import { Btn, Card, Field, Header, Screen } from '../ui';

export default function Rating() {
  const { params, navigate, goBack, showToast, t } = useApp();
  const booking = params.booking;
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await api.rateBooking(booking.id, stars, comment);
      showToast(t('thanksRating'));
      navigate('bookings');
    } catch (e: any) { showToast(e.message); } finally { setLoading(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={t('ratingTitle')} onBack={goBack} />
      <Screen>
        <Card>
          <Text style={st.q}>{t('howWasService')}</Text>
          <View style={st.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity key={n} onPress={() => setStars(n)}>
                <Text style={[st.star, { opacity: n <= stars ? 1 : 0.25 }]}>⭐</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Field label={t('commentOptional')} placeholder={t('commentHint')} value={comment} onChangeText={setComment} multiline />
          <Btn title={t('submitReview')} onPress={submit} loading={loading} />
        </Card>
      </Screen>
    </View>
  );
}

const st = StyleSheet.create({
  q: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: 12 },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 16 },
  star: { fontSize: 40 },
});
