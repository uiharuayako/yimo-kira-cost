import katex from '../vendor/katex/katex.mjs';
import { BASE_RATES, REGIONS, STAGES, CUBES, MODEL, defaultWeights, calculate, getEnergyModel, getCaptureSettings, getReportSettings } from './model.js';

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

function restoredState() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!data || !Array.isArray(data.weights) || data.weights.length !== 15 || !data.weights.every((w) => Number.isFinite(w) && w >= 0)) return null;
    return {
      weights: data.weights,
      mode: data.mode === 'captures' ? 'captures' : 'throws',
      essenceCount: Number.isSafeInteger(data.essenceCount) && data.essenceCount >= 0 ? data.essenceCount : 0,
      backAttackProbability: Number.isFinite(data.backAttackProbability) && data.backAttackProbability >= 0 && data.backAttackProbability <= 1 ? data.backAttackProbability : .3,
      levelDifference: Number.isSafeInteger(data.levelDifference) ? data.levelDifference : 10,
      reportBonusRate: Number.isFinite(data.reportBonusRate) && data.reportBonusRate >= 0 ? data.reportBonusRate : .3,
    };
  } catch { return null; }
}
const saved = restoredState();
const state = { weights: defaultWeights(), mode: 'throws', essenceCount: 0, backAttackProbability: .3, levelDifference: 10, reportBonusRate: .3, ...saved, cube: CUBES[0].id, target: 14 };
const options = () => ({ backAttackProbability: state.backAttackProbability, levelDifference: state.levelDifference, reportBonusRate: state.reportBonusRate });
const currentCalculation = () => calculate(state.weights, state.mode, state.essenceCount, options());
const initial = currentCalculation();
if (initial.valid && initial.normalizedWeights.some(w => w > 0)) state.target = initial.normalizedWeights.indexOf(Math.max(...initial.normalizedWeights));

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
  $('front-percent').value = decimal((1 - state.backAttackProbability) * 100, 10);
  $('back-percent').value = decimal(state.backAttackProbability * 100, 10);
  $('level-difference').value = String(state.levelDifference);
  $('report-bonus').value = decimal(state.reportBonusRate * 100, 10);
  document.querySelector(`input[name="weight-mode"][value="${state.mode}"]`).checked = true;
}
syncInputValues();

const mathOptions = { displayMode: true, throwOnError: false, output: 'htmlAndMathml', strict: 'ignore' };
const renderMath = (id, expression) => katex.render(expression, $(id), mathOptions);
function appendMath(id, expression) { const line = document.createElement('div'); katex.render(expression, line, mathOptions); $(id).append(line); }
renderMath('formula-capture', String.raw`p_{i,m}=(1-\beta)\min(b_i mL(\Delta)+\delta,1)+\beta\min(1.5b_i mL(\Delta)+\delta,1)`);
renderMath('formula-weights', String.raw`\alpha_i=\frac{w_i}{\sum_{j=1}^{15}w_j},\qquad \sum_{i=1}^{15}\alpha_i=1`);
renderMath('formula-energy', String.raw`a=\min(n,22),\qquad r=\max(10\,500-480a,0)`);
renderMath('formula-survival', String.raw`s=0.97^{a},\qquad P(\text{精华提前直出})=1-s`);
renderMath('formula-stop', String.raw`N_w(r)=\min\left\{t\ge0:W_t=1\ \text{或}\ \sum_{j=1}^{t}R_j\ge r\right\},\qquad K_w(r)=\mathbb E[N_w(r)]`);
renderMath('formula-weather-mean', String.raw`\mathbb E[N]=\begin{cases}sK_w(r),&n<22\\0,&n\ge22\end{cases}`);
renderMath('formula-reward', String.raw`\mathbb E[R_{\mathrm{ordinary}}\mid\text{未直出}]=0.4(275)+0.5(300)+0.05(350)+0.05(500)=302.5`);
renderMath('formula-geometric', String.raw`T=\min(G,H),\quad G\sim\operatorname{Geom}(q),\qquad \mathbb E[T]=\frac{1-(1-q)^H}{q}`);
renderMath('formula-cost', String.raw`\mathbb E[B_m]=\frac{\mathbb E[N]}{P_m},\qquad \mathbb E[C_{\mathrm{gross},m}]=c_m\frac{\mathbb E[N]}{P_m}`);
renderMath('formula-refund', String.raw`\mathbb E[F]=\mathbb E[N]\times1\,200(1+\gamma)`);
renderMath('formula-net', String.raw`\mathbb E[C_{\mathrm{net},m}]=\mathbb E[C_{\mathrm{gross},m}]-\mathbb E[F]`);

function remember() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ weights: state.weights, mode: state.mode, essenceCount: state.essenceCount, ...options() })); } catch { /* Local storage is optional. */ }
}

