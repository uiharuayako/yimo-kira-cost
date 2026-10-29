import katex from '../vendor/katex/katex.mjs';
import { BASE_RATES, REGIONS, STAGES, CUBES, MODEL, defaultWeights, calculate, getEnergyModel } from './model.js';

const STORAGE_KEY = 'yimo-kira-lab:v1';
const $ = (id) => document.getElementById(id);
const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const shortNumber = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 });
const integer = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
const percent = (value, digits = 1) => `${(value * 100).toFixed(digits)}%`;
const decimal = (value, digits = 6) => String(Number(value.toFixed(digits)));
const texNumber = (value, digits = 1) => number.format(Number(value.toFixed(digits))).replaceAll(',', '\\,');

function restoredState() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!data || !Array.isArray(data.weights) || data.weights.length !== 15 || !data.weights.every((w) => Number.isFinite(w) && w >= 0)) return null;
    return { weights: data.weights, mode: data.mode === 'captures' ? 'captures' : 'throws', essenceCount: Number.isSafeInteger(data.essenceCount) && data.essenceCount >= 0 ? data.essenceCount : 0 };
  } catch { return null; }
}

const saved = restoredState();
const state = { weights: saved?.weights ?? defaultWeights(), mode: saved?.mode ?? 'throws', essenceCount: saved?.essenceCount ?? 0, cube: CUBES[0].id, target: 14 };
const initialValid = calculate(state.weights, state.mode, state.essenceCount);
if (initialValid.valid && initialValid.normalizedWeights.some(w => w > 0)) state.target = initialValid.normalizedWeights.indexOf(Math.max(...initialValid.normalizedWeights));
$('essence-count').value = String(state.essenceCount);

$('weight-grid').innerHTML = REGIONS.map((region, r) => `<tr><th scope="row">${region.replace('区域', '')}</th>${STAGES.map((stage, s) => {
  const i = r * 3 + s;
  return `<td><label class="sr-only" for="weight-${i}">${region}·${stage}权重</label><input id="weight-${i}" type="number" min="0" step="any" inputmode="decimal" value="${state.weights[i]}" data-weight="${i}" aria-describedby="weight-help-${i}"><span class="cell-detail" id="weight-help-${i}"><span title="官网基础捕获率">${percent(BASE_RATES[r][s], 0)}</span><span class="cell-share is-zero" data-share="${i}">0%</span></span></td>`;
}).join('')}</tr>`).join('');

$('result-cards').innerHTML = CUBES.map((cube) => `<article class="result-card" data-cube="${cube.id}" aria-labelledby="name-${cube.id}"><div class="result-top"><h4 id="name-${cube.id}" class="cube-name"><span class="mini-cube" aria-hidden="true"></span>${cube.name}<span class="cube-price">${integer.format(cube.price)} 金币 / 个</span></h4><span class="best-label" data-best="${cube.id}" hidden>最省金币</span></div><p class="cost-value" data-cost="${cube.id}">—<span>万金币</span></p><div class="result-bar" data-bar-label="${cube.id}" role="img"><span class="result-bar-fill" data-bar="${cube.id}" style="--width:0%"></span></div><div class="result-details"><span>折算捕获率<strong data-rate="${cube.id}">—</strong></span><span>期望用球<strong data-balls="${cube.id}">—</strong></span></div></article>`).join('');

$('explain-cube').innerHTML = CUBES.map((cube) => `<option value="${cube.id}">${cube.name}</option>`).join('');
$('explain-target').innerHTML = REGIONS.map((region, r) => STAGES.map((stage, s) => `<option value="${r * 3 + s}">${region.replace('区域', '')} · ${stage}</option>`).join('')).join('');
$('explain-target').value = String(state.target);
document.querySelector(`input[name="weight-mode"][value="${state.mode}"]`).checked = true;

function renderMath(id, expression) {
  katex.render(expression, $(id), { displayMode: true, throwOnError: false, output: 'htmlAndMathml', strict: 'ignore' });
}

