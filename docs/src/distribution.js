import { WEATHER_THRESHOLDS } from './weather-threshold-data.js?v=c997aab634c1';
import { getEnergyModel } from './model.js?v=c997aab634c1';

const LUCK_LEVELS = Object.freeze([100, 95, 80, 50, 30, 10]);
const cache = new Map();
const clampProbability = value => Math.max(0, Math.min(1, value));

/** Smallest integer in the distribution whose CDF reaches u; no interpolation. */
export function discreteQuantile(distribution, fraction) {
  if (!distribution?.valid || !Number.isFinite(fraction) || fraction < 0 || fraction > 1) return null;
  if (fraction === 0) return distribution.supportMin;
  let lower = 0, upper = distribution.cdf.length - 1;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (distribution.cdf[middle] >= fraction) upper = middle;
    else lower = middle + 1;
  }
  return lower;
}

/** Unconditional successful-capture counts, including zero on essence weather. */
export function getWeatherDistribution(essenceCount = 0, options = {}) {
  const energy = getEnergyModel(essenceCount, options);
  if (!energy.valid) return { valid: false, error: energy.error };
  const key = energy.noCaptureNeeded ? 'completed' : `${energy.remainingEnergy}:${energy.totalEssenceCount}`;
  const plan = { essenceCount, boostedEssenceCount: energy.boostedEssenceCount };
  if (cache.has(key)) return { ...cache.get(key), ...plan };
  const row = energy.noCaptureNeeded ? null : WEATHER_THRESHOLDS.thresholds.find(item => item.remainingEnergy === energy.remainingEnergy);
  if (!energy.noCaptureNeeded && !row) return { valid: false, error: '缺少当前剩余虹能门槛的分布数据。' };
  const survival = energy.noCaptureNeeded ? 0 : energy.survivalProb;
  const pmf = new Float64Array(row ? row.counts.length + 1 : 1);
  pmf[0] = 1 - survival;
  if (row) row.counts.forEach((count, index) => { pmf[index + 1] = survival * count / WEATHER_THRESHOLDS.samples; });
  const cdf = new Float64Array(pmf.length);
  let total = 0, mean = 0;
  for (let k = 0; k < pmf.length; k += 1) {
    total += pmf[k];
    cdf[k] = clampProbability(total);
    mean += k * pmf[k];
  }
  // Every simulated path is recorded; remove only floating-point summation drift.
  cdf[cdf.length - 1] = 1;
  let variance = 0, thirdMoment = 0;
  for (let k = 0; k < pmf.length; k += 1) {
    const delta = k - mean;
    variance += delta * delta * pmf[k];
    thirdMoment += delta ** 3 * pmf[k];
  }
  const standardDeviation = Math.sqrt(Math.max(0, variance));
  const distribution = {
    valid: true, error: null, metric: 'successful-captures', label: '成功捕获次数', unit: '只',
    ...plan, pmf, cdf, mean, standardDeviation,
    skewness: standardDeviation > 0 ? thirdMoment / standardDeviation ** 3 : 0,
    supportMin: energy.noCaptureNeeded || energy.totalEssenceCount > 0 ? 0 : 1,
    observedMax: pmf.length - 1,
    samples: row ? WEATHER_THRESHOLDS.samples : 0,
    zeroCaptureProbability: pmf[0],
    firstCaptureProbability: pmf[1] ?? 0,
    firstDirectWeatherProbability: survival * (.002 + (1 - .002) * .01) * .006,
    metadata: {
      method: '500万共享事件路径的离散经验分布；精华零捕获分支解析混合',
      seed: WEATHER_THRESHOLDS.seed,
      sourceUrl: WEATHER_THRESHOLDS.sourceUrl ?? 'https://www.yimo.com/formula-multipliers',
      probabilitySource: '正次数概率和分位数来自模拟，零捕获概率及首抓直接天气概率解析计算。',
      maximumScope: 'observedMax是模拟样本最大值，不是游戏理论保底次数。',
      tailMass: 0,
    },
  };
  distribution.quantiles = LUCK_LEVELS.map(luck => {
    const fraction = (100 - luck) / 100;
    const count = discreteQuantile(distribution, fraction);
    return {
      luck, label: `p${luck}`, fraction, n: count,
      minimum: luck === 100,
      cdfBefore: count === 0 ? 0 : cdf[count - 1],
      cdfAt: cdf[count],
    };
  });
  cache.set(key, distribution);
  return distribution;
}

/** Integer closed interval and its disjoint left/right probabilities. */
export function getIntervalProbability(distribution, lower, upper) {
  if (!distribution?.valid || !Number.isFinite(lower) || !Number.isFinite(upper) || lower > upper) return null;
  const first = Math.max(0, Math.ceil(lower));
  const last = Math.min(distribution.observedMax, Math.floor(upper));
  const before = first <= 0 ? 0 : first > distribution.observedMax ? 1 : distribution.cdf[first - 1];
  const cumulative = last < 0 ? 0 : distribution.cdf[last];
  const probability = last < first ? 0 : clampProbability(cumulative - before);
  return { lower: first, upper: last, probability, before, cumulative, tail: clampProbability(1 - cumulative) };
}

/** Equal-width display bins. Inference always uses the full integer PMF above. */
export function getDistributionBins(distribution, count = 60) {
  if (!distribution?.valid || !Number.isSafeInteger(count) || count < 1) return [];
  const width = Math.max(1, Math.ceil((distribution.observedMax + 1) / count));
  const bins = [];
  for (let lower = 0; lower <= distribution.observedMax; lower += width) {
    const upper = Math.min(distribution.observedMax, lower + width - 1);
    bins.push(getIntervalProbability(distribution, lower, upper));
  }
  return bins;
}
