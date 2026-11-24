/**
 * weatherService.ts — Real-time weather atmosphere adapter backed by the
 * Google Maps Platform Weather API (currentConditions:lookup).
 *
 * Maps live meteorological telemetry (weatherCondition.type, isDaytime,
 * relativeHumidity, cloudCover, wind, temperature) into painterly sky
 * atmospheres, Three.js lighting rigs, particle systems, and calm indoor
 * microclimate context notes.
 */

export type WeatherAtmosphereId =
  | 'clear-day'
  | 'golden-hour'
  | 'partly-cloudy'
  | 'overcast'
  | 'rain'
  | 'storm'
  | 'fog'
  | 'snow'
  | 'clear-night';

export interface WeatherAtmosphereTheme {
  id: WeatherAtmosphereId;
  label: string;
  skyTop: string;
  skyMid: string;
  skyHorizon: string;
  hillFar: string;
  hillMid: string;
  hillNear: string;
  groundTint: string;
  hudText: 'dark' | 'light';
  celestial: 'sun' | 'low-sun' | 'moon' | 'none';
  clouds: 'none' | 'light' | 'dense' | 'storm';
  particles: 'pollen' | 'rain' | 'storm-rain' | 'snow' | 'fireflies' | 'mist' | 'none';
  ambientColor: string;
  ambientIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  keyColor: string;
  keyIntensity: number;
  keyPosition: [number, number, number];
  rimColor: string;
  rimIntensity: number;
  fogColor: string;
  fogDensity: number;
  pedestalColor: string;
  pedestalAccent: string;
}

export interface LiveWeatherState {
  atmosphere: WeatherAtmosphereId;
  conditionLabel: string;
  conditionType: string;
  temperatureC: number;
  feelsLikeC: number;
  relativeHumidity: number;
  windKmh: number;
  cloudCover: number;
  uvIndex: number;
  isDaytime: boolean;
  locationLabel: string;
  source: 'google-weather' | 'preview';
  careContext: string;
  updatedAt: string;
}

