import { WEATHER_DISTRIBUTION } from './weather-distribution-data.js?v=21e86f820207';

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
export function getWeatherDistribution(essenceCount = 0) {
  if (!Number.isSafeInteger(essenceCount) || essenceCount < 0) {
    return { valid: false, error: '地脉精华次数必须是非负安全整数。' };
  }
  const n = Math.min(essenceCount, 22);
  if (cache.has(n)) return cache.get(n);
  const row = n < 22 ? WEATHER_DISTRIBUTION.rows.find(item => item.essenceCount === n) : null;
  const survival = n < 22 ? .97 ** n : 0;
  const pmf = new Float64Array(row ? row.counts.length + 1 : 1);
  pmf[0] = 1 - survival;
  if (row) row.counts.forEach((count, index) => { pmf[index + 1] = survival * count / WEATHER_DISTRIBUTION.samples; });
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
    essenceCount: n, pmf, cdf, mean, standardDeviation,
    skewness: standardDeviation > 0 ? thirdMoment / standardDeviation ** 3 : 0,
    supportMin: n > 0 ? 0 : 1,
    observedMax: pmf.length - 1,
    samples: row ? WEATHER_DISTRIBUTION.samples : 0,
    zeroCaptureProbability: pmf[0],
    firstCaptureProbability: pmf[1] ?? 0,
    firstDirectWeatherProbability: survival * (.002 + (1 - .002) * .01) * .006,
    metadata: {
      method: '500万共享事件路径的离散经验分布；精华零捕获分支解析混合',
      seed: WEATHER_DISTRIBUTION.seed,
      sourceUrl: WEATHER_DISTRIBUTION.sourceUrl ?? 'https://www.yimo.com/formula-multipliers',
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
  cache.set(n, distribution);
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
