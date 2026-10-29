"""Full conditional successful-capture PMFs for the current weather model.

Requires NumPy. Run from the repository root:
    python scripts/simulate_weather_distribution.py --samples 5000000

The random calls and default batch size match simulate_weather.py exactly.
Every shared path records first threshold crossing OR first direct weather at
all 22 remaining-energy thresholds. Counts start at N=1. Essence direct-weather
mass at N=0 is deliberately excluded from these conditional PMFs.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import time

import numpy as np

TARGETS = np.array([10500-480*n for n in range(22)], dtype=np.int32)[::-1]
# A deliberately loose deterministic bound: 39 ordinary events at >=275 each
# need at most 39*400 eligible captures; fewer than 7 super events can interrupt
# that ordinary clock before their own energy already guarantees completion.
SUPPORT_LIMIT = math.ceil(10500/275)*400+math.ceil(10500/1500)


def simulate_batch(rng: np.random.Generator, size: int) -> np.ndarray:
    energy = np.zeros(size, dtype=np.int32)
    captures = np.zeros(size, dtype=np.int32)
    sc = np.zeros(size, dtype=np.int32)
    oc = np.zeros(size, dtype=np.int32)
    st = np.zeros(size, dtype=np.int32)
    ot = np.zeros(size, dtype=np.int32)
    direct_weather = np.zeros(size, dtype=bool)
    differences = np.zeros((TARGETS.size+1, SUPPORT_LIMIT+1), dtype=np.int64)
    while True:
        ids = np.flatnonzero((energy < 10500) & ~direct_weather)
        if ids.size == 0:
            counts = np.cumsum(differences, axis=0)[:-1]
            assert np.all(counts >= 0)
            assert np.all(counts.sum(axis=1) == size)
            assert np.all(counts[:, 0] == 0)
            return counts

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

        lo = np.searchsorted(TARGETS, before, side='right')
        hi = np.searchsorted(TARGETS, energy[ids], side='right')
        hi[weather] = TARGETS.size
        crossed = hi > lo
        lo, hi = lo[crossed], hi[crossed]
        times = captures[ids[crossed]]
        assert np.all((times >= 1) & (times <= SUPPORT_LIMIT))
        # A first crossing applies to the contiguous threshold range [lo, hi).
        # Histogram differences avoid allocating paths × thresholds samples.
        np.add.at(differences, (lo, times), 1)
        np.add.at(differences, (hi, times), -1)


def minimum_probability(remaining_energy: int) -> dict[str, float]:
    super_chance = .002
    ordinary_chance = .998*.01
    direct = (super_chance+ordinary_chance)*.006
    ordinary_energy_success = sum(p for reward, p in [(275,.4),(300,.5),(350,.05),(500,.05)] if reward >= remaining_energy)
    total = super_chance*(.006+.994*(1500 >= remaining_energy))+ordinary_chance*(.006+.994*ordinary_energy_success)
    return {'directWeather': direct, 'total': total}


def summarize_counts(counts: np.ndarray) -> dict:
    samples = int(counts.sum())
    support = np.arange(counts.size, dtype=np.int64)
    mean = float(np.dot(support, counts)/samples)
    centered = support.astype(np.float64)-mean
    variance = float(np.dot(centered*centered, counts)/samples)
    standard_deviation = math.sqrt(variance)
    skewness = float(np.dot(centered**3, counts)/samples/standard_deviation**3) if standard_deviation else 0.
    cumulative = np.cumsum(counts)
    quantiles = {f'p{int(q*100):02d}': int(np.searchsorted(cumulative, q*samples, side='left')) for q in [.05,.25,.5,.75,.95,.99]}
    observed = np.flatnonzero(counts)
    return {'sum': samples, 'mean': mean, 'standardDeviation': standard_deviation,
            'skewness': skewness, 'quantiles': quantiles,
            'observedMin': int(observed[0]), 'observedMax': int(observed[-1])}


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
    parser.add_argument('--output', type=Path, default=Path('data/weather-distribution.json'))
    parser.add_argument('--module-output', type=Path, default=Path('src/weather-distribution-data.js'))
    args = parser.parse_args()
    rng = np.random.default_rng(args.seed)
    totals = np.zeros((TARGETS.size, SUPPORT_LIMIT+1), dtype=np.int64)
    count = 0
    start = time.perf_counter()
    while count < args.samples:
        size = min(args.batch_size, args.samples-count)
        totals += simulate_batch(rng, size)
        count += size

    reference = json.loads(Path('data/weather-results.json').read_text(encoding='utf-8'))
    rows = []
    for n in range(22):
        counts = totals[21-n]
        stats = summarize_counts(counts)
        remaining = 10500-480*n
        rows.append({
            'essenceCount': n,
            'remainingEnergy': remaining,
            'minN': 1,
            **stats,
            'counts': counts[1:stats['observedMax']+1].tolist(),
            'minimumProbability': minimum_probability(remaining),
            'referenceMeanDifference': stats['mean']-reference['estimates'][n]['conditionalK'],
        })
    exact_match = all(row['referenceMeanDifference'] == 0 for row in rows)
    if args.samples == 5_000_000 and args.batch_size == 100_000 and args.seed == 2026103041:
        assert exact_match, 'Same random stream must reproduce all reference means exactly.'
    result = {
        'schemaVersion': 1,
        'kind': 'conditional-successful-captures',
        'samples': count,
        'seed': args.seed,
        'batchSize': args.batch_size,
        'countsStartAt': 1,
        'rows': rows,
        'exactReferenceMeanMatch': exact_match,
        'referenceMeans': 'data/weather-results.json',
        'sourceUrl': 'https://www.yimo.com/formula-multipliers',
        'assumptions': reference['assumptions'],
        'interpretation': {
            'conditional': 'Given all planned essence direct-weather attempts failed and capturing is still required; both weekly lucky counts and pity counters start at zero.',
            'zeroMass': 'These rows exclude N=0. For n<22, the unconditional PMF adds 1-0.97^n at N=0 and multiplies every positive count probability by 0.97^n. For n>=22, all mass is at N=0.',
            'minimum': 'minN=1 is the theoretical positive support minimum. minimumProbability.directWeather is the universal first-capture direct-weather component; total also includes first-capture energy completion.',
            'maximum': 'observedMax is the largest simulated stopping count, not a proof of the theoretical maximum or of 100% coverage.',
            'supportBound': SUPPORT_LIMIT,
            'moments': 'Population moments of the empirical PMF; quantiles use the smallest integer whose empirical CDF reaches the requested probability.',
            'shape': 'Use the discrete empirical PMF/CDF directly; no normal distribution is fitted.',
        },
        'elapsedSeconds': time.perf_counter()-start,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(',',':'))+'\n', encoding='utf-8')
    args.module_output.parent.mkdir(parents=True, exist_ok=True)
    args.module_output.write_text('// Generated by scripts/simulate_weather_distribution.py; metadata: data/weather-distribution.json.\nexport const WEATHER_DISTRIBUTION = '+json.dumps(result, ensure_ascii=False, separators=(',',':'))+';\n', encoding='utf-8')
    print(json.dumps({'samples': count, 'elapsedSeconds': result['elapsedSeconds'], 'exactReferenceMeanMatch': exact_match,
                      'jsonBytes': args.output.stat().st_size, 'moduleBytes': args.module_output.stat().st_size,
                      'examples': [{k:v for k,v in rows[n].items() if k != 'counts'} for n in [0,10,21]]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
