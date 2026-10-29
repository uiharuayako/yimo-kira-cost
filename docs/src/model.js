/**
 * Pure calculation model. Probabilities are fractions (0.56 means 56%).
 * The rainbow stopping-time estimate is fixed; editing encounter weights does
 * not rerun or change that simulation.
 */

import { WEATHER_ESTIMATES } from './weather-estimates.js';

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export const REGIONS = Object.freeze([
  '前期区域', '前中期区域', '中期区域', '中后期区域', '后期区域',
]);

export const STAGES = Object.freeze(['新生期', '成长期', '成熟期']);

export const BASE_RATES = deepFreeze([
  [0.56, 0.42, 0.28],
  [0.50, 0.38, 0.25],
  [0.44, 0.33, 0.22],
  [0.38, 0.29, 0.19],
  [0.32, 0.24, 0.16],
]);

export const CUBES = deepFreeze([
  { id: 'mystery', name: '谜立方', price: 3500, multiplier: 1 },
  { id: 'super', name: '超级立方', price: 7000, multiplier: 1.5 },
  { id: 'ultimate', name: '究极立方', price: 10500, multiplier: 2 },
]);

export const MODEL = deepFreeze({
  targetEnergy: 10500,
  initialEnergy: 0,
  essenceEnergyEach: 480,
  essenceGuaranteeCount: 22,
  expectedCaptures: WEATHER_ESTIMATES[0].expectedCaptures,
  samples: WEATHER_ESTIMATES[0].samples,
  ci95: WEATHER_ESTIMATES[0].ci95,
  essenceDirectWeatherProbability: 0.03,
  luckyDirectWeatherProbability: 0.006,
  reportBaseCredits: 1200,
  reportBonusRate: 0.30,
  levelDifference: 10,
  backAttackProbability: 0.30,
  backAttackMultiplier: 1.5,
  flatCaptureBonus: 0.01,
  sourceUrl: 'https://www.yimo.com/formula-multipliers',
  assumptions: [
    '初始虹能为 0，最多先使用指定次数的地脉精华，每次获得 480 虹能；默认次数为 0，出虹天气即停止。',
    '开始捕捉时本周普通、超级幸运一击次数及两类保底计数均为 0；不跨周。',
    '成功捕捉均符合幸运判定条件；精华自身成本不计，毛费用只计算立方支出，净费用扣除基础汇报返还。',
    '每次精华以 3% 独立概率直接出虹天气；未直出时增加 480 虹能，累计达到 10500 同样完成，最多需要 22 次。',
    '优先判定超级幸运一击；未触发超级时才判定普通幸运一击。',
    '两类保底独立累计，触发本类后仅重置本类；达到公示保底次数的当次必定触发。',
    '超级触发当次不判定普通，也不累计普通保底；官网未明确该计数细节，这是模型假设。',
    '每次普通或超级幸运事件先以 0.6% 独立概率直接出虹天气，否则按公示奖励增加虹能；任一直出或虹能达到 10500 时停止。',
    '天气停止模型不随区域、生长期、立方、等级差、背袭比例或汇报加成改变；这些设置仅影响投掷费用或返还。',
    '背袭占比默认 30%，可在 0% 至 100% 调整；等级差默认不超过 10 级。正面与背袭分支分别应用等级倍率，再加 1 个百分点，最后分别封顶为 100%。',
    '每次成功捕捉均提交汇报，包含触发天气的最后一次；基础返还 1200 由用户确认，默认汇报加成 30%。',
    '仅计算基础汇报返还，不含资质、幽黯等额外奖励；不使用已移除的一发入魂奖励。',
    '失败也消耗一个立方；费用为期望值，实际消耗会波动。',
  ],
  metadata: {
    official: {
      kind: 'official',
      title: '《伊莫》官方网站 · 概率公示',
      url: 'https://www.yimo.com/formula-multipliers',
      checkedOn: '2026-10-30',
      includes: ['15 类伊莫基础捕获率', '立方倍率', '背袭倍率', '幸运概率、保底与虹能奖励', '地脉精华每次 480 虹能'],
      essence: { energy: 480, directWeatherProbability: 0.03 },
      luckyDirectWeatherProbability: 0.006,
      ordinary: {
        firstTen: { probability: 0.01, pity: 200 },
        later: { probability: 0.005, pity: 400 },
        rewards: [275, 300, 350, 500],
        rewardProbabilities: [0.40, 0.50, 0.05, 0.05],
      },
      super: [
        { probability: 0.002, pity: 500 },
        { probability: 0.001, pity: 1000 },
        { probability: 0.0005, pity: 3000 },
      ],
      superReward: 1500,
    },
    user: {
      kind: 'user',
      includes: ['立方价格 3500 / 7000 / 10500', '默认 30% 背袭占比、可调', '固定额外捕获率 +1 个百分点', '目标为出虹天气，虹能 10500 保底亦完成', '精华自身成本不计', '用户确认基础汇报返还 1200，默认加成 30%，即 1560'],
    },
    simulation: {
      kind: 'simulation',
      method: '500 万共享事件路径，记录各虹能门槛首次到达或 0.6% 天气直出；精华 3% 直出概率解析合并。',
      samples: WEATHER_ESTIMATES[0].samples,
      mean: WEATHER_ESTIMATES[0].expectedCaptures,
      ci95: WEATHER_ESTIMATES[0].ci95,
      essenceTable: 'data/weather-results.json：n=0..21 共用 500 万条条件捕捉路径；旧的严格虹能表仅作为历史数据保留。',
      uncertainty: '区间仅表示蒙特卡洛均值的抽样误差，不包含规则歧义和单次游玩的随机波动。',
    },
    assumption: {
      kind: 'assumption',
      ordinaryPityOnSuper: '暂停',
      directRainbowWeather: '每次幸运事件独立以 0.6% 直出即完成，否则增加虹能',
      directEssenceWeather: '每次精华独立以 3% 直出即完成，否则增加 480 虹能',
      captureModifiers: '等级差按公示倍率可调；血量、状态及其他未列修正均不额外作用。',
      reportRewards: '基础 1200 及当前加成 30% 来自用户确认；不包含其他额外汇报奖。',
    },
  },
});

