/**
 * MuseDiagnosticSheet.tsx — Zone 3 inspector.
 *
 * Mobile: vaul bottom drawer. Desktop: sticky side panel. Same content:
 * live environment sliders driving instant client-side recalculation
 * (and the 3D reaction, via the shared store), the live diagnosis list,
 * and the APG IV + PlantNet provenance card with the pet-safety warning.
 */

import { useEffect, useMemo, useState } from 'react';
import { Drawer } from 'vaul';
import { AlertTriangle, FlaskConical, PawPrint, X } from 'lucide-react';
import {
  computeHealthIndex,
  computeNetPhotosynthesis,
  computeVpd,
  diagnose,
  PATHOLOGY_META,
  simulateHydration,
} from '../../lib/biophysicsEngine';
import { buildDiagnosisEvidence } from '../../lib/diagnosisEvidence';
import { api, type TriageResult } from '../../lib/api';
import {
  useActiveSpecies,
  useLiveMetrics,
  usePeteyStore,
  type LiveMetrics,
} from '../../store/usePeteyStore';
import type { SpeciesRecord } from '../../types/botanical';

const PET_SAFETY: Record<string, string> = {
  NON_TOXIC_BIOSAFE: 'Pet-safe: no known toxicity mechanism for cats or dogs.',
  INSOLUBLE_CA_OXALATE_NEEDLE_RAPHIDES:
    'Pet caution: insoluble calcium-oxalate raphides — oral irritation, drooling, and pawing if chewed.',
  STEROIDAL_SAPONINS_GI_IRRITANT:
    'Pet caution: steroidal saponins — vomiting, diarrhoea, and lethargy if ingested.',
  PROTEOLYTIC_FICIN_FURANOCOUMARIN_SAP:
    'Pet caution: ficin + furanocoumarin latex sap — skin irritation and GI upset if chewed.',
};