function updateSettings(capture, report, result) {
  const captureError = capture.valid ? '' : capture.error;
  const reportError = report.valid ? (result.error?.includes('汇报') ? result.error : '') : report.error;
  $('settings-error').hidden = !captureError && !reportError;
  $('settings-error').textContent = [captureError, reportError].filter(Boolean).join(' ');
  $('level-difference').setAttribute('aria-invalid', String(!Number.isSafeInteger(state.levelDifference)));
  $('report-bonus').setAttribute('aria-invalid', String(!report.valid));
  $('level-multiplier').textContent = capture.valid ? `当前系数 ×${capture.levelMultiplier}` : '请输入整数等级差';
  $('report-per-capture').textContent = report.valid ? `每只实收 ${shortNumber.format(report.perCaptureRefund)} 金币` : '请输入有效加成';
  $('condition-level').textContent = capture.valid ? `等级差 ${state.levelDifference} · 系数 ×${capture.levelMultiplier}` : '等级差待填写';
  $('condition-position').textContent = `正面 ${compactPercent(1-state.backAttackProbability)} / 背面 ${compactPercent(state.backAttackProbability)}`;
  $('art-position-note').textContent = `${compactPercent(state.backAttackProbability)} BACK / ${compactPercent(1-state.backAttackProbability)} FRONT`;
}

function updateEnergy(energy) {
  $('essence-count').setAttribute('aria-invalid', String(!energy.valid));
  $('essence-error').hidden = energy.valid;
  $('essence-error').textContent = energy.valid ? '' : energy.error;
  const progress = energy.valid ? Math.min(energy.essenceEnergy, MODEL.targetEnergy) : 0;
  $('essence-energy').textContent = energy.valid ? integer.format(energy.essenceEnergy) : '—';
  $('essence-progress').setAttribute('aria-valuenow', String(progress));
  $('essence-progress-fill').style.width = `${progress / MODEL.targetEnergy * 100}%`;
  $('essence-direct-probability').textContent = energy.valid ? percent(energy.directEssenceWeatherProbability, 2) : '—';
  $('essence-survival-probability').textContent = energy.valid ? percent(energy.survivalProb, 2) : '—';
  $('energy-remaining').innerHTML = !energy.valid ? '请输入非负整数次数。' : energy.noCaptureNeeded ? '<strong>最迟第 22 次由虹能保底完成，无需捕获。</strong>' : `若精华未直出，剩余保底 <strong>${integer.format(energy.remainingEnergy)} 虹能</strong>`;
  $('common-expected-captures').textContent = energy.valid ? `${number.format(energy.expectedCaptures)} 只` : '—';
  $('simulation-samples').textContent = !energy.valid ? 'WAITING FOR VALID INPUT' : energy.noCaptureNeeded ? 'GUARANTEED IN ESSENCE STAGE' : `${integer.format(energy.modelSamples)} SIMULATED RUNS`;
  $('simulation-expected').innerHTML = `${energy.valid ? number.format(energy.expectedCaptures) : '—'} <small>只 · 最终期望</small>`;
  $('simulation-precision').innerHTML = !energy.valid ? '请输入有效的非负整数滋养次数。' : energy.noCaptureNeeded ? '精华直出或虹能保底，最迟第 22 次完成。<br>无需进入捕获阶段，立方支出与汇报返还均为 0。<br>精华自身成本未计入；无需捕获模拟。' : `条件 <var>K<sub>w</sub>(${integer.format(energy.remainingEnergy)})</var> = ${decimal(energy.conditionalCaptures, 4)} 只<br>精华未直出概率 ${percent(energy.survivalProb, 2)}<br>最终均值 95% 蒙特卡洛区间<br><span class="tabular">[${energy.ci95.map(v => v.toFixed(4)).join(', ')}]</span>`;
  if (energy.valid) {
    renderMath('formula-energy-numeric', String.raw`a=${energy.effectiveEssenceCount},\quad r=\max(10\,500-480\times${energy.effectiveEssenceCount},0)=${energy.remainingEnergy},\quad s=0.97^{${energy.effectiveEssenceCount}}\approx${decimal(energy.survivalProb)}`);
    renderMath('formula-weather-numeric', energy.noCaptureNeeded ? String.raw`n\ge22\ \Longrightarrow\ \mathbb E[N]=0\ \text{只}` : String.raw`\mathbb E[N]=${decimal(energy.survivalProb)}\times${decimal(energy.conditionalCaptures, 4)}\approx${decimal(energy.expectedCaptures, 4)}\ \text{只}`);
  } else { $('formula-energy-numeric').textContent = '请输入有效的精华次数。'; $('formula-weather-numeric').textContent = '请输入有效的精华次数。'; }
}

