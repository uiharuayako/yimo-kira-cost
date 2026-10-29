"""Unified 240-energy-step weather means and integer stopping-time PMFs.

Requires NumPy. Run from the repository root:
    python scripts/simulate_weather_thresholds.py --samples 5000000

The same random stream as the original 22-threshold distribution is retained.
All 44 remaining-energy targets (10500, 10260, ..., 180) share each path.
Ordinary essence adds 480; the user-provided boosted version adds 720 (+50%).
Both have the same 3% direct-weather chance, handled analytically by the model.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import time

import numpy as np

import simulate_weather_distribution as original

TARGETS = np.array([10500-240*j for j in range(44)], dtype=np.int32)[::-1]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--samples', type=original.positive_integer, default=5_000_000)
    parser.add_argument('--batch-size', type=original.positive_integer, default=100_000)
    parser.add_argument('--seed', type=int, default=2026103041)
    parser.add_argument('--output', type=Path, default=Path('data/weather-thresholds.json'))
    parser.add_argument('--module-output', type=Path, default=Path('src/weather-threshold-data.js'))
    args = parser.parse_args()
    if args.samples < 2:
        parser.error('--samples must be at least 2')
    rng = np.random.default_rng(args.seed)
    counts = np.zeros((TARGETS.size, original.SUPPORT_LIMIT+1), dtype=np.int64)
    completed = 0
    start = time.perf_counter()
    while completed < args.samples:
        size = min(args.batch_size, args.samples-completed)
        counts += original.simulate_batch(rng, size, targets=TARGETS)
        completed += size
    old_means = json.loads(Path('data/weather-results.json').read_text(encoding='utf-8'))
    old_pmf = json.loads(Path('data/weather-distribution.json').read_text(encoding='utf-8'))
    thresholds = []
    support = np.arange(original.SUPPORT_LIMIT+1, dtype=np.int64)
    for j in range(44):
        row_counts = counts[43-j]
        stats = original.summarize_counts(row_counts)
        mean = stats['mean']
        square_sum = int(np.dot(support*support, row_counts))
        variance = (square_sum-completed*mean*mean)/(completed-1)
        se = float(np.sqrt(max(0, variance)/completed))
        half_width = 1.959963984540054*se
        remaining = 10500-240*j
        row = {
            'energyIndex': j, 'remainingEnergy': remaining, 'minN': 1,
            'samples': completed, 'conditionalK': mean,
            'conditionalStandardError': se, 'conditionalCi95': [mean-half_width,mean+half_width],
            **stats,
            'counts': row_counts[1:stats['observedMax']+1].tolist(),
            'minimumProbability': original.minimum_probability(remaining),
        }
        if j % 2 == 0:
            old_index = j//2
            row['legacyMeanDifference'] = mean-old_means['estimates'][old_index]['conditionalK']
            row['legacyCountsExactMatch'] = row['counts'] == old_pmf['rows'][old_index]['counts']
        thresholds.append(row)
    exact_means = all(row.get('legacyMeanDifference',0) == 0 for row in thresholds)
    exact_counts = all(row.get('legacyCountsExactMatch',True) for row in thresholds)
    if args.samples == 5_000_000 and args.batch_size == 100_000 and args.seed == 2026103041:
        assert exact_means and exact_counts
    result = {
        'schemaVersion': 1, 'kind': 'conditional-thresholds-successful-captures',
        'samples': completed, 'seed': args.seed, 'batchSize': args.batch_size,
        'targetEnergy': 10500, 'thresholdStep': 240, 'countsStartAt': 1,
        'thresholds': thresholds,
        'legacyMeansExactMatch': exact_means, 'legacyCountsExactMatch': exact_counts,
        'sourceUrl': 'https://www.yimo.com/formula-multipliers',
        'essenceSources': {
            'ordinary': {'energy':480,'kind':'official'},
            'boosted': {'energy':720,'kind':'user','description':'User-specified +50% energy; not asserted to be an official universal value.'},
            'directWeatherProbability': .03,
        },
        'assumptions': old_means['assumptions'],
        'interpretation': {
            **old_pmf['interpretation'],
            'index': 'thresholds[j] has remainingEnergy=10500-240*j, j=0..43; all energy comparisons use exact >= thresholds.',
            'zeroMass': 'The two essence counts are independent plan inputs; no use order is defined. If planned energy is below 10500, k=u+v, mass at N=0 is 1-0.97^k and the remaining-energy conditional PMF is multiplied by 0.97^k. If planned energy guarantees weather, all mass is at N=0; actual use counts and the direct-weather share are unspecified.',
        },
        'elapsedSeconds': time.perf_counter()-start,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(',',':'))+'\n', encoding='utf-8')
    args.module_output.parent.mkdir(parents=True, exist_ok=True)
    args.module_output.write_text('// Generated by scripts/simulate_weather_thresholds.py; metadata: data/weather-thresholds.json.\nexport const WEATHER_THRESHOLDS = '+json.dumps(result, ensure_ascii=False, separators=(',',':'))+';\n', encoding='utf-8')
    print(json.dumps({'samples':completed,'elapsedSeconds':result['elapsedSeconds'],
                      'legacyMeansExactMatch':exact_means,'legacyCountsExactMatch':exact_counts,
                      'jsonBytes':args.output.stat().st_size,'moduleBytes':args.module_output.stat().st_size,
                      'examples':[{k:v for k,v in thresholds[j].items() if k != 'counts'} for j in [0,1,3,43]]}))


if __name__ == '__main__':
    main()