renderMath('formula-capture', String.raw`p_{i,m}=0.7\min(b_i m+\delta,1)+0.3\min(1.5b_i m+\delta,1)`);
renderMath('formula-weights', String.raw`\alpha_i=\frac{w_i}{\sum_{j=1}^{15}w_j},\qquad \sum_{i=1}^{15}\alpha_i=1`);
renderMath('formula-energy', String.raw`r=\max(10\,500-480n,\,0)`);
renderMath('formula-stop', String.raw`N(r)=\min\left\{k\ge0:\sum_{t=1}^{k}R_t\ge r\right\},\qquad K(r)=\mathbb E[N(r)]`);
renderMath('formula-cost', String.raw`\mathbb E[B_m]=\frac{K(r)}{P_m},\qquad \mathbb E[C_m]=c_m\frac{K(r)}{P_m}\quad(r>0)`);
renderMath('formula-reward', String.raw`\mathbb E[R_{\mathrm{ordinary}}]=0.4\times275+0.5\times300+0.05\times350+0.05\times500=302.5`);
renderMath('formula-geometric', String.raw`T=\min(G,H),\quad G\sim\operatorname{Geom}(q),\qquad \mathbb E[T]=\frac{1-(1-q)^H}{q}`);

function remember() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ weights: state.weights, mode: state.mode, essenceCount: state.essenceCount })); } catch { /* Storage is optional; calculation always remains available. */ }
}

function selectedProbability() {
  const cube = CUBES.find((item) => item.id === state.cube) ?? CUBES[0];
  const base = BASE_RATES[Math.floor(state.target / 3)][state.target % 3];
  const front = Math.min(base * cube.multiplier + MODEL.flatCaptureBonus, 1);
  const back = Math.min(base * cube.multiplier * MODEL.backAttackMultiplier + MODEL.flatCaptureBonus, 1);
  return { cube, base, front, back, p: 0.7 * front + 0.3 * back };
}

function updateFormula(result) {
  const energy = getEnergyModel(state.essenceCount);
  if (energy.valid) renderMath('formula-energy-numeric', String.raw`r=\max(10\,500-480\times${state.essenceCount},\,0)=${energy.remainingEnergy}\ \text{虹能}`);
  else $('formula-energy-numeric').textContent = '请输入有效的非负整数滋养次数。';
  const { cube, base, front, back, p } = selectedProbability();
  $('capture-flow').innerHTML = `<div class="flow-stat"><span>正面 · 占 70%</span><strong>${percent(front)}</strong><small>基础 ${percent(base, 0)} × ${cube.multiplier}，再加 1 个百分点${base * cube.multiplier + .01 >= 1 ? '；上限 100%' : ''}</small></div><span class="flow-arrow" aria-hidden="true">+</span><div class="flow-stat"><span>背面 · 占 30%</span><strong>${percent(back)}</strong><small>基础 ${percent(base, 0)} × ${cube.multiplier} × 1.5，再加 1 个百分点${base * cube.multiplier * 1.5 + .01 >= 1 ? '；上限 100%' : ''}</small></div><span class="flow-arrow" aria-hidden="true">→</span><div class="flow-stat combined"><span>这类目标的捕获率</span><strong>${percent(p)}</strong><small>${cube.name}</small></div>`;
  renderMath('formula-capture-numeric', String.raw`p_{i,m}=0.7\times\min(${decimal(base)}\times${cube.multiplier}+0.01,1)+0.3\times\min(1.5\times${decimal(base)}\times${cube.multiplier}+0.01,1)=${decimal(p)}`);
  renderMath('formula-mix', state.mode === 'throws' ? String.raw`P_m=\sum_{i=1}^{15}\alpha_i p_{i,m}` : String.raw`P_m=\left(\sum_{i=1}^{15}\frac{\alpha_i}{p_{i,m}}\right)^{-1}`);
  $('mix-formula-description').textContent = state.mode === 'throws'
    ? '当前口径：投掷目标占比。先随机选择本次投掷的目标类型，再进行捕获；因此按各类每次投掷成功率做算术加权。'
    : '当前口径：成功捕获占比。先选择本次要成功捕获的目标类型，再持续投掷直到抓到；因此先对各类每次成功平均用球数 1/p 加权，再取倒数。';
  if (!result.valid) {
    $('formula-mix-numeric').textContent = energy.valid ? '请设置有效权重，查看配比代入结果。' : '请输入有效的滋养次数，查看配比代入结果。';
    $('formula-cost-numeric').textContent = energy.valid ? '请设置有效权重，查看期望球数与金币。' : '请输入有效的滋养次数，查看期望球数与金币。';
    return;
  }
  if (result.noCaptureNeeded) {
    $('formula-mix-numeric').textContent = '精华奖励已达到目标，无需捕获，折算捕获率不参与费用计算。';
    renderMath('formula-cost-numeric', String.raw`r=0\ \Longrightarrow\ K(0)=0,\quad\mathbb E[B_m]=0\ \text{个},\quad\mathbb E[C_m]=0\ \text{金币}`);
    return;
  }
  const entry = result.results.find((item) => item.id === cube.id);
  const active = result.normalizedWeights.flatMap((alpha, i) => alpha > 0 ? [{ alpha, p: entry.frontBack[i].p }] : []);
  const terms = active.slice(0, 3).map((item) => state.mode === 'throws' ? `${decimal(item.alpha, 4)}\\times${decimal(item.p, 4)}` : `\\frac{${decimal(item.alpha, 4)}}{${decimal(item.p, 4)}}`);
  const sum = terms.join('+') + (active.length > 3 ? '+\\cdots' : '');
  const numeric = state.mode === 'throws' ? sum : `\\left(${sum}\\right)^{-1}`;
  renderMath('formula-mix-numeric', `P_m=${numeric}\\approx${decimal(entry.p)}\\quad(${percent(entry.p).replace('%', '\\%')})`);
  renderMath('formula-cost-numeric', String.raw`\mathbb E[B_m]=\frac{${decimal(result.expectedCaptures, 4)}}{${decimal(entry.p, 6)}}\approx${texNumber(entry.expectedCubes)}\ \text{个}`);
  const costLine = document.createElement('div');
  const priceTex = integer.format(cube.price).replaceAll(',', String.raw`\,`);
  katex.render(String.raw`\mathbb E[C_m]=${priceTex}\times\frac{${decimal(result.expectedCaptures, 4)}}{${decimal(entry.p, 6)}}\approx${texNumber(entry.expectedCost / 10000)}\ \text{万金币}`, costLine, { displayMode: true, throwOnError: false, output: 'htmlAndMathml' });
  $('formula-cost-numeric').append(costLine);
}