/** Row-major order: regionIndex * 3 + stageIndex. */
export function defaultWeights() {
  return Array.from({ length: 15 }, (_, index) => (index === 14 ? 1 : 0));
}

// Freeze the shared lookup data. Public functions return fresh CI arrays.
deepFreeze(WEATHER_ESTIMATES);

/** The remaining stopping time starts with both weekly counts and pities at 0. */
export function getEnergyModel(essenceCount = 0) {
  if (!Number.isSafeInteger(essenceCount) || essenceCount < 0) {
    return {
      valid: false,
      error: '地脉精华次数必须是非负安全整数。',
      essenceCount,
      essenceEnergy: null,
      remainingEnergy: null,
      expectedCaptures: null,
      modelSamples: 0,
      standardError: null,
      ci95: [],
      noCaptureNeeded: false,
    };
  }
  const effectiveEssenceCount = Math.min(essenceCount, MODEL.essenceGuaranteeCount);
  const entry = WEATHER_ESTIMATES[effectiveEssenceCount];
  return {
    valid: true,
    error: null,
    essenceCount,
    effectiveEssenceCount,
    essenceEnergy: effectiveEssenceCount * MODEL.essenceEnergyEach,
    remainingEnergy: Math.max(0, MODEL.targetEnergy-effectiveEssenceCount*MODEL.essenceEnergyEach),
    conditionalK: entry.conditionalK,
    conditionalCaptures: entry.conditionalK,
    conditionalStandardError: entry.conditionalStandardError,
    conditionalCi95: [...entry.conditionalCi95],
    survivalProb: entry.survivalProb,
    captureNeededProbability: entry.captureNeededProbability,
    directEssenceWeatherProbability: entry.directEssenceWeatherProbability,
    expectedEssenceUses: entry.expectedEssenceUses,
    expectedCaptures: entry.expectedCaptures,
    modelSamples: entry.samples,
    standardError: entry.standardError,
    ci95: [...entry.ci95],
    noCaptureNeeded: essenceCount >= MODEL.essenceGuaranteeCount,
  };
}

function validOptions(options) {
  return options !== null && typeof options === 'object' && !Array.isArray(options);
}

export function getCaptureSettings(options = {}) {
  if (!validOptions(options)) return { valid: false, error: '捕捉设置必须为对象。' };
  const backAttackProbability = options.backAttackProbability === undefined ? MODEL.backAttackProbability : options.backAttackProbability;
  const levelDifference = options.levelDifference === undefined ? MODEL.levelDifference : options.levelDifference;
  if (typeof backAttackProbability !== 'number' || !Number.isFinite(backAttackProbability) || backAttackProbability < 0 || backAttackProbability > 1) {
    return { valid: false, error: '背袭占比必须是 0 至 1 之间的有限数字。' };
  }
  if (!Number.isSafeInteger(levelDifference)) return { valid: false, error: '等级差必须是安全整数。' };
  const levelMultiplier = levelDifference <= 10 ? 1 : levelDifference === 11 ? .8 : levelDifference === 12 ? .6 : levelDifference === 13 ? .4 : levelDifference === 14 ? .2 : .1;
  return { valid: true, error: null, backAttackProbability, frontAttackProbability: 1-backAttackProbability, levelDifference, levelMultiplier };
}

export function getReportSettings(options = {}) {
  if (!validOptions(options)) return { valid: false, error: '汇报设置必须为对象。' };
  const reportBonusRate = options.reportBonusRate === undefined ? MODEL.reportBonusRate : options.reportBonusRate;
  if (typeof reportBonusRate !== 'number' || !Number.isFinite(reportBonusRate) || reportBonusRate < 0) {
    return { valid: false, error: '汇报加成必须是有限的非负数字。' };
  }
  const perCaptureRefund = MODEL.reportBaseCredits*(1+reportBonusRate);
  if (!Number.isFinite(perCaptureRefund)) return { valid: false, error: '汇报加成过大，无法计算有限的金币返还。' };
  return { valid: true, error: null, reportBaseCredits: MODEL.reportBaseCredits, reportBonusRate, perCaptureRefund };
}

