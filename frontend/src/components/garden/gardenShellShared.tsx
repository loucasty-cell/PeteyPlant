import { useEffect, useState } from 'react';
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Moon,
  Sun,
} from 'lucide-react';
import type { GardenPlant } from '../../lib/gardenApi';
import {
  ALL_ATMOSPHERE_IDS,
  WEATHER_THEMES,
  type WeatherAtmosphereId,
} from '../../lib/weatherService';

export type PrimaryView = 'home' | 'detail' | 'garden' | 'lens' | 'care' | 'more' | 'add' | 'lab';

export const SELECTED_PLANT_KEY = 'petey-selected-plant-v1';
export const RENDER_MODE_KEY = 'petey-disable-3d-v1';
const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

export const ATMOSPHERE_LIST: WeatherAtmosphereId[] = ALL_ATMOSPHERE_IDS;

export const STATUS_LABELS: Record<GardenPlant['status'], string> = {
  check: 'Check soil',
  ready: 'Water now',
  wait: 'Hold off',
  rest: 'Doing well',
  details: 'Needs info',
};

export const VIEW_TITLES: Record<PrimaryView, string> = {
  home: 'Petey Plant — Home',
  detail: 'Petey Plant — Plant Care Profile',
  garden: 'Petey Plant — My Garden',
  lens: 'Petey Plant — Petey Lens',
  care: 'Petey Plant — Care & Alerts',
  more: 'Petey Plant — Settings & Catalog',
  add: 'Petey Plant — Add Plant',
  lab: 'Petey Plant — Plant Lab (Demo)',
};

export function nextCheckLabel(plant: GardenPlant): string {
  if (plant.status === 'ready') return 'Dry mix reported';
  if (plant.status === 'wait') {
    return plant.next_check_at
      ? `Hold · Est. ${DATE_FORMAT.format(new Date(plant.next_check_at))}`
      : 'Hold watering';
  }
  if (plant.status === 'details') return 'Confirm drainage';
  if (!plant.next_check_at) return 'Check potting mix';
  const date = new Date(plant.next_check_at);
  return date.getTime() <= Date.now()
    ? 'Soil check due'
    : `Est. check ${DATE_FORMAT.format(date)}`;
}

export function isDueNow(plant: GardenPlant): boolean {
  if (plant.status === 'ready' || plant.status === 'check') return true;
  if (!plant.next_check_at) return false;
  return new Date(plant.next_check_at).getTime() <= Date.now();
}

export function formatHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}:00 ${suffix}`;
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const pref = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(pref.matches);
    pref.addEventListener('change', update);
    return () => pref.removeEventListener('change', update);
  }, []);
  return reduced;
}

export function WeatherIcon({ atmosphere }: { atmosphere: WeatherAtmosphereId }) {
  const theme = WEATHER_THEMES[atmosphere];
  if (!theme) {
    return <Sun className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
  if (theme.clouds === 'storm' || theme.particles === 'storm-rain') {
    return <CloudLightning className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
  if (theme.particles === 'snow') {
    return <CloudSnow className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
  if (theme.particles === 'rain' || theme.category === 'Rain & Monsoon') {
    return <CloudRain className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
  if (theme.particles === 'mist' || theme.category === 'Mist, Storm & Frost') {
    return <CloudFog className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
  if (theme.celestial === 'moon' || theme.category === 'Nocturnal Biomes') {
    return <Moon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
  if (theme.category === 'Clouds & Breeze' || theme.clouds === 'dense') {
    return <Cloud className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
  return <Sun className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
}