function updateFormula(result, capture, report) {
  const cube = CUBES.find(item => item.id === state.cube) ?? CUBES[0];
  if (capture.valid) {
    const base = BASE_RATES[Math.floor(state.target / 3)][state.target % 3];
    const frontRaw = base * cube.multiplier * capture.levelMultiplier + .01;
    const backRaw = base * cube.multiplier * capture.levelMultiplier * 1.5 + .01;
    const front = Math.min(frontRaw, 1), back = Math.min(backRaw, 1);
    const p = capture.frontAttackProbability * front + capture.backAttackProbability * back;
    $('capture-flow').innerHTML = `<div class="flow-stat"><span>正面 · 占 ${compactPercent(capture.frontAttackProbability)}</span><strong>${percent(front)}</strong><small>${percent(base,0)} × ${cube.multiplier} × ${capture.levelMultiplier}，再加 1 个百分点${frontRaw >= 1 ? '；上限 100%' : ''}</small></div><span class="flow-arrow" aria-hidden="true">+</span><div class="flow-stat"><span>背面 · 占 ${compactPercent(capture.backAttackProbability)}</span><strong>${percent(back)}</strong><small>再乘背袭 1.5，最终加 1 个百分点${backRaw >= 1 ? '；上限 100%' : ''}</small></div><span class="flow-arrow" aria-hidden="true">→</span><div class="flow-stat combined"><span>这类目标的捕获率</span><strong>${percent(p)}</strong><small>${cube.name}</small></div>`;
    $('capture-branch-description').textContent = `先对每个正面、背面分支分别封顶到100%，再按正面${compactPercent(capture.frontAttackProbability)} / 背面${compactPercent(capture.backAttackProbability)}加权。`;
    $('capture-assumptions').textContent = `1.5 是官网背袭倍率；当前等级差 ${state.levelDifference} 级，对应 L=${capture.levelMultiplier}，正背比例由输入决定。状态系数假定为1。全部在战斗外，因此满血不乘战斗内的0.8系数。`;
    renderMath('formula-capture-numeric', String.raw`p_{i,m}=${decimal(capture.frontAttackProbability)}\min(${decimal(base)}\times${cube.multiplier}\times${capture.levelMultiplier}+0.01,1)+${decimal(capture.backAttackProbability)}\min(1.5\times${decimal(base)}\times${cube.multiplier}\times${capture.levelMultiplier}+0.01,1)=${decimal(p)}`);
  } else {
    $('capture-flow').textContent = '请输入有效的正背比例与整数等级差。';
    $('formula-capture-numeric').textContent = capture.error;
    $('capture-assumptions').textContent = '等级差必须为整数；正背比例合计100%。';
  }
  renderMath('formula-mix', state.mode === 'throws' ? String.raw`P_m=\sum_{i=1}^{15}\alpha_i p_{i,m}` : String.raw`P_m=\left(\sum_{i=1}^{15}\frac{\alpha_i}{p_{i,m}}\right)^{-1}`);
  $('mix-formula-description').textContent = state.mode === 'throws' ? '投掷目标占比：按每次投掷选择的目标，对各类成功率做算术加权。' : '成功捕获占比：先选择要成功捕获的目标，再持续投掷直到抓到；对每次成功平均用球数1/p加权后取倒数。';
  if (!result.valid) { $('formula-mix-numeric').textContent = result.error; $('formula-cost-numeric').textContent = result.error; return; }
  if (result.noCaptureNeeded) {
    $('formula-mix-numeric').textContent = '精华阶段已由直出或保底完成，无需捕获。';
    renderMath('formula-cost-numeric', String.raw`\mathbb E[N]=0\ \Longrightarrow\ \mathbb E[B_m]=\mathbb E[C_{\mathrm{gross},m}]=\mathbb E[F]=\mathbb E[C_{\mathrm{net},m}]=0`);
    return;
  }
  const entry = result.results.find(item => item.id === cube.id);
  const active = result.normalizedWeights.flatMap((alpha,i) => alpha > 0 ? [{alpha,p:entry.frontBack[i].p}] : []);
  const terms = active.slice(0,3).map(item => state.mode === 'throws' ? `${decimal(item.alpha,4)}\\times${decimal(item.p,4)}` : `\\frac{${decimal(item.alpha,4)}}{${decimal(item.p,4)}}`);
  const sum = terms.join('+') + (active.length > 3 ? '+\\cdots' : '');
  const numeric = state.mode === 'throws' ? sum : `\\left(${sum}\\right)^{-1}`;
  renderMath('formula-mix-numeric', `P_m=${numeric}\\approx${decimal(entry.p)}\\quad(${percent(entry.p).replace('%','\\%')})`);
  renderMath('formula-cost-numeric', String.raw`\mathbb E[B_m]=\frac{${decimal(result.expectedCaptures,4)}}{${decimal(entry.p)}}\approx${texNumber(entry.expectedCubes)}\ \text{个}`);
  appendMath('formula-cost-numeric', String.raw`\mathbb E[C_{\mathrm{gross},m}]=${cube.price}\times\frac{${decimal(result.expectedCaptures,4)}}{${decimal(entry.p)}}\approx${texNumber(entry.expectedCost/10000)}\ \text{万金币}`);
  appendMath('formula-cost-numeric', String.raw`\mathbb E[F]=${decimal(result.expectedCaptures,4)}\times1200(1+${decimal(report.reportBonusRate)})\approx${texNumber(entry.expectedRefund/10000)}\ \text{万金币}`);
  appendMath('formula-cost-numeric', String.raw`\mathbb E[C_{\mathrm{net},m}]\approx${texNumber(entry.expectedCost/10000)}-${texNumber(entry.expectedRefund/10000)}\approx${texNumber(entry.expectedNetCost/10000)}\ \text{万金币}`);
}

