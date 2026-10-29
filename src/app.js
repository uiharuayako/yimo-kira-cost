import katex from '../vendor/katex/katex.mjs';
import { BASE_RATES, REGIONS, STAGES, CUBES, MODEL, defaultWeights, calculate, getEnergyModel, getCaptureSettings, getReportSettings, getTargetSettings } from './model.js';
import { getWeatherDistribution, getIntervalProbability, getDistributionBins } from './distribution.js';

const STORAGE_KEY = 'yimo-kira-lab:v1';
const $ = (id) => document.getElementById(id);
const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const shortNumber = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 });
const integer = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
const percent = (value, digits = 1) => `${(value * 100).toFixed(digits)}%`;
const compactPercent = (value) => `${shortNumber.format(value * 100)}%`;
const decimal = (value, digits = 6) => String(Number(value.toFixed(digits)));
const texNumber = (value) => number.format(value).replaceAll(',', String.raw`\,`);
const displayAmount = (value) => Math.abs(value) >= 1e10 ? value.toExponential(3) : number.format(value);
const distributionState = { data: null, essenceKey: null, lower: 0, upper: 0, activeLuck: 50, drag: null, geometry: null, bins: [] };
const probabilityLabel = (p) => `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: p > 0 && p < .001 ? 6 : 3 }).format(p * 100)}%`;

function restoredState() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!data || !Array.isArray(data.weights) || data.weights.length !== 15 || !data.weights.every((w) => Number.isFinite(w) && w >= 0)) return null;
    return {
      weights: data.weights,
      mode: data.mode === 'captures' ? 'captures' : 'throws',
      essenceCount: Number.isSafeInteger(data.essenceCount) && data.essenceCount >= 0 ? data.essenceCount : 0,
      boostedEssenceCount: Number.isSafeInteger(data.boostedEssenceCount) && data.boostedEssenceCount >= 0 ? data.boostedEssenceCount : 0,
      backAttackProbability: Number.isFinite(data.backAttackProbability) && data.backAttackProbability >= 0 && data.backAttackProbability <= 1 ? data.backAttackProbability : .3,
      levelDifference: Number.isSafeInteger(data.levelDifference) ? data.levelDifference : 10,
      reportBonusRate: Number.isFinite(data.reportBonusRate) && data.reportBonusRate >= 0 ? data.reportBonusRate : .3,
      targetMode: data.targetMode === 'single' ? 'single' : 'weights',
      baseProbability: Number.isFinite(data.baseProbability) && data.baseProbability >= 0 && data.baseProbability <= 1 ? data.baseProbability : .16,
      captureBonusMode: data.captureBonusMode === 'official' ? 'official' : 'additive',
      captureBonusRate: Number.isFinite(data.captureBonusRate) && data.captureBonusRate >= 0 ? data.captureBonusRate : .01,
    };
  } catch { return null; }
}
const saved = restoredState();
const state = { weights: defaultWeights(), mode: 'throws', essenceCount: 0, boostedEssenceCount: 0, backAttackProbability: .3, levelDifference: 10, reportBonusRate: .3, targetMode: 'weights', baseProbability: .16, captureBonusMode: 'additive', captureBonusRate: .01, ...saved, cube: CUBES[0].id, target: 14 };
const options = () => ({ backAttackProbability: state.backAttackProbability, levelDifference: state.levelDifference, reportBonusRate: state.reportBonusRate, targetMode: state.targetMode, baseProbability: state.baseProbability, captureBonusMode: state.captureBonusMode, captureBonusRate: state.captureBonusRate, boostedEssenceCount: state.boostedEssenceCount });
const currentCalculation = () => calculate(state.weights, state.mode, state.essenceCount, options());
const initial = currentCalculation();
if (state.targetMode === 'weights' && initial.valid && initial.normalizedWeights.some(w => w > 0)) state.target = initial.normalizedWeights.indexOf(Math.max(...initial.normalizedWeights));

$('weight-grid').innerHTML = REGIONS.map((region, r) => `<tr><th scope="row">${region.replace('区域', '')}</th>${STAGES.map((stage, s) => {
  const i = r * 3 + s;
  return `<td><label class="sr-only" for="weight-${i}">${region}·${stage}权重</label><input id="weight-${i}" type="number" min="0" step="any" inputmode="decimal" value="${state.weights[i]}" data-weight="${i}" aria-describedby="weight-help-${i}"><span class="cell-detail" id="weight-help-${i}"><span title="官网基础捕获率">${percent(BASE_RATES[r][s], 0)}</span><span class="cell-share is-zero" data-share="${i}">0%</span></span></td>`;
}).join('')}</tr>`).join('');

$('result-cards').innerHTML = CUBES.map((cube) => `<article class="result-card" data-cube="${cube.id}" aria-labelledby="name-${cube.id}"><div class="result-top"><h4 id="name-${cube.id}" class="cube-name"><span class="mini-cube" aria-hidden="true"></span>${cube.name}<span class="cube-price">${integer.format(cube.price)} 金币 / 个</span></h4><span class="best-label" data-best="${cube.id}" hidden>净花费最低</span></div><p class="cost-value" data-cost="${cube.id}">—<span>万金币 · 净花费</span></p><div class="result-bar net-bar" data-bar-label="${cube.id}" role="img"><span class="result-bar-fill" data-bar="${cube.id}" style="--width:0%;left:50%"></span></div><div class="net-axis" aria-hidden="true"><span>← 净收益</span><span>0</span><span>净花费 →</span></div><dl class="result-breakdown"><div><dt>立方支出</dt><dd data-gross="${cube.id}">—</dd></div><div><dt>基础汇报返还</dt><dd data-refund="${cube.id}">—</dd></div></dl><div class="result-details"><span>折算捕获率<strong data-rate="${cube.id}">—</strong></span><span>期望用球<strong data-balls="${cube.id}">—</strong></span></div></article>`).join('');

$('explain-cube').innerHTML = CUBES.map((cube) => `<option value="${cube.id}">${cube.name}</option>`).join('');
$('explain-target').innerHTML = REGIONS.map((region, r) => STAGES.map((stage, s) => `<option value="${r * 3 + s}">${region.replace('区域', '')} · ${stage}</option>`).join('')).join('');
$('explain-target').value = String(state.target);

