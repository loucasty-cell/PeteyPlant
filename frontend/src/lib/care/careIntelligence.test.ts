import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewWeather, fetchGoogleWeather } from '../weatherService.ts';
import {
  getConditionPresentation,
  getRegisteredConditionCount,
  resolveMultipleConditions,
} from './conditionRegistry.ts';
import {
  buildHydrationCartSummary,
  buildPlantAlerts,
  buildWateringIntelligence,
  filterEligibleCartIds,
  formatWaterVolume,
  formatWaterVolumeRange,
  getHydrationEligibility,
  isWithinQuietHours,
  sortPlantsByActionPriority,
  type ExtendedGardenPlant,
  type NotificationPreferences,
} from './careIntelligence.ts';

function makePlant(overrides: Partial<ExtendedGardenPlant> = {}): ExtendedGardenPlant {
  return {
    id: 'p-1',
    name: 'Window Monstera',
    species_id: 'Monstera deliciosa',
    common_name: 'Monstera',
    drainage: 'yes',
    status: 'check',
    message: 'Check whether the top quarter to one-third of the mix is dry.',
    check_prompt: 'Check whether the top quarter to one-third of the mix is dry.',
    next_check_at: new Date(Date.now() - 3_600_000).toISOString(),
    watering_guidance: 'Water thoroughly when top third dries.',
    watering_source: 'https://example.org/monstera',
    history: [
      { id: 'evt-1', kind: 'watered', occurred_at: new Date(Date.now() - 3 * 86_400_000).toISOString() },
    ],
    ...overrides,
  };
}

test('condition registry covers 25+ documented backend identifiers and handles unknown safely', () => {
  assert.ok(getRegisteredConditionCount() >= 25, 'expected at least 25 registered backend condition states');

  const ready = getConditionPresentation('ready');
  assert.equal(ready.actionability, 'water_now');
  assert.equal(ready.severity, 'moderate');

  const brake = getConditionPresentation('watering_locked');
  assert.equal(brake.actionability, 'do_not_water');
  assert.equal(brake.severity, 'urgent');

  const unknown = getConditionPresentation('future_unmapped_status_xyz');
  assert.equal(unknown.domain, 'fallback');
  assert.equal(unknown.severity, 'unknown');
  assert.notEqual(unknown.actionability, 'no_action_needed');
});

test('multiple simultaneous conditions are deduplicated and ordered by severity', () => {
  const multi = resolveMultipleConditions(['rest', 'BIOTIC_OOMYCETE_PYTHIUM', 'chlorosis_yellowing', 'rest']);
  assert.equal(multi.length, 3);
  assert.equal(multi[0].id, 'BIOTIC_OOMYCETE_PYTHIUM');
  assert.equal(multi[0].severity, 'urgent');
  assert.equal(multi[1].id, 'chlorosis_yellowing');
  assert.equal(multi[2].id, 'rest');
});

test('watering intelligence never manufactures mL precision when backend lacks volume fields', () => {
  const readyPlant = makePlant({ status: 'ready', next_check_at: null });
  const intel = buildWateringIntelligence(readyPlant);
  assert.equal(intel.needsAttention, true);
  assert.equal(intel.actionHeadline, 'Water now');
  assert.equal(intel.volumeGuidance.hasQuantitativeVolume, false);
  assert.equal(intel.volumeGuidance.formattedAmount, null);
  assert.ok(intel.volumeGuidance.limitationNote?.includes('milliliter'));
});

test('outdoor care context preserves measured zero and leaves missing and preview readings out', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({
    weatherCondition: { type: 'CLOUDY', description: { text: 'Cloudy' } },
    temperature: { degrees: 0 },
    wind: { speed: { value: 0 } },
  }));

  const weather = await fetchGoogleWeather(1, 2, 'Fixture');
  assert.ok(weather);
  assert.equal(weather.source, 'google-weather');
  assert.equal(weather.temperatureC, 0);
  assert.equal(weather.windKmh, 0);
  assert.equal(weather.relativeHumidity, null);
  assert.equal(weather.feelsLikeC, null);
  assert.equal(weather.updatedAt, null);

  const liveContext = buildWateringIntelligence(makePlant(), { weather }).environmentalContext;
  assert.match(liveContext, /0°C/);
  assert.doesNotMatch(liveContext, /% RH/);
  const previewContext = buildWateringIntelligence(makePlant(), { weather: createPreviewWeather('rain') }).environmentalContext;
  assert.match(previewContext, /Live outdoor weather is unavailable/);
  assert.doesNotMatch(previewContext, /°C|% RH/);
});

test('watering intelligence formats exact mL and fl oz ranges when future engine provides them', () => {
  const futurePlant = makePlant({
    status: 'ready',
    recommended_water_min_ml: 200,
    recommended_water_max_ml: 300,
  });
  const mlView = buildWateringIntelligence(futurePlant, { unit: 'ml' });
  assert.equal(mlView.volumeGuidance.hasQuantitativeVolume, true);
  assert.equal(mlView.volumeGuidance.formattedAmount, '200 mL – 300 mL');

  const ozView = buildWateringIntelligence(futurePlant, { unit: 'fl_oz' });
  assert.equal(ozView.volumeGuidance.formattedAmount, formatWaterVolumeRange(200, 300, 'fl_oz'));
  assert.equal(formatWaterVolume(250, 'ml'), '250 mL');
});

