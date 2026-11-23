import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Leaf, Music2 } from 'lucide-react';
import type { PalMood } from './PalCharacter';
import './pal-stage.css';

export const pals = [
  { id: 'Monstera deliciosa', name: 'Monstera', trait: 'The confident leader' },
  { id: 'Epipremnum aureum', name: 'Golden Pothos', trait: 'The friendly trailblazer' },
  { id: 'Dracaena trifasciata', name: 'Snake Plant', trait: 'The steady guardian' },
  { id: 'Chlorophytum comosum', name: 'Spider Plant', trait: 'The caring multitasker' },
  { id: 'Aloe vera', name: 'Aloe Vera', trait: 'The resourceful helper' },
  { id: 'Dypsis lutescens', name: 'Areca Palm', trait: 'The sunny socialite' },
  { id: 'Goeppertia makoyana', name: 'Peacock Plant', trait: 'The elegant diva' },
  { id: 'Ficus lyrata', name: 'Fiddle-Leaf Fig', trait: 'The ambitious believer' },
];

const PalRenderer = lazy(() => import('./PalWebGL').then(module => ({ default: module.PalRenderer })));
const PalView = lazy(() => import('./PalWebGL').then(module => ({ default: module.PalView })));

export function PalCanvas() {
  return <Suspense fallback={null}><PalRenderer /></Suspense>;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  return reduced;
}

export function Portrait({ pal, className = '', onShelf = false, mood = 'idle', interactive = false }: {
  pal: (typeof pals)[number]; className?: string; onShelf?: boolean; mood?: PalMood; interactive?: boolean;
}) {
  const stage = useRef<HTMLSpanElement>(null);
  const [large, setLarge] = useState(false);
  const [play, setPlay] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) => setLarge(entry.contentRect.width >= 92));
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  return <span ref={stage} className={`garden-portrait pal-stage ${onShelf ? 'pal-stage-shelf' : ''} ${className}`} data-mood={mood}>
    <Leaf className="pal-fallback" aria-hidden="true" />
    {large && <Suspense fallback={null}>
      <PalView variant={pals.indexOf(pal)} mood={mood} play={play} reduced={reduced} />
    </Suspense>}
    {interactive && large && !reduced && <button
      className="pal-play" type="button" onClick={() => setPlay(count => count + 1)}
      aria-label={`Watch ${pal.name} dance`}
    ><Music2 aria-hidden="true" /> Dance</button>}
  </span>;
}
