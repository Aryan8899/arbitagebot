const config = require('../../config');

class Executor {
  constructor(binanceAdapter, hyperliquidAdapter) {
    this.binance = binanceAdapter;
    this.hyperliquid = hyperliquidAdapter;
  }

  /**
   * Executes (or simulates) both legs of the arbitrage trade.
   * Returns a settlement record.
   */
  async execute(evaluatedOpportunity) {
    const { buyExchange, sellExchange, symbol, tradeSizeUSD } = evaluatedOpportunity;

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
      const amount = tradeSizeUSD / evaluatedOpportunity.buyPrice;

      const buyLeg = buyExchange === 'binance'
        ? await this.binance.placeMarketOrder(symbol, 'buy', amount)
        : await this.hyperliquid.placeMarketOrder(symbol, 'buy', amount);

      const sellLeg = sellExchange === 'binance'
        ? await this.binance.placeMarketOrder(symbol, 'sell', amount)
        : await this.hyperliquid.placeMarketOrder(symbol, 'sell', amount);

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
