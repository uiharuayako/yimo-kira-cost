import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BASE_RATES, REGIONS, STAGES, CUBES, MODEL, defaultWeights, calculate, getEnergyModel } from '../src/model.js';

function close(actual, expected, relativeTolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= relativeTolerance * Math.max(1, Math.abs(expected)), `${actual} ≈ ${expected}`);
}

function single(index) {
  return Array.from({ length: 15 }, (_, i) => (i === index ? 1 : 0));
}

test('complete source matrix, cube economy and fixed rainbow estimate', () => {
  assert.equal(REGIONS.length, 5);
  assert.equal(STAGES.length, 3);
  assert.deepEqual(BASE_RATES, [[.56,.42,.28],[.50,.38,.25],[.44,.33,.22],[.38,.29,.19],[.32,.24,.16]]);
  assert.deepEqual(CUBES.map(({ id, price, multiplier }) => [id, price, multiplier]), [
    ['mystery',3500,1],['super',7000,1.5],['ultimate',10500,2],
  ]);
  assert.equal(MODEL.expectedCaptures, 2797.7761872);
  assert.equal(MODEL.samples, 15000000);
  assert.deepEqual(MODEL.ci95, [2797.4569133,2798.0954611]);
  assert.deepEqual(Object.values(MODEL.metadata).map(({kind}) => kind), ['official','user','simulation','assumption']);
});

test('saved simulation reference agrees with the browser constants', async () => {
  const saved = JSON.parse(await readFile(new URL('../data/model-results.json', import.meta.url), 'utf8'));
  assert.equal(saved.expectedCaptures, MODEL.expectedCaptures);
  assert.equal(saved.samples, MODEL.samples);
  assert.deepEqual(saved.ci95, MODEL.ci95);
  assert.equal(saved.targetEnergy, MODEL.targetEnergy);
  assert.equal(saved.officialSource, MODEL.sourceUrl);
  assert.equal(saved.assumptions.ordinaryPityAdvancesOnSuper, false);
});

test('default chooses only late-region mature creatures and has independently calculated values', () => {
  const weights = defaultWeights();
  assert.deepEqual(weights, single(14));
  const value = calculate(weights);
  assert.equal(value.valid, true);
  assert.equal(value.bestId, 'mystery');
  const probabilities = [.194,.286,.378];
  value.results.forEach((result, index) => {
    const p = probabilities[index];
    close(result.p, p);
    close(result.expectedCubes, 2797.7761872 / p);
    close(result.expectedCost, 2797.7761872 * CUBES[index].price / p);
    close(result.costPerCapture, CUBES[index].price / p);
    assert.equal(result.frontBack.length, 15);
  });
  assert.notStrictEqual(defaultWeights(), weights);
});

test('mixed throws use arithmetic mean; mixed captures use harmonic mean', () => {
  const weights = single(0);
  weights[14] = 1;
  const throws = calculate(weights, 'throws');
  const captures = calculate(weights, 'captures');
  const high = [.654,.895,1];
  const low = [.194,.286,.378];
  throws.results.forEach((result, index) => {
    close(result.p, (high[index]+low[index])/2);
    close(captures.results[index].p, 1/(.5/high[index]+.5/low[index]));
    assert.ok(captures.results[index].expectedCost >= result.expectedCost);
  });
});

test('cap each branch after its multiplier and fixed +1 percentage point', () => {
  const result = calculate(single(0));
  const mystery = result.results[0].frontBack[0];
  close(mystery.front, .57);
  close(mystery.back, .85);
  close(mystery.p, .654);
  const superCube = result.results[1].frontBack[0];
  close(superCube.front, .85);
  close(superCube.back, 1);
  close(superCube.p, .895);
  assert.equal(result.results[2].frontBack[0].front, 1);
  assert.equal(result.results[2].frontBack[0].back, 1);
  // For base .38 and m=2, averaging uncapped branches first gives .884;
  // capping the back branch first correctly gives .839.
  const partial = result.results[2].frontBack[4];
  close(partial.front, .77);
  close(partial.back, 1);
  close(partial.p, .839);
});

test('rescaling weights preserves both calculation meanings', () => {
  const weights = Array.from({ length: 15 }, (_, i) => i+1);
  for (const mode of ['throws', 'captures']) {
    const original = calculate(weights, mode);
    for (const scale of [7, 1e-300, 1e300]) {
      const scaled = calculate(weights.map((w) => w*scale), mode);
      assert.equal(scaled.valid, true);
      scaled.results.forEach((result, index) => close(result.expectedCost, original.results[index].expectedCost));
      scaled.normalizedWeights.forEach((weight, index) => close(weight, original.normalizedWeights[index]));
    }
  }
});