function update({persist=true}={}) {
  const result = currentCalculation();
  const energy = getEnergyModel(state.essenceCount);
  const capture = getCaptureSettings(options()), report = getReportSettings(options());
  updateSettings(capture, report, result);
  updateEnergy(energy);
  $('mode-description').textContent = state.mode === 'throws' ? '每次投掷选择各类目标的占比，权重会自动归一化。' : '希望成功捕获的各类伊莫占比，按每只目标的平均用球数加权。';
  const settingsValid = capture.valid && report.valid && !result.error?.includes('汇报');
  $('input-error').hidden = result.valid || !energy.valid || !settingsValid;
  $('input-error').textContent = $('input-error').hidden ? '' : result.error;
  const total = state.weights.reduce((sum,w)=>sum+w,0);
  $('weight-total').innerHTML = `权重合计 <strong>${Number.isFinite(total)&&total>=0?shortNumber.format(total):'—'}</strong>`;
  document.querySelectorAll('[data-weight]').forEach(input => {
    const i=Number(input.dataset.weight), share=result.valid?result.normalizedWeights[i]:0;
    input.closest('td').classList.toggle('is-active',share>0);
    input.setAttribute('aria-invalid',String(!Number.isFinite(state.weights[i])||state.weights[i]<0));
    const label=document.querySelector(`[data-share="${i}"]`); label.textContent=percent(share,0);label.classList.toggle('is-zero',share===0);
  });
  if(result.valid) {
    const active=result.normalizedWeights.flatMap((share,i)=>share>0?[{share,i}]:[]).sort((a,b)=>b.share-a.share);
    $('mix-summary').textContent=result.noCaptureNeeded?'精华阶段已完成，捕获与汇报金额均为0。':active.slice(0,2).map(({share,i})=>`${REGIONS[Math.floor(i/3)].replace('区域','')}·${STAGES[i%3]} ${percent(share,0)}`).join(' / ')+(active.length>2?` 等 ${active.length} 类`:'');
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
  updateFormula(result,capture,report);
  if(persist&&energy.valid&&capture.valid&&report.valid&&state.weights.every(w=>Number.isFinite(w)&&w>=0)) remember();
}

document.querySelectorAll('[data-weight]').forEach(input=>input.addEventListener('input',()=>{state.weights[Number(input.dataset.weight)]=input.value===''?0:Number(input.value);update();}));
document.querySelectorAll('input[name="weight-mode"]').forEach(input=>input.addEventListener('change',()=>{if(input.checked){state.mode=input.value;update();}}));
function replaceWeights(weights){state.weights=weights;document.querySelectorAll('[data-weight]').forEach(input=>{input.value=String(weights[Number(input.dataset.weight)]);});update();}
$('reset-weights').addEventListener('click',()=>{Object.assign(state,{essenceCount:0,mode:'throws',backAttackProbability:.3,levelDifference:10,reportBonusRate:.3});syncInputValues();replaceWeights(defaultWeights());});
$('clear-weights').addEventListener('click',()=>replaceWeights(Array(15).fill(0)));
$('essence-count').addEventListener('input',event=>{state.essenceCount=event.target.value===''?0:Number(event.target.value);update();});
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
$('explain-cube').addEventListener('change',event=>{state.cube=event.target.value;updateFormula(currentCalculation(),getCaptureSettings(options()),getReportSettings(options()));});
$('explain-target').addEventListener('change',event=>{state.target=Number(event.target.value);updateFormula(currentCalculation(),getCaptureSettings(options()),getReportSettings(options()));});
update({persist:false});