function syncInputValues() {
  $('essence-count').value = String(state.essenceCount);
  $('boosted-essence-count').value = String(state.boostedEssenceCount);
  $('front-percent').value = decimal((1 - state.backAttackProbability) * 100, 10);
  $('back-percent').value = decimal(state.backAttackProbability * 100, 10);
  $('level-difference').value = String(state.levelDifference);
  $('report-bonus').value = decimal(state.reportBonusRate * 100, 10);
  $('single-base-percent').value = decimal(state.baseProbability * 100, 10);
  $('capture-bonus-mode').value = state.captureBonusMode;
  $('capture-bonus-percent').value = decimal(state.captureBonusRate * 100, 10);
  document.querySelector(`input[name="weight-mode"][value="${state.mode}"]`).checked = true;
  document.querySelector(`input[name="target-mode"][value="${state.targetMode}"]`).checked = true;
}
syncInputValues();

const mathOptions = { displayMode: true, throwOnError: false, output: 'htmlAndMathml', strict: 'ignore' };
const renderMath = (id, expression) => katex.render(expression, $(id), mathOptions);
function appendMath(id, expression) { const line = document.createElement('div'); katex.render(expression, line, mathOptions); $(id).append(line); }
renderMath('formula-capture', String.raw`p_{i,m}=(1-\beta)\min(b_i mL(\Delta)+\eta,1)+\beta\min(1.5b_i mL(\Delta)+\eta,1)`);
renderMath('formula-weights', String.raw`\alpha_i=\frac{w_i}{\sum_{j=1}^{15}w_j},\qquad \sum_{i=1}^{15}\alpha_i=1`);
renderMath('formula-energy', String.raw`a=u+v,\qquad E=480u+720v,\qquad r=\max(10\,500-E,0)`);
renderMath('formula-survival', String.raw`s=0.97^{a},\qquad P(\text{精华提前直出})=1-s\quad(r>0)`);
renderMath('formula-stop', String.raw`N_w(r)=\min\left\{t\ge0:W_t=1\ \text{或}\ \sum_{j=1}^{t}R_j\ge r\right\},\qquad K_w(r)=\mathbb E[N_w(r)]`);
renderMath('formula-weather-mean', String.raw`\mathbb E[N]=\begin{cases}sK_w(r),&r>0\\0,&r=0\end{cases}`);
renderMath('formula-reward', String.raw`\mathbb E[R_{\mathrm{ordinary}}\mid\text{未直出}]=0.4(275)+0.5(300)+0.05(350)+0.05(500)=302.5`);
renderMath('formula-geometric', String.raw`T=\min(G,H),\quad G\sim\operatorname{Geom}(q),\qquad \mathbb E[T]=\frac{1-(1-q)^H}{q}`);
renderMath('formula-cost', String.raw`\mathbb E[B_m]=\frac{\mathbb E[N]}{P_m},\qquad \mathbb E[C_{\mathrm{gross},m}]=c_m\frac{\mathbb E[N]}{P_m}`);
renderMath('formula-refund', String.raw`\mathbb E[F]=\mathbb E[N]\times1\,200(1+\gamma)`);
renderMath('formula-net', String.raw`\mathbb E[C_{\mathrm{net},m}]=\mathbb E[C_{\mathrm{gross},m}]-\mathbb E[F]`);
renderMath('formula-distribution-mixture', String.raw`h_r(k)=\frac{c_{r,k}}{M},\quad f(k)=\begin{cases}1-s,&k=0\\s\,h_r(k),&k\ge1\end{cases}\quad(r>0)`);
renderMath('formula-distribution', String.raw`f(k)=P(N=k),\quad F(k)=\sum_{j=0}^{k}f(j),\quad P(L\le N\le U)=F(U)-F(L-1)`);
renderMath('formula-luck-quantile', String.raw`\tau=\frac{100-\ell}{100},\quad p\ell=\min\{k:F(k)\ge\tau\}\ (\tau>0),\quad p100=\min\operatorname{supp}(N)`);
renderMath('formula-first-weather', String.raw`P(\text{首抓直出})=s\,[0.002+(1-0.002)\times0.01]\times0.006=s\times0.00007188`);

function remember() {
  const storedWeights = state.weights.length === 15 && state.weights.every(w => Number.isFinite(w) && w >= 0) ? state.weights : defaultWeights();
  const storedBase = Number.isFinite(state.baseProbability) && state.baseProbability >= 0 && state.baseProbability <= 1 ? state.baseProbability : .16;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ weights: storedWeights, mode: state.mode, essenceCount: state.essenceCount, ...options(), baseProbability: storedBase })); } catch { /* Local storage is optional. */ }
}

function updateTargetMode(target) {
  const single = state.targetMode === 'single';
  $('weights-controls').hidden = single;
  $('single-base-controls').hidden = !single;
  $('weight-total').hidden = single;
  $('clear-weights').hidden = single;
  $('explain-target-control').hidden = single;
  $('explain-custom-target').hidden = !single;
  const validBase = Number.isFinite(state.baseProbability) && state.baseProbability >= 0 && state.baseProbability <= 1;
  $('explain-custom-target').textContent = `单一目标 · 用户基础率 ${validBase ? compactPercent(state.baseProbability) : '待填写'}`;
  $('single-base-percent').setAttribute('aria-invalid', String(single && !target.valid));
  $('base-probability-definition').textContent = single ? '当前为单一目标：b取用户输入的基础概率，不是最终成功率，无单位；仍叠加下列捕获修正。' : '当前为15类配比：第i类普通伊莫的官网基础概率，无单位；由区域和成长阶段决定。';
  $('formula-weights').hidden = single;
  $('weight-symbol-definitions').hidden = single;
  $('mix-formula-title').textContent = single ? '单一目标，直接使用它的捕获率。' : '再把15类目标，合成这条路线的捕获率。';
  $('effective-probability-definition').textContent = single ? '只抓一个目标时，P_m就是该目标应用所有修正后的每次投掷成功率，无单位。无需权重或配比加权。' : '该立方在当前配比下的每次投掷成功率；成功构成模式下是每次成功平均用球数的倒数。';
}

