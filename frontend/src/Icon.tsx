// One semantic icon component for the whole app, backed by Ionicons (@expo/vector-icons).
// Use <Icon name="wallet" /> instead of emoji, so every icon stays consistent in weight + style.
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { colors } from './theme';

// Semantic name -> Ionicons glyph. Add new names here, never emoji in screens.
const GLYPHS = {
  // tabs / navigation (filled + outline variants for the bottom bar)
  home: 'home', homeO: 'home-outline',
  jobs: 'briefcase', jobsO: 'briefcase-outline',
  bookings: 'clipboard', bookingsO: 'clipboard-outline',
  chat: 'chatbubble-ellipses', chatO: 'chatbubble-ellipses-outline',
  bell: 'notifications', bellO: 'notifications-outline',
  settings: 'settings', settingsO: 'settings-outline',
  add: 'add-circle', addO: 'add-circle-outline', plus: 'add',
  // service categories
  plumber: 'water', electrician: 'flash', carpenter: 'hammer',
  cleaner: 'sparkles', cook: 'restaurant', household: 'people',
  // status / meta
  verified: 'checkmark-circle', check: 'checkmark', shield: 'shield-checkmark',
  star: 'star', starO: 'star-outline', location: 'location', locationO: 'location-outline',
  warning: 'warning', alert: 'alert-circle', info: 'information-circle', help: 'help-circle',
  time: 'time', alarm: 'alarm', calendar: 'calendar', pending: 'hourglass',
  lock: 'lock-closed', key: 'key', person: 'person', personCircle: 'person-circle',
  worker: 'construct', people: 'people', deal: 'swap-horizontal', interested: 'hand-right',
  // money
  wallet: 'wallet', card: 'card', cash: 'cash',
  // misc
  search: 'search', close: 'close', back: 'chevron-back', forward: 'chevron-forward',
  arrowForward: 'arrow-forward', arrowBack: 'arrow-back',
  demo: 'flask', phone: 'phone-portrait', globe: 'globe', language: 'language',
  empty: 'file-tray-outline', fingerprint: 'finger-print', camera: 'camera', hand: 'hand-left',
  celebrate: 'sparkles', signal: 'radio', logout: 'log-out', edit: 'create', refresh: 'refresh',
  locate: 'locate', trash: 'trash',
  // voice
  mic: 'mic', micOff: 'mic-off', stop: 'stop', record: 'radio-button-on',
  // ui glyphs
  chevronDown: 'chevron-down', play: 'play',
} as const;

export type IconName = keyof typeof GLYPHS;

export function Icon({ name, size = 20, color = colors.text, style }:
  { name: IconName; size?: number; color?: string; style?: any }) {
  return <Ionicons name={GLYPHS[name] as any} size={size} color={color} style={style} />;
}

export default Icon;
