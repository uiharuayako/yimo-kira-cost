"""Unified 44-threshold data integrity, compatibility and analytic checks."""

import importlib.util
import json
from pathlib import Path
import sys
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
spec = importlib.util.spec_from_file_location('weather_thresholds', ROOT/'scripts'/'simulate_weather_thresholds.py')
thresholds = importlib.util.module_from_spec(spec)
spec.loader.exec_module(thresholds)


class ImmediateSuperEvents:
    def geometric(self, probability):
        return np.ones(np.shape(probability), dtype=np.int64)

    def random(self, size):
        return np.ones(size)


class WeatherThresholdTests(unittest.TestCase):
    def test_all_44_targets_accumulate_once_per_path(self):
        counts = thresholds.original.simulate_batch(ImmediateSuperEvents(), 5, targets=thresholds.TARGETS)
        self.assertEqual(counts.shape[0], 44)
        self.assertTrue(np.all(counts.sum(axis=1) == 5))
        for row, energy in zip(counts, thresholds.TARGETS):
            stop = int(np.ceil(energy/1500))
            self.assertEqual(row[stop], 5)
            self.assertEqual(np.count_nonzero(row), 1)

    def test_published_data_are_complete_and_preserve_every_legacy_even_threshold(self):
        data = json.loads((ROOT/'data'/'weather-thresholds.json').read_text(encoding='utf-8'))
        old = json.loads((ROOT/'data'/'weather-distribution.json').read_text(encoding='utf-8'))
        self.assertEqual(data['samples'], 5_000_000)
        self.assertTrue(data['legacyMeansExactMatch'])
        self.assertTrue(data['legacyCountsExactMatch'])
        self.assertEqual(len(data['thresholds']), 44)
        for j, row in enumerate(data['thresholds']):
            self.assertEqual(row['energyIndex'], j)
            self.assertEqual(row['remainingEnergy'], 10500-240*j)
            self.assertEqual(sum(row['counts']), data['samples'])
            self.assertEqual(len(row['counts']), row['observedMax'])
            self.assertTrue(all(isinstance(n,int) and n >= 0 for n in row['counts']))
            mean = sum((n+1)*count for n,count in enumerate(row['counts']))/data['samples']
            self.assertEqual(mean, row['conditionalK'])
            if j % 2 == 0:
                self.assertEqual(row['counts'], old['rows'][j//2]['counts'])
                self.assertEqual(row['mean'], old['rows'][j//2]['mean'])
        module = (ROOT/'src'/'weather-threshold-data.js').read_text(encoding='utf-8')
        self.assertEqual(json.loads(module.split('export const WEATHER_THRESHOLDS = ',1)[1].rstrip(';\n')), data)

    def test_180_energy_target_agrees_with_truncated_geometric_analytic_law(self):
        data = json.loads((ROOT/'data'/'weather-thresholds.json').read_text(encoding='utf-8'))
        row = data['thresholds'][43]
        probability = .002+.998*.01
        exact_mean = (1-(1-probability)**200)/probability
        self.assertLess(abs(row['conditionalK']-exact_mean), 6*row['conditionalStandardError'])
        self.assertAlmostEqual(row['minimumProbability']['total'], probability)
        self.assertEqual(row['observedMax'], 200)


if __name__ == '__main__':
    unittest.main()