function updateSettings(capture, report, result) {
  const captureError = capture.valid ? '' : capture.error;
  const reportError = report.valid ? (result.error?.includes('汇报') ? result.error : '') : report.error;
  $('settings-error').hidden = !captureError && !reportError;
  $('settings-error').textContent = [captureError, reportError].filter(Boolean).join(' ');
  $('level-difference').setAttribute('aria-invalid', String(!Number.isSafeInteger(state.levelDifference)));
  $('report-bonus').setAttribute('aria-invalid', String(!report.valid));
  $('capture-bonus-percent').setAttribute('aria-invalid', String(!Number.isFinite(state.captureBonusRate) || state.captureBonusRate < 0));
  $('level-multiplier').textContent = capture.valid ? `当前系数 ×${capture.levelMultiplier}` : '请输入整数等级差';
  $('report-per-capture').textContent = report.valid ? `每只实收 ${shortNumber.format(report.perCaptureRefund)} 金币` : '请输入有效加成';
  $('condition-level').textContent = capture.valid ? `等级差 ${state.levelDifference} · 系数 ×${capture.levelMultiplier}` : '等级差待填写';
  $('condition-position').textContent = `正面 ${compactPercent(1-state.backAttackProbability)} / 背面 ${compactPercent(state.backAttackProbability)}`;
  $('art-position-note').textContent = `${compactPercent(state.backAttackProbability)} BACK / ${compactPercent(1-state.backAttackProbability)} FRONT`;
  const official = state.captureBonusMode === 'official';
  const bonus = shortNumber.format(state.captureBonusRate * 100);
  $('capture-bonus-note').textContent = official ? `官网乘算 · 相对 +${bonus}%` : `最终加算 · +${bonus} 个百分点`;
  $('capture-bonus-source').textContent = official ? '官网乘算口径' : '最终加算口径';
  $('capture-bonus-source').className = `source-badge ${official ? 'official' : 'user'}`;
  $('capture-bonus-help').textContent = official ? `当前官网乘算：基础概率乘以 (1 + ${bonus}%)，再应用其他倍率。1%表示相对×1.01。` : `当前最终加算：所有倍率完成后，每个正背分支额外加 ${bonus} 个百分点。1%输入表示+1个百分点。`;
  $('capture-bonus-definition').textContent = official ? `当前为官网乘算：η=${decimal(state.captureBonusRate)}，由输入百分比除以100得到；基础率先乘(1+η)。1%为相对×1.01，公式口径来自官网。` : `当前为最终加算：η=${decimal(state.captureBonusRate)}，由输入百分比除以100得到；在每个正背分支乘法后直接加入。1%代表最终+1个百分点，此口径由用户指定。`;
}

function updateEnergy(energy) {
  $('essence-count').setAttribute('aria-invalid', String(!Number.isSafeInteger(state.essenceCount)||state.essenceCount<0));
  $('boosted-essence-count').setAttribute('aria-invalid', String(!Number.isSafeInteger(state.boostedEssenceCount)||state.boostedEssenceCount<0));
  $('essence-error').hidden = energy.valid;
  $('essence-error').textContent = energy.valid ? '' : energy.error;
  const progress = energy.valid ? Math.min(energy.essenceEnergy, MODEL.targetEnergy) : 0;
  $('essence-energy').textContent = energy.valid ? integer.format(energy.essenceEnergyExact ? BigInt(energy.essenceEnergyExact) : energy.essenceEnergy) : '—';
  $('essence-progress').setAttribute('aria-valuenow', String(progress));
  $('essence-progress-fill').style.width = `${progress / MODEL.targetEnergy * 100}%`;
  $('essence-direct-probability').textContent = energy.valid&&!energy.noCaptureNeeded ? percent(energy.directEssenceWeatherProbability, 2) : '—';
  $('essence-survival-probability').textContent = energy.valid&&!energy.noCaptureNeeded ? percent(energy.survivalProb, 2) : '—';
  $('essence-split-note').hidden = !energy.valid||!energy.noCaptureNeeded;
  $('energy-remaining').innerHTML = !energy.valid ? '请输入两类精华的非负整数次数。' : energy.noCaptureNeeded ? '<strong>精华阶段由直出或虹能保底完成，无需捕获。</strong>' : `若精华均未直出，剩余保底 <strong>${integer.format(energy.remainingEnergy)} 虹能</strong>`;
  $('common-expected-captures').textContent = energy.valid ? `${number.format(energy.expectedCaptures)} 只` : '—';
  $('simulation-samples').textContent = !energy.valid ? 'WAITING FOR VALID INPUT' : energy.noCaptureNeeded ? 'GUARANTEED IN ESSENCE STAGE' : `${integer.format(energy.modelSamples)} SIMULATED RUNS`;
  $('simulation-expected').innerHTML = `${energy.valid ? number.format(energy.expectedCaptures) : '—'} <small>只 · 最终期望</small>`;
  $('simulation-precision').innerHTML = !energy.valid ? '请输入两类精华的有效非负整数次数。' : energy.noCaptureNeeded ? '两类精华计划合计虹能已达到保底。<br>无需进入捕获阶段，立方支出与汇报返还均为0。<br>完成即停，余下计划不消耗；未指定顺序，不拆分实际使用次数或直出占比。两类精华成本未计入。' : `条件 <var>K<sub>w</sub>(${integer.format(energy.remainingEnergy)})</var> = ${decimal(energy.conditionalCaptures, 4)} 只<br>两类精华均未直出概率 ${percent(energy.survivalProb, 2)}<br>最终均值 95% 蒙特卡洛区间<br><span class="tabular">[${energy.ci95.map(v => v.toFixed(4)).join(', ')}]</span>`;
  if (energy.valid) {
    const planEnergy=energy.essenceEnergyExact??String(energy.essenceEnergy),totalCount=energy.totalEssenceCountExact??String(state.essenceCount+state.boostedEssenceCount);
    const survival=energy.noCaptureNeeded?'':String.raw`,\quad s=0.97^{${totalCount}}\approx${decimal(energy.survivalProb)}`;
    renderMath('formula-energy-numeric', String.raw`E=480\times${state.essenceCount}+720\times${state.boostedEssenceCount}=${planEnergy},\quad a=${totalCount},\quad r=${energy.remainingEnergy}${survival}`);
    renderMath('formula-weather-numeric', energy.noCaptureNeeded ? String.raw`E\ge10\,500\ \Longrightarrow\ r=0,\quad\mathbb E[N]=0\ \text{只}` : String.raw`\mathbb E[N]=${decimal(energy.survivalProb)}\times${decimal(energy.conditionalCaptures, 4)}\approx${decimal(energy.expectedCaptures, 4)}\ \text{只}`);
  } else { $('formula-energy-numeric').textContent = '请输入有效的精华次数。'; $('formula-weather-numeric').textContent = '请输入有效的精华次数。'; }
}

