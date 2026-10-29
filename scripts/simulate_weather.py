"""Generate weather stopping times from shared event-jump Monte Carlo paths.

Requires NumPy. Run from the repository root:
    python scripts/simulate_weather.py --samples 5000000

Each path begins with zero weekly event counts and zero pity counters, and is
followed until a Lucky/Super Lucky event triggers direct weather (0.6%) or
capture rewards reach 10500. The first crossing OR weather time of every
threshold 10500-480*n is recorded on that same path. Essence attempts occur
before capturing, stop immediately on direct weather (3%), and are capped at
22 attempts because the energy guarantee then completes the weather goal.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import time

import numpy as np

TARGETS = np.array([10500-480*n for n in range(22)], dtype=np.int32)[::-1]


def simulate_batch(rng: np.random.Generator, size: int) -> tuple[np.ndarray, np.ndarray]:
    energy = np.zeros(size, dtype=np.int32)
    captures = np.zeros(size, dtype=np.int32)
    sc = np.zeros(size, dtype=np.int32)
    oc = np.zeros(size, dtype=np.int32)
    st = np.zeros(size, dtype=np.int32)
    ot = np.zeros(size, dtype=np.int32)
    direct_weather = np.zeros(size, dtype=bool)
    sum_diff = np.zeros(TARGETS.size+1, dtype=np.float64)
    square_diff = np.zeros(TARGETS.size+1, dtype=np.float64)
    count_diff = np.zeros(TARGETS.size+1, dtype=np.int64)
    while True:
        ids = np.flatnonzero((energy < 10500) & ~direct_weather)
        if ids.size == 0:
            assert np.all(np.cumsum(count_diff)[:-1] == size)
            return np.cumsum(sum_diff)[:-1], np.cumsum(square_diff)[:-1]

        before = energy[ids].copy()
        ns, no = sc[ids], oc[ids]
        ps = np.where(ns == 0, .002, np.where(ns == 1, .001, .0005))
        hs = np.where(ns == 0, 500, np.where(ns == 1, 1000, 3000))
        po = np.where(no < 10, .01, .005)
        ho = np.where(no < 10, 200, 400)
        ds = np.minimum(rng.geometric(ps), hs-st[ids])
        do = np.minimum(rng.geometric(po), ho-ot[ids])
        is_super = ds <= do
        elapsed = np.minimum(ds, do)
        captures[ids] += elapsed
        si, oi = ids[is_super], ids[~is_super]
        energy[si] += 1500
        sc[si] += 1
        st[si] = 0
        ot[si] += elapsed[is_super]-1
        st[oi] += elapsed[~is_super]
        ot[oi] = 0
        oc[oi] += 1
        u = rng.random(oi.size)
        energy[oi] += np.where(u < .4, 275, np.where(u < .9, 300, np.where(u < .95, 350, 500)))
        weather = rng.random(ids.size) < .006
        direct_weather[ids[weather]] = True

        # All newly crossed thresholds receive the same stopping time. A range
        # difference array records these times without storing paths × targets.
        lo = np.searchsorted(TARGETS, before, side='right')
        hi = np.searchsorted(TARGETS, energy[ids], side='right')
        hi[weather] = TARGETS.size
        crossed = hi > lo
        lo, hi = lo[crossed], hi[crossed]
        times = captures[ids[crossed]].astype(np.float64)
        bins = TARGETS.size+1
        sum_diff += np.bincount(lo, weights=times, minlength=bins)-np.bincount(hi, weights=times, minlength=bins)
        squares = times*times
        square_diff += np.bincount(lo, weights=squares, minlength=bins)-np.bincount(hi, weights=squares, minlength=bins)
        count_diff += np.bincount(lo, minlength=bins)-np.bincount(hi, minlength=bins)


def positive_integer(value: str) -> int:
    result = int(value)
    if result < 1:
        raise argparse.ArgumentTypeError('must be positive')
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--samples', type=positive_integer, default=5_000_000)
    parser.add_argument('--batch-size', type=positive_integer, default=100_000)
    parser.add_argument('--seed', type=int, default=2026103041)
    parser.add_argument('--output', type=Path, default=Path('data/weather-results.json'))
    parser.add_argument('--module-output', type=Path, default=Path('src/weather-estimates.js'))
    args = parser.parse_args()
    if args.samples < 2:
        parser.error('--samples must be at least 2')

    rng = np.random.default_rng(args.seed)
    sums = np.zeros(TARGETS.size, dtype=np.float64)
    squares = np.zeros(TARGETS.size, dtype=np.float64)
    count = 0
    start = time.perf_counter()
    while count < args.samples:
        batch_size = min(args.batch_size, args.samples-count)
        batch_sum, batch_squares = simulate_batch(rng, batch_size)
        sums += batch_sum
        squares += batch_squares
        count += batch_size

    means = sums/count
    assert np.all(np.diff(means) >= 0)
    variances = (squares-count*means*means)/(count-1)
    errors = np.sqrt(np.maximum(variances, 0)/count)
    half_widths = 1.959963984540054*errors
    estimates = []
    for n in range(22):
        i = 21-n
        survival = .97**n
        estimates.append({
            'essenceCount': n,
            'essenceEnergy': 480*n,
            'remainingEnergy': 10500-480*n,
            'conditionalK': float(means[i]),
            'conditionalStandardError': float(errors[i]),
            'conditionalCi95': [float(means[i]-half_widths[i]), float(means[i]+half_widths[i])],
            'survivalProb': survival,
            'captureNeededProbability': survival,
            'expectedCaptures': float(survival*means[i]),
            'samples': count,
            'standardError': float(survival*errors[i]),
            'ci95': [float(survival*(means[i]-half_widths[i])), float(survival*(means[i]+half_widths[i]))],
            'directEssenceWeatherProbability': 1-survival,
            'expectedEssenceUses': (1-survival)/.03,
            'kind': 'simulation',
        })
    estimates.append({
        'essenceCount': 22, 'essenceEnergy': 10560, 'remainingEnergy': 0,
        'conditionalK': 0, 'conditionalStandardError': 0, 'conditionalCi95': [0, 0],
        'survivalProb': .97**22, 'captureNeededProbability': 0,
        'directEssenceWeatherProbability': 1-.97**22,
        'expectedEssenceUses': (1-.97**22)/.03,
        'expectedCaptures': 0, 'samples': 0, 'standardError': 0,
        'ci95': [0, 0], 'kind': 'deterministic',
    })
    result = {
        'schemaVersion': 1,
        'currentModel': True,
        'modelScope': 'Weather succeeds by any of essence direct weather, Lucky/Super Lucky direct weather, or energy guarantee.',
        'method': 'Shared-path event-jump Monte Carlo: first threshold crossing OR direct weather per path',
        'samplesPerConditionalThreshold': count,
        'seed': args.seed,
        'essenceEnergyEach': 480,
        'essenceDirectWeatherProbability': .03,
        'luckyDirectWeatherProbability': .006,
        'maximumEssenceUses': 22,
        'combinationFormula': 'For n<22: E[N]=0.97^n*K_weather(10500-480n); for n>=22: E[N]=0.',
        'targetEnergy': 10500,
        'estimates': estimates,
        'officialSource': 'https://www.yimo.com/formula-multipliers',
        'assumptions': {
            'essencesUsedBeforeCapturing': True,
            'essenceCostsIncluded': False,
            'initialWeeklyOrdinaryCount': 0,
            'initialWeeklySuperCount': 0,
            'initialOrdinaryPityCount': 0,
            'initialSuperPityCount': 0,
            'crossWeeklyReset': False,
            'ordinaryPityAdvancesOnSuper': False,
            'directEssenceWeatherStopsRun': True,
            'directEssenceWeatherReplacesOrResetsEnergy': False,
            'directLuckyWeatherStopsRun': True,
            'directLuckyWeatherReplacesOrResetsEnergy': False,
        },
        'elapsedSeconds': time.perf_counter()-start,
        'uncertainty': 'Each interval covers Monte Carlo error of its estimated mean, excluding rules ambiguity and individual-playthrough variation; estimates share paths and are correlated.',
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')
    args.module_output.parent.mkdir(parents=True, exist_ok=True)
    args.module_output.write_text(
        '// Generated by scripts/simulate_weather.py; metadata: data/weather-results.json.\n'
        'export const WEATHER_ESTIMATES = '+json.dumps(estimates, indent=2, ensure_ascii=False)+';\n',
        encoding='utf-8',
    )
    print(json.dumps({'samples': count, 'elapsedSeconds': result['elapsedSeconds'],
                      'default': estimates[0], 'tenEssences': estimates[10],
                      'twentyOneEssences': estimates[21], 'noCaptures': estimates[22]}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