export interface WeatherLocationPreset {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

export const WEATHER_LOCATIONS: WeatherLocationPreset[] = [
  { id: 'sf', label: 'San Francisco', lat: 37.7694, lng: -122.4862 },
  { id: 'tokyo', label: 'Tokyo', lat: 35.6762, lng: 139.6503 },
  { id: 'london', label: 'London', lat: 51.5072, lng: -0.1276 },
  { id: 'singapore', label: 'Singapore', lat: 1.3521, lng: 103.8198 },
  { id: 'reykjavik', label: 'Reykjavik', lat: 64.1466, lng: -21.9426 },
];

export const WEATHER_THEMES: Record<WeatherAtmosphereId, WeatherAtmosphereTheme> = {
  'clear-day': {
    id: 'clear-day',
    label: 'Sunny',
    skyTop: '#2c7ec9',
    skyMid: '#7bc3ef',
    skyHorizon: '#f8e6bd',
    hillFar: '#6ea4a5',
    hillMid: '#4c8876',
    hillNear: '#2f654c',
    groundTint: '#e6d8bd',
    hudText: 'light',
    celestial: 'sun',
    clouds: 'light',
    particles: 'pollen',
    ambientColor: '#fff6e3',
    ambientIntensity: 0.72,
    hemiSky: '#a8dcff',
    hemiGround: '#826b4b',
    hemiIntensity: 1.05,
    keyColor: '#fff1cc',
    keyIntensity: 2.35,
    keyPosition: [-2.8, 6.0, 5.2],
    rimColor: '#9be7ff',
    rimIntensity: 1.0,
    fogColor: '#e9ebd8',
    fogDensity: 0.022,
    pedestalColor: '#e8d7be',
    pedestalAccent: '#6b9464',
  },
  'golden-hour': {
    id: 'golden-hour',
    label: 'Golden Hour',
    skyTop: '#3e4273',
    skyMid: '#d07d67',
    skyHorizon: '#fbd393',
    hillFar: '#865f6f',
    hillMid: '#5c4b52',
    hillNear: '#333b35',
    groundTint: '#d8b794',
    hudText: 'light',
    celestial: 'low-sun',
    clouds: 'light',
    particles: 'pollen',
    ambientColor: '#ffdcb4',
    ambientIntensity: 0.65,
    hemiSky: '#ffbe8a',
    hemiGround: '#4c3833',
    hemiIntensity: 1.0,
    keyColor: '#ffbf78',
    keyIntensity: 2.5,
    keyPosition: [-4.5, 2.8, 4.2],
    rimColor: '#ffa87a',
    rimIntensity: 1.25,
    fogColor: '#eab994',
    fogDensity: 0.028,
    pedestalColor: '#d9b99a',
    pedestalAccent: '#7f8c54',
  },
  'partly-cloudy': {
    id: 'partly-cloudy',
    label: 'Partly Cloudy',
    skyTop: '#4a88be',
    skyMid: '#9ac6df',
    skyHorizon: '#e9ecdf',
    hillFar: '#7ea29e',
    hillMid: '#588272',
    hillNear: '#365e4c',
    groundTint: '#ddd4bf',
    hudText: 'light',
    celestial: 'sun',
    clouds: 'dense',
    particles: 'pollen',
    ambientColor: '#eef4ef',
    ambientIntensity: 0.78,
    hemiSky: '#c7e2f5',
    hemiGround: '#6f6554',
    hemiIntensity: 1.0,
    keyColor: '#fff5e0',
    keyIntensity: 1.95,
    keyPosition: [-2.2, 5.5, 5.0],
    rimColor: '#c3e7d6',
    rimIntensity: 0.9,
    fogColor: '#dde7e0',
    fogDensity: 0.026,
    pedestalColor: '#e2d7c4',
    pedestalAccent: '#638862',
  },
  overcast: {
    id: 'overcast',
    label: 'Overcast',
    skyTop: '#647985',
    skyMid: '#98aab0',
    skyHorizon: '#cfd8d4',
    hillFar: '#7d8e8c',
    hillMid: '#5c726b',
    hillNear: '#3b5349',
    groundTint: '#c9cdc2',
    hudText: 'light',
    celestial: 'none',
    clouds: 'dense',
    particles: 'none',
    ambientColor: '#dce6e5',
    ambientIntensity: 0.88,
    hemiSky: '#c3d2d9',
    hemiGround: '#585b52',
    hemiIntensity: 1.15,
    keyColor: '#f2f7f5',
    keyIntensity: 1.45,
    keyPosition: [-1.4, 6.2, 4.8],
    rimColor: '#b5d4cb',
    rimIntensity: 0.8,
    fogColor: '#c7d3ce',
    fogDensity: 0.036,
    pedestalColor: '#d3d0c4',
    pedestalAccent: '#56745b',
  },
  rain: {
    id: 'rain',
    label: 'Rainy',
    skyTop: '#2d4659',
    skyMid: '#4f7182',
    skyHorizon: '#8daab0',
    hillFar: '#4c6770',
    hillMid: '#375354',
    hillNear: '#243e3a',
    groundTint: '#94a8a3',
    hudText: 'light',
    celestial: 'none',
    clouds: 'storm',
    particles: 'rain',
    ambientColor: '#b7d4df',
    ambientIntensity: 0.72,
    hemiSky: '#8cb6cc',
    hemiGround: '#3d4c46',
    hemiIntensity: 1.05,
    keyColor: '#d8f0ff',
    keyIntensity: 1.4,
    keyPosition: [-1.5, 5.5, 4.5],
    rimColor: '#76c5d8',
    rimIntensity: 1.2,
    fogColor: '#7f9fa8',
    fogDensity: 0.045,
    pedestalColor: '#b4bcb5',
    pedestalAccent: '#46745e',
  },
  storm: {
    id: 'storm',
    label: 'Thunderstorm',
    skyTop: '#162133',
    skyMid: '#2a3d54',
    skyHorizon: '#566d7e',
    hillFar: '#2e3f4d',
    hillMid: '#20313a',
    hillNear: '#152627',
    groundTint: '#65757a',
    hudText: 'light',
    celestial: 'none',
    clouds: 'storm',
    particles: 'storm-rain',
    ambientColor: '#98b4cc',
    ambientIntensity: 0.62,
    hemiSky: '#6d90b3',
    hemiGround: '#293533',
    hemiIntensity: 0.95,
    keyColor: '#cfe4ff',
    keyIntensity: 1.35,
    keyPosition: [-2.0, 5.2, 4.2],
    rimColor: '#67b4d9',
    rimIntensity: 1.35,
    fogColor: '#485d6e',
    fogDensity: 0.052,
    pedestalColor: '#9ba5a6',
    pedestalAccent: '#3d6352',
  },
  fog: {
    id: 'fog',
    label: 'Misty Fog',
    skyTop: '#8aa0a1',
    skyMid: '#b9c9c4',
    skyHorizon: '#e4ebe4',
    hillFar: '#9eb2ac',
    hillMid: '#7d958c',
    hillNear: '#587166',
    groundTint: '#d4ddd6',
    hudText: 'dark',
    celestial: 'none',
    clouds: 'dense',
    particles: 'mist',
    ambientColor: '#e6efeb',
    ambientIntensity: 0.92,
    hemiSky: '#dae7e4',
    hemiGround: '#727a72',
    hemiIntensity: 1.15,
    keyColor: '#f7fbf7',
    keyIntensity: 1.3,
    keyPosition: [-1.2, 5.8, 5.0],
    rimColor: '#c8e0d8',
    rimIntensity: 0.85,
    fogColor: '#dbe6df',
    fogDensity: 0.06,
    pedestalColor: '#d7dad2',
    pedestalAccent: '#65816b',
  },
  snow: {
    id: 'snow',
    label: 'Snowfall',
    skyTop: '#56789c',
    skyMid: '#9eb9d2',
    skyHorizon: '#e7f0f7',
    hillFar: '#9cb3c7',
    hillMid: '#7a95ab',
    hillNear: '#5a7384',
    groundTint: '#dde8f0',
    hudText: 'light',
    celestial: 'none',
    clouds: 'dense',
    particles: 'snow',
    ambientColor: '#e3f0ff',
    ambientIntensity: 0.85,
    hemiSky: '#d2e9ff',
    hemiGround: '#6c7c8a',
    hemiIntensity: 1.15,
    keyColor: '#f5fbff',
    keyIntensity: 1.75,
    keyPosition: [-2.0, 5.8, 4.8],
    rimColor: '#bfe6ff',
    rimIntensity: 1.1,
    fogColor: '#dce9f4',
    fogDensity: 0.04,
    pedestalColor: '#dce3ea',
    pedestalAccent: '#739589',
  },
  'clear-night': {
    id: 'clear-night',
    label: 'Starry Night',
    skyTop: '#0d152b',
    skyMid: '#1d2f52',
    skyHorizon: '#35506d',
    hillFar: '#1d3047',
    hillMid: '#152636',
    hillNear: '#0f1e26',
    groundTint: '#2b3d4a',
    hudText: 'light',
    celestial: 'moon',
    clouds: 'none',
    particles: 'fireflies',
    ambientColor: '#7a98c4',
    ambientIntensity: 0.58,
    hemiSky: '#6389c7',
    hemiGround: '#3d3020',
    hemiIntensity: 0.95,
    keyColor: '#d6e6ff',
    keyIntensity: 1.45,
    keyPosition: [2.8, 5.5, 4.5],
    rimColor: '#ffd38a',
    rimIntensity: 1.25,
    fogColor: '#23364f',
    fogDensity: 0.04,
    pedestalColor: '#8d8c88',
    pedestalAccent: '#466957',
  },
};

export const PREVIEW_WEATHER_PRESETS: Record<WeatherAtmosphereId, Omit<LiveWeatherState, 'updatedAt'>> = {
  'clear-day': {
    atmosphere: 'clear-day',
    conditionLabel: 'Sunny',
    conditionType: 'CLEAR',
    temperatureC: 23,
    feelsLikeC: 23,
    relativeHumidity: 48,
    windKmh: 9,
    cloudCover: 10,
    uvIndex: 6,
    isDaytime: true,
    locationLabel: 'Atmosphere preview',
    source: 'preview',
    careContext: 'Bright outdoor sun · windowsills dry faster today; feel the top inch of mix before watering.',
  },
  'golden-hour': {
    atmosphere: 'golden-hour',
    conditionLabel: 'Golden Hour',
    conditionType: 'MOSTLY_CLEAR',
    temperatureC: 20,
    feelsLikeC: 20,
    relativeHumidity: 56,
    windKmh: 7,
    cloudCover: 20,
    uvIndex: 2,
    isDaytime: true,
    locationLabel: 'Atmosphere preview',
    source: 'preview',
    careContext: 'Warm evening glow · gentle indoor conditions for a calm soil check.',
  },
  'partly-cloudy': {
    atmosphere: 'partly-cloudy',
    conditionLabel: 'Partly Cloudy',
    conditionType: 'PARTLY_CLOUDY',
    temperatureC: 19,
    feelsLikeC: 19,
    relativeHumidity: 58,
    windKmh: 12,
    cloudCover: 45,
    uvIndex: 4,
    isDaytime: true,
    locationLabel: 'Atmosphere preview',
    source: 'preview',
    careContext: 'Filtered sky · balanced indirect light suits most tropical foliage.',
  },
  overcast: {
    atmosphere: 'overcast',
    conditionLabel: 'Overcast',
    conditionType: 'CLOUDY',
    temperatureC: 16,
    feelsLikeC: 16,
    relativeHumidity: 70,
    windKmh: 14,
    cloudCover: 92,
    uvIndex: 1,
    isDaytime: true,
    locationLabel: 'Atmosphere preview',
    source: 'preview',
    careContext: 'Cloudy skies · lower light slows water uptake, so potting mix stays moist longer.',
  },
  rain: {
    atmosphere: 'rain',
    conditionLabel: 'Light Rain',
    conditionType: 'LIGHT_RAIN',
    temperatureC: 15,
    feelsLikeC: 14,
    relativeHumidity: 86,
    windKmh: 18,
    cloudCover: 96,
    uvIndex: 1,
    isDaytime: true,
    locationLabel: 'Atmosphere preview',
    source: 'preview',
    careContext: 'High outdoor humidity (86%) · potting mix evaporates more slowly on rainy days.',
  },
  storm: {
    atmosphere: 'storm',
    conditionLabel: 'Thunderstorm',
    conditionType: 'THUNDERSTORM',
    temperatureC: 17,
    feelsLikeC: 16,
    relativeHumidity: 91,
    windKmh: 34,
    cloudCover: 100,
    uvIndex: 0,
    isDaytime: true,
    locationLabel: 'Atmosphere preview',
    source: 'preview',
    careContext: 'Stormy & humid · keep plants away from cold window drafts and check soil before watering.',
  },
  fog: {
    atmosphere: 'fog',
    conditionLabel: 'Morning Mist',
    conditionType: 'FOG',
    temperatureC: 13,
    feelsLikeC: 13,
    relativeHumidity: 92,
    windKmh: 6,
    cloudCover: 85,
    uvIndex: 1,
    isDaytime: true,
    locationLabel: 'Atmosphere preview',
    source: 'preview',
    careContext: 'Misty air · humid mornings reduce transpiration; check soil moisture before pouring.',
  },
  snow: {
    atmosphere: 'snow',
    conditionLabel: 'Light Snow',
    conditionType: 'LIGHT_SNOW',
    temperatureC: -1,
    feelsLikeC: -4,
    relativeHumidity: 74,
    windKmh: 15,
    cloudCover: 90,
    uvIndex: 1,
    isDaytime: true,
    locationLabel: 'Atmosphere preview',
    source: 'preview',
    careContext: 'Cold outside · indoor heating can dry room air fast while chilly glass cools nearby leaves.',
  },
  'clear-night': {
    atmosphere: 'clear-night',
    conditionLabel: 'Clear Night',
    conditionType: 'CLEAR',
    temperatureC: 14,
    feelsLikeC: 14,
    relativeHumidity: 62,
    windKmh: 6,
    cloudCover: 8,
    uvIndex: 0,
    isDaytime: false,
    locationLabel: 'Atmosphere preview',
    source: 'preview',
    careContext: 'Nighttime rest · most houseplants pause transpiration after dusk; morning is ideal for watering.',
  },
};

function buildCareContext(
  atmosphere: WeatherAtmosphereId,
  tempC: number,
  humidity: number,
  isDaytime: boolean,
): string {
  if (atmosphere === 'snow' || tempC <= 4) {
    return `Cold outdoors (${Math.round(tempC)}°C) · indoor heating dries air quickly; keep leaves off chilly glass.`;
  }
  if (atmosphere === 'rain' || atmosphere === 'storm') {
    return `Rainy & ${humidity}% RH outdoors · lower light and moisture slow potting-mix drying.`;
  }
  if (!isDaytime) {
    return `Nighttime (${Math.round(tempC)}°C) · stomata rest after dark; morning checks are clearest.`;
  }
  if (humidity <= 38) {
    return `Dry outdoor air (${humidity}% RH) · potting mix may dry quicker than usual today.`;
  }
  if (atmosphere === 'overcast' || atmosphere === 'fog') {
    return `Soft overcast light · slower transpiration means soil holds moisture a little longer.`;
  }
  if (atmosphere === 'clear-day' || atmosphere === 'golden-hour') {
    return `Bright sky (${Math.round(tempC)}°C · ${humidity}% RH) · check the top inch of potting mix before watering.`;
  }
  return `Mild conditions (${Math.round(tempC)}°C · ${humidity}% RH) · check potting mix moisture by touch.`;
}

function mapConditionToAtmosphere(
  conditionType: string,
  isDaytime: boolean,
  cloudCover: number,
  currentTimeIso?: string,
  timeZoneId?: string,
): WeatherAtmosphereId {
  const code = (conditionType || '').toUpperCase();

  if (code.includes('THUNDER') || code.includes('STORM') || code.includes('HAIL')) {
    return 'storm';
  }
  if (code.includes('SNOW') || code.includes('SLEET') || code.includes('ICE') || code.includes('BLIZZARD') || code.includes('FLURR')) {
    return 'snow';
  }
  if (code.includes('RAIN') || code.includes('SHOWER') || code.includes('DRIZZLE')) {
    return 'rain';
  }
  if (code.includes('FOG') || code.includes('MIST') || code.includes('HAZE') || code.includes('SMOKE')) {
    return 'fog';
  }
  if (!isDaytime) {
    return 'clear-night';
  }

  // Detect golden hour around sunrise/sunset (6-7am or 17-19pm local time) on clear/partly-cloudy skies
  if (currentTimeIso) {
    try {
      const hourStr = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        ...(timeZoneId ? { timeZone: timeZoneId } : {}),
      }).format(new Date(currentTimeIso));
      const hour = Number(hourStr);
      if ((hour >= 17 && hour <= 19) || (hour >= 6 && hour <= 7)) {
        if (code.includes('CLEAR') || code.includes('SUN') || code.includes('PARTLY')) {
          return 'golden-hour';
        }
      }
    } catch {
      // Fall through to standard mapping
    }
  }

  if (code.includes('OVERCAST') || (code === 'CLOUDY' && cloudCover >= 80) || cloudCover >= 85) {
    return 'overcast';
  }
  if (code.includes('CLOUD') || cloudCover >= 35) {
    return 'partly-cloudy';
  }
  return 'clear-day';
}

