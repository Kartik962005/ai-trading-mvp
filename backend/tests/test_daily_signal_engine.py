import unittest

from app.services.daily_signal_engine.diversification import diversify_candidates
from app.services.daily_signal_engine.scoring import adjusted_win_rate, compute_expected_r
from app.services.daily_trade_service import _build_unsubscribe_token, _decode_unsubscribe_token, _validate_email_time


class DailySignalEngineTests(unittest.TestCase):
    def test_adjusted_win_rate_shrinks_toward_universe_average(self):
        result = adjusted_win_rate(wins=2, trades=2, universe_average_win_rate=0.52, k=20)
        self.assertAlmostEqual(result, (2 + 20 * 0.52) / 22, places=6)

    def test_expected_r_penalizes_costs(self):
        result = compute_expected_r(0.62, 0.24, 1.8, 1.0, transaction_cost_r=0.03, slippage_r=0.02)
        self.assertAlmostEqual(result, 0.62 * 1.8 - 0.24 * 1.0 - 0.03 - 0.02, places=6)

    def test_diversification_caps_sector_and_skips_correlated_duplicates(self):
        base_returns = [0.01, 0.012, 0.011, 0.014, 0.009, 0.013, 0.015, 0.01, 0.008, 0.014, 0.009, 0.01]
        candidates = [
            {"symbol": "AAA", "sector": "Tech", "final_score": 0.91, "recent_returns": base_returns},
            {"symbol": "BBB", "sector": "Tech", "final_score": 0.89, "recent_returns": [value * 0.99 for value in base_returns]},
            {"symbol": "CCC", "sector": "Tech", "final_score": 0.88, "recent_returns": [value * 1.01 for value in base_returns]},
            {"symbol": "DDD", "sector": "Banks", "final_score": 0.87, "recent_returns": [-0.01, 0.005, -0.004, 0.008, -0.003, 0.004, 0.007, -0.005, 0.006, -0.002, 0.004, -0.001]},
        ]
        selected = diversify_candidates(candidates)
        self.assertEqual([item["symbol"] for item in selected], ["AAA", "DDD"])

    def test_unsubscribe_token_round_trip(self):
        token = _build_unsubscribe_token("user-123", "nonce-abc")
        user_id, nonce = _decode_unsubscribe_token(token)
        self.assertEqual(user_id, "user-123")
        self.assertEqual(nonce, "nonce-abc")

    def test_email_time_must_be_after_market_close(self):
        self.assertEqual(_validate_email_time("NSE", "18:00"), "18:00")
        with self.assertRaises(ValueError):
            _validate_email_time("NSE", "15:45")


if __name__ == "__main__":
    unittest.main()
