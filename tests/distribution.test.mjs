import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WEATHER_ESTIMATES } from '../src/weather-estimates.js';
import { WEATHER_DISTRIBUTION } from '../src/weather-distribution-data.js';
import { getWeatherDistribution, discreteQuantile, getIntervalProbability, getDistributionBins } from '../src/distribution.js';

const close = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a-b) <= tolerance * Math.max(1, Math.abs(b)), `${a} != ${b}`);

test('distribution publication records every path and agrees with the existing mean model', async () => {
  const json = JSON.parse(await readFile(new URL('../data/weather-distribution.json', import.meta.url), 'utf8'));
  assert.equal(WEATHER_DISTRIBUTION.samples, 5_000_000);
  assert.equal(WEATHER_DISTRIBUTION.seed, 2026103041);
  assert.deepEqual(json.rows, WEATHER_DISTRIBUTION.rows);
  assert.equal(WEATHER_DISTRIBUTION.rows.length, 22);
  for (let n=0; n<22; n+=1) {
    const row = WEATHER_DISTRIBUTION.rows.find(item => item.essenceCount === n);
    assert.ok(row.counts.every(count => Number.isSafeInteger(count) && count >= 0));
    assert.equal(row.counts.reduce((sum,count)=>sum+count,0), WEATHER_DISTRIBUTION.samples);
    const distribution = getWeatherDistribution(n);
    close(distribution.pmf.reduce((sum,p)=>sum+p,0), 1);
    close(distribution.mean, WEATHER_ESTIMATES[n].expectedCaptures);
    assert.equal(distribution.cdf.at(-1), 1);
    assert.ok(distribution.cdf.every((p,i,cdf)=>p>=0&&p<=1&&(i===0||p>=cdf[i-1])));
  }
});

test('essence probability is a zero-count atom, while variance includes the mixture spread', () => {
  for (const n of [1,10,21]) {
    const d = getWeatherDistribution(n), row=WEATHER_DISTRIBUTION.rows.find(item=>item.essenceCount===n);
    const s=.97**n;
    const conditionalMean=row.counts.reduce((sum,count,i)=>sum+(i+1)*count,0)/WEATHER_DISTRIBUTION.samples;
    const conditionalVariance=row.counts.reduce((sum,count,i)=>sum+(i+1-conditionalMean)**2*count,0)/WEATHER_DISTRIBUTION.samples;
    close(d.pmf[0],1-s);
    close(d.standardDeviation**2,s*conditionalVariance+s*(1-s)*conditionalMean**2);
  }
});

test('luck ranking reverses ordinary percentiles and uses the theoretical endpoint at p100', () => {
  for(let n=0;n<22;n+=1){
    const d=getWeatherDistribution(n);
    assert.deepEqual(d.quantiles.map(q=>q.luck),[100,95,80,50,30,10]);
    assert.equal(d.quantiles[0].n,n===0?1:0);
    d.quantiles.slice(1).forEach(q=>{
      assert.ok(q.cdfAt>=q.fraction);
      assert.ok(q.n===0 || q.cdfBefore<q.fraction);
      assert.equal(q.n,discreteQuantile(d,q.fraction));
    });
    assert.ok(d.quantiles.every((q,i,qs)=>i===0||q.n>=qs[i-1].n));
  }
  assert.ok(getWeatherDistribution(1).quantiles.find(q=>q.luck===95).n>0);
  assert.equal(getWeatherDistribution(2).quantiles.find(q=>q.luck===95).n,0);
  assert.ok(getWeatherDistribution(7).quantiles.find(q=>q.luck===80).n>0);
  assert.equal(getWeatherDistribution(8).quantiles.find(q=>q.luck===80).n,0);
  assert.ok(getWeatherDistribution(21).quantiles.find(q=>q.luck===50).n>0);
});

test('integer interval probabilities partition the entire distribution without losing point masses', () => {
  for(const n of [0,1,10,21,22]){
    const d=getWeatherDistribution(n);
    for(const [lo,hi] of [[0,0],[1,1],[1,100],[200,1200],[0,d.observedMax]]){
      const interval=getIntervalProbability(d,lo,hi);
      let expected=0;
      for(let k=lo;k<=Math.min(hi,d.observedMax);k+=1) expected+=d.pmf[k]??0;
      close(interval.probability,expected);
      close(interval.before+interval.probability+interval.tail,1);
      close(interval.cumulative+interval.tail,1);
    }
    const bins=getDistributionBins(d,60);
    assert.ok(bins.length<=60);
    assert.equal(bins[0].lower,0);
    assert.equal(bins.at(-1).upper,d.observedMax);
    bins.slice(1).forEach((bin,i)=>assert.equal(bin.lower,bins[i].upper+1));
    close(bins.reduce((sum,bin)=>sum+bin.probability,0),1);
  }
});

test('direct-weather first-catch probability respects super priority and essence survival', () => {
  const first=(.002+.998*.01)*.006;
  close(first,.00007188);
  for(const n of [0,1,10,21]) close(getWeatherDistribution(n).firstDirectWeatherProbability,.97**n*first);
});

test('22 essences or more create a deterministic zero-capture distribution', () => {
  for(const n of [22,23,100,Number.MAX_SAFE_INTEGER]){
    const d=getWeatherDistribution(n);
    assert.deepEqual([...d.pmf],[1]);assert.deepEqual([...d.cdf],[1]);
    assert.equal(d.mean,0);assert.equal(d.standardDeviation,0);assert.equal(d.skewness,0);
    assert.equal(d.samples,0);assert.equal(d.firstDirectWeatherProbability,0);
    assert.ok(d.quantiles.every(q=>q.n===0));
  }
});

test('unusable requests return a friendly result and do not emit invalid probabilities', () => {
  for(const value of [-1,.5,NaN,Infinity,'1',null]) assert.equal(getWeatherDistribution(value).valid,false);
  const d=getWeatherDistribution(0);
  for(const u of [-1,NaN,Infinity,1.01]) assert.equal(discreteQuantile(d,u),null);
  assert.equal(getIntervalProbability(d,5,4),null);
  assert.equal(getIntervalProbability(d,NaN,5),null);
  assert.deepEqual(getDistributionBins(d,0),[]);
});
