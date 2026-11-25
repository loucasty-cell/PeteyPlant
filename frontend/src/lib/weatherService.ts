/**
 * weatherService.ts — Real-time weather & nature biome atmosphere adapter
 * backed by the Google Maps Platform Weather API (currentConditions:lookup).
 */

export * from './weather/themes';
import {
  ALL_ATMOSPHERE_IDS,
  WEATHER_THEMES,
  type LiveWeatherState,
  type WeatherAtmosphereId,
} from './weather/themes';


function buildCareContext(
  atmosphere: WeatherAtmosphereId,
  tempC: number | null,
  humidity: number | null,
  isDaytime: boolean | null,
): string {
  const theme = WEATHER_THEMES[atmosphere];
  if (atmosphere === 'snow' || atmosphere === 'alpine-frost' || atmosphere === 'glacier-fjord' || (tempC !== null && tempC <= 4)) {
    return 'Check for cold drafts or chilly glass near your plant.';
  }
  if (theme.category === 'Rain & Monsoon' || atmosphere === 'storm') {
    return 'Lower light indoors can slow potting-mix drying. Check the mix directly.';
  }
  if (isDaytime === false || theme.category === 'Nocturnal Biomes') {
    return 'Check the potting mix in the morning when conditions are easier to see.';
  }
  if ((humidity !== null && humidity <= 38) || atmosphere === 'desert-oasis') {
    return 'Check for dry air in your plant’s room and feel the potting mix.';
  }
  if (atmosphere === 'overcast' || atmosphere === 'fog' || atmosphere === 'highland-moor') {
    return 'Potting mix can hold moisture longer under lower light. Check the mix directly.';
  }
  return 'Check potting-mix moisture by touch.';
}

function buildDefaultPreviewPreset(id: WeatherAtmosphereId): Omit<LiveWeatherState, 'updatedAt'> {
  const theme = WEATHER_THEMES[id];
  const isNight = theme.category === 'Nocturnal Biomes';
  const isRain = theme.category === 'Rain & Monsoon' || id === 'storm';
  const isCold = id === 'snow' || id === 'alpine-frost' || id === 'glacier-fjord';
  const isHot = id === 'desert-oasis' || id === 'tropical-breeze' || id === 'saffron-twilight';

  const temperatureC = isCold ? -1 : isHot ? 28 : isRain ? 16 : isNight ? 14 : 22;
  const relativeHumidity = isRain ? 88 : id === 'fog' ? 92 : id === 'desert-oasis' ? 24 : id === 'tropical-breeze' ? 76 : 54;
  const windKmh = id === 'storm' ? 34 : id === 'chinook-wind' ? 28 : isRain ? 17 : 9;
  const cloudCover = isRain ? 94 : theme.clouds === 'dense' ? 82 : theme.clouds === 'light' ? 24 : 8;
  const uvIndex = isNight ? 0 : isRain ? 1 : isHot ? 8 : 5;

  return {
    atmosphere: id,
    conditionLabel: theme.label,
    conditionType: isRain ? 'RAIN' : isCold ? 'SNOW' : 'CLEAR',
    temperatureC,
    feelsLikeC: temperatureC,
    relativeHumidity,
    windKmh,
    cloudCover,
    uvIndex,
    isDaytime: !isNight,
    locationLabel: theme.biomeSubtitle,
    source: 'preview',
    careContext: buildCareContext(id, temperatureC, relativeHumidity, !isNight),
  };
}

export const PREVIEW_WEATHER_PRESETS: Record<WeatherAtmosphereId, Omit<LiveWeatherState, 'updatedAt'>> =
  Object.fromEntries(
    ALL_ATMOSPHERE_IDS.map((id) => [id, buildDefaultPreviewPreset(id)]),
  ) as Record<WeatherAtmosphereId, Omit<LiveWeatherState, 'updatedAt'>>;

/**
 * Intelligently maps live Google Weather telemetry + location latitude into the
 * richest matching theme across all 32 nature & botanical biome themes.
 */
