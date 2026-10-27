/**
 * TopTelemetryBar.tsx — Zone 1 masthead (herbarium-ledger identity).
 *
 * Folio heading (serif scientific name + guild specimen label), a
 * framed specimen switcher, growth rings (tree-ring streak marks —
 * earned ONLY by biophysical check-ins, never by watering), growth
 * points (Sprout glyph, never the experience-points abbreviation), a
 * VPD status label, and the physiological health bar with its
 * telemetry exposed.
 */

import { Activity, Droplets, Flower2, Leaf, ShieldCheck, Sprout, TreeDeciduous } from 'lucide-react';
import { CLUSTER_META } from '../types/botanical';
import { useActiveSpecies, useLiveMetrics, usePeteyStore } from '../store/usePeteyStore';

const ARCHETYPE_GLYPH: Record<string, typeof Leaf> = {
  fenestrated: Leaf,
  ellipse: Flower2,
  sword: Sprout,
  broad: TreeDeciduous,
};

/** Growth rings: three concentric 2px rings. A complete ring = one full
 * 7-day week in the streak; a partial arc = the current week's share.
 * The centre number is the exact streak-day count. */
function GrowthRings({ streakDays }: { streakDays: number }) {
  const rings = [
    { r: 10, week: 1 },
    { r: 15, week: 2 },
    { r: 20, week: 3 },
  ];
  return (
    <span
      className="inline-flex items-center gap-2"
      title="Streak earned by daily biophysical check-ins (VPD check, rotation, dusting, mite check) — watering never extends a streak"
    >
      <svg width="48" height="48" viewBox="0 0 48 48" role="img" aria-label={`${streakDays}-day check-in streak`}>
        {rings.map(({ r, week }) => {
          const done = streakDays - (week - 1) * 7;
          const frac = Math.max(0, Math.min(1, done / 7));
          const c = 2 * Math.PI * r;
          const stroke = frac >= 1 ? '#007338' : frac > 0 ? '#00A159' : '#D0CEC7';
          return (
            <circle
              key={week}
              cx="24"
              cy="24"
              r={r}
              fill="none"
              stroke={stroke}
              strokeWidth="2"
              strokeDasharray={`${frac * c} ${c}`}
              transform="rotate(-90 24 24)"
            />
          );
        })}
        <text x="24" y="28" textAnchor="middle" fontSize="12.8" fontWeight="700" fill="#181B1F" fontFamily="JetBrains Mono, monospace">
          {streakDays}
        </text>
      </svg>
      <span className="text-caption font-bold text-inksoft">
        day streak
        <span className="block font-normal text-inkfaint">check-ins only</span>
      </span>
    </span>
  );
}

function VpdStatusLabel({ status }: { status: string }) {
  const tone =
    status === 'OPTIMAL TRANSPIRATION'
      ? 'bg-leaftint text-leafdeep'
      : status === 'FUNGAL RISK'
        ? 'bg-dangersoft text-danger'
        : 'bg-ambertint text-amberdeep';
  return (
    <span className={`ledger-tag ${tone}`}>
      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
      {status}
    </span>
  );
}

/** Binomial (genus + species) for the switcher: the full authority
 * string (e.g. "Goeppertia makoyana (E.Morren) Borchs. & S.Suarez")
 * cannot fit a 320px native select and truncates. The full authority
 * name is still shown in the diagnostic inspector's provenance card. */
function binomial(scientificName: string): string {
  return scientificName.split(' ').slice(0, 2).join(' ');
}

export default function TopTelemetryBar() {
  const speciesList = usePeteyStore((s) => s.species);
  const activeSpeciesId = usePeteyStore((s) => s.activeSpeciesId);
  const selectSpecies = usePeteyStore((s) => s.selectSpecies);
  const streakDays = usePeteyStore((s) => s.streakDays);
  const growthPoints = usePeteyStore((s) => s.xp);
  const species = useActiveSpecies();
  const metrics = useLiveMetrics();
  const cluster = CLUSTER_META[species.care_cluster_id];
  const Glyph = ARCHETYPE_GLYPH[species.params.archetype] ?? Sprout;

  return (
    <header className="ledger-card flex flex-col gap-4 p-4 sm:p-6" aria-label="Plant telemetry">
      <div className="flex flex-wrap items-center gap-4">
        {/* Specimen switcher: framed ledger control, not a pill */}
        <div className="flex min-w-0 max-w-full items-center gap-3" role="group" aria-label="Switch plant">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border-[1.5px] border-rulestrong bg-parchment text-leafdeep sm:h-12 sm:w-12" aria-hidden="true">
            <Glyph className="h-5 w-5 sm:h-6 sm:w-6" />
          </span>
          <span className="min-w-0">
            <span className="telemetry block text-caption text-inkfaint">SPECIMEN · {cluster.short}</span>
            <label htmlFor="plant-switcher" className="sr-only">
              Active plant
            </label>
            <select
              id="plant-switcher"
              className="w-full min-w-0 max-w-[208px] cursor-pointer bg-transparent font-display text-body font-bold tracking-tight text-ink outline-none sm:max-w-[280px]"
              value={activeSpeciesId}
              onChange={(e) => selectSpecies(e.target.value)}
            >
              {speciesList.map((sp) => (
                <option key={sp.taxon_code} value={sp.taxon_code}>
                  {binomial(sp.scientific_name)}
                </option>
              ))}
            </select>
          </span>
        </div>

        <span className="ml-auto flex flex-wrap items-center gap-4">
          <GrowthRings streakDays={streakDays} />
          <span className="inline-flex items-center gap-2" title="Growth points come from check-ins and care actions">
            <Sprout className="h-5 w-5 text-leafdeep" aria-hidden="true" />
            <span className="telemetry text-subhead">{growthPoints}</span>
            <span className="text-caption font-bold text-inksoft">growth points</span>
          </span>
          <VpdStatusLabel status={metrics.vpdStatus} />
        </span>
      </div>

      {/* Physiological health bar with exposed telemetry. Two lines so
         the 320px layout never overflows: label + bar, then a wrapping
         telemetry caption row (A_net + VPD_leaf at every width). */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="inline-flex shrink-0 items-center gap-2 text-body font-bold text-ink">
            <Activity className="h-5 w-5 text-leafdeep" aria-hidden="true" />
            Health
            <span className="telemetry">{Math.round(metrics.healthIndex)}</span>
            <span className="text-inksoft">/ 100</span>
          </span>
          <div
            className="ledger-track h-4 min-w-0 flex-1"
            role="progressbar"
            aria-valuenow={Math.round(metrics.healthIndex)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Physiological health index"
          >
            <div
              className="h-full bg-leaf transition-[width] duration-500"
              style={{ width: `${Math.max(2, Math.min(100, metrics.healthIndex))}%` }}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="telemetry text-caption text-inksoft">
            A_net {metrics.aNet.toFixed(2)} µmol/m²/s
          </span>
          <span className="inline-flex items-center gap-2 text-caption font-bold text-inksoft">
            <Droplets className="h-4 w-4 text-water" aria-hidden="true" />
            VPD_leaf <span className="telemetry">{metrics.vpdLeafKpa.toFixed(2)} kPa</span>
          </span>
        </div>
      </div>
    </header>
  );
}
