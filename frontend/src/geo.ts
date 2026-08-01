// Turns coordinates into a "City, Country" label. Uses expo-location's on-device geocoder
// first (Android/iOS), then a FREE no-key HTTP reverse geocoder that also works in the browser
// (where the on-device geocoder isn't available). Returns '' if the place can't be resolved.
import * as Location from 'expo-location';

export async function resolvePlace(lat: number, lng: number): Promise<string> {
  // 1) on-device geocoder — native only
  try {
    const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const g = geo && geo[0];
    if (g) {
      const city = g.city || g.subregion || g.district || g.region || '';
      const label = [city, g.country].filter(Boolean).join(', ');
      if (label) return label;
    }
  } catch { /* not available (e.g. web) — fall through to the HTTP lookup */ }

  // 2) free, no-key, CORS-enabled reverse geocoder — works in the browser and on native
  try {
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`);
    const d = await r.json();
    const city = d.city || d.locality || d.principalSubdivision || '';
    const label = [city, d.countryName].filter(Boolean).join(', ');
    if (label) return label;
  } catch { /* offline or blocked — keep the coordinate-based flow */ }

  return '';
}