test('invalid weights and modes return a usable error without NaN results', () => {
  const bad = [null, {}, [], Array(14).fill(1), Array(16).fill(1), Array(15), Array(15).fill(0)];
  for (const invalidNumber of [-1, NaN, Infinity, -Infinity, '1', null]) {
    const weights = single(14);
    weights[0] = invalidNumber;
    bad.push(weights);
  }
  for (const weights of bad) {
    const result = calculate(weights);
    assert.equal(result.valid, false);
    assert.equal(typeof result.error, 'string');
    assert.ok(result.error.length > 0);
    assert.deepEqual(result.results, []);
  }
  assert.equal(calculate(single(14), 'unknown').valid, false);
});

test('huge finite weights avoid sum overflow and tiny finite weights remain usable', () => {
  for (const weights of [Array(15).fill(Number.MAX_VALUE), Array(15).fill(Number.MIN_VALUE)]) {
    const result = calculate(weights);
    assert.equal(result.valid, true);
    close(result.normalizedWeights.reduce((a,b) => a+b, 0), 1);
    for (const weight of result.normalizedWeights) close(weight, 1/15);
    for (const entry of result.results) {
      assert.ok(Number.isFinite(entry.p));
      assert.ok(Number.isFinite(entry.expectedCost));
    }
  }
  const extreme = single(0);
  extreme[0] = Number.MAX_VALUE;
  extreme[14] = Number.MIN_VALUE;
  assert.equal(calculate(extreme).valid, true);
});

test('mystery cube is cheapest for every single creature type and both weight meanings agree', () => {
  for (let index = 0; index < 15; index++) {
    const throws = calculate(single(index), 'throws');
    const captures = calculate(single(index), 'captures');
    assert.equal(throws.bestId, 'mystery');
    assert.ok(throws.results[0].expectedCost < throws.results[1].expectedCost);
    assert.ok(throws.results[1].expectedCost < throws.results[2].expectedCost);
    throws.results.forEach((entry, i) => close(entry.p, captures.results[i].p));
  }
});

test('calculation is pure and constants cannot be changed by callers', () => {
  const weights = Object.freeze(Array.from({ length: 15 }, (_, index) => index));
  const before = [...weights];
  const first = calculate(weights);
  const second = calculate(weights);
  assert.deepEqual(weights, before);
  assert.deepEqual(first, second);
  first.normalizedWeights[0] = 100;
  first.results[0].frontBack[0].p = 0;
  assert.deepEqual(calculate(weights), second);
  assert.ok(Object.isFrozen(BASE_RATES[0]));
  assert.ok(Object.isFrozen(CUBES[0]));
  assert.ok(Object.isFrozen(MODEL.metadata.official));
});

test('400 deterministic mixed populations preserve probability, cost and ordering invariants', () => {
  let state = 123456789;
  const random = () => {
    state = (Math.imul(state, 1664525)+1013904223) >>> 0;
    return state / 2**32;
  };
  for (let sample = 0; sample < 400; sample++) {
    const weights = Array.from({length: 15}, () => random() < .25 ? 0 : random()*1000);
    if (weights.every((value) => value === 0)) weights[14] = 1;
    const throws = calculate(weights, 'throws');
    const captures = calculate(weights, 'captures');
    for (const result of [throws, captures]) {
      assert.equal(result.valid, true);
      close(result.normalizedWeights.reduce((a,b) => a+b, 0), 1);
      assert.equal(result.bestId, 'mystery');
      assert.equal(result.expectedCaptures, MODEL.expectedCaptures);
      let previousProbability = 0;
      let previousCost = 0;
      result.results.forEach((entry) => {
        assert.ok(entry.p > 0 && entry.p <= 1);
        assert.ok(entry.p >= previousProbability);
        assert.ok(entry.expectedCost > previousCost);
        close(entry.expectedCost, entry.expectedCubes*entry.price);
        close(entry.expectedCost, entry.costPerCapture*MODEL.expectedCaptures);
        previousProbability = entry.p;
        previousCost = entry.expectedCost;
      });
    }
    throws.results.forEach((entry, index) => {
      assert.ok(captures.results[index].p <= entry.p+1e-14);
    });
  }
});

test('essence lookup retains the default reference and matches saved estimates', async () => {
  const saved = JSON.parse(await readFile(new URL('../data/essence-results.json', import.meta.url), 'utf8'));
  assert.equal(saved.estimates.length, 23);
  assert.equal(MODEL.essenceEnergyEach, 480);
  assert.equal(MODEL.metadata.official.essence.energy, 480);
  const defaultEnergy = getEnergyModel();
  assert.equal(defaultEnergy.expectedCaptures, MODEL.expectedCaptures);
  assert.equal(defaultEnergy.modelSamples, MODEL.samples);
  assert.deepEqual(defaultEnergy.ci95, MODEL.ci95);
  for (let n = 0; n <= 22; n++) {
    const value = getEnergyModel(n);
    const entry = saved.estimates[n];
    assert.equal(value.valid, true);
    assert.equal(value.expectedCaptures, entry.expectedCaptures);
    assert.equal(value.modelSamples, entry.samples);
    assert.equal(value.standardError, entry.standardError);
    assert.deepEqual(value.ci95, entry.ci95);
    assert.equal(value.essenceCount, n);
    assert.equal(value.essenceEnergy, n*480);
    assert.equal(value.remainingEnergy, Math.max(10500-n*480, 0));
  }
});

