/**
 * GrowthLedger.tsx — Zone 2: the growth ledger.
 *
 * Replaces the old winding path with a herbarium ledger: a solid vine
 * stem down a 40px rail, small pressed-leaf marks at each entry, and
 * rectangular ledger rows (glyph tile + title + blurb + status tag).
 * No dotted path, no circular nodes, no GO labels, no pulsing.
 *
 * Logic is unchanged: streak growth points come ONLY from biophysical
 * check-ins (VPD check, 90-degree rotation, dusting, abaxial mite
 * check). The irrigation entry is CONDITION-LOCKED: watering is
 * impossible while substrate_trough_vwc > critical_depletion_vwc, and
 * the lock explains the O2-porosity reason. The triage entry opens
 * the diagnostic drawer and is framed as an Alert whenever the live
 * diagnosis is not HOMEOSTASIS_OPTIMAL.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  Bug,
  Droplets,
  Lock,
  RotateCw,
  Sparkles,
  Sprout,
  Sun,
  Wind,
  X,
} from 'lucide-react';
import {
  computeLiveMetrics,
  fallbackRuntime,
  type CheckinType,
} from '../../store/usePeteyStore';
import { CLUSTER_META } from '../../types/botanical';
import { PATHOLOGY_META } from '../../lib/biophysicsEngine';
import { useActiveSpecies, useLiveMetrics, usePeteyStore } from '../../store/usePeteyStore';

type QuestKind = 'checkin' | 'irrigation' | 'triage';

interface QuestNodeDef {
  id: string;
  kind: QuestKind;
  checkin?: CheckinType;
  title: string;
  blurb: string;
}

const NODES: QuestNodeDef[] = [
  {
    id: 'checkin-vpd',
    kind: 'checkin',
    checkin: 'vpd',
    title: 'Microclimate Check-In',
    blurb: 'Measure VPD, tune humidity, bank +25 growth points.',
  },
  {
    id: 'checkin-rotation',
    kind: 'checkin',
    checkin: 'rotation',
    title: 'Phototropism: 90° Rotation',
    blurb: 'Turn the pot a quarter-turn for even growth.',
  },
  {
    id: 'checkin-dusting',
    kind: 'checkin',
    checkin: 'dusting',
    title: 'Leaf Dusting',
    blurb: 'Wipe the adaxial surface so stomata can breathe.',
  },
  {
    id: 'checkin-mite',
    kind: 'checkin',
    checkin: 'mite',
    title: 'Abaxial Mite Check',
    blurb: 'Flip a leaf and inspect the underside for webbing.',
  },
  {
    id: 'irrigation',
    kind: 'irrigation',
    title: 'Precision Leaching Irrigation',
    blurb: 'Dose only when the substrate truly demands it.',
  },
  {
    id: 'triage',
    kind: 'triage',
    title: 'Boss Triage',
    blurb: 'Differential diagnosis for the current stress signature.',
  },
];

function nodeIcon(node: QuestNodeDef, size = 22) {
  const props = { width: size, height: size, 'aria-hidden': true } as const;
  switch (node.id) {
    case 'checkin-vpd':
      return <Wind {...props} />;
    case 'checkin-rotation':
      return <RotateCw {...props} />;
    case 'checkin-dusting':
      return <Sparkles {...props} />;
    case 'checkin-mite':
      return <Bug {...props} />;
    case 'irrigation':
      return <Droplets {...props} />;
    default:
      return <Sprout {...props} />;
  }
}

/** Small pressed-leaf mark pinned on the vine stem. */
function LeafMark({ tone }: { tone: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className={tone}>
      <path
        fill="currentColor"
        d="M8 1 C 13.5 3.5, 14 10, 8 15 C 2 10, 2.5 3.5, 8 1 Z"
      />
      <path d="M8 3 L8 13" stroke="#F8F5EA" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function fireConfetti() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;
  void confetti({
    particleCount: 90,
    spread: 75,
    origin: { y: 0.6 },
    colors: ['#00A159', '#2591C4', '#DA950B', '#BE222A'],
  });
}

/* ------------------------------------------------------------------ */
/* Quest modal content                                                 */
/* ------------------------------------------------------------------ */

function CheckinWizard({ node, onDone }: { node: QuestNodeDef; onDone: () => void }) {
  const species = useActiveSpecies();
  const env = usePeteyStore((s) => s.env);
  const runtimeBySpecies = usePeteyStore((s) => s.runtimeBySpecies);
  const completeCheckin = usePeteyStore((s) => s.completeCheckin);
  const checkinsToday = usePeteyStore((s) => s.checkinsToday);
  const [step, setStep] = useState(0);
  const [rhPreview, setRhPreview] = useState(env.relativeHumidityPct);
  const [result, setResult] = useState<string | null>(null);
  // Auto-close timer: cleared on unmount so closing the modal early
  // (X, Escape) can never close a different modal opened afterwards.
  const closeTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  const runtime =
    runtimeBySpecies[species.taxon_code] ?? fallbackRuntime(species);
  const preview = useMemo(
    () =>
      computeLiveMetrics(species, { ...env, relativeHumidityPct: rhPreview }, runtime),
    [species, env, rhPreview, runtime],
  );
  const isVpd = node.checkin === 'vpd';
  const alreadyDone = node.checkin ? checkinsToday.includes(node.checkin) : false;

  const finish = () => {
    if (!node.checkin) return;
    const outcome = completeCheckin(node.checkin);
    if (outcome === 'credited') {
      fireConfetti();
      setResult('Check-in recorded: +25 growth points and your streak grows. Nice work, plant parent.');
      closeTimer.current = window.setTimeout(onDone, 1600);
    } else {
      setResult('Already recorded today — each check-in credits growth points once per day.');
    }
  };

  const stepTitles = isVpd
    ? ['1 · Measure', '2 · Tune humidity', '3 · Confirm']
    : ['Confirm check-in'];

  return (
    <div>
      <p className="mb-3 flex items-center gap-2 text-body font-bold text-inksoft">
        <Sun className="h-4 w-4 text-amberdeep" aria-hidden="true" />
        {stepTitles[Math.min(step, stepTitles.length - 1)]} · {node.title}
      </p>

      {alreadyDone && !result ? (
        <p className="rounded-lg border-[1.5px] border-rule bg-parchment p-3 text-body font-bold text-inksoft">
          Already completed today — come back tomorrow for fresh growth points.
        </p>
      ) : (
        <>
      {isVpd && step === 0 && (
        <div className="space-y-3">
          <p className="text-body text-ink">
            Current leaf VPD is{' '}
            <span className="telemetry font-extrabold">{preview.vpdLeafKpa.toFixed(2)} kPa</span>{' '}
            — <strong>{preview.vpdStatus}</strong>. A_net is{' '}
            <span className="telemetry font-extrabold">{preview.aNet.toFixed(2)} µmol/m²/s</span>.
          </p>
          <p className="text-body text-inksoft">
            VPD is the drying power of the air. Too low invites fungi; too high slams stomata shut.
          </p>
          <button type="button" className="ledger-btn ledger-btn-leaf" onClick={() => setStep(1)}>
            Record reading →
          </button>
        </div>
      )}

      {isVpd && step === 1 && (
        <div className="space-y-3">
          <label htmlFor="rh-slider" className="text-body font-bold text-ink">
            Slide relative humidity and watch VPD + A_net recalculate live:
          </label>
          <input
            id="rh-slider"
            type="range"
            min={20}
            max={90}
            value={rhPreview}
            onChange={(e) => setRhPreview(Number(e.target.value))}
            className="ledger-range w-full"
          />
          <p className="telemetry text-body text-ink">
            RH {rhPreview}% → VPD_leaf {preview.vpdLeafKpa.toFixed(2)} kPa · A_net{' '}
            {preview.aNet.toFixed(2)} µmol/m²/s · {preview.vpdStatus}
          </p>
          <div className="flex gap-2">
            <button type="button" className="ledger-btn ledger-btn-ghost" onClick={() => setStep(0)}>
              ← Back
            </button>
            <button type="button" className="ledger-btn ledger-btn-leaf" onClick={() => setStep(2)}>
              Looks good →
            </button>
          </div>
        </div>
      )}

      {(!isVpd || step === 2) && (
        <div className="space-y-3">
          <p className="text-body text-ink">{node.blurb}</p>
          {alreadyDone && (
            <p className="rounded-lg border-[1.5px] border-rule bg-parchment p-3 text-body font-bold text-inksoft">
              Already completed today — come back tomorrow for fresh growth points.
            </p>
          )}
          {result && (
            <p className="rounded-lg border-[1.5px] border-leafdeep bg-leaftint p-3 text-body font-bold text-ink">
              {result}
            </p>
          )}
          {!alreadyDone && !result && (
            <button type="button" className="ledger-btn ledger-btn-leaf" onClick={finish}>
              Complete check-in · +25 growth points
            </button>
          )}
          {isVpd && step === 2 && !result && (
            <button type="button" className="ledger-btn ledger-btn-ghost" onClick={() => setStep(1)}>
              ← Back
            </button>
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
}

function IrrigationModal({ onDone }: { onDone: () => void }) {
  const metrics = useLiveMetrics();
  const species = useActiveSpecies();
  const waterPlant = usePeteyStore((s) => s.waterPlant);
  const [result, setResult] = useState<string | null>(null);
  // Same auto-close timer hygiene as the check-in wizard.
  const closeTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  const dose = () => {
    const outcome = waterPlant();
    if (outcome.ok) {
      fireConfetti();
      setResult(
        `Dosed ${metrics.optimalDoseMl} mL. Petey jumps for joy — and your streak is untouched, because streaks never come from watering.`,
      );
      closeTimer.current = window.setTimeout(onDone, 1800);
    } else {
      setResult(outcome.reason);
    }
  };

  if (metrics.wateringLocked) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-body font-extrabold text-danger">
          <Lock className="h-4 w-4" aria-hidden="true" /> Locked — do not water yet
        </p>
        <p className="text-body text-ink">{metrics.lockReason}</p>
        <div className="rounded-lg border-[1.5px] border-rule bg-parchment p-3 text-body text-ink">
          <p>
            Trough VWC{' '}
            <span className="telemetry font-extrabold">
              {(metrics.troughVwc * 100).toFixed(1)}%
            </span>{' '}
            is still above critical depletion{' '}
            <span className="telemetry font-extrabold">
              {(species.params.criticalDepletionVwc * 100).toFixed(1)}%
            </span>
            .
          </p>
          <p className="mt-1">
            Root-zone O₂ porosity is{' '}
            <span className="telemetry font-extrabold">
              {(metrics.airFilledPorosity * 100).toFixed(0)}%
            </span>{' '}
            (minimum {(species.params.airFilledPorosityMin * 100).toFixed(0)}%). Watering now
            would displace air and invite Pythium root rot.
          </p>
          <p className="mt-1 font-bold">
            Unlocks in ≈ {metrics.daysUntilWater.toFixed(1)} days at current ET demand.
          </p>
        </div>
        <p className="text-caption font-bold text-inksoft">
          Streaks are earned by check-ins only — watering is never offered to protect a streak.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-body font-extrabold text-waterdeep">
        <Droplets className="h-4 w-4" aria-hidden="true" /> Unlocked — substrate demand confirmed
      </p>
      <p className="text-body text-ink">
        Recommended dose:{' '}
        <span className="telemetry text-subhead font-extrabold">{metrics.optimalDoseMl} mL</span>{' '}
        — usable water refilled to field capacity plus the 15% leaching fraction, so salts flush
        out with the runoff.
      </p>
      <p className="telemetry text-caption leading-relaxed text-inksoft">
        Dose math: (FC − critical) × pot volume × 1.15 = ({species.params.fieldCapacityVwc} −{' '}
        {species.params.criticalDepletionVwc}) × {species.pot_volume_liters * 1000} mL × 1.15 ={' '}
        {metrics.optimalDoseMl} mL · Interval math: (FC − critical) / daily VWC drop ={' '}
        {metrics.optimalIntervalDays} days at {metrics.dailyEtMl.toFixed(1)} mL/day ET.
      </p>
      <p className="text-body text-inksoft">
        EC flush note: water slowly until ~15% drains from the saucer, then empty the saucer. Pause
        fertiliser until the next cycle.
      </p>
      {result && (
        <p className="rounded-lg border-[1.5px] border-leafdeep bg-leaftint p-3 text-body font-bold text-ink">
          {result}
        </p>
      )}
      {!result && (
        <button type="button" className="ledger-btn ledger-btn-water" onClick={dose}>
          Dose {metrics.optimalDoseMl} mL
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ledger + rows + modal shell                                         */
/* ------------------------------------------------------------------ */

export default function GrowthLedger() {
  const species = useActiveSpecies();
  const metrics = useLiveMetrics();
  const completedQuests = usePeteyStore((s) => s.completedQuests);
  const setDiagnosticOpen = usePeteyStore((s) => s.setDiagnosticOpen);
  const activeQuest = usePeteyStore((s) => s.activeQuest);
  const setActiveQuest = usePeteyStore((s) => s.setActiveQuest);
  const cluster = CLUSTER_META[species.care_cluster_id];
  const bossActive = metrics.primaryPathology !== 'HOMEOSTASIS_OPTIMAL';

  const activeNode = NODES.find((n) => n.id === activeQuest) ?? null;

  // Keyboard: Escape closes the quest modal (vaul handles its own drawer).
  useEffect(() => {
    if (!activeNode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveQuest(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeNode, setActiveQuest]);

  const isDone = (node: QuestNodeDef) => {
    if (node.kind === 'irrigation') return completedQuests.includes('irrigation');
    if (node.kind === 'triage') return metrics.primaryPathology === 'HOMEOSTASIS_OPTIMAL';
    return node.checkin ? completedQuests.includes(`checkin-${node.checkin}`) : false;
  };

  const openNode = (node: QuestNodeDef) => {
    if (node.kind === 'triage') {
      setDiagnosticOpen(true);
      return;
    }
    setActiveQuest(node.id);
  };

  return (
    <section id="growth-ledger" aria-label="Growth ledger" className="ledger-card p-4 sm:p-6">
      {/* Unit header: grouped by physiological guild */}
      <div className="mb-4 rounded-lg border-[1.5px] border-rule bg-parchment p-4">
        <p className="telemetry text-caption text-inksoft">
          UNIT · {cluster.guild}
        </p>
        <h2 className="font-display text-subhead font-bold tracking-tight text-ink">
          {species.common_name} — {cluster.short}
        </h2>
        <p className="text-body text-inksoft">{cluster.blurb}</p>
      </div>

      {/* Vine stem + ledger rows */}
      <div className="relative">
        <div
          aria-hidden="true"
          className="absolute bottom-6 left-[20px] top-6 w-[2px] bg-leafdeep/30"
        />
        <ol className="relative flex flex-col gap-4">
          {NODES.map((node) => {
            const done = isDone(node);
            const lockedIrrigation = node.kind === 'irrigation' && metrics.wateringLocked;
            const bossAlert = node.kind === 'triage' && bossActive;
            const status = done
              ? { tag: 'Pressed', tone: 'bg-leaftint text-leafdeep', leaf: 'text-leafdeep' }
              : lockedIrrigation
                ? { tag: 'Sealed', tone: 'bg-ambertint text-amberdeep', leaf: 'text-amber' }
                : bossAlert
                  ? { tag: 'Alert', tone: 'bg-dangersoft text-danger', leaf: 'text-danger' }
                  : { tag: 'Open', tone: 'bg-parchment text-inksoft', leaf: 'text-inkfaint' };
            return (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => openNode(node)}
                  className={`ledger-row grid-cols-[40px_1fr] items-center gap-3 p-4 text-left ${
                    bossAlert ? 'border-danger' : ''
                  }`}
                  aria-label={`${node.title}${done ? ' (completed)' : ''}${lockedIrrigation ? ' (locked)' : ''}`}
                >
                  <span className="flex items-center justify-center" aria-hidden="true">
                    <LeafMark tone={status.leaf} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-ink" aria-hidden="true">
                        {lockedIrrigation ? <Lock width={20} height={20} /> : nodeIcon(node, 20)}
                      </span>
                      <span className="text-body font-bold text-ink">{node.title}</span>
                      <span className={`ledger-tag ${status.tone}`}>{status.tag}</span>
                    </span>
                    <span className="mt-1 block text-body text-inksoft">{node.blurb}</span>
                    {node.kind === 'irrigation' && lockedIrrigation && (
                      <span className="telemetry mt-1 block text-caption text-amberdeep">
                        Sealed until trough VWC ≤ {(species.params.criticalDepletionVwc * 100).toFixed(0)}%
                      </span>
                    )}
                    {bossAlert && (
                      <span className="telemetry mt-1 block text-caption text-danger">
                        {PATHOLOGY_META[metrics.primaryPathology].label} — open for the differential
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Ledger footer note */}
      <div className="mt-4 rounded-lg border-[1.5px] border-rule bg-parchment p-4 text-center text-body font-bold text-inksoft">
        {bossActive
          ? `Ledger note: ${PATHOLOGY_META[metrics.primaryPathology].label} — open the triage entry for the differential.`
          : 'All clear: homeostasis optimal. Keep the daily check-ins coming.'}
      </div>

      {/* Quest modal */}
      <AnimatePresence>
        {activeNode && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActiveQuest(null)}
            role="presentation"
          >
            <motion.div
              className="ledger-card max-h-[85vh] w-full max-w-lg overflow-y-auto p-4 sm:p-6"
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={activeNode.title}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <h3 className="font-display text-subhead font-bold tracking-tight text-ink">{activeNode.title}</h3>
                <button
                  type="button"
                  className="ledger-btn ledger-btn-ghost ledger-btn-sm"
                  onClick={() => setActiveQuest(null)}
                  aria-label="Close quest"
                  autoFocus
                >
                  <X width={18} height={18} aria-hidden="true" />
                </button>
              </div>
              {activeNode.kind === 'irrigation' ? (
                <IrrigationModal onDone={() => setActiveQuest(null)} />
              ) : (
                <CheckinWizard node={activeNode} onDone={() => setActiveQuest(null)} />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