function mapConditionToAtmosphere(
  conditionType: string | null,
  isDaytime: boolean | null,
  cloudCover: number | null,
  tempC: number | null,
  humidity: number | null,
  windKmh: number | null,
  lat: number,
  currentTimeIso?: string,
  timeZoneId?: string,
): WeatherAtmosphereId {
  const code = (conditionType || '').toUpperCase();
  const absLat = Math.abs(lat);

  if (code.includes('THUNDER') || code.includes('STORM') || code.includes('HAIL')) {
    return 'storm';
  }
  if (code.includes('SNOW') || code.includes('SLEET') || code.includes('ICE') || code.includes('BLIZZARD') || code.includes('FLURR')) {
    if (absLat >= 56) return 'glacier-fjord';
    if (cloudCover !== null && cloudCover < 55) return 'alpine-frost';
    return 'snow';
  }
  if (code.includes('RAIN') || code.includes('SHOWER') || code.includes('DRIZZLE')) {
    if (code.includes('HEAVY') || (windKmh !== null && windKmh >= 25)) return 'monsoon-downpour';
    if (tempC !== null && tempC >= 21 && humidity !== null && humidity >= 80) return 'cloud-forest-rain';
    if (code.includes('DRIZZLE')) return 'fern-gully-drizzle';
    if (cloudCover !== null && cloudCover <= 65 && isDaytime) return 'rainbow-clearing';
    return 'rain';
  }
  if (code.includes('FOG') || code.includes('MIST') || code.includes('HAZE') || code.includes('SMOKE')) {
    return 'fog';
  }
  if (isDaytime === false) {
    if (absLat >= 55) return 'aurora-borealis';
    if (tempC !== null && tempC >= 22 && humidity !== null && humidity >= 72) return 'bioluminescent-bay';
    if (tempC !== null && tempC >= 18 && humidity !== null && humidity >= 58) return 'firefly-glade';
    if (humidity !== null && humidity <= 38) return 'velvet-midnight';
    return 'clear-night';
  }

  // Detect sunrise / golden hour around 6-7am or 17-19pm local time
  if (currentTimeIso && timeZoneId) {
    try {
      const hourStr = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: timeZoneId,
      }).format(new Date(currentTimeIso));
      const hour = Number(hourStr);
      if (hour >= 5 && hour <= 7) {
        return absLat >= 44 ? 'alpenglow-dusk' : 'rose-dawn';
      }
      if (hour >= 17 && hour <= 19) {
        if (tempC !== null && tempC >= 25 && humidity !== null && humidity <= 42) return 'saffron-twilight';
        if (absLat <= 35) return 'crimson-horizon';
        return 'golden-hour';
      }
    } catch {
      // Fall through to daytime biome mapping
    }
  }

  if (tempC !== null && tempC <= 2) return 'alpine-frost';
  if (code.includes('OVERCAST') || (cloudCover !== null && (cloudCover >= 85 || (code === 'CLOUDY' && cloudCover >= 80)))) {
    return absLat >= 50 ? 'highland-moor' : 'overcast';
  }
  if (code.includes('CLOUD') || (cloudCover !== null && cloudCover >= 35)) {
    if (windKmh !== null && windKmh >= 22) return 'chinook-wind';
    if (cloudCover !== null && cloudCover >= 65) return 'silver-lining';
    return 'partly-cloudy';
  }

  // Clear / Mostly Clear daytime biomes driven by temperature, humidity & latitude
  if (tempC !== null && humidity !== null) {
    if (tempC >= 26 && humidity <= 36) return 'desert-oasis';
    if (tempC >= 24 && humidity >= 65) return 'tropical-breeze';
    if (tempC >= 22 && humidity <= 55 && absLat <= 43) return 'mediterranean-noon';
    if (humidity >= 58 && tempC >= 15 && tempC <= 24) return 'sunlit-canopy';
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

function parseGoogleWeather(
  data: GoogleWeatherResponse,
  locationLabel: string,
  lat: number,
): LiveWeatherState {
  const roundReading = (value: number | undefined) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
  const conditionType = data.weatherCondition?.type ?? null;
  const isDaytime = data.isDaytime ?? null;
  const cloudCover = roundReading(data.cloudCover);
  const temperatureC = roundReading(data.temperature?.degrees);
  const feelsLikeC = roundReading(data.feelsLikeTemperature?.degrees);
  const relativeHumidity = roundReading(data.relativeHumidity);
  const windKmh = roundReading(data.wind?.speed?.value);
  const uvIndex = roundReading(data.uvIndex);

  const atmosphere = mapConditionToAtmosphere(
    conditionType,
    isDaytime,
    cloudCover,
    temperatureC,
    relativeHumidity,
    windKmh,
    lat,
    data.currentTime,
    data.timeZone?.id,
  );

  const conditionLabel =
    data.weatherCondition?.description?.text ?? 'Condition description unavailable';

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
    updatedAt: data.currentTime ?? null,
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
      return parseGoogleWeather(data, locationLabel, lat);
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
      return parseGoogleWeather(data, locationLabel, lat);
    }
  } catch {
    return null;
  }

  return null;
}
