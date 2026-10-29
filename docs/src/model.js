/**
 * Pure calculation model. Probabilities are fractions (0.56 means 56%).
 * The rainbow stopping-time estimate is fixed; editing encounter weights does
 * not rerun or change that simulation.
 */

import { ENERGY_ESTIMATES } from './energy-estimates.js';

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
  expectedCaptures: 2797.7761872,
  samples: 15000000,
  ci95: [2797.4569133, 2798.0954611],
  backAttackProbability: 0.30,
  backAttackMultiplier: 1.5,
  flatCaptureBonus: 0.01,
  sourceUrl: 'https://www.yimo.com/formula-multipliers',
  assumptions: [
    '初始虹能为 0，先使用指定次数的地脉精华，每次获得 480 虹能；默认次数为 0。',
    '开始捕捉时本周普通、超级幸运一击次数及两类保底计数均为 0；不跨周。',
    '成功捕捉均符合幸运判定条件；精华自身成本不计，只计算立方费用。',
    '精华有 3% 概率直接虹天气，该事件不作为停止条件，也不替代或重置每次 480 虹能，这是模型假设。',
    '优先判定超级幸运一击；未触发超级时才判定普通幸运一击。',
    '两类保底独立累计，触发本类后仅重置本类；达到公示保底次数的当次必定触发。',
    '超级触发当次不判定普通，也不累计普通保底；官网未明确该计数细节，这是模型假设。',
    '每次普通幸运一击按公示档次增加虹能，超级增加 1500；累计虹能达到或超过 10500 时停止。',
    '0.6% 直接虹天气不作为停止条件，也不替代或重置本模型中的虹能奖励。',
    '虹能模型不随区域、生长期和立方选择改变；各次捕捉的独立成败不改变幸运机制。',
    '30% 背袭独立作用于当次，正面与背袭分支分别加 1 个百分点，再分别封顶为 100%。',
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
      includes: ['立方价格 3500 / 7000 / 10500', '30% 背袭占比', '固定额外捕获率 +1 个百分点', '目标累计虹能 10500', '精华自身成本不计，只算立方费'],
    },
    simulation: {
      kind: 'simulation',
      method: '事件跳跃蒙特卡洛；两次独立实现合并 1000 万与 500 万条路径',
      samples: 15000000,
      mean: 2797.7761872,
      ci95: [2797.4569133, 2798.0954611],
      essenceTable: 'data/essence-results.json：n=1..21 共用 500 万条路径的各门槛首次到达时间；n=0 保留 1500 万条路径结果。',
      uncertainty: '区间仅表示蒙特卡洛均值的抽样误差，不包含规则歧义和单次游玩的随机波动。',
    },
    assumption: {
      kind: 'assumption',
      ordinaryPityOnSuper: '暂停',
      directRainbowWeather: '不提前停止，不替代或重置虹能',
      directEssenceWeather: '3% 直接天气不提前停止，不替代或重置每次 480 虹能',
      captureModifiers: '等级、血量、状态及其他未列修正均不额外作用。',
    },
  },
});

/** Row-major order: regionIndex * 3 + stageIndex. */
export function defaultWeights() {
  return Array.from({ length: 15 }, (_, index) => (index === 14 ? 1 : 0));
}

// Freeze the shared lookup data. Public functions return fresh CI arrays.
deepFreeze(ENERGY_ESTIMATES);

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
  const entry = ENERGY_ESTIMATES[Math.min(essenceCount, MODEL.essenceGuaranteeCount)];
  return {
    valid: true,
    error: null,
    essenceCount,
    essenceEnergy: essenceCount * MODEL.essenceEnergyEach,
    remainingEnergy: Math.max(0, MODEL.targetEnergy-essenceCount*MODEL.essenceEnergyEach),
    expectedCaptures: entry.expectedCaptures,
    modelSamples: entry.samples,
    standardError: entry.standardError,
    ci95: [...entry.ci95],
    noCaptureNeeded: essenceCount >= MODEL.essenceGuaranteeCount,
  };
}

/**
 * throws: weights describe the mix of all throws; p = sum(alpha_i * p_i).
 * captures: weights describe the desired mix of successful captures;
 *           p = 1 / sum(alpha_i / p_i).
 */
export function calculate(weights, mode = 'throws', essenceCount = 0) {
  const energy = getEnergyModel(essenceCount);
  const invalid = (error) => ({ ...energy, valid: false, error, mode, normalizedWeights: [], results: [] });
  if (!energy.valid) return invalid(energy.error);
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
      const front = Math.min(base * cube.multiplier + MODEL.flatCaptureBonus, 1);
      const back = Math.min(base * cube.multiplier * MODEL.backAttackMultiplier + MODEL.flatCaptureBonus, 1);
      const p = (1 - MODEL.backAttackProbability) * front + MODEL.backAttackProbability * back;
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
      costPerCapture: p === null ? null : cube.price / p,
      expectedCubesCi95: energy.noCaptureNeeded ? [0, 0] : energy.ci95.map((mean) => mean / p),
      expectedCostCi95: energy.noCaptureNeeded ? [0, 0] : energy.ci95.map((mean) => mean * cube.price / p),
      frontBack,
    };
  });

  return {
    ...energy,
    mode,
    normalizedWeights,
    results,
    targetEnergy: MODEL.targetEnergy,
    bestId: energy.noCaptureNeeded ? null : results.reduce((best, result) => (result.expectedCost < best.expectedCost ? result : best)).id,
  };
}
