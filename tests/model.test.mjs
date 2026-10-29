import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BASE_RATES, REGIONS, STAGES, CUBES, MODEL, defaultWeights, calculate, getEnergyModel, getCaptureSettings, getReportSettings, getTargetSettings } from '../src/model.js';

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
  assert.equal(MODEL.expectedCaptures, 2576.3470804);
  assert.equal(MODEL.samples, 5000000);
  assert.deepEqual(MODEL.ci95, [2575.5854908961587,2577.108669903841]);
  assert.deepEqual(Object.values(MODEL.metadata).map(({kind}) => kind), ['official','user','simulation','assumption']);
});

test('saved simulation reference agrees with the browser constants', async () => {
  const saved = JSON.parse(await readFile(new URL('../data/weather-results.json', import.meta.url), 'utf8'));
  assert.equal(saved.currentModel, true);
  assert.equal(saved.estimates[0].expectedCaptures, MODEL.expectedCaptures);
  assert.equal(saved.estimates[0].samples, MODEL.samples);
  assert.deepEqual(saved.estimates[0].ci95, MODEL.ci95);
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
    close(result.expectedCubes, 2576.3470804 / p);
    close(result.expectedCost, 2576.3470804 * CUBES[index].price / p);
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
  const saved = JSON.parse(await readFile(new URL('../data/weather-results.json', import.meta.url), 'utf8'));
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

test('weather model analytically combines essence survival with conditional capture stopping times', () => {
  for (let n = 0; n <= 21; n++) {
    const value = getEnergyModel(n);
    const survival = .97**n;
    close(value.survivalProb, survival);
    close(value.captureNeededProbability, survival);
    close(value.directEssenceWeatherProbability, 1-survival);
    close(value.expectedEssenceUses, (1-survival)/.03);
    close(value.expectedCaptures, survival*value.conditionalK);
    close(value.standardError, survival*value.conditionalStandardError);
    value.ci95.forEach((endpoint, index) => close(endpoint, survival*value.conditionalCi95[index]));
    assert.equal(value.conditionalCaptures, value.conditionalK);
  }
  const full = getEnergyModel(22);
  const excessive = getEnergyModel(100);
  assert.equal(excessive.effectiveEssenceCount, 22);
  assert.equal(excessive.essenceEnergy, 10560);
  assert.equal(excessive.expectedEssenceUses, full.expectedEssenceUses);
  assert.equal(excessive.directEssenceWeatherProbability, full.directEssenceWeatherProbability);
  assert.equal(excessive.captureNeededProbability, 0);
  assert.equal(excessive.conditionalK, 0);
  assert.equal(excessive.expectedCaptures, 0);
});

test('strict-energy historical data are labelled and are not the weather stopping model', async () => {
  const historical = JSON.parse(await readFile(new URL('../data/essence-results.json', import.meta.url), 'utf8'));
  const oldDefault = JSON.parse(await readFile(new URL('../data/model-results.json', import.meta.url), 'utf8'));
  assert.equal(historical.currentModel, false);
  assert.equal(oldDefault.currentModel, false);
  assert.ok(getEnergyModel(0).expectedCaptures < oldDefault.expectedCaptures);
  for (let n = 0; n <= 21; n++) {
    assert.ok(getEnergyModel(n).conditionalK < historical.estimates[n].expectedCaptures);
  }
});

test('level differences use every official coefficient, including allowed negative differences', () => {
  for (const [difference, multiplier] of [[-100,1],[0,1],[10,1],[11,.8],[12,.6],[13,.4],[14,.2],[15,.1],[100,.1]]) {
    const settings = getCaptureSettings({levelDifference: difference});
    assert.equal(settings.valid, true);
    assert.equal(settings.levelMultiplier, multiplier);
    const value = calculate(defaultWeights(), 'throws', 0, {levelDifference: difference});
    assert.equal(value.levelMultiplier, multiplier);
    close(value.results[0].frontBack[14].front, .16*multiplier+.01);
    close(value.results[0].frontBack[14].back, .24*multiplier+.01);
    assert.equal(value.expectedCaptures, MODEL.expectedCaptures);
  }
});

test('front and back endpoints and their editable mixture apply the fixed bonus after all multipliers', () => {
  for (const beta of [0, .3, 1]) {
    const value = calculate(single(0), 'throws', 0, {backAttackProbability: beta, levelDifference: 11});
    assert.equal(value.captureSettings.backAttackProbability, beta);
    close(value.captureSettings.frontAttackProbability, 1-beta);
    const partial = value.results[2].frontBack[0];
    close(partial.front, .906);
    assert.equal(partial.back, 1);
    close(partial.p, (1-beta)*.906+beta);
  }
  const implicit = calculate(defaultWeights());
  const explicit = calculate(defaultWeights(), 'throws', 0, {backAttackProbability:.3, levelDifference:10});
  assert.deepEqual(implicit, explicit);
});

test('invalid capture options fail even when no capturing would be required', () => {
  const invalid = [null, [], false,
    ...[-.1,1.1,NaN,Infinity,'0.3',null].map((beta) => ({backAttackProbability: beta})),
    ...[.5,NaN,Infinity,'10',null,Number.MAX_SAFE_INTEGER+1].map((levelDifference) => ({levelDifference})),
  ];
  for (const options of invalid) {
    assert.equal(getCaptureSettings(options).valid, false);
    assert.equal(calculate(defaultWeights(), 'throws', 0, options).valid, false);
    assert.equal(calculate(Array(15).fill(0), 'throws', 22, options).valid, false);
  }
});

test('reporting refunds use user-confirmed 1200 with editable 0, 30% and 100% bonuses', () => {
  for (const bonus of [0,.3,1]) {
    const settings = getReportSettings({reportBonusRate: bonus});
    assert.equal(settings.valid, true);
    close(settings.perCaptureRefund, 1200*(1+bonus));
    const value = calculate(defaultWeights(), 'throws', 0, {reportBonusRate: bonus});
    assert.equal(value.expectedCaptures, MODEL.expectedCaptures);
    assert.equal(value.perCaptureRefund, settings.perCaptureRefund);
    close(value.expectedRefund, MODEL.expectedCaptures*settings.perCaptureRefund);
    value.results.forEach((entry) => {
      close(entry.expectedRefund, value.expectedRefund);
      close(entry.expectedNetCost, entry.expectedCost-entry.expectedRefund);
      close(entry.expectedRefundCi95[0], value.ci95[0]*settings.perCaptureRefund);
      assert.ok(entry.expectedNetCostCi95[0] <= entry.expectedNetCost);
      assert.ok(entry.expectedNetCost <= entry.expectedNetCostCi95[1]);
    });
    assert.equal(value.bestId, 'mystery');
  }
  assert.equal(getReportSettings().perCaptureRefund, 1560);
});

test('negative net cost is allowed and its confidence interval endpoints remain sorted', () => {
  const value = calculate(single(0), 'throws', 0, {reportBonusRate:100});
  assert.equal(value.valid, true);
  for (const entry of value.results) {
    assert.ok(entry.expectedNetCost < 0);
    assert.ok(entry.expectedNetCostCi95[0] < entry.expectedNetCostCi95[1]);
    assert.ok(entry.expectedNetCostCi95[0] < entry.expectedNetCost);
    assert.ok(entry.expectedNetCost < entry.expectedNetCostCi95[1]);
    close(entry.expectedNetCostCi95[0], value.ci95[1]*(entry.costPerCapture-value.perCaptureRefund));
  }
});

test('invalid report bonuses fail and no captures means no refunds or net expenditure', () => {
  for (const bonus of [-.1,NaN,Infinity,-Infinity,'0.3',null,Number.MAX_VALUE]) {
    const options = {reportBonusRate:bonus};
    assert.equal(calculate(defaultWeights(), 'throws', 0, options).valid, false);
  }
  const value = calculate(Array(15).fill(0), 'captures', 22, {reportBonusRate:1});
  assert.equal(value.valid, true);
  assert.equal(value.expectedRefund, 0);
  for (const entry of value.results) {
    assert.equal(entry.expectedRefund, 0);
    assert.equal(entry.expectedNetCost, 0);
    assert.deepEqual(entry.expectedRefundCi95, [0,0]);
    assert.deepEqual(entry.expectedNetCostCi95, [0,0]);
  }
});

test('capture and reporting options are not mutated and do not change the weather simulation', () => {
  const options = Object.freeze({backAttackProbability:.7,levelDifference:14,reportBonusRate:.75});
  const before = {...options};
  const first = calculate(defaultWeights(), 'captures', 8, options);
  const second = calculate(defaultWeights(), 'captures', 8);
  assert.deepEqual(options, before);
  assert.equal(first.expectedCaptures, second.expectedCaptures);
  assert.equal(first.modelSamples, second.modelSamples);
  assert.deepEqual(first.ci95, second.ci95);
  first.captureSettings.levelMultiplier = 100;
  first.reportSettings.perCaptureRefund = 0;
  assert.equal(calculate(defaultWeights(), 'captures', 8, options).levelMultiplier, .2);
});

test('single default 16% base probability matches the one-type matrix population', () => {
  const weighted = calculate(defaultWeights());
  const custom = calculate(undefined, 'throws', 0, {targetMode:'single'});
  assert.equal(custom.valid, true);
  assert.equal(custom.targetMode, 'single');
  assert.equal(custom.baseProbability, .16);
  assert.deepEqual(custom.normalizedWeights, [1]);
  custom.results.forEach((entry, index) => {
    close(entry.p, weighted.results[index].p);
    close(entry.expectedCubes, weighted.results[index].expectedCubes);
    close(entry.expectedCost, weighted.results[index].expectedCost);
    close(entry.expectedNetCost, weighted.results[index].expectedNetCost);
    assert.equal(entry.frontBack.length, 1);
    assert.equal(entry.frontBack[0].base, .16);
    assert.equal(entry.frontBack[0].region, '自定义');
    assert.equal(entry.frontBack[0].stage, '单一目标');
  });
  assert.equal(weighted.targetMode, 'weights');
  assert.equal(getTargetSettings().targetMode, 'weights');
});

test('single target mode ignores absent, zero and invalid inactive weights completely', () => {
  for (const ignored of [undefined, null, {}, [], Array(15).fill(0), Array(15).fill(-1), Array(15).fill(NaN), Array(15).fill(Infinity)]) {
    const value = calculate(ignored, 'throws', 0, {targetMode:'single',baseProbability:.3});
    assert.equal(value.valid, true);
    assert.deepEqual(value.normalizedWeights, [1]);
    close(value.results[0].p, .355);
  }
  const zeroCost = calculate(undefined, 'captures', 22, {targetMode:'single',baseProbability:0});
  assert.equal(zeroCost.valid, true);
  zeroCost.results.forEach((entry) => {
    assert.equal(entry.p, .01);
    assert.equal(entry.expectedCost, 0);
    assert.equal(entry.expectedRefund, 0);
  });
});

test('single 0% and 100% bases still include the fixed bonus and branch caps', () => {
  for (const beta of [0,.3,1]) {
    const zero = calculate(undefined, 'throws', 0, {targetMode:'single',baseProbability:0,backAttackProbability:beta});
    const full = calculate(undefined, 'throws', 0, {targetMode:'single',baseProbability:1,backAttackProbability:beta});
    zero.results.forEach((entry) => assert.equal(entry.p, .01));
    full.results.forEach((entry) => assert.equal(entry.p, 1));
  }
});

test('single input is a base rate to which cube, level and back multipliers are applied', () => {
  const options = {targetMode:'single',baseProbability:.5,levelDifference:11,backAttackProbability:.4};
  const value = calculate(undefined, 'throws', 0, options);
  const probabilities = [.49,.73,.886];
  const fronts = [.41,.61,.81];
  const backs = [.61,.91,1];
  value.results.forEach((entry, index) => {
    close(entry.frontBack[0].front, fronts[index]);
    close(entry.frontBack[0].back, backs[index]);
    close(entry.p, probabilities[index]);
  });
  const captures = calculate(undefined, 'captures', 0, options);
  captures.results.forEach((entry, index) => assert.equal(entry.p, value.results[index].p));
});

test('active single target values validate strictly while inactive bases do not block weights mode', () => {
  for (const baseProbability of [-.1,1.1,NaN,Infinity,-Infinity,'0.16',null]) {
    assert.equal(getTargetSettings({targetMode:'single',baseProbability}).valid, false);
    assert.equal(calculate(undefined, 'throws', 0, {targetMode:'single',baseProbability}).valid, false);
    assert.equal(calculate(defaultWeights(), 'throws', 0, {targetMode:'weights',baseProbability}).valid, true);
  }
  for (const targetMode of ['unknown',null,1]) {
    assert.equal(getTargetSettings({targetMode}).valid, false);
    assert.equal(calculate(defaultWeights(), 'throws', 0, {targetMode}).valid, false);
  }
  assert.equal(calculate(undefined).valid, false);
  assert.equal(calculate(Array(15).fill(0)).valid, false);
});

test('single base changes neither weather stopping counts nor per-capture reporting refund', () => {
  const weighted = calculate(defaultWeights(), 'captures', 9, {reportBonusRate:.5});
  const options = Object.freeze({targetMode:'single',baseProbability:.71,reportBonusRate:.5});
  const custom = calculate(undefined, 'captures', 9, options);
  assert.equal(custom.expectedCaptures, weighted.expectedCaptures);
  assert.equal(custom.modelSamples, weighted.modelSamples);
  assert.deepEqual(custom.ci95, weighted.ci95);
  assert.equal(custom.perCaptureRefund, weighted.perCaptureRefund);
  assert.equal(custom.expectedRefund, weighted.expectedRefund);
  assert.equal(options.baseProbability, .71);
  custom.targetSettings.baseProbability = 0;
  assert.equal(calculate(undefined, 'captures', 9, options).baseProbability, .71);
});

test('capture bonuses default to additive one percentage point and official mode means relative 1%', () => {
  const defaults = getCaptureSettings();
  assert.equal(defaults.captureBonusMode, 'additive');
  assert.equal(defaults.captureBonusRate, .01);
  const additive = calculate(defaultWeights());
  const explicit = calculate(defaultWeights(), 'throws', 0, {captureBonusMode:'additive',captureBonusRate:.01});
  assert.deepEqual(additive, explicit);
  const official = calculate(undefined, 'throws', 0, {targetMode:'single',baseProbability:.16,captureBonusMode:'official',captureBonusRate:.01});
  official.results.forEach((entry, index) => close(entry.p, [.18584,.27876,.37168][index]));
  additive.results.forEach((entry, index) => assert.ok(entry.p > official.results[index].p));
});

test('zero capture bonus makes both calculation conventions identical', () => {
  const options = {captureBonusRate:0,backAttackProbability:.8,levelDifference:12};
  for (const mode of ['throws','captures']) {
    const additive = calculate(Array(15).fill(1), mode, 3, {...options,captureBonusMode:'additive'});
    const official = calculate(Array(15).fill(1), mode, 3, {...options,captureBonusMode:'official'});
    additive.results.forEach((entry, index) => {
      assert.equal(entry.p, official.results[index].p);
      assert.equal(entry.expectedCost, official.results[index].expectedCost);
    });
  }
});

test('both capture conventions cap individual branches before mixing and accept larger bonuses', () => {
  const options = {targetMode:'single',baseProbability:.56,captureBonusRate:.1};
  const additive = calculate(undefined, 'throws', 0, {...options,captureBonusMode:'additive'});
  const official = calculate(undefined, 'throws', 0, {...options,captureBonusMode:'official'});
  close(additive.results[1].frontBack[0].front, .94);
  assert.equal(additive.results[1].frontBack[0].back, 1);
  close(additive.results[1].p, .958);
  close(official.results[1].frontBack[0].front, .924);
  assert.equal(official.results[1].frontBack[0].back, 1);
  close(official.results[1].p, .9468);
  for (const rate of [1,2,Number.MAX_VALUE]) {
    const value = calculate(undefined, 'throws', 0, {targetMode:'single',baseProbability:0,captureBonusMode:'additive',captureBonusRate:rate});
    assert.equal(value.valid, true);
    value.results.forEach((entry) => assert.equal(entry.p, 1));
  }
  const hugeOfficial = calculate(undefined, 'throws', 0, {targetMode:'single',baseProbability:.1,captureBonusMode:'official',captureBonusRate:Number.MAX_VALUE});
  assert.equal(hugeOfficial.valid, true);
  hugeOfficial.results.forEach((entry) => assert.equal(entry.p, 1));
});

test('zero effective success probability gives a friendly unreachable error until essence guarantees weather', () => {
  const cases = [
    {captureBonusMode:'official',captureBonusRate:0},
    {captureBonusMode:'official',captureBonusRate:.01},
    {captureBonusMode:'official',captureBonusRate:Number.MAX_VALUE},
    {captureBonusMode:'additive',captureBonusRate:0},
  ];
  for (const bonus of cases) {
    const options = {targetMode:'single',baseProbability:0,...bonus};
    for (const n of [0,1,21]) {
      const value = calculate(undefined, 'throws', n, options);
      assert.equal(value.valid, false);
      assert.match(value.error, /捕获概率为0/);
      assert.deepEqual(value.results, []);
    }
    const completed = calculate(undefined, 'throws', 22, options);
    assert.equal(completed.valid, true);
    completed.results.forEach((entry) => {
      assert.equal(entry.p, 0);
      assert.equal(entry.costPerCapture, null);
      assert.equal(entry.expectedCost, 0);
      assert.equal(entry.expectedRefund, 0);
      assert.equal(entry.expectedNetCost, 0);
      assert.deepEqual(entry.expectedCostCi95, [0,0]);
    });
  }
});

test('capture convention and rate validation reject invalid values rather than emitting NaN amounts', () => {
  for (const captureBonusMode of ['unknown',null,0]) {
    assert.equal(getCaptureSettings({captureBonusMode}).valid, false);
    assert.equal(calculate(defaultWeights(), 'throws', 0, {captureBonusMode}).valid, false);
  }
  for (const captureBonusRate of [-.1,NaN,Infinity,-Infinity,'0.01',null]) {
    assert.equal(getCaptureSettings({captureBonusRate}).valid, false);
    assert.equal(calculate(defaultWeights(), 'throws', 0, {captureBonusRate}).valid, false);
    assert.equal(calculate(defaultWeights(), 'throws', 22, {captureBonusRate}).valid, false);
  }
  const tooSmall = calculate(undefined, 'throws', 0, {targetMode:'single',baseProbability:Number.MIN_VALUE,captureBonusMode:'official',captureBonusRate:0});
  assert.equal(tooSmall.valid, false);
  assert.deepEqual(tooSmall.results, []);
});

test('combined custom bonus settings remain pure and leave weather and refund mechanics unchanged', () => {
  const options = Object.freeze({targetMode:'single',baseProbability:.16,levelDifference:14,backAttackProbability:.8,captureBonusMode:'official',captureBonusRate:.3,reportBonusRate:.5});
  const value = calculate(undefined, 'captures', 10, options);
  const defaultValue = calculate(defaultWeights(), 'captures', 10, {reportBonusRate:.5});
  assert.equal(value.valid, true);
  close(value.results[0].frontBack[0].front, .0416);
  close(value.results[0].frontBack[0].back, .0624);
  close(value.results[0].p, .05824);
  assert.equal(value.expectedCaptures, defaultValue.expectedCaptures);
  assert.deepEqual(value.ci95, defaultValue.ci95);
  assert.equal(value.expectedRefund, defaultValue.expectedRefund);
  assert.equal(options.captureBonusRate, .3);
  value.captureSettings.captureBonusRate = 100;
  assert.equal(calculate(undefined, 'captures', 10, options).captureBonusRate, .3);
});
