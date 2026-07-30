import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from './src/state';
import { colors } from './src/theme';
import { Toast } from './src/ui';

import Onboarding from './src/screens/Onboarding';
import Login from './src/screens/Login';
import Signup from './src/screens/Signup';
import ForgotPassword from './src/screens/ForgotPassword';
import Home from './src/screens/Home';
import ServiceListing from './src/screens/ServiceListing';
import WorkerProfile from './src/screens/WorkerProfile';
import PostJob from './src/screens/PostJob';
import Bidding from './src/screens/Bidding';
import BookingPayment from './src/screens/BookingPayment';
import Chat from './src/screens/Chat';
import Rating from './src/screens/Rating';
import WorkerDashboard from './src/screens/WorkerDashboard';
import Kyc from './src/screens/Kyc';
import Settings from './src/screens/Settings';
import Bookings from './src/screens/Bookings';
import Notifications from './src/screens/Notifications';
import JobDetail from './src/screens/JobDetail';
import MyJobs from './src/screens/MyJobs';
import JobApplicants from './src/screens/JobApplicants';
import BookingDetail from './src/screens/BookingDetail';
import Wallet from './src/screens/Wallet';

const SCREENS: Record<string, any> = {
  onboarding: Onboarding, login: Login, signup: Signup, forgotPassword: ForgotPassword, home: Home, serviceListing: ServiceListing,
  workerProfile: WorkerProfile, postJob: PostJob, bidding: Bidding, bookingPayment: BookingPayment,
  chat: Chat, rating: Rating, workerDashboard: WorkerDashboard, kyc: Kyc, settings: Settings,
  bookings: Bookings, notifications: Notifications,
  jobDetail: JobDetail, myJobs: MyJobs, jobApplicants: JobApplicants, bookingDetail: BookingDetail, wallet: Wallet,
};

function Router() {
  const { screen, toast } = useApp();
  const Comp = SCREENS[screen] || Home;
  return (
    <>
      <Comp />
      {toast ? <Toast msg={toast} /> : null}
    </>
  );
}

function Shell() {
  const { rtl } = useApp();
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('dir', rtl ? 'rtl' : 'ltr');
    }
  }, [rtl]);
  return (
    <View style={styles.outer}>
      <View style={styles.frame}>
        <StatusBar style="light" />
        <Router />
      </View>
    </View>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: colors.backdrop, alignItems: 'center' },
  frame: { flex: 1, width: '100%', maxWidth: 430, backgroundColor: colors.bg, overflow: 'hidden' },
});