const scaledInterval = (interval, coefficient) => interval.map((mean) => mean*coefficient).sort((a, b) => a-b);

/**
 * throws: weights describe the mix of all throws; p = sum(alpha_i * p_i).
 * captures: weights describe the desired mix of successful captures;
 *           p = 1 / sum(alpha_i / p_i).
 */
export function calculate(weights, mode = 'throws', essenceCount = 0, options = {}) {
  const energy = getEnergyModel(essenceCount);
  const captureSettings = getCaptureSettings(options);
  const reportSettings = getReportSettings(options);
  const invalid = (error) => ({ ...energy, valid: false, error, mode, captureSettings, reportSettings, normalizedWeights: [], results: [] });
  if (!energy.valid) return invalid(energy.error);
  if (!captureSettings.valid) return invalid(captureSettings.error);
  if (!reportSettings.valid) return invalid(reportSettings.error);
  const expectedRefund = energy.expectedCaptures*reportSettings.perCaptureRefund;
  if (!Number.isFinite(expectedRefund)) return invalid('汇报加成过大，无法计算有限的金币返还。');
  if (mode !== 'throws' && mode !== 'captures') {
    return invalid('请选择按投掷次数或按成功捕获数量加权。');
  }
  if (!Array.isArray(weights) || weights.length !== 15) {
    return invalid('请提供 15 项区域与生长期权重。');
  }
  if (Array.from(weights).some((weight) => typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0)) {
    return invalid('权重必须是有限的非负数字。');
  }
  const maximum = Math.max(...weights);
  if (maximum === 0 && !energy.noCaptureNeeded) return invalid('请至少为一类伊莫设置大于 0 的权重。');

  // Scaling first keeps the sum finite even for weights near Number.MAX_VALUE.
  const scaled = maximum === 0 ? Array(15).fill(0) : weights.map((weight) => weight / maximum);
  const scaledTotal = scaled.reduce((sum, weight) => sum + weight, 0);
  const normalizedWeights = scaledTotal === 0 ? Array(15).fill(0) : scaled.map((weight) => weight / scaledTotal);
  const flatRates = BASE_RATES.flat();

  const results = CUBES.map((cube) => {
    const frontBack = flatRates.map((base, index) => {
      const front = Math.min(base * cube.multiplier * captureSettings.levelMultiplier + MODEL.flatCaptureBonus, 1);
      const back = Math.min(base * cube.multiplier * captureSettings.levelMultiplier * MODEL.backAttackMultiplier + MODEL.flatCaptureBonus, 1);
      const p = captureSettings.frontAttackProbability * front + captureSettings.backAttackProbability * back;
      return { base, front, back, p, region: REGIONS[Math.floor(index / 3)], stage: STAGES[index % 3] };
    });
    const aggregateProbability = maximum === 0 ? null : mode === 'throws'
      ? frontBack.reduce((sum, entry, index) => sum + normalizedWeights[index] * entry.p, 0)
      : 1 / frontBack.reduce((sum, entry, index) => sum + normalizedWeights[index] / entry.p, 0);
    // Rounding of normalized weights must not produce a probability above 1.
    const p = aggregateProbability === null ? null : Math.min(1, aggregateProbability);
    const expectedCubes = energy.noCaptureNeeded ? 0 : energy.expectedCaptures / p;
    return {
      ...cube,
      p,
      expectedCubes,
      expectedCost: expectedCubes * cube.price,
      expectedRefund,
      expectedNetCost: expectedCubes*cube.price-expectedRefund,
      expectedRefundCi95: scaledInterval(energy.ci95, reportSettings.perCaptureRefund),
      expectedNetCostCi95: energy.noCaptureNeeded ? [0, 0] : scaledInterval(energy.ci95, cube.price/p-reportSettings.perCaptureRefund),
      costPerCapture: p === null ? null : cube.price / p,
      expectedCubesCi95: energy.noCaptureNeeded ? [0, 0] : energy.ci95.map((mean) => mean / p),
      expectedCostCi95: energy.noCaptureNeeded ? [0, 0] : energy.ci95.map((mean) => mean * cube.price / p),
      frontBack,
    };
  });

  return {
    ...energy,
    mode,
    captureSettings,
    levelMultiplier: captureSettings.levelMultiplier,
    reportSettings,
    reportBonusRate: reportSettings.reportBonusRate,
    perCaptureRefund: reportSettings.perCaptureRefund,
    expectedRefund,
    normalizedWeights,
    results,
    targetEnergy: MODEL.targetEnergy,
    bestId: energy.noCaptureNeeded ? null : results.reduce((best, result) => (result.expectedCost < best.expectedCost ? result : best)).id,
  };
}
