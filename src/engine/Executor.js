const config = require('../../config');
const { scanOpportunity } = require('./scanner');
const { calculateNetProfit } = require('./calculator');

class Executor {
  constructor(binanceAdapter, hyperliquidAdapter, riskValidator) {
    this.binance = binanceAdapter;
    this.hyperliquid = hyperliquidAdapter;
    this.riskValidator = riskValidator; // optional, used for stop-loss re-check before live execution
  }

  /**
   * Re-fetches fresh tickers right before firing live orders and recomputes
   * the opportunity/profit. If the market moved since the original scan and
   * the trade would now breach the stop-loss (or no longer crosses at all),
   * this returns { ok: false, reason }.
   *
   * symbolPair: { binance: 'BTC/USDT', hyperliquid: 'BTC' } — needed because
   * evaluatedOpportunity alone doesn't carry both exchanges' native symbols.
   */
  async _revalidate(evaluatedOpportunity, symbolPair) {
    if (!config.risk.revalidateBeforeExecution) return { ok: true, fresh: evaluatedOpportunity };

    const [binTicker, hlTicker] = await Promise.all([
      this.binance.getTicker(symbolPair.binance),
      this.hyperliquid.getTicker(symbolPair.hyperliquid),
    ]);

    const freshOpportunity = scanOpportunity(binTicker, hlTicker);
    if (!freshOpportunity) {
      return { ok: false, reason: 'Stop-loss guard: spread no longer crossed on re-check' };
    }

    const freshEvaluated = calculateNetProfit(freshOpportunity, evaluatedOpportunity.tradeSizeUSD);

    if (this.riskValidator) {
      const verdict = this.riskValidator.validate(freshEvaluated, binTicker, hlTicker);
      if (!verdict.ok) return { ok: false, reason: verdict.reason, fresh: freshEvaluated };
    } else {
      const maxLossPct = Math.abs(config.risk.maxLossPct);
      if (freshEvaluated.netProfitPct <= -maxLossPct) {
        return {
          ok: false,
          reason: `Stop-loss triggered on re-check: projected loss ${freshEvaluated.netProfitPct}% exceeds max allowed loss ${maxLossPct}%`,
          fresh: freshEvaluated,
        };
      }
    }

    return { ok: true, fresh: freshEvaluated };
  }

  /**
   * Executes (or simulates) both legs of the arbitrage trade.
   * Returns a settlement record.
   *
   * symbolPair: { binance: 'BTC/USDT', hyperliquid: 'BTC' } — pass this in
   * live mode so the pre-execution stop-loss re-check can fetch fresh prices.
   */
  async execute(evaluatedOpportunity, symbolPair) {
    if (config.mode === 'paper') {
      // Simulated fill at the observed prices — no real orders sent.
      return {
        ...evaluatedOpportunity,
        mode: 'paper',
        status: 'FILLED_SIMULATED',
        executedAt: Date.now(),
      };
    }

    // ── LIVE MODE ────────────────────────────────────────
    try {
      // Stop-loss guard: re-check with fresh prices right before firing orders.
      if (symbolPair) {
        const check = await this._revalidate(evaluatedOpportunity, symbolPair);
        if (!check.ok) {
          return {
            ...evaluatedOpportunity,
            mode: 'live',
            status: 'ABORTED_STOP_LOSS',
            reason: check.reason,
            revalidated: check.fresh || null,
            executedAt: Date.now(),
          };
        }
        // Use the re-validated numbers/prices (buy/sell direction can flip
        // if the market moved) for the actual trade.
        evaluatedOpportunity = check.fresh;
      }

      const { buyExchange, sellExchange, tradeSizeUSD } = evaluatedOpportunity;
      const amount = tradeSizeUSD / evaluatedOpportunity.buyPrice;

      // Pick each exchange's native symbol (e.g. 'BTC/USDT' vs 'BTC'), falling
      // back to evaluatedOpportunity.symbol if no symbolPair was supplied.
      const binanceSymbol = symbolPair ? symbolPair.binance : evaluatedOpportunity.symbol;
      const hyperliquidSymbol = symbolPair ? symbolPair.hyperliquid : evaluatedOpportunity.symbol;

      const buyLeg = buyExchange === 'binance'
        ? await this.binance.placeMarketOrder(binanceSymbol, 'buy', amount)
        : await this.hyperliquid.placeMarketOrder(hyperliquidSymbol, 'buy', amount);

      const sellLeg = sellExchange === 'binance'
        ? await this.binance.placeMarketOrder(binanceSymbol, 'sell', amount)
        : await this.hyperliquid.placeMarketOrder(hyperliquidSymbol, 'sell', amount);

      return {
        ...evaluatedOpportunity,
        mode: 'live',
        status: 'FILLED_LIVE',
        buyLeg,
        sellLeg,
        executedAt: Date.now(),
      };
    } catch (err) {
      return {
        ...evaluatedOpportunity,
        mode: 'live',
        status: 'FAILED',
        error: err.message,
        executedAt: Date.now(),
      };
    }
  }
}

module.exports = Executor;