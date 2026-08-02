// Maps a backend voice action onto the app's navigation/state handles. Pure and platform-agnostic.
import type { InterpretResponse } from './types';

export type VoiceAppHandles = {
  navigate: (screen: string, params?: any) => void;
  goBack: () => void;
  setLanguage: (lang: any) => void;
  showToast: (msg: string) => void;
};

export function executeVoiceAction(res: InterpretResponse, app: VoiceAppHandles) {
  switch (res.action) {
    case 'navigate':
      if (res.route) app.navigate(res.route, res.params || {});
      break;
    case 'search':
      if (res.params?.category) app.navigate('serviceListing', { category: res.params.category });
      break;
    case 'post_job':
      app.navigate('postJob', {
        category: res.params?.category,
        budget_target: res.params?.budget_target,
      });
      break;
    case 'set_language':
      if (res.params?.lang) app.setLanguage(res.params.lang);
      break;
    case 'go_back':
      app.goBack();
      break;
    case 'speak_only':
    case 'none':
    default:
      break; // reply is spoken; no navigation
  }
}
