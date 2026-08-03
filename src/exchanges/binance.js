const ccxt = require('ccxt');
const config = require('../../config');

class BinanceAdapter {
  constructor() {
    this.exchange = new ccxt.binance({
      apiKey: config.binance.apiKey || undefined,
      secret: config.binance.apiSecret || undefined,
      enableRateLimit: true,
    });
    this.name = 'binance';
  }

  /**
   * Fetch the current best bid/ask for a symbol, e.g. "BTC/USDT"
   * Returns { bid, ask, mid, timestamp } or null on failure
   */
  async getTicker(symbol) {
    try {
      const t = await this.exchange.fetchTicker(symbol);
      return {
        exchange: this.name,
        symbol,
        bid: t.bid,
        ask: t.ask,
        mid: (t.bid + t.ask) / 2,
        timestamp: t.timestamp || Date.now(),
      };
    } catch (err) {
      console.error(`[Binance] getTicker(${symbol}) failed:`, err.message);
      return null;
    }
  }

  /**
   * Place a real order. Only called when config.mode === "live".
   * side: "buy" | "sell"
   */
  async placeMarketOrder(symbol, side, amount) {
    if (!config.binance.apiKey) {
      throw new Error('Binance API key not configured — cannot place live order');
    }
    const order = await this.exchange.createMarketOrder(symbol, side, amount);
    return order;
  }
}

module.exports = BinanceAdapter;