interface GoogleWeatherResponse {
  currentTime?: string;
  timeZone?: { id?: string };
  isDaytime?: boolean;
  weatherCondition?: {
    type?: string;
    description?: { text?: string };
  };
  temperature?: { degrees?: number; unit?: string };
  feelsLikeTemperature?: { degrees?: number; unit?: string };
  relativeHumidity?: number;
  uvIndex?: number;
  cloudCover?: number;
  wind?: { speed?: { value?: number; unit?: string } };
  error?: { status?: string; message?: string };
}

function parseGoogleWeather(data: GoogleWeatherResponse, locationLabel: string): LiveWeatherState {
  const conditionType = data.weatherCondition?.type ?? 'CLEAR';
  const isDaytime = data.isDaytime ?? true;
  const cloudCover = Math.round(data.cloudCover ?? 0);
  const temperatureC = Math.round(data.temperature?.degrees ?? 21);
  const feelsLikeC = Math.round(data.feelsLikeTemperature?.degrees ?? temperatureC);
  const relativeHumidity = Math.round(data.relativeHumidity ?? 52);
  const windKmh = Math.round(data.wind?.speed?.value ?? 8);
  const uvIndex = Math.round(data.uvIndex ?? (isDaytime ? 3 : 0));

  const atmosphere = mapConditionToAtmosphere(
    conditionType,
    isDaytime,
    cloudCover,
    data.currentTime,
    data.timeZone?.id,
  );

  const conditionLabel =
    data.weatherCondition?.description?.text ?? WEATHER_THEMES[atmosphere].label;

  return {
    atmosphere,
    conditionLabel,
    conditionType,
    temperatureC,
    feelsLikeC,
    relativeHumidity,
    windKmh,
    cloudCover,
    uvIndex,
    isDaytime,
    locationLabel,
    source: 'google-weather',
    careContext: buildCareContext(atmosphere, temperatureC, relativeHumidity, isDaytime),
    updatedAt: data.currentTime ?? new Date().toISOString(),
  };
}