function SliderRow({
  id,
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="flex justify-between text-body font-bold text-ink">
        <span>{label}</span>
        <span className="telemetry">
          {value} {unit}
        </span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="ledger-range w-full"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ReAct trace — backend triage steps, local engine fallback           */
/* ------------------------------------------------------------------ */

interface LocalTraceStep {
  thought: string;
  action: string;
  observation: string;
  update: string;
  latencyMs: number;
}

function timed<T>(fn: () => T): { value: T; ms: number } {
  const t0 = performance.now();
  const value = fn();
  return { value, ms: performance.now() - t0 };
}

function fmtMs(ms: number): string {
  return ms < 0.01 ? '<0.01 ms' : `${ms.toFixed(2)} ms`;
}

/** The client-side engine's own ReAct trace, measured, not asserted. */
function buildLocalTrace(species: SpeciesRecord, metrics: LiveMetrics): LocalTraceStep[] {
  const p = species.params;
  const env = usePeteyStore.getState().env;
  const vpd = timed(() => computeVpd(env.airTempC, env.relativeHumidityPct));
  const photo = timed(() =>
    computeNetPhotosynthesis(
      {
        lcpPpfd: p.lcpPpfd,
        lspPpfd: p.lspPpfd,
        quantumYieldAlpha: p.quantumYieldAlpha,
        aMaxUmolM2S: p.aMaxUmolM2S,
        darkRespirationRd: p.darkRespirationRd,
        variegationPenalty: p.variegationPenalty,
      },
      {
        tBaseC: p.tBaseC,
        tOptMinC: p.tOptMinC,
        tOptMaxC: p.tOptMaxC,
        tUpperStressC: p.tUpperStressC,
        vpdOptMaxKpa: p.vpdOptMaxKpa,
        vpdStomatalClosureKpa: p.vpdStomatalClosureKpa,
      },
      env.ppfd,
      env.airTempC,
      vpd.value.vpdAirKpa,
    ),
  );
  const hydro = timed(() =>
    simulateHydration(
      {
        porosityFraction: p.porosityFraction,
        airFilledPorosityMin: p.airFilledPorosityMin,
        fieldCapacityVwc: p.fieldCapacityVwc,
        criticalDepletionVwc: p.criticalDepletionVwc,
        permanentWiltingPointVwc: p.permanentWiltingPointVwc,
        hypoxiaRotSusceptibility: p.hypoxiaRotSusceptibility,
        cropCoefficientKc: p.cropCoefficientKc,
      },
      species.pot_volume_liters,
      p.fieldCapacityVwc,
      species.watering_amount_ml,
      env.wateringIntervalDays,
      species.leaf_count,
      vpd.value.vpdAirKpa,
      species.photosynthetic_pathway,
    ),
  );
  const diags = timed(() =>
    diagnose(
      {
        lcpPpfd: p.lcpPpfd,
        lspPpfd: p.lspPpfd,
        ecBurnThresholdMsCm: p.ecBurnThresholdMsCm,
        fluorideBoronSensitive: p.fluorideBoronSensitive,
      },
      {
        vpdAirKpa: vpd.value.vpdAirKpa,
        hypoxiaRisk: metrics.hypoxiaRisk,
        ppfd: env.ppfd,
        fertilizerEcMsCm: species.fertilizer_ec_ms_cm,
      },
    ),
  );
  const health = timed(() =>
    computeHealthIndex(
      photo.value.aNetUmolM2S,
      p.aMaxUmolM2S,
      metrics.hypoxiaRisk,
      metrics.desiccationRisk,
      diags.value.length > 0 ? diags.value[0].severityScore : 0,
    ),
  );

  return [
    {
      thought:
        'Saturation vapour pressure rises exponentially with temperature (Magnus-Tetens). The leaf sits 0.8 °C cooler than air via transpirational cooling, so air and leaf VPD differ — and that gap drives everything downstream.',
      action: `computeVpd(air_temp=${env.airTempC} °C, RH=${env.relativeHumidityPct}%, leaf_offset=−0.8 °C)`,
      observation: `es=${vpd.value.esAirKpa.toFixed(4)} kPa, ea=${vpd.value.eaKpa.toFixed(4)} kPa → VPD_air=${vpd.value.vpdAirKpa.toFixed(4)} kPa, VPD_leaf=${vpd.value.vpdLeafKpa.toFixed(4)} kPa, dew point ${vpd.value.dewPointC.toFixed(2)} °C.`,
      update: 'Drying power is now known. It gates stomatal conductance and ET demand in the next two steps.',
      latencyMs: vpd.ms,
    },
    {
      thought:
        'Stomata close as VPD_air rises past the optimum; temperature gates enzyme kinetics; light above saturation bleaches PSII. Feed the gated PPFD into the non-rectangular hyperbola.',
      action: `computeNetPhotosynthesis(PPFD=${env.ppfd}, T=${env.airTempC} °C, VPD_air=${vpd.value.vpdAirKpa.toFixed(4)} kPa)`,
      observation: `gₛ=${photo.value.stomatalConductanceRatio.toFixed(4)}, temp=${photo.value.thermalEfficiencyRatio.toFixed(4)}, incident=${(env.ppfd * photo.value.stomatalConductanceRatio * photo.value.thermalEfficiencyRatio).toFixed(1)} µmol/m²/s → A_gross=${photo.value.aGrossUmolM2S.toFixed(4)}, R_d=${photo.value.rdUmolM2S.toFixed(4)} → A_net=${photo.value.aNetUmolM2S.toFixed(4)} µmol/m²/s.`,
      update:
        photo.value.aNetUmolM2S >= 0
          ? 'Positive carbon balance — the plant is gaining biomass today.'
          : 'Negative carbon balance — respiration exceeds photosynthesis; etiolation logic will fire downstream.',
      latencyMs: photo.ms,
    },
    {
      thought:
        'A watering cycle starts at field capacity, the dose lifts VWC (capped at porosity), and ET drains it linearly. Porosity is judged at peak VWC, when roots are most oxygen-starved.',
      action: `simulateHydration(pot=${species.pot_volume_liters} L, initial=FC, dose=${species.watering_amount_ml} mL, interval=${env.wateringIntervalDays} d, leaves=${species.leaf_count})`,
      observation: `ET=${hydro.value.dailyEtMl.toFixed(2)} mL/day → peak=${(hydro.value.peakVwc * 100).toFixed(1)}%, trough=${(hydro.value.troughVwc * 100).toFixed(1)}%, mean=${(hydro.value.meanVwc * 100).toFixed(1)}%, O₂ porosity=${(hydro.value.airFilledPorosity * 100).toFixed(0)}%, hypoxia=${(hydro.value.hypoxiaRotRiskScore * 100).toFixed(0)}%, desiccation=${(hydro.value.desiccationWiltRiskScore * 100).toFixed(0)}%.`,
      update: 'Water state is now known. The trough-vs-critical comparison decides the watering lock.',
      latencyMs: hydro.ms,
    },
    {
      thought:
        'Each pathology has one deterministic trigger. Evaluate all six against the live vector; rank by severity; an empty set means homeostasis.',
      action: `diagnose(VPD_air, hypoxia, PPFD, EC=${species.fertilizer_ec_ms_cm} mS/cm, fluoride=0.7 ppm)`,
      observation:
        diags.value.length > 0
          ? diags.value.map((d) => `${d.code} (severity ${d.severityScore.toFixed(3)}, confidence ${d.probability.toFixed(2)})`).join('; ')
          : 'No trigger fired → HOMEOSTASIS_OPTIMAL.',
      update: `Primary code set to ${diags.value.length > 0 ? diags.value[0].code : 'HOMEOSTASIS_OPTIMAL'} — this drives the boss node, the 3D tints, and the watering lock.`,
      latencyMs: diags.ms,
    },
    {
      thought:
        'Health blends carbon (40%), hydraulic safety (30%), and pathology severity (30%). Growth follows carbon surplus alone.',
      action: 'computeHealthIndex(A_net, A_max, hypoxia, desiccation, primary severity)',
      observation: `Health=${health.value.healthIndex.toFixed(2)} / 100; predicted 30-day leaves=${health.value.predicted30dNewLeaves.toFixed(2)}.`,
      update: 'Headline health and the growth forecast are set. Trace complete.',
      latencyMs: health.ms,
    },
  ];
}

function TraceStepCard({
  index,
  thought,
  action,
  observation,
  update,
  latency,
}: {
  index: number;
  thought: string;
  action: string;
  observation: string;
  update: string;
  latency: string;
}) {
  return (
    <article className="rounded-lg border-[1.5px] border-rule bg-surface p-3">
      <p className="flex items-center justify-between gap-2 text-caption font-extrabold tracking-wide text-ink-soft">
        <span>STEP {index + 1}</span>
        <span className="telemetry">{latency}</span>
      </p>
      <dl className="mt-1 space-y-1 text-body">
        <div>
          <dt className="font-extrabold text-leafdeep">Thought</dt>
          <dd className="text-ink">{thought}</dd>
        </div>
        <div>
          <dt className="font-extrabold text-waterdeep">Action</dt>
          <dd className="telemetry break-words text-ink">{action}</dd>
        </div>
        <div>
          <dt className="font-extrabold text-leafdeep">Observation</dt>
          <dd className="text-ink">{observation}</dd>
        </div>
        <div>
          <dt className="font-extrabold text-amberdeep">Epistemic update</dt>
          <dd className="text-ink">{update}</dd>
        </div>
      </dl>
    </article>
  );
}

function ReactTrace({ species, metrics }: { species: SpeciesRecord; metrics: LiveMetrics }) {
  const [backendTrace, setBackendTrace] = useState<TriageResult | null>(null);
  const [source, setSource] = useState<'loading' | 'backend' | 'local'>('loading');
  const localTrace = useMemo(() => buildLocalTrace(species, metrics), [species, metrics]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const plants = await api.plants();
      const id = plants?.plants?.[0]?.id;
      if (!id) {
        if (!cancelled) setSource('local');
        return;
      }
      const triage = await api.triage(id);
      if (cancelled) return;
      if (triage) {
        setBackendTrace(triage);
        setSource('backend');
      } else {
        setSource('local');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section aria-label="ReAct trace" className="space-y-2">
      <h3 className="font-display text-base font-bold text-ink">ReAct trace</h3>
      {source === 'loading' && (
        <p className="text-body text-ink-soft">Contacting the Muse triage agent…</p>
      )}
      {source === 'backend' && backendTrace && (
        <>
          <p className="rounded-lg border-[1.5px] border-leafdeep bg-parchment p-3 text-body text-ink">
            <span className="font-extrabold">Muse agent trace</span> · plant{' '}
            <span className="telemetry font-bold">{backendTrace.plant_id}</span> · model{' '}
            <span className="telemetry font-bold">{backendTrace.muse_model_id}</span> ·{' '}
            {backendTrace.summary}
          </p>
          {backendTrace.agent_trace.map((step, i) => (
            <TraceStepCard
              key={i}
              index={i}
              thought={step.thought}
              action={`${step.tool_name}(${JSON.stringify(step.tool_args)})`}
              observation={step.tool_observation}
              update={
                i + 1 < backendTrace.agent_trace.length
                  ? `Leads to: ${backendTrace.agent_trace[i + 1].thought}`
                  : `Conclusion: ${backendTrace.summary}`
              }
              latency={`${step.latency_ms} ms`}
            />
          ))}
        </>
      )}
      {source === 'local' && (
        <>
          <p className="rounded-lg border-[1.5px] border-amber bg-ambertint p-3 text-body font-bold text-ink">
            Backend triage unreachable — showing the local engine&apos;s own trace, measured live
            from the same functions that render the 3D plant. Same structure, same thresholds.
          </p>
          {localTrace.map((step, i) => (
            <TraceStepCard
              key={i}
              index={i}
              thought={step.thought}
              action={step.action}
              observation={step.observation}
              update={step.update}
              latency={fmtMs(step.latencyMs)}
            />
          ))}
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Derivation chain + diagnosis evidence                               */
/* ------------------------------------------------------------------ */

function DerivationChain({ species, metrics }: { species: SpeciesRecord; metrics: LiveMetrics }) {
  const p = species.params;
  const d = metrics.derivation;
  const env = usePeteyStore((s) => s.env);
  const stages: Array<{ title: string; body: string }> = [
    {
      title: '1 · Live inputs',
      body: `T=${env.airTempC} °C, RH=${env.relativeHumidityPct}%, PPFD=${env.ppfd} µmol/m²/s, interval=${env.wateringIntervalDays} d, pot=${species.pot_volume_liters} L, leaves=${species.leaf_count}, EC=${species.fertilizer_ec_ms_cm} mS/cm, fluoride=0.7 ppm (tap default).`,
    },
    {
      title: '2 · VPD — Magnus-Tetens',
      body: `es = 0.61078·exp(17.27T/(T+237.3)) = ${d.esAirKpa.toFixed(4)} kPa; ea = es × RH = ${d.eaKpa.toFixed(4)} kPa; VPD_air = es − ea = ${metrics.vpdAirKpa.toFixed(4)} kPa. Leaf at ${d.leafTempC.toFixed(1)} °C → VPD_leaf = ${metrics.vpdLeafKpa.toFixed(4)} kPa (dew point ${d.dewPointC.toFixed(2)} °C). Status: ${metrics.vpdStatus} (optimal ${p.vpdOptMinKpa}–${p.vpdOptMaxKpa} kPa, closure ${p.vpdStomatalClosureKpa} kPa).`,
    },
    {
      title: '3 · A_net — non-rectangular hyperbola (θ = 0.75)',
      body: `gₛ=${metrics.gsRatio.toFixed(4)} from VPD_air (1.0 ≤ ${p.vpdOptMaxKpa} kPa, → 0.10 at ${p.vpdStomatalClosureKpa} kPa); temp=${d.tempScalar.toFixed(4)} (optimum ${p.tOptMinC}–${p.tOptMaxC} °C); incident = ${env.ppfd} × ${metrics.gsRatio.toFixed(4)} × ${d.tempScalar.toFixed(4)} = ${d.incidentPpfd.toFixed(1)} µmol/m²/s; α_eff=${d.alphaEff.toFixed(4)}, A_max,eff=${d.aMaxEff.toFixed(2)}${d.isPhotoinhibited ? `, photoinhibition ×${d.photoinhibitionFactor.toFixed(4)} (PPFD > LSP ${p.lspPpfd})` : ''}; A_gross=${d.aGross.toFixed(4)} − R_d=${d.rd.toFixed(4)} = A_net=${metrics.aNet.toFixed(4)} µmol/m²/s.`,
    },
    {
      title: '4 · Hydration balance',
      body: `ET = VPD_air × Kc × pathway × leaf area × 900 = ${metrics.vpdAirKpa.toFixed(4)} × ${p.cropCoefficientKc} × ${d.pathwayScalar} × ${d.leafAreaM2.toFixed(3)} m² × 900 = ${metrics.dailyEtMl.toFixed(2)} mL/day. Peak=${(d.peakVwc * 100).toFixed(1)}%, trough=${(metrics.troughVwc * 100).toFixed(1)}%, mean=${(metrics.meanVwc * 100).toFixed(1)}%; O₂ porosity = porosity − peak = ${(metrics.airFilledPorosity * 100).toFixed(0)}% (floor ${(p.airFilledPorosityMin * 100).toFixed(0)}%). Interval = (FC − critical) / daily drop = (${p.fieldCapacityVwc} − ${p.criticalDepletionVwc}) / ${d.dailyVwcDrop.toFixed(5)} = ${metrics.optimalIntervalDays} d; dose = (FC − critical) × volume × 1.15 = ${metrics.optimalDoseMl} mL.`,
    },
    {
      title: '5 · Pathology code',
      body: `Primary code ${metrics.primaryPathology} — ${PATHOLOGY_META[metrics.primaryPathology].label}. The evidence widget below shows every trigger rule evaluated against these live values, for and against.`,
    },
  ];
  return (
    <section aria-label="Derivation chain" className="space-y-2">
      <h3 className="font-display text-base font-bold text-ink">Derivation chain — every number, traced</h3>
      <ol className="space-y-2">
        {stages.map((s) => (
          <li key={s.title} className="rounded-lg border-[1.5px] border-rule bg-parchment p-3">
            <p className="text-body font-extrabold text-ink">{s.title}</p>
            <p className="mt-0.5 text-body leading-relaxed text-ink">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DiagnosisEvidenceWidget({
  species,
  metrics,
}: {
  species: SpeciesRecord;
  metrics: LiveMetrics;
}) {
  const env = usePeteyStore((s) => s.env);
  const evidence = useMemo(
    () =>
      buildDiagnosisEvidence(
        species.params,
        {
          vpdAirKpa: metrics.vpdAirKpa,
          hypoxiaRisk: metrics.hypoxiaRisk,
          airFilledPorosity: metrics.airFilledPorosity,
          ppfd: env.ppfd,
          fertilizerEcMsCm: species.fertilizer_ec_ms_cm,
          tapWaterFluoridePpm: 0.7,
        },
        metrics.diagnoses,
      ),
    [species, metrics, env.ppfd],
  );
  return (
    <section aria-label="Differential diagnosis with evidence" className="space-y-2">
      <h3 className="font-display text-base font-bold text-ink">Differential diagnosis — evidence for &amp; against</h3>
      {evidence.map((c) => (
        <article key={c.code} className="rounded-lg border-[1.5px] border-rule bg-surface p-3">
          <p className="flex flex-wrap items-center gap-2 text-body font-extrabold text-ink">
            {c.label}
            <span
              className={`rounded-sm px-2 py-0.5 text-caption ${
                c.triggered ? 'bg-danger text-white' : 'bg-leaftint text-leafdeep'
              }`}
            >
              {c.triggered ? 'TRIGGERED' : 'RULED OUT'}
            </span>
            {c.severity !== null && (
              <span className="telemetry text-caption font-bold text-ink-soft">
                severity {c.severity.toFixed(3)} · confidence {c.confidence?.toFixed(2)}
              </span>
            )}
          </p>
          <p className="mt-1 text-caption font-bold text-ink-soft">{c.rule}</p>
          {c.evidenceFor.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {c.evidenceFor.map((line) => (
                <li key={line} className="text-body text-ink">
                  <span className="font-extrabold text-danger">For: </span>
                  {line}
                </li>
              ))}
            </ul>
          )}
          {c.evidenceAgainst.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {c.evidenceAgainst.map((line) => (
                <li key={line} className="text-body text-ink-soft">
                  <span className="font-extrabold text-leafdeep">Against: </span>
                  {line}
                </li>
              ))}
            </ul>
          )}
          {c.triggered && (
            <p className="mt-1 text-body font-bold text-danger">Fix: {c.fix}</p>
          )}
        </article>
      ))}
    </section>
  );
}

function DiagnosticContent() {
  const species = useActiveSpecies();
  const env = usePeteyStore((s) => s.env);
  const setEnv = usePeteyStore((s) => s.setEnv);
  const setDiagnosticOpen = usePeteyStore((s) => s.setDiagnosticOpen);
  const metrics = useLiveMetrics();
  const p = species.params;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-subhead font-bold text-ink">Diagnostic Inspector</h2>
          <p className="text-body text-ink-soft">
            {species.scientific_name} · {species.family}
          </p>
        </div>
        <button
          type="button"
          className="ledger-btn ledger-btn-ghost ledger-btn-sm"
          onClick={() => setDiagnosticOpen(false)}
          aria-label="Close diagnostics"
        >
          <X width={18} height={18} aria-hidden="true" />
        </button>
      </div>

      {/* Live sliders */}
      <section aria-label="Environment controls" className="space-y-3">
        <SliderRow
          id="diag-temp"
          label="Air temperature"
          value={env.airTempC}
          min={10}
          max={38}
          step={0.5}
          unit="°C"
          onChange={(v) => setEnv({ airTempC: v })}
        />
        <SliderRow
          id="diag-rh"
          label="Relative humidity"
          value={env.relativeHumidityPct}
          min={20}
          max={90}
          step={1}
          unit="%"
          onChange={(v) => setEnv({ relativeHumidityPct: v })}
        />
        <SliderRow
          id="diag-ppfd"
          label="Light (PPFD)"
          value={env.ppfd}
          min={20}
          max={900}
          step={5}
          unit="µmol/m²/s"
          onChange={(v) => setEnv({ ppfd: v })}
        />
        <SliderRow
          id="diag-interval"
          label="Watering interval"
          value={env.wateringIntervalDays}
          min={1}
          max={21}
          step={1}
          unit="days"
          onChange={(v) => setEnv({ wateringIntervalDays: v })}
        />
      </section>

      {/* Live readout */}
      <section aria-label="Live biophysics readout" className="rounded-lg border-[1.5px] border-rule bg-parchment p-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-body">
          <div className="flex justify-between"><dt className="text-ink-soft">VPD air</dt><dd className="telemetry font-bold">{metrics.vpdAirKpa.toFixed(2)} kPa</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">VPD leaf</dt><dd className="telemetry font-bold">{metrics.vpdLeafKpa.toFixed(2)} kPa</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">DLI</dt><dd className="telemetry font-bold">{metrics.dli.toFixed(2)} mol</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">A_net</dt><dd className="telemetry font-bold">{metrics.aNet.toFixed(2)} µmol/m²/s</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">Stomatal gₛ</dt><dd className="telemetry font-bold">{(metrics.gsRatio * 100).toFixed(0)}%</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">Daily ET</dt><dd className="telemetry font-bold">{metrics.dailyEtMl.toFixed(1)} mL</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">Mean VWC</dt><dd className="telemetry font-bold">{(metrics.meanVwc * 100).toFixed(1)}%</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">Trough VWC</dt><dd className="telemetry font-bold">{(metrics.troughVwc * 100).toFixed(1)}%</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">O₂ porosity</dt><dd className="telemetry font-bold">{(metrics.airFilledPorosity * 100).toFixed(0)}%</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">Hypoxia risk</dt><dd className="telemetry font-bold">{(metrics.hypoxiaRisk * 100).toFixed(0)}%</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">Wilt risk</dt><dd className="telemetry font-bold">{(metrics.desiccationRisk * 100).toFixed(0)}%</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">Health</dt><dd className="telemetry font-bold">{Math.round(metrics.healthIndex)} / 100</dd></div>
        </dl>
        <p className="mt-2 text-body text-ink">
          Recommended: every <strong>{metrics.optimalIntervalDays} days</strong>,{' '}
          <span className="telemetry font-extrabold">{metrics.optimalDoseMl} mL</span> (incl. 15%
          leaching). Predicted 30-day growth:{' '}
          <span className="telemetry font-extrabold">{metrics.predictedLeaves.toFixed(1)} leaves</span>.
        </p>
      </section>

      <DerivationChain species={species} metrics={metrics} />

      {/* Formulas, thresholds & units behind every telemetry value */}
      <section aria-label="Formulas and thresholds" className="rounded-lg border-[1.5px] border-rule bg-parchment p-3">
        <h3 className="font-display text-base font-bold text-ink">Formulas, thresholds &amp; units</h3>
        <dl className="mt-2 space-y-1.5 text-body">
          <div><dt className="font-extrabold text-ink">VPD (kPa)</dt><dd className="text-ink-soft">es = 0.61078·exp(17.27T/(T+237.3)); ea = es × RH; VPD = es − ea. Species band {p.vpdOptMinKpa}–{p.vpdOptMaxKpa} kPa; stomatal closure at {p.vpdStomatalClosureKpa} kPa.</dd></div>
          <div><dt className="font-extrabold text-ink">DLI (mol/m²/day)</dt><dd className="text-ink-soft">PPFD × photoperiod (12 h) × 0.0036. Species band {p.dliOptimalMin}–{p.dliOptimalMax}.</dd></div>
          <div><dt className="font-extrabold text-ink">A_net (µmol/m²/s)</dt><dd className="text-ink-soft">Non-rectangular hyperbola, θ = 0.75, on incident PPFD = PPFD × gₛ × temp; minus Q10 respiration (×2 per 10 °C from 25 °C). LCP {p.lcpPpfd}, LSP {p.lspPpfd} µmol/m²/s.</dd></div>
          <div><dt className="font-extrabold text-ink">ET (mL/day)</dt><dd className="text-ink-soft">VPD_air × Kc ({p.cropCoefficientKc}) × pathway ({species.photosynthetic_pathway}) × leaf area × 900.</dd></div>
          <div><dt className="font-extrabold text-ink">VWC / O₂ porosity (fraction)</dt><dd className="text-ink-soft">Peak = min(porosity, FC + dose/volume); trough = peak − ET × interval/volume; O₂ = porosity − peak. FC {p.fieldCapacityVwc}, critical {p.criticalDepletionVwc}, wilting {p.permanentWiltingPointVwc}, O₂ floor {p.airFilledPorosityMin}.</dd></div>
          <div><dt className="font-extrabold text-ink">Health (0–100)</dt><dd className="text-ink-soft">100 × (0.40 × A_net/A_max + 0.30 × (1 − max risk) + 0.30 × (1 − primary severity)). Leaves = max(0, A_net) × 0.15.</dd></div>
        </dl>
      </section>

      <DiagnosisEvidenceWidget species={species} metrics={metrics} />

      <ReactTrace species={species} metrics={metrics} />

      {/* APG IV + PlantNet provenance */}
      <section aria-label="Provenance" className="rounded-lg border-[1.5px] border-rule bg-parchment p-3">
        <h3 className="flex items-center gap-2 font-display text-base font-bold text-ink">
          <FlaskConical className="h-4 w-4 text-leafdeep" aria-hidden="true" />
          APG IV + PlantNet provenance
        </h3>
        <dl className="mt-2 space-y-1 text-body">
          <div className="flex justify-between gap-3"><dt className="text-ink-soft">Taxon code</dt><dd className="telemetry font-bold">{species.taxon_code}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-ink-soft">APG IV clade / order</dt><dd className="font-bold">{p.apgIvClade} · {p.apgIvOrder}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-ink-soft">PlantNet species id</dt><dd className="telemetry font-bold">{species.plantnet_species_id}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-ink-soft">PlantNet logit offset</dt><dd className="telemetry font-bold">{species.plantnet_logit_offset.toFixed(4)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-ink-soft">Substrate</dt><dd className="text-right font-bold">{p.substrate}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-ink-soft">Pathway</dt><dd className="font-bold">{species.photosynthetic_pathway}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-ink-soft">NPK ratio</dt><dd className="telemetry font-bold">{p.npkRatio.join(' : ')}</dd></div>
        </dl>
        <p className="mt-3 flex gap-2 rounded-lg border-[1.5px] border-amber bg-ambertint p-3 text-body font-bold text-ink">
          <PawPrint className="h-5 w-5 shrink-0 text-amberdeep" aria-hidden="true" />
          {PET_SAFETY[species.toxicity_mechanism] ?? `Pet caution: ${species.toxicity_mechanism}.`}
        </p>
        {species.params.thaiConstellation && (
          <p className="mt-2 flex gap-2 text-caption font-bold text-ink-soft">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amberdeep" aria-hidden="true" />
            Thai Constellation variegation params available: variegation penalty 0.74, higher
            light demand, lower Amax — cream sectors photosynthesise less.
          </p>
        )}
      </section>
    </div>
  );
}

export default function MuseDiagnosticSheet() {
  const diagnosticOpen = usePeteyStore((s) => s.diagnosticOpen);
  const setDiagnosticOpen = usePeteyStore((s) => s.setDiagnosticOpen);

  return (
    <>
      {/* Mobile: vaul drawer */}
      <div className="lg:hidden">
        <Drawer.Root open={diagnosticOpen} onOpenChange={setDiagnosticOpen}>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/50" />
            <Drawer.Content className="ledger-drawer fixed inset-x-0 bottom-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-xl border-2 border-b-0 border-rulestrong bg-surface p-4 pb-8 outline-none">
              <div className="mx-auto mb-4 h-1 w-12 rounded-sm bg-rule" aria-hidden="true" />
              <Drawer.Title className="sr-only">Diagnostic Inspector</Drawer.Title>
              <DiagnosticContent />
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </div>

      {/* Desktop: sticky panel */}
      {diagnosticOpen && (
        <aside
          aria-label="Diagnostic Inspector"
          className="ledger-card sticky top-4 hidden max-h-[calc(100vh-2rem)] overflow-y-auto p-4 lg:block"
        >
          <DiagnosticContent />
        </aside>
      )}
    </>
  );
}