function updateFormula(result, capture, report, target = getTargetSettings(options())) {
  const cube = CUBES.find(item => item.id === state.cube) ?? CUBES[0];
  const single = state.targetMode === 'single';
  const official = state.captureBonusMode === 'official';
  renderMath('formula-capture', official ? String.raw`p_{i,m}=(1-\beta)\min\big(b_i(1+\eta)mL(\Delta),1\big)+\beta\min\big(1.5b_i(1+\eta)mL(\Delta),1\big)` : String.raw`p_{i,m}=(1-\beta)\min(b_i mL(\Delta)+\eta,1)+\beta\min(1.5b_i mL(\Delta)+\eta,1)`);
  if (capture.valid && target.valid) {
    const base = single ? target.baseProbability : BASE_RATES[Math.floor(state.target / 3)][state.target % 3];
    const relativeMultiplier = official ? 1 + state.captureBonusRate : 1;
    const finalBonus = official ? 0 : state.captureBonusRate;
    const frontRaw = base * relativeMultiplier * cube.multiplier * capture.levelMultiplier + finalBonus;
    const backRaw = base * relativeMultiplier * cube.multiplier * capture.levelMultiplier * 1.5 + finalBonus;
    const front = Math.min(frontRaw, 1), back = Math.min(backRaw, 1);
    const p = capture.frontAttackProbability * front + capture.backAttackProbability * back;
    const bonusDescription = official ? `基础先×${decimal(relativeMultiplier)}` : `最终加${shortNumber.format(finalBonus * 100)}个百分点`;
    $('capture-flow').innerHTML = `<div class="flow-stat"><span>正面 · 占 ${compactPercent(capture.frontAttackProbability)}</span><strong>${percent(front)}</strong><small>基础${compactPercent(base)}，立方×${cube.multiplier}，等级×${capture.levelMultiplier}，${bonusDescription}${frontRaw >= 1 ? '；上限100%' : ''}</small></div><span class="flow-arrow" aria-hidden="true">+</span><div class="flow-stat"><span>背面 · 占 ${compactPercent(capture.backAttackProbability)}</span><strong>${percent(back)}</strong><small>再乘背袭1.5，${bonusDescription}${backRaw >= 1 ? '；上限100%' : ''}</small></div><span class="flow-arrow" aria-hidden="true">→</span><div class="flow-stat combined"><span>这类目标的捕获率</span><strong>${percent(p)}</strong><small>${cube.name}</small></div>`;
    $('capture-branch-description').textContent = `先对每个正面、背面分支分别封顶到100%，再按正面${compactPercent(capture.frontAttackProbability)} / 背面${compactPercent(capture.backAttackProbability)}加权。`;
    $('capture-assumptions').textContent = `1.5 是官网背袭倍率；当前等级差 ${state.levelDifference} 级，对应 L=${capture.levelMultiplier}，正背比例由输入决定。状态系数假定为1。全部在战斗外，因此满血不乘战斗内的0.8系数。`;
    const core = official ? `${decimal(base)}(1+${decimal(state.captureBonusRate)})\\times${cube.multiplier}\\times${capture.levelMultiplier}` : `${decimal(base)}\\times${cube.multiplier}\\times${capture.levelMultiplier}`;
    const addition = official ? '' : `+${decimal(state.captureBonusRate)}`;
    renderMath('formula-capture-numeric', `${decimal(capture.frontAttackProbability)}\\min(${core}${addition},1)+${decimal(capture.backAttackProbability)}\\min(1.5\\times${core}${addition},1)=${decimal(p)}`);
  } else {
    $('capture-flow').textContent = target.valid ? '请输入有效的捕获设置、非负加成与整数等级差。' : '单一基础概率必须为0%至100%。';
    $('formula-capture-numeric').textContent = target.valid ? capture.error : target.error;
    $('capture-assumptions').textContent = '等级差必须为整数；正背比例合计100%；单一基础概率介于0%和100%。';
  }
  renderMath('formula-mix', single ? String.raw`P_m=p_{\mathrm{single},m}` : state.mode === 'throws' ? String.raw`P_m=\sum_{i=1}^{15}\alpha_i p_{i,m}` : String.raw`P_m=\left(\sum_{i=1}^{15}\frac{\alpha_i}{p_{i,m}}\right)^{-1}`);
  $('mix-formula-description').textContent = single ? '单一基础概率模式：只捕捉这一种伊莫，不使用15类配比或权重口径。输入基础率经立方、等级、正背与当前捕获加成口径修正，得到P_m。' : state.mode === 'throws' ? '投掷目标占比：按每次投掷选择的目标，对各类成功率做算术加权。' : '成功捕获占比：先选择要成功捕获的目标，再持续投掷直到抓到；对每次成功平均用球数1/p加权后取倒数。';
  if (!result.valid) { $('formula-mix-numeric').textContent = result.error; $('formula-cost-numeric').textContent = result.error; return; }
  if (result.noCaptureNeeded) {
    $('formula-mix-numeric').textContent = '精华阶段已由直出或保底完成，无需捕获。';
    renderMath('formula-cost-numeric', String.raw`\mathbb E[N]=0\ \Longrightarrow\ \mathbb E[B_m]=\mathbb E[C_{\mathrm{gross},m}]=\mathbb E[F]=\mathbb E[C_{\mathrm{net},m}]=0`);
    return;
  }
  const entry = result.results.find(item => item.id === cube.id);
  if (single) {
    renderMath('formula-mix-numeric', String.raw`b=${decimal(target.baseProbability)},\qquad P_m=p_{\mathrm{single},m}=${decimal(entry.p)}\quad(${percent(entry.p).replace('%','\\%')})`);
  } else {
  const active = result.normalizedWeights.flatMap((alpha,i) => alpha > 0 ? [{alpha,p:entry.frontBack[i].p}] : []);
  const terms = active.slice(0,3).map(item => state.mode === 'throws' ? `${decimal(item.alpha,4)}\\times${decimal(item.p,4)}` : `\\frac{${decimal(item.alpha,4)}}{${decimal(item.p,4)}}`);
  const sum = terms.join('+') + (active.length > 3 ? '+\\cdots' : '');
  const numeric = state.mode === 'throws' ? sum : `\\left(${sum}\\right)^{-1}`;
  renderMath('formula-mix-numeric', `P_m=${numeric}\\approx${decimal(entry.p)}\\quad(${percent(entry.p).replace('%','\\%')})`);
  }
  renderMath('formula-cost-numeric', String.raw`\mathbb E[B_m]=\frac{${decimal(result.expectedCaptures,4)}}{${decimal(entry.p)}}\approx${texNumber(entry.expectedCubes)}\ \text{个}`);
  appendMath('formula-cost-numeric', String.raw`\mathbb E[C_{\mathrm{gross},m}]=${cube.price}\times\frac{${decimal(result.expectedCaptures,4)}}{${decimal(entry.p)}}\approx${texNumber(entry.expectedCost/10000)}\ \text{万金币}`);
  appendMath('formula-cost-numeric', String.raw`\mathbb E[F]=${decimal(result.expectedCaptures,4)}\times1200(1+${decimal(report.reportBonusRate)})\approx${texNumber(entry.expectedRefund/10000)}\ \text{万金币}`);
  appendMath('formula-cost-numeric', String.raw`\mathbb E[C_{\mathrm{net},m}]\approx${texNumber(entry.expectedCost/10000)}-${texNumber(entry.expectedRefund/10000)}\approx${texNumber(entry.expectedNetCost/10000)}\ \text{万金币}`);
}