function update({ persist = true } = {}) {
  const result = calculate(state.weights, state.mode, state.essenceCount);
  const energy = getEnergyModel(state.essenceCount);
  $('essence-count').setAttribute('aria-invalid', String(!energy.valid));
  $('essence-error').hidden = energy.valid;
  $('essence-error').textContent = energy.valid ? '' : energy.error;
  const progress = energy.valid ? Math.min(energy.essenceEnergy, MODEL.targetEnergy) : 0;
  $('essence-energy').textContent = energy.valid ? integer.format(energy.essenceEnergy) : '—';
  $('essence-progress').setAttribute('aria-valuenow', String(progress));
  $('essence-progress-fill').style.width = `${progress / MODEL.targetEnergy * 100}%`;
  $('energy-remaining').innerHTML = !energy.valid ? '请输入非负整数次数。' : energy.remainingEnergy === 0 ? '<strong>虹能目标已达成，无需消耗立方。</strong>' : `剩余需捕获获得 <strong>${integer.format(energy.remainingEnergy)} 虹能</strong>`;
  $('common-expected-captures').textContent = energy.valid ? `${number.format(energy.expectedCaptures)} 只` : '—';
  $('simulation-samples').textContent = !energy.valid ? 'WAITING FOR VALID INPUT' : energy.remainingEnergy === 0 ? 'TARGET REACHED / 无需模拟' : `${integer.format(energy.modelSamples)} SIMULATED RUNS`;
  $('simulation-expected').innerHTML = `${energy.valid ? number.format(energy.expectedCaptures) : '—'} <small>只成功捕获</small>`;
  $('simulation-precision').innerHTML = !energy.valid ? '请输入有效的非负整数滋养次数。' : energy.remainingEnergy === 0 ? '滋养奖励已满足 10,500 虹能目标。<br>无需捕获，立方花费为 0。<br>精华自身成本未计入。' : `估计 <var>K(${integer.format(energy.remainingEnergy)})</var> = ${decimal(energy.expectedCaptures, 7)} 只<br>均值的 95% 蒙特卡洛置信区间<br><span class="tabular">[${energy.ci95.map(v => v.toFixed(4)).join(', ')}]</span>`;
  $('mode-description').textContent = state.mode === 'throws' ? '每次投掷选择各类目标的占比，权重会自动归一化。' : '希望成功捕获的各类伊莫占比，按每只目标的平均用球数加权。';
  $('input-error').hidden = result.valid || !energy.valid;
  $('input-error').textContent = result.valid || !energy.valid ? '' : result.error;
  const sum = state.weights.reduce((total, item) => total + item, 0);
  $('weight-total').innerHTML = `权重合计 <strong>${Number.isFinite(sum) && sum >= 0 ? shortNumber.format(sum) : '—'}</strong>`;
  document.querySelectorAll('[data-weight]').forEach((input) => {
    const i = Number(input.dataset.weight);
    const share = result.valid ? result.normalizedWeights[i] : 0;
    input.closest('td').classList.toggle('is-active', result.valid && share > 0);
    input.setAttribute('aria-invalid', String(!Number.isFinite(state.weights[i]) || state.weights[i] < 0));
    const label = document.querySelector(`[data-share="${i}"]`);
    label.textContent = percent(share, 0);
    label.classList.toggle('is-zero', share === 0);
  });
  if (result.valid) {
    const active = result.normalizedWeights.flatMap((share, i) => share > 0 ? [{ share, i }] : []);
    const largest = active.slice().sort((a, b) => b.share - a.share);
    const description = largest.slice(0, 2).map(({ share, i }) => `${REGIONS[Math.floor(i / 3)].replace('区域', '')}·${STAGES[i % 3]} ${percent(share, 0)}`).join(' / ');
    $('mix-summary').textContent = result.noCaptureNeeded ? '精华奖励已满足目标，无需捕获。' : `${description}${active.length > 2 ? ` 等 ${active.length} 类` : ''}`;
    const maximum = Math.max(...result.results.map((entry) => entry.expectedCost));
    result.results.forEach((entry) => {
      document.querySelector(`[data-cost="${entry.id}"]`).innerHTML = `${number.format(entry.expectedCost / 10000)}<span>万金币</span>`;
      document.querySelector(`[data-rate="${entry.id}"]`).textContent = result.noCaptureNeeded ? '无需捕获' : percent(entry.p);
      document.querySelector(`[data-balls="${entry.id}"]`).textContent = `${number.format(entry.expectedCubes)} 个`;
      document.querySelector(`[data-bar="${entry.id}"]`).style.setProperty('--width', `${maximum > 0 ? entry.expectedCost / maximum * 100 : 0}%`);
      document.querySelector(`[data-bar-label="${entry.id}"]`).setAttribute('aria-label', `${entry.name}期望花费${number.format(entry.expectedCost / 10000)}万金币`);
      document.querySelector(`[data-best="${entry.id}"]`).hidden = result.noCaptureNeeded || entry.id !== result.bestId;
    });
  } else {
    $('mix-summary').textContent = energy.valid ? '设置至少一项正权重，查看费用比较。' : '请输入有效的非负整数滋养次数。';
    CUBES.forEach((cube) => {
      document.querySelector(`[data-cost="${cube.id}"]`).innerHTML = '—<span>万金币</span>';
      document.querySelector(`[data-rate="${cube.id}"]`).textContent = '—';
      document.querySelector(`[data-balls="${cube.id}"]`).textContent = '—';
      document.querySelector(`[data-bar="${cube.id}"]`).style.setProperty('--width', '0%');
      document.querySelector(`[data-bar-label="${cube.id}"]`).setAttribute('aria-label', '权重无效，暂无费用结果');
      document.querySelector(`[data-best="${cube.id}"]`).hidden = true;
    });
  }
  updateFormula(result);
  if (persist && state.weights.every(Number.isFinite) && energy.valid) remember();
}