function handleQuotaResponse(status: number, payload: GoogleWeatherResponse | null) {
  if (status === 429 || payload?.error?.status === 'RESOURCE_EXHAUSTED') {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    return true;
  }
  return false;
}

export function createPreviewWeather(atmosphere: WeatherAtmosphereId): LiveWeatherState {
  return {
    ...PREVIEW_WEATHER_PRESETS[atmosphere],
    updatedAt: new Date().toISOString(),
  };
}

export function defaultTimeWeather(): LiveWeatherState {
  const hour = new Date().getHours();
  if (hour >= 20 || hour < 6) return createPreviewWeather('clear-night');
  if (hour >= 17 || hour <= 7) return createPreviewWeather('golden-hour');
  return createPreviewWeather('clear-day');
}

export async function fetchGoogleWeather(
  lat: number,
  lng: number,
  locationLabel: string,
  signal?: AbortSignal,
): Promise<LiveWeatherState | null> {
  // 1. Try Vite dev/preview server proxy (handles API key & attribution header cleanly without CORS preflight)
  try {
    const proxyRes = await fetch(
      `/api/weather?lat=${encodeURIComponent(lat.toFixed(4))}&lng=${encodeURIComponent(lng.toFixed(4))}&units=METRIC`,
      { signal },
    );
    const data = (await proxyRes.json().catch(() => null)) as GoogleWeatherResponse | null;
    if (handleQuotaResponse(proxyRes.status, data)) {
      return null;
    }
    if (proxyRes.ok && data && data.weatherCondition) {
      return parseGoogleWeather(data, locationLabel);
    }
  } catch {
    // Fall through to direct browser lookup if VITE_GOOGLE_MAPS_API_KEY is exposed
  }

  // 2. Direct browser fallback when built statically with VITE_GOOGLE_MAPS_API_KEY
  const clientKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!clientKey) return null;

  try {
    const url = new URL('https://weather.googleapis.com/v1/currentConditions:lookup');
    url.searchParams.set('key', clientKey);
    url.searchParams.set('location.latitude', lat.toFixed(4));
    url.searchParams.set('location.longitude', lng.toFixed(4));
    url.searchParams.set('unitsSystem', 'METRIC');

    const res = await fetch(url.toString(), { signal });
    const data = (await res.json().catch(() => null)) as GoogleWeatherResponse | null;
    if (handleQuotaResponse(res.status, data)) {
      return null;
    }
    if (res.ok && data && data.weatherCondition) {
      return parseGoogleWeather(data, locationLabel);
    }
  } catch {
    return null;
  }

  return null;
}