function distributionSvgElement(tag, attrs = {}, text) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([name,value]) => element.setAttribute(name,String(value)));
  if (text !== undefined) element.textContent = text;
  return element;
}

function drawDistribution() {
  const data = distributionState.data;
  if (!data?.valid || $('distribution-content').hidden) return;
  const plot = $('distribution-plot');
  const width = Math.round(plot.getBoundingClientRect().width);
  if (width < 1) return;
  const height = width < 500 ? 284 : 318;
  const left = 58, right = 16, top = 28, bottom = 56;
  const innerWidth = Math.max(1,width-left-right), innerHeight = height-top-bottom;
  const maximum = data.observedMax;
  const x = n => left + (n+.5)/(maximum+1)*innerWidth;
  const bins = getDistributionBins(data, Math.max(18,Math.min(85,Math.floor(innerWidth/9))));
  const maxProbability = Math.min(1,Math.max(...bins.map(bin=>bin.probability),.000001)*1.12);
  const y = p => top + innerHeight*(1-p/maxProbability);
  const el=distributionSvgElement;
  const svg=el('svg',{class:'distribution-chart',viewBox:`0 0 ${width} ${height}`,width,height,role:'img','aria-label':`成功捕获次数的离散完成分布；当前选择${distributionState.lower}至${distributionState.upper}次。紫色为选中区间的概率，灰紫色为全部概率。`});
  svg.append(el('title',{},'完成次数离散直方图，未作正态拟合'));
  svg.append(el('desc',{},`数据来自${integer.format(data.samples)}条模拟路径与精华零捕获分支的解析混合。图形分箱仅用于显示。模拟样本最大为${maximum}次，不是理论保底。`));
  svg.append(el('rect',{'data-distribution-frame':'',x:left,y:top,width:innerWidth,height:innerHeight,fill:'none',stroke:'var(--line)','stroke-width':1}));
  for(let i=0;i<=4;i++) {
    const p=maxProbability*i/4,py=y(p);
    if(i>0&&i<4)svg.append(el('line',{x1:left,y1:py,x2:width-right,y2:py,class:'distribution-grid-line'}));
    svg.append(el('text',{x:left-9,y:py+4,'text-anchor':'end',class:'distribution-axis-label'},shortNumber.format(p*100)));
  }
  const desired = width < 500 ? 3 : 5;
  const rawStep = Math.max(1,maximum/desired);
  const magnitude = 10**Math.floor(Math.log10(rawStep));
  const step = Math.max(1,Math.ceil(rawStep/magnitude)*magnitude);
  const ticks = maximum === 0 ? [0] : Array.from({length:Math.floor(maximum/step)+1},(_,i)=>i*step);
  ticks.forEach(tick=>svg.append(el('text',{x:x(tick),y:height-bottom+21,'text-anchor':tick===0?'start':'middle',class:'distribution-axis-label'},integer.format(tick))));
  svg.append(el('text',{x:left,y:15,class:'distribution-axis-title'},'每个分箱的概率（%）'));
  svg.append(el('text',{x:left+innerWidth/2,y:height-8,'text-anchor':'middle',class:'distribution-axis-title'},'成功捕获次数（次）'));
  const selectedLeft=x(distributionState.lower-.5), selectedRight=x(distributionState.upper+.5);
  svg.append(el('rect',{x:selectedLeft,y:top,width:Math.max(1,selectedRight-selectedLeft),height:innerHeight,class:'distribution-selected-band'}));
  bins.forEach(bin=>{
    const px=x(bin.lower-.5),barWidth=Math.max(.5,(bin.upper-bin.lower+1)/(maximum+1)*innerWidth-1);
    svg.append(el('rect',{x:px+.5,y:y(bin.probability),width:barWidth,height:Math.max(0,y(0)-y(bin.probability)),class:'distribution-bin','data-bin-lower':bin.lower,'data-bin-upper':bin.upper}));
    const low=Math.max(bin.lower,distributionState.lower),high=Math.min(bin.upper,distributionState.upper);
    if(low<=high){
      const selected=getIntervalProbability(data,low,high).probability;
      svg.append(el('rect',{x:px+.5,y:y(selected),width:barWidth,height:Math.max(0,y(0)-y(selected)),class:'distribution-bin-selected'}));
    }
  });
  if(maximum>0){
    const meanX=x(data.mean);
    svg.append(el('line',{x1:meanX,y1:top+22,x2:meanX,y2:height-bottom,class:'distribution-mean-line'}));
    svg.append(el('text',{x:Math.min(width-right-4,Math.max(left+4,meanX)),y:top+14,'text-anchor':meanX>left+innerWidth*.7?'end':'start',class:'distribution-mean-label'},`均值 ${number.format(data.mean)}`));
  }
  [distributionState.lower,distributionState.upper].forEach((n,index)=>{
    const px=x(index===0?n-.5:n+.5);
    svg.append(el('line',{x1:px,y1:top,x2:px,y2:height-bottom,class:'distribution-range-edge'}));
    svg.append(el('rect',{x:px-3,y:top+innerHeight/2-15,width:6,height:30,rx:3,class:'distribution-range-grip'}));
  });
  plot.replaceChildren(svg);
  distributionState.geometry={left,right,top,bottom,width,height,innerWidth,maximum};
  distributionState.bins=bins;
}