document.querySelectorAll('[data-weight]').forEach((input) => input.addEventListener('input', () => {
  state.weights[Number(input.dataset.weight)] = input.value === '' ? 0 : Number(input.value);
  update();
}));
document.querySelectorAll('input[name="weight-mode"]').forEach((input) => input.addEventListener('change', () => { if (input.checked) { state.mode = input.value; update(); } }));
function replaceWeights(weights) {
  state.weights = weights;
  document.querySelectorAll('[data-weight]').forEach((input) => { input.value = String(weights[Number(input.dataset.weight)]); });
  update();
}
$('reset-weights').addEventListener('click', () => { state.essenceCount = 0; state.mode = 'throws'; $('essence-count').value = '0'; document.querySelector('input[name="weight-mode"][value="throws"]').checked = true; replaceWeights(defaultWeights()); });
$('clear-weights').addEventListener('click', () => replaceWeights(Array(15).fill(0)));
$('essence-count').addEventListener('input', (event) => { state.essenceCount = event.target.value === '' ? 0 : Number(event.target.value); update(); });
$('explain-cube').addEventListener('change', (event) => { state.cube = event.target.value; updateFormula(calculate(state.weights, state.mode, state.essenceCount)); });
$('explain-target').addEventListener('change', (event) => { state.target = Number(event.target.value); updateFormula(calculate(state.weights, state.mode, state.essenceCount)); });
update({ persist: false });