test('smart watering lifecycle marks action_recorded_reassessment_pending instead of instant recovery', () => {
  const wateredPlant = makePlant({
    status: 'rest',
    history: [{ id: 'evt-new', kind: 'watered', occurred_at: new Date().toISOString() }],
  });
  const intel = buildWateringIntelligence(wateredPlant, {
    justRecordedAction: { plantId: wateredPlant.id, kind: 'watered' },
  });
  assert.equal(intel.lifecyclePhase, 'action_recorded_reassessment_pending');
  assert.ok(intel.lifecycleBanner?.includes('Reassessment pending'));
});

test('priority sorting and alert generation preserve urgency order and acknowledgement separation', () => {
  const resting = makePlant({ id: 'p-rest', name: 'Calm Pothos', status: 'rest' });
  const ready = makePlant({ id: 'p-ready', name: 'Thirsty Snake', status: 'ready' });
  const locked = makePlant({ id: 'p-lock', name: 'Wet Fig', status: 'wait', watering_locked: true });

  const sorted = sortPlantsByActionPriority([resting, ready, locked]);
  assert.deepEqual(
    sorted.map((p) => p.id),
    ['p-lock', 'p-ready', 'p-rest'],
  );

  const alertsInitial = buildPlantAlerts([resting, ready, locked], {});
  assert.equal(alertsInitial.length, 2);
  assert.equal(alertsInitial[0].plantId, 'p-lock');
  assert.equal(alertsInitial[0].isEmergency, true);
  assert.equal(alertsInitial[1].plantId, 'p-ready');
  assert.equal(alertsInitial[1].isEmergency, false);

  // Acknowledging does NOT remove the unresolved alert
  const acked = buildPlantAlerts([resting, ready, locked], { [alertsInitial[1].fingerprint]: '2026-01-01T00:00:00Z' });
  assert.equal(acked.length, 2);
  assert.equal(acked[1].acknowledged, true);
});

test('quiet hours handles overnight and daytime spans accurately', () => {
  const overnight: NotificationPreferences = {
    enabled: true,
    routineReminders: true,
    urgentOnly: false,
    quietHoursEnabled: true,
    quietStartHour: 21,
    quietEndHour: 8,
  };
  assert.equal(isWithinQuietHours(overnight, 22), true);
  assert.equal(isWithinQuietHours(overnight, 3), true);
  assert.equal(isWithinQuietHours(overnight, 14), false);

  const daytime: NotificationPreferences = {
    ...overnight,
    quietStartHour: 12,
    quietEndHour: 15,
  };
  assert.equal(isWithinQuietHours(daytime, 13), true);
  assert.equal(isWithinQuietHours(daytime, 16), false);
});

test('hydration cart enforces safety eligibility and prunes non-ready or locked plants', () => {
  const ready = makePlant({ id: 'p-ready', status: 'ready', drainage: 'yes' });
  const check = makePlant({ id: 'p-check', status: 'check', drainage: 'yes' });
  const wait = makePlant({ id: 'p-wait', status: 'wait', drainage: 'yes' });
  const locked = makePlant({ id: 'p-locked', status: 'ready', watering_locked: true });
  const rest = makePlant({ id: 'p-rest', status: 'rest' });

  assert.equal(getHydrationEligibility(ready), 'eligible');
  assert.equal(getHydrationEligibility(check), 'check_first');
  assert.equal(getHydrationEligibility(wait), 'blocked');
  assert.equal(getHydrationEligibility(locked), 'blocked');
  assert.equal(getHydrationEligibility(rest), 'resting');

  const pruned = filterEligibleCartIds(
    ['p-ready', 'p-wait', 'p-locked', 'p-check', 'p-ready', 'missing-id'],
    [ready, check, wait, locked, rest],
  );
  assert.deepEqual(pruned, ['p-ready']);
});

test('hydration cart summary stays qualitative when backend lacks mL and sums accurately when present', () => {
  const qualA = makePlant({ id: 'q-1', status: 'ready', drainage: 'yes' });
  const qualB = makePlant({ id: 'q-2', status: 'ready', drainage: 'no' });
  const qualSummary = buildHydrationCartSummary([qualA, qualB], 'ml');
  assert.equal(qualSummary.count, 2);
  assert.equal(qualSummary.quantitativeCount, 0);
  assert.equal(qualSummary.qualitativeCount, 2);
  assert.equal(qualSummary.formattedVolumeTotal, null);
  assert.equal(qualSummary.volumeSummaryLabel, 'Qualitative (no mL estimate)');
  assert.equal(qualSummary.drainageCautionCount, 1);

  const quantA = makePlant({ id: 'v-1', status: 'ready', recommended_water_ml: 200 });
  const quantB = makePlant({
    id: 'v-2',
    status: 'ready',
    recommended_water_min_ml: 150,
    recommended_water_max_ml: 250,
  });
  const quantSummary = buildHydrationCartSummary([quantA, quantB], 'ml');
  assert.equal(quantSummary.formattedVolumeTotal, '350 mL – 450 mL');
  assert.equal(quantSummary.volumeSummaryLabel, '350 mL – 450 mL');

  const mixedSummary = buildHydrationCartSummary([quantA, qualA], 'ml');
  assert.equal(mixedSummary.volumeSummaryLabel, '200 mL + 1 qualitative');
});

