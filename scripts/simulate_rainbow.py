"""Optional offline reproduction of the rainbow-energy stopping-time estimate.

Requires Python 3.10+ and NumPy: python -m pip install numpy
Run from the repository root, for example:
    python scripts/simulate_rainbow.py --samples 15000000

The generated file is separate from the reference data and from src/model.js.
It is a new Monte Carlo estimate, so it need not exactly equal the reference
mean obtained by combining two independent historical implementations.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import time

import numpy as np


def simulate_batch(rng: np.random.Generator, size: int) -> tuple[np.ndarray, ...]:
    """Jump between lucky events; all elapsed counts are successful captures.

    Each geometric draw includes the triggering trial. Truncating it at the
    remaining pity count guarantees an event on that final trial. If both event
    clocks reach the same capture, super wins and the ordinary clock advances
    by only elapsed-1 eligible captures. Conditional geometric memorylessness
    permits drawing the next clock afresh after either type of event.
    """
    energy = np.zeros(size, dtype=np.int32)
    captures = np.zeros(size, dtype=np.int32)
    super_count = np.zeros(size, dtype=np.int32)
    ordinary_count = np.zeros(size, dtype=np.int32)
    super_pity = np.zeros(size, dtype=np.int32)
    ordinary_pity = np.zeros(size, dtype=np.int32)

    while True:
        ids = np.flatnonzero(energy < 10500)
        if ids.size == 0:
            return captures, super_count, ordinary_count, energy

        ns, no = super_count[ids], ordinary_count[ids]
        super_probability = np.where(ns == 0, .002, np.where(ns == 1, .001, .0005))
        super_limit = np.where(ns == 0, 500, np.where(ns == 1, 1000, 3000))
        ordinary_probability = np.where(no < 10, .01, .005)
        ordinary_limit = np.where(no < 10, 200, 400)

        super_wait = np.minimum(rng.geometric(super_probability), super_limit-super_pity[ids])
        ordinary_wait = np.minimum(rng.geometric(ordinary_probability), ordinary_limit-ordinary_pity[ids])
        super_wins = super_wait <= ordinary_wait
        elapsed = np.minimum(super_wait, ordinary_wait)
        captures[ids] += elapsed

        si, oi = ids[super_wins], ids[~super_wins]
        energy[si] += 1500
        super_count[si] += 1
        super_pity[si] = 0
        ordinary_pity[si] += elapsed[super_wins]-1

        super_pity[oi] += elapsed[~super_wins]
        ordinary_pity[oi] = 0
        ordinary_count[oi] += 1
        reward_draw = rng.random(oi.size)
        energy[oi] += np.where(reward_draw < .4, 275,
                              np.where(reward_draw < .9, 300,
                                       np.where(reward_draw < .95, 350, 500)))


def positive_integer(value: str) -> int:
    number = int(value)
    if number < 1:
        raise argparse.ArgumentTypeError('must be a positive integer')
    return number


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--samples', type=positive_integer, default=15_000_000)
    parser.add_argument('--batch-size', type=positive_integer, default=250_000)
    parser.add_argument('--seed', type=int, default=2026103017)
    parser.add_argument('--output', type=Path, default=Path('data/model-results.generated.json'))
    args = parser.parse_args()
    if args.samples < 2:
        parser.error('--samples must be at least 2 to estimate sampling error')

    rng = np.random.default_rng(args.seed)
    start = time.perf_counter()
    totals = np.zeros(4, dtype=np.float64)
    square_total = 0.
    count = 0
    while count < args.samples:
        batch_size = min(args.batch_size, args.samples-count)
        batch = simulate_batch(rng, batch_size)
        captures = batch[0].astype(np.int64)
        totals += [a.sum(dtype=np.int64) for a in batch]
        square_total += np.square(captures).sum(dtype=np.int64)
        count += batch_size

    mean = totals[0]/count
    variance = (square_total-count*mean*mean)/(count-1)
    standard_error = float(np.sqrt(variance/count))
    half_width = 1.959963984540054*standard_error
    result = {
        'schemaVersion': 1,
        'kind': 'simulation',
        'method': 'Event-jump Monte Carlo',
        'samples': count,
        'seed': args.seed,
        'expectedCaptures': float(mean),
        'standardDeviation': float(np.sqrt(variance)),
        'standardError': standard_error,
        'ci95': [float(mean-half_width), float(mean+half_width)],
        'meanSuperEvents': float(totals[1]/count),
        'meanOrdinaryEvents': float(totals[2]/count),
        'meanFinalEnergy': float(totals[3]/count),
        'targetEnergy': 10500,
        'initialEnergy': 0,
        'officialSource': 'https://www.yimo.com/formula-multipliers',
        'assumptions': {
            'initialWeeklyOrdinaryCount': 0,
            'initialWeeklySuperCount': 0,
            'initialOrdinaryPityCount': 0,
            'initialSuperPityCount': 0,
            'crossWeeklyReset': False,
            'useLeylineEssence': False,
            'superCheckedFirst': True,
            'ordinaryPityAdvancesOnSuper': False,
            'onlyTriggeredTypeResetsItsPity': True,
            'stopAtEnergyAtLeast': 10500,
            'directRainbowWeatherStopsRun': False,
            'directRainbowWeatherReplacesOrResetsEnergy': False,
        },
        'elapsedSeconds': time.perf_counter()-start,
        'uncertainty': 'The confidence interval measures sampling error of the mean only.',
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))
    print(f'Wrote {args.output}')


if __name__ == '__main__':
    main()
