"""Deterministic tests for histogram accumulation and first-capture support."""

import importlib.util
import json
from pathlib import Path
import unittest

import numpy as np

spec = importlib.util.spec_from_file_location('weather_distribution', Path(__file__).resolve().parents[1]/'scripts'/'simulate_weather_distribution.py')
weather = importlib.util.module_from_spec(spec)
spec.loader.exec_module(weather)


class DeterministicSuperEvents:
    def __init__(self, weather_event=None):
        self.weather_event = weather_event
        self.event = 0

    def geometric(self, probability):
        return np.ones(np.shape(probability), dtype=np.int64)

    def random(self, size):
        if size == 0:
            return np.empty(0)
        self.event += 1
        return np.zeros(size) if self.event == self.weather_event else np.ones(size)


class WeatherDistributionTests(unittest.TestCase):
    def check_counts(self, weather_event):
        size = 7
        counts = weather.simulate_batch(DeterministicSuperEvents(weather_event), size)
        expected = np.ceil(weather.TARGETS/1500).astype(int)
        if weather_event is not None:
            expected = np.minimum(expected, weather_event)
        self.assertTrue(np.all(counts.sum(axis=1) == size))
        self.assertTrue(np.all(counts >= 0))
        self.assertTrue(np.all(counts[:,0] == 0))
        for row, stop in zip(counts, expected):
            self.assertEqual(row[stop], size)
            self.assertEqual(np.count_nonzero(row), 1)

    def test_energy_only_paths(self):
        self.check_counts(None)

    def test_first_event_weather_completes_all_thresholds(self):
        self.check_counts(1)

    def test_second_event_weather_keeps_earlier_first_crossings(self):
        self.check_counts(2)

    def test_analytic_first_capture_probability_accounts_for_energy_threshold(self):
        self.assertAlmostEqual(weather.minimum_probability(10500)['total'], .00007188)
        self.assertAlmostEqual(weather.minimum_probability(1380)['total'], .00205988)
        self.assertAlmostEqual(weather.minimum_probability(900)['total'], .00205988)
        self.assertAlmostEqual(weather.minimum_probability(420)['total'], .002555886)

    def test_statistics_are_discrete_population_moments(self):
        stats = weather.summarize_counts(np.array([0,1,2,1]))
        self.assertEqual(stats['sum'], 4)
        self.assertEqual(stats['mean'], 2)
        self.assertAlmostEqual(stats['standardDeviation'], np.sqrt(.5))
        self.assertEqual(stats['skewness'], 0)
        self.assertEqual(stats['observedMin'], 1)
        self.assertEqual(stats['observedMax'], 3)
        self.assertEqual(stats['quantiles']['p50'], 2)

    def test_published_histograms_preserve_all_sample_counts_and_reference_means(self):
        root = Path(__file__).resolve().parents[1]
        data = json.loads((root/'data'/'weather-distribution.json').read_text(encoding='utf-8'))
        reference = json.loads((root/'data'/'weather-results.json').read_text(encoding='utf-8'))
        self.assertEqual(data['samples'], 5_000_000)
        self.assertEqual(data['seed'], 2026103041)
        self.assertTrue(data['exactReferenceMeanMatch'])
        self.assertEqual(len(data['rows']), 22)
        for n, row in enumerate(data['rows']):
            self.assertEqual(row['essenceCount'], n)
            self.assertEqual(row['remainingEnergy'], 10500-480*n)
            self.assertEqual(row['minN'], 1)
            self.assertEqual(len(row['counts']), row['observedMax'])
            self.assertEqual(sum(row['counts']), data['samples'])
            self.assertTrue(all(isinstance(count, int) and count >= 0 for count in row['counts']))
            self.assertGreater(row['counts'][-1], 0)
            mean = sum((index+1)*count for index, count in enumerate(row['counts']))/data['samples']
            self.assertEqual(mean, row['mean'])
            self.assertEqual(mean, reference['estimates'][n]['conditionalK'])
            self.assertEqual(row['referenceMeanDifference'], 0)
        module = (root/'src'/'weather-distribution-data.js').read_text(encoding='utf-8')
        module_json = module.split('export const WEATHER_DISTRIBUTION = ', 1)[1].rstrip(';\n')
        self.assertEqual(json.loads(module_json), data)


if __name__ == '__main__':
    unittest.main()