test('essence thresholds are monotone and use re-estimated stopping times, not linear scaling', () => {
  let previous = getEnergyModel(0).expectedCaptures;
  for (let n = 1; n <= 21; n++) {
    const value = getEnergyModel(n);
    assert.ok(value.expectedCaptures > 0 && value.expectedCaptures < previous);
    assert.equal(value.modelSamples, 5000000);
    assert.ok(value.ci95[0] < value.expectedCaptures && value.expectedCaptures < value.ci95[1]);
    assert.equal(value.noCaptureNeeded, false);
    previous = value.expectedCaptures;
  }
  const n10 = getEnergyModel(10);
  assert.ok(Math.abs(n10.expectedCaptures-MODEL.expectedCaptures*n10.remainingEnergy/10500) > 1);
  const n21 = getEnergyModel(21);
  assert.equal(n21.remainingEnergy, 420);
  assert.notEqual(n21.remainingEnergy % 25, 0);
});

test('essence-adjusted costs and confidence intervals use the dynamic successful-capture estimate', () => {
  const weights = defaultWeights();
  for (const mode of ['throws', 'captures']) {
    const original = calculate(weights, mode);
    for (const n of [1, 7, 14, 21]) {
      const value = calculate(weights, mode, n);
      const energy = getEnergyModel(n);
      assert.equal(value.expectedCaptures, energy.expectedCaptures);
      assert.equal(value.modelSamples, energy.modelSamples);
      assert.deepEqual(value.ci95, energy.ci95);
      value.results.forEach((entry, index) => {
        close(entry.p, original.results[index].p);
        close(entry.expectedCubes, energy.expectedCaptures/entry.p);
        close(entry.expectedCost, energy.expectedCaptures*entry.price/entry.p);
        close(entry.expectedCostCi95[0], energy.ci95[0]*entry.price/entry.p);
        close(entry.expectedCubesCi95[1], energy.ci95[1]/entry.p);
        assert.ok(entry.expectedCost < original.results[index].expectedCost);
      });
    }
  }
});

test('22 or more essences need no capture and charge no cube cost', () => {
  for (const n of [22, 23, 100, Number.MAX_SAFE_INTEGER]) {
    for (const weights of [defaultWeights(), Array(15).fill(0)]) {
      const result = calculate(weights, 'throws', n);
      assert.equal(result.valid, true);
      assert.equal(result.noCaptureNeeded, true);
      assert.equal(result.expectedCaptures, 0);
      assert.equal(result.remainingEnergy, 0);
      assert.ok(Number.isFinite(result.essenceEnergy));
      assert.equal(result.modelSamples, 0);
      assert.deepEqual(result.ci95, [0,0]);
      assert.equal(result.bestId, null);
      for (const entry of result.results) {
        assert.equal(entry.expectedCubes, 0);
        assert.equal(entry.expectedCost, 0);
        assert.deepEqual(entry.expectedCubesCi95, [0,0]);
        assert.deepEqual(entry.expectedCostCi95, [0,0]);
        if (weights.every((w) => w === 0)) {
          assert.equal(entry.p, null);
          assert.equal(entry.costPerCapture, null);
          assert.equal(entry.frontBack.length, 15);
        } else {
          assert.ok(entry.p > 0);
          assert.ok(entry.costPerCapture > 0);
        }
      }
    }
  }
  assert.equal(calculate(Array(15).fill(0), 'throws', 21).valid, false);
});

test('invalid essence counts are rejected and invalid weights stay invalid after energy is full', () => {
  for (const n of [-1, .5, NaN, Infinity, -Infinity, '1', null, Number.MAX_SAFE_INTEGER+1]) {
    assert.equal(getEnergyModel(n).valid, false);
    const value = calculate(defaultWeights(), 'throws', n);
    assert.equal(value.valid, false);
    assert.equal(typeof value.error, 'string');
    assert.deepEqual(value.results, []);
  }
  for (const weight of [-1, NaN, Infinity]) {
    const weights = defaultWeights();
    weights[0] = weight;
    assert.equal(calculate(weights, 'throws', 22).valid, false);
  }
  assert.equal(calculate([], 'throws', 22).valid, false);
  const one = getEnergyModel(1);
  one.ci95[0] = 0;
  assert.ok(getEnergyModel(1).ci95[0] > 0);
});
