import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPreviewCare, createUuid, gardenApi, gardenKey, setPreviewMode, withTimeoutSignal, type GardenPlant } from './gardenApi.ts';

const SAMPLE_PLANT: GardenPlant = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Preview Monstera',
  species_id: 'Monstera deliciosa',
  common_name: 'Monstera',
  drainage: 'yes',
  status: 'check',
  message: 'Check soil',
  check_prompt: 'Check soil',
  next_check_at: null,
  watering_guidance: null,
  watering_source: null,
  history: [],
};

test('P-02: preview care logs observations without ever returning ready', () => {
  const result = applyPreviewCare(SAMPLE_PLANT, { id: 'evt-1', kind: 'dry' });
  assert.notEqual(result.status, 'ready');
  assert.equal(result.status, 'details');
  assert.equal(result.watering_advice_expires_at, null);
  assert.equal(result.history[0]?.kind, 'dry');
});

test('P-07: UUIDv4 and timeout helpers work without crypto.randomUUID or AbortSignal.any', () => {
  const originalRandomUUID = globalThis.crypto.randomUUID;
  const storage = new Map<string, string>();
  const originalLocalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: undefined });

  try {
    const id = createUuid();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const key1 = gardenKey();
    const key2 = gardenKey();
    assert.equal(key1, key2);
    assert.match(key1, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  } finally {
    Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: originalRandomUUID });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalLocalStorage });
  }

  const originalAny = AbortSignal.any;
  Object.defineProperty(AbortSignal, 'any', { configurable: true, value: undefined });
  try {
    const controller = new AbortController();
    const { signal, cleanup } = withTimeoutSignal(5000, controller.signal);
    assert.equal(signal.aborted, false);
    controller.abort('test');
    assert.equal(signal.aborted, true);
    cleanup();
  } finally {
    Object.defineProperty(AbortSignal, 'any', { configurable: true, value: originalAny });
  }
});

test('P-02/P-11: preview garden never seeds ready and omits guidance for unverified or null species', async () => {
  const session = new Map<string, string>();
  const originalSession = (globalThis as { sessionStorage?: unknown }).sessionStorage;
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => session.get(key) ?? null,
      setItem: (key: string, value: string) => session.set(key, value),
      removeItem: (key: string) => session.delete(key),
    },
  });
  try {
    setPreviewMode(true);
    const starter = await gardenApi.plants();
    assert.ok(starter.length > 0);
    assert.ok(starter.every((plant) => plant.status !== 'ready'));

    const unverified = await gardenApi.create({
      id: 'test-areca',
      name: 'Hallway Areca',
      species_id: 'Dypsis lutescens',
      drainage: 'yes',
    });
    assert.equal(unverified.watering_guidance, null);
    assert.equal(unverified.watering_source, null);

    const cleared = await gardenApi.update('test-areca', { species_id: null });
    assert.equal(cleared.common_name, null);
    assert.equal(cleared.watering_guidance, null);
  } finally {
    setPreviewMode(false);
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: originalSession });
  }
});
