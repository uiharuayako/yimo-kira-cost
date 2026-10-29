"""Small deterministic checks of first-crossing/weather range accumulation."""

import importlib.util
from pathlib import Path
import unittest

import numpy as np

spec = importlib.util.spec_from_file_location('weather', Path(__file__).resolve().parents[1]/'scripts'/'simulate_weather.py')
weather = importlib.util.module_from_spec(spec)
spec.loader.exec_module(weather)


class DeterministicSuperEvents:
    def __init__(self, weather_event=None):
        self.weather_event = weather_event
        self.event = 0

    def geometric(self, probability):
        # Both clocks tie at 1; super priority must win each time.
        return np.ones(np.shape(probability), dtype=np.int64)

    def random(self, size):
        if size == 0:
            return np.empty(0)
        self.event += 1
        return np.zeros(size) if self.event == self.weather_event else np.ones(size)


class WeatherStoppingTests(unittest.TestCase):
    def check_stop(self, weather_event):
        size = 3
        sums, squares = weather.simulate_batch(DeterministicSuperEvents(weather_event), size)
        expected = np.ceil(weather.TARGETS/1500)
        if weather_event is not None:
            expected = np.minimum(expected, weather_event)
        np.testing.assert_array_equal(sums, size*expected)
        np.testing.assert_array_equal(squares, size*expected**2)

    def test_energy_guarantee_without_direct_weather(self):
        self.check_stop(None)

    def test_first_event_weather_completes_every_threshold(self):
        self.check_stop(1)

    def test_second_event_weather_preserves_previously_crossed_thresholds(self):
        self.check_stop(2)


if __name__ == '__main__':
    unittest.main()