function updateDistributionSelection() {
  const data=distributionState.data;if(!data?.valid)return;
  const max=data.observedMax;
  distributionState.lower=Math.max(0,Math.min(max,Math.round(distributionState.lower)));
  distributionState.upper=Math.max(distributionState.lower,Math.min(max,Math.round(distributionState.upper)));
  const {lower,upper}=distributionState;
  const interval=getIntervalProbability(data,lower,upper);
  $('distribution-lower').value=String(lower);$('distribution-upper').value=String(upper);
  $('distribution-lower').setAttribute('aria-valuetext',`${integer.format(lower)}次成功捕获`);
  $('distribution-upper').setAttribute('aria-valuetext',`${integer.format(upper)}次成功捕获`);
  $('distribution-lower-value').textContent=`${integer.format(lower)} 次`;$('distribution-upper-value').textContent=`${integer.format(upper)} 次`;
  $('distribution-interval-label').textContent=`${integer.format(lower)}–${integer.format(upper)} 次内完成`;
  $('distribution-cumulative-label').textContent=`截至 ${integer.format(upper)} 次累计完成`;
  $('distribution-tail-label').textContent=`${integer.format(upper)} 次之后仍未完成`;
  $('distribution-interval-probability').textContent=probabilityLabel(interval.probability);
  $('distribution-cumulative-probability').textContent=probabilityLabel(interval.cumulative);
  $('distribution-tail-probability').textContent=probabilityLabel(interval.tail);
  document.querySelectorAll('[data-luck]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.luck)===distributionState.activeLuck)));
  drawDistribution();
}

function updateDistribution(energy) {
  if(!energy.valid){
    distributionState.data=null;distributionState.essenceKey=null;
    $('distribution-error').hidden=false;$('distribution-error').textContent='请输入有效的非负整数滋养次数，查看完成次数分布。';
    $('distribution-content').hidden=true;$('distribution-plot').replaceChildren();$('distribution-quantiles').replaceChildren();
    ['distribution-mean','distribution-median','distribution-standard-deviation','distribution-samples','distribution-zero-probability','distribution-first-direct','distribution-interval-probability','distribution-cumulative-probability','distribution-tail-probability','distribution-lower-value','distribution-upper-value'].forEach(id=>{$(id).textContent='—';});
    $('distribution-context').textContent='输入有效滋养次数后显示分布；其他捕获与汇报设置不影响成功捕获次数。';
    ['distribution-lower','distribution-upper'].forEach(id=>{$(id).disabled=true;});
    return;
  }
  $('distribution-context').textContent=`普通${integer.format(state.essenceCount)}次、虹能+50%精华${integer.format(state.boostedEssenceCount)}次，独立输入、不规定顺序；分布包含精华阶段完成的0次捕获路径。捕获率与汇报设置不会改变本分布。`;
  const key=`${state.essenceCount}|${state.boostedEssenceCount}`;
  if(distributionState.essenceKey===key&&distributionState.data?.valid)return;
  const data=getWeatherDistribution(state.essenceCount,{boostedEssenceCount:state.boostedEssenceCount});
  $('distribution-error').hidden=data.valid;
  $('distribution-error').textContent=data.valid?'':data.error;
  $('distribution-content').hidden=!data.valid;
  distributionState.data=data;distributionState.essenceKey=key;
  if(!data.valid)return;
  const median=data.quantiles.find(q=>q.luck===50);
  distributionState.lower=0;distributionState.upper=median.n;distributionState.activeLuck=50;
  $('distribution-mean').textContent=`${number.format(data.mean)} 次`;
  $('distribution-median').textContent=`${integer.format(median.n)} 次`;
  $('distribution-standard-deviation').textContent=`${number.format(data.standardDeviation)} 次`;
  $('distribution-samples').textContent=data.samples?integer.format(data.samples):'无需捕获模拟';
  $('distribution-zero-probability').textContent=probabilityLabel(data.zeroCaptureProbability);
  $('distribution-first-direct').textContent=probabilityLabel(data.firstDirectWeatherProbability);
  $('distribution-first-note').textContent=data.observedMax===0?'无需进入捕获阶段，全部概率集中在0次。':`已包含精华未直出的权重。1次捕获完成合计${probabilityLabel(data.firstCaptureProbability)}为经验估计；解析值只计算直接天气，不含首抓虹能保底。`;
  $('distribution-quantiles').innerHTML=data.quantiles.map(q=>`<button type="button" class="luck-card" data-luck="${q.luck}" data-quantile-count="${q.n}" aria-pressed="${q.luck===50}" aria-label="查看${q.label}，截至${q.n}次成功捕获的累计概率"><span>${q.label}</span><strong>${integer.format(q.n)}<small>次</small></strong><span class="luck-definition">${q.minimum?'理论最幸运':`下尾${shortNumber.format(q.fraction*100)}%分位`}</span></button>`).join('');
  $('distribution-quantiles').querySelectorAll('[data-luck]').forEach(button=>button.addEventListener('click',()=>{distributionState.lower=0;distributionState.upper=Number(button.dataset.quantileCount);distributionState.activeLuck=Number(button.dataset.luck);updateDistributionSelection();}));
  ['distribution-lower','distribution-upper'].forEach(id=>{$(id).min='0';$(id).max=String(data.observedMax);$(id).disabled=data.observedMax===0;});
  $('distribution-note').textContent=data.observedMax===0?'两类精华计划合计虹能达到保底，无需捕获。所有幸运档位并列0次，立方支出和汇报返还均为0。不规定顺序，因此不拆分精华直出占比及实际使用次数。':`图形只做显示分箱，区间与分位数使用完整整数分布，不插值。最大显示次数${integer.format(data.observedMax)}是模拟样本最大值，经验尾部为0不代表游戏理论保底。首抓直出解析概率与稀有事件经验频次可能因抽样误差不同。次数不包含失败投掷，不能直接除以捕获率当作立方数分位。`;
  updateDistributionSelection();
}

function distributionPointerCount(event) {
  const g=distributionState.geometry;if(!g)return null;
  const rect=$('distribution-plot').getBoundingClientRect();
  const localX=(event.clientX-rect.left)*g.width/rect.width;
  return Math.max(0,Math.min(g.maximum,Math.round((localX-g.left)/g.innerWidth*(g.maximum+1)-.5)));
}

function update({persist=true}={}) {
  const result = currentCalculation();
  const energy = getEnergyModel(state.essenceCount,{boostedEssenceCount:state.boostedEssenceCount});
  const capture = getCaptureSettings(options()), report = getReportSettings(options());
  const target = getTargetSettings(options());
  updateTargetMode(target);
  updateSettings(capture, report, result);
  updateEnergy(energy);
  updateDistribution(energy);
  $('mode-description').textContent = state.mode === 'throws' ? '每次投掷选择各类目标的占比，权重会自动归一化。' : '希望成功捕获的各类伊莫占比，按每只目标的平均用球数加权。';
  const settingsValid = capture.valid && report.valid && !result.error?.includes('汇报');
  $('input-error').hidden = result.valid || !energy.valid || !settingsValid;
  $('input-error').textContent = $('input-error').hidden ? '' : result.error;
  const total = state.weights.reduce((sum,w)=>sum+w,0);
  $('weight-total').innerHTML = `权重合计 <strong>${Number.isFinite(total)&&total>=0?shortNumber.format(total):'—'}</strong>`;
  document.querySelectorAll('[data-weight]').forEach(input => {
    const i=Number(input.dataset.weight), share=result.valid&&state.targetMode==='weights'?(result.normalizedWeights[i]??0):0;
    input.closest('td').classList.toggle('is-active',share>0);
    input.setAttribute('aria-invalid',String(!Number.isFinite(state.weights[i])||state.weights[i]<0));
    const label=document.querySelector(`[data-share="${i}"]`); label.textContent=percent(share,0);label.classList.toggle('is-zero',share===0);
  });
  if(result.valid) {
    const active=result.normalizedWeights.flatMap((share,i)=>share>0?[{share,i}]:[]).sort((a,b)=>b.share-a.share);
    $('mix-summary').textContent=result.noCaptureNeeded?'精华阶段已完成，捕获与汇报金额均为0。':state.targetMode==='single'?`单一目标 · 用户基础率 ${compactPercent(target.baseProbability)}`:active.slice(0,2).map(({share,i})=>`${REGIONS[Math.floor(i/3)].replace('区域','')}·${STAGES[i%3]} ${percent(share,0)}`).join(' / ')+(active.length>2?` 等 ${active.length} 类`:'');
    const maximum=Math.max(...result.results.map(entry=>Math.abs(entry.expectedNetCost)));
    result.results.forEach(entry=>{
      const profit=entry.expectedNetCost<0;
      const costNode=document.querySelector(`[data-cost="${entry.id}"]`);
      costNode.innerHTML=`${displayAmount(Math.abs(entry.expectedNetCost)/10000)}<span>万金币 · ${profit?'预计净收益':'净花费'}</span>`;
      costNode.dataset.netValue=String(entry.expectedNetCost);
      costNode.classList.toggle('is-profit',profit);
      document.querySelector(`[data-gross="${entry.id}"]`).textContent=`${displayAmount(entry.expectedCost/10000)} 万`;
      document.querySelector(`[data-refund="${entry.id}"]`).textContent=`${displayAmount(entry.expectedRefund/10000)} 万`;
      document.querySelector(`[data-rate="${entry.id}"]`).textContent=result.noCaptureNeeded?'无需捕获':percent(entry.p);
      document.querySelector(`[data-balls="${entry.id}"]`).textContent=`${number.format(entry.expectedCubes)} 个`;
      const width=maximum>0?Math.abs(entry.expectedNetCost)/maximum*50:0;
      const bar=document.querySelector(`[data-bar="${entry.id}"]`);bar.style.setProperty('--width',`${width}%`);bar.style.left=`${profit?50-width:50}%`;
      document.querySelector(`[data-bar-label="${entry.id}"]`).setAttribute('aria-label',`${entry.name}${profit?'预计净收益':'净花费'}${number.format(Math.abs(entry.expectedNetCost)/10000)}万金币，零轴${profit?'左':'右'}侧`);
      const best=document.querySelector(`[data-best="${entry.id}"]`);best.hidden=result.noCaptureNeeded||entry.id!==result.bestId;best.textContent=profit?'净收益最高':'净花费最低';
    });
  } else {
    $('mix-summary').textContent=result.error;
    CUBES.forEach(cube=>{
      document.querySelector(`[data-cost="${cube.id}"]`).innerHTML='—<span>万金币 · 净花费</span>';
      document.querySelector(`[data-cost="${cube.id}"]`).classList.remove('is-profit');
      delete document.querySelector(`[data-cost="${cube.id}"]`).dataset.netValue;
      ['gross','refund','rate','balls'].forEach(key=>{document.querySelector(`[data-${key}="${cube.id}"]`).textContent='—';});
      document.querySelector(`[data-bar="${cube.id}"]`).style.setProperty('--width','0%');
      document.querySelector(`[data-bar-label="${cube.id}"]`).setAttribute('aria-label','设置无效，暂无结果');
      document.querySelector(`[data-best="${cube.id}"]`).hidden=true;
    });
  }
  updateFormula(result,capture,report,target);
  if(persist&&energy.valid&&capture.valid&&report.valid&&target.valid&&(state.targetMode==='single'||state.weights.every(w=>Number.isFinite(w)&&w>=0))) remember();
}

document.querySelectorAll('[data-weight]').forEach(input=>input.addEventListener('input',()=>{state.weights[Number(input.dataset.weight)]=input.value===''?0:Number(input.value);update();}));
document.querySelectorAll('input[name="weight-mode"]').forEach(input=>input.addEventListener('change',()=>{if(input.checked){state.mode=input.value;update();}}));
function replaceWeights(weights){state.weights=weights;document.querySelectorAll('[data-weight]').forEach(input=>{input.value=String(weights[Number(input.dataset.weight)]);});update();}
$('reset-weights').addEventListener('click',()=>{Object.assign(state,{essenceCount:0,boostedEssenceCount:0,mode:'throws',backAttackProbability:.3,levelDifference:10,reportBonusRate:.3,targetMode:'weights',baseProbability:.16,captureBonusMode:'additive',captureBonusRate:.01});syncInputValues();replaceWeights(defaultWeights());});
$('clear-weights').addEventListener('click',()=>replaceWeights(Array(15).fill(0)));
$('essence-count').addEventListener('input',event=>{state.essenceCount=event.target.value===''?0:Number(event.target.value);update();});
$('boosted-essence-count').addEventListener('input',event=>{state.boostedEssenceCount=event.target.value===''?0:Number(event.target.value);update();});
function positionInput(which){
  const input=$(which==='front'?'front-percent':'back-percent');
  const raw=input.value===''?0:Number(input.value);
  const value=Math.min(100,Math.max(0,Number.isFinite(raw)?raw:0));
  if(raw!==value)input.value=String(value);
  state.backAttackProbability=which==='back'?value/100:(100-value)/100;
  $(which==='front'?'back-percent':'front-percent').value=decimal(100-value,10);
  update();
}
$('front-percent').addEventListener('input',()=>positionInput('front'));
$('back-percent').addEventListener('input',()=>positionInput('back'));
$('level-difference').addEventListener('input',event=>{state.levelDifference=event.target.value===''?NaN:Number(event.target.value);update();});
$('report-bonus').addEventListener('input',event=>{state.reportBonusRate=event.target.value===''?0:Number(event.target.value)/100;update();});
$('single-base-percent').addEventListener('input',event=>{state.baseProbability=event.target.value===''?NaN:Number(event.target.value)/100;update();});
document.querySelectorAll('input[name="target-mode"]').forEach(input=>input.addEventListener('change',()=>{if(input.checked){state.targetMode=input.value;update();}}));
$('capture-bonus-mode').addEventListener('change',event=>{state.captureBonusMode=event.target.value;update();});
$('capture-bonus-percent').addEventListener('input',event=>{state.captureBonusRate=event.target.value===''?0:Number(event.target.value)/100;update();});
$('explain-cube').addEventListener('change',event=>{state.cube=event.target.value;updateFormula(currentCalculation(),getCaptureSettings(options()),getReportSettings(options()));});
$('explain-target').addEventListener('change',event=>{state.target=Number(event.target.value);updateFormula(currentCalculation(),getCaptureSettings(options()),getReportSettings(options()));});
$('distribution-lower').addEventListener('input',event=>{distributionState.lower=Number(event.target.value);if(distributionState.lower>distributionState.upper)distributionState.upper=distributionState.lower;distributionState.activeLuck=null;updateDistributionSelection();});
$('distribution-upper').addEventListener('input',event=>{distributionState.upper=Number(event.target.value);if(distributionState.upper<distributionState.lower)distributionState.lower=distributionState.upper;distributionState.activeLuck=null;updateDistributionSelection();});
$('distribution-plot').addEventListener('pointerdown',event=>{
  if(!distributionState.data?.valid||event.button!==0)return;
  const g=distributionState.geometry,rect=$('distribution-plot').getBoundingClientRect();
  const y=(event.clientY-rect.top)*g.height/rect.height;
  if(y<g.top||y>g.height-g.bottom)return;
  const count=distributionPointerCount(event);
  const pointPx=(event.clientX-rect.left)*g.width/rect.width;
  const lowPx=g.left+distributionState.lower/(g.maximum+1)*g.innerWidth;
  const highPx=g.left+(distributionState.upper+1)/(g.maximum+1)*g.innerWidth;
  const nearLow=Math.abs(pointPx-lowPx)<18,nearHigh=Math.abs(pointPx-highPx)<18;
  const kind=nearLow&&(!nearHigh||Math.abs(pointPx-lowPx)<Math.abs(pointPx-highPx))?'lower':nearHigh?'upper':'brush';
  distributionState.drag={kind,anchor:count};distributionState.activeLuck=null;
  if(kind==='brush'){distributionState.lower=count;distributionState.upper=count;}
  $('distribution-plot').setPointerCapture(event.pointerId);updateDistributionSelection();event.preventDefault();
});
$('distribution-plot').addEventListener('pointermove',event=>{
  const drag=distributionState.drag;if(!drag)return;
  const count=distributionPointerCount(event);
  if(drag.kind==='brush'){distributionState.lower=Math.min(drag.anchor,count);distributionState.upper=Math.max(drag.anchor,count);}
  else if(drag.kind==='lower'){distributionState.lower=Math.min(count,distributionState.upper);}
  else distributionState.upper=Math.max(count,distributionState.lower);
  updateDistributionSelection();
});
['pointerup','pointercancel'].forEach(type=>$('distribution-plot').addEventListener(type,event=>{distributionState.drag=null;if($('distribution-plot').hasPointerCapture(event.pointerId))$('distribution-plot').releasePointerCapture(event.pointerId);}));
new ResizeObserver(()=>drawDistribution()).observe($('distribution-plot'));
update({persist:false});
