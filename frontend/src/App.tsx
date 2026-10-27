/**
 * App.tsx — responsive 3-zone shell (herbarium-ledger identity).
 *
 * Zone 1: TopTelemetryBar masthead. Zone 2: GrowthLedger.
 * Zone 3: the single persistent PeteyTerrariumCanvas + diagnostic
 * inspector. Mobile: bottom nav + swipeable drawers. Desktop: left nav
 * rail (80px), center ledger, right sticky terrarium + inspector
 * (420px). Shell max width 1440 — all on the 4pt grid.
 *
 * The terrarium is rendered EXACTLY ONCE. Breakpoint changes only move
 * it with CSS order — there is never a second <Canvas> in the tree.
 */

import { useEffect, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { FlaskConical, Leaf, Moon, Sprout, Sun, TreePine } from 'lucide-react';
import TopTelemetryBar from './components/TopTelemetryBar';
import GrowthLedger from './components/ledger/GrowthLedger';
import PeteyTerrariumCanvas from './components/three/PeteyTerrariumCanvas';
import MuseDiagnosticSheet from './components/diagnostics/MuseDiagnosticSheet';
import { usePeteyStore } from './store/usePeteyStore';
import { api } from './lib/api';

function useBackendStatus() {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  useEffect(() => {
    let cancelled = false;
    void api.health().then((h) => {
      if (!cancelled) setStatus(h ? 'online' : 'offline');
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function App() {
  const growthPoints = usePeteyStore((s) => s.xp);
  const setDiagnosticOpen = usePeteyStore((s) => s.setDiagnosticOpen);
  const diagnosticOpen = usePeteyStore((s) => s.diagnosticOpen);
  const backendStatus = useBackendStatus();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  const growthPointsTag = (
    <span className="ledger-tag bg-parchment text-ink">
      <Sprout className="h-4 w-4 text-leafdeep" aria-hidden="true" />
      <span className="telemetry">{growthPoints}</span> growth points
    </span>
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-paper font-sans text-ink">
        <div className="mx-auto max-w-[1440px] px-3 pb-28 pt-3 sm:px-4 lg:pb-8">
          <TopTelemetryBar />

          {/* Backend link status + growth points (offline-first: local engine always works) */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={`ledger-tag ${
                backendStatus === 'online'
                  ? 'bg-leaftint text-leafdeep'
                  : 'bg-ambertint text-amberdeep'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-sm ${
                  backendStatus === 'online' ? 'bg-leaf' : 'bg-amber'
                }`}
                aria-hidden="true"
              />
              {backendStatus === 'online'
                ? 'Backend connected'
                : backendStatus === 'checking'
                  ? 'Checking backend…'
                  : 'Backend offline — running on the local biophysics engine'}
            </span>
            {growthPointsTag}
            <button
              type="button"
              className="ledger-btn ledger-btn-ghost ledger-btn-sm ml-auto"
              onClick={() => setDark((d) => !d)}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {dark ? <Sun width={16} height={16} aria-hidden="true" /> : <Moon width={16} height={16} aria-hidden="true" />}
              {dark ? 'Light' : 'Dark'}
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-4 lg:grid lg:grid-cols-[80px_minmax(0,1fr)_420px] lg:items-start">
            {/* Left nav rail (desktop) */}
            <nav
              aria-label="Primary"
              className="order-2 hidden flex-col items-center gap-2 lg:order-1 lg:flex lg:sticky lg:top-4"
            >
              <button
                type="button"
                className="ledger-btn ledger-btn-leaf"
                onClick={() => scrollToId('growth-ledger')}
                aria-label="Go to growth ledger"
              >
                <Sprout width={22} height={22} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="ledger-btn ledger-btn-water"
                onClick={() => scrollToId('terrarium')}
                aria-label="Go to terrarium"
              >
                <TreePine width={22} height={22} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`ledger-btn ${diagnosticOpen ? 'ledger-btn-ink' : 'ledger-btn-ghost'}`}
                onClick={() => setDiagnosticOpen(!diagnosticOpen)}
                aria-label="Toggle diagnostic inspector"
                aria-pressed={diagnosticOpen}
              >
                <FlaskConical width={22} height={22} aria-hidden="true" />
              </button>
              <span className="ledger-tag mt-2 bg-surface text-inksoft">
                <Leaf className="h-3 w-3 text-leafdeep" aria-hidden="true" />
                Petey
              </span>
            </nav>

            {/* Center: growth ledger */}
            <main id="growth-ledger" className="order-3 scroll-mt-4 lg:order-2">
              <GrowthLedger />
            </main>

            {/* Right: terrarium + inspector (ONE Canvas, moved by order) */}
            <div className="order-1 flex flex-col gap-4 lg:order-3 lg:sticky lg:top-4">
              <div id="terrarium" className="scroll-mt-4">
                <PeteyTerrariumCanvas />
              </div>
              <button
                type="button"
                className={`ledger-btn w-full ${diagnosticOpen ? 'ledger-btn-ink' : 'ledger-btn-ghost'}`}
                onClick={() => setDiagnosticOpen(!diagnosticOpen)}
                aria-pressed={diagnosticOpen}
              >
                <FlaskConical width={18} height={18} aria-hidden="true" />
                {diagnosticOpen ? 'Hide diagnostic inspector' : 'Open diagnostic inspector'}
              </button>
              <MuseDiagnosticSheet />
            </div>
          </div>
        </div>

        {/* Mobile bottom nav */}
        <nav
          aria-label="Mobile"
          className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around gap-1 border-t-2 border-ink bg-surface px-2 py-2 lg:hidden"
        >
          <button
            type="button"
            className="flex flex-col items-center gap-0.5 rounded-md px-3 py-1 text-caption font-extrabold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leafdeep"
            onClick={() => scrollToId('growth-ledger')}
          >
            <Sprout width={22} height={22} aria-hidden="true" />
            Ledger
          </button>
          <button
            type="button"
            className="flex flex-col items-center gap-0.5 rounded-md px-3 py-1 text-caption font-extrabold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leafdeep"
            onClick={() => scrollToId('terrarium')}
          >
            <TreePine width={22} height={22} aria-hidden="true" />
            Petey
          </button>
          <button
            type="button"
            className="flex flex-col items-center gap-0.5 rounded-md px-3 py-1 text-caption font-extrabold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leafdeep"
            onClick={() => setDiagnosticOpen(true)}
          >
            <FlaskConical width={22} height={22} aria-hidden="true" />
            Diagnose
          </button>
          <span className="flex flex-col items-center gap-0.5 px-3 py-1 text-caption font-extrabold text-ink">
            <Sprout width={22} height={22} className="text-leafdeep" aria-hidden="true" />
            {growthPoints} pts
          </span>
        </nav>
      </div>
    </MotionConfig>
  );
}
