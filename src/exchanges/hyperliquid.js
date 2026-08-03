const axios = require('axios');
const config = require('../../config');

class HyperliquidAdapter {
  constructor() {
    this.apiUrl = config.hyperliquid.apiUrl;
    this.name = 'hyperliquid';
  }

  /**
   * Hyperliquid's public "info" endpoint returns mid prices for all assets
   * plus L2 order book snapshots. We use allMids for a quick mid price,
   * and l2Book for a real bid/ask.
   */
  async getTicker(coin) {
    try {
      const res = await axios.post(`${this.apiUrl}/info`, {
        type: 'l2Book',
        coin,
      });
      const book = res.data;
      const bestBid = parseFloat(book.levels[0][0].px);
      const bestAsk = parseFloat(book.levels[1][0].px);
      return {
        exchange: this.name,
        symbol: coin,
        bid: bestBid,
        ask: bestAsk,
        mid: (bestBid + bestAsk) / 2,
        timestamp: Date.now(),
      };
    } catch (err) {
      console.error(`[Hyperliquid] getTicker(${coin}) failed:`, err.message);
      return null;
    }
  }

  /**
   * Place a real order on Hyperliquid. Only called when config.mode === "live".
   *
   * IMPORTANT: Hyperliquid's exchange API requires EIP-712 signed "actions"
   * using your wallet's private key. The signing scheme is non-trivial and
   * changes with protocol versions, so this method is intentionally a stub.
   * Before enabling live mode, integrate the official Hyperliquid SDK
   * (see https://github.com/hyperliquid-dex/hyperliquid-python-sdk or
   * community Node/TS ports) rather than hand-rolling the signature.
   */
  async placeMarketOrder(coin, side, amount) {
    if (!config.hyperliquid.privateKey) {
      throw new Error('Hyperliquid private key not configured — cannot place live order');
    }
    throw new Error(
      'Hyperliquid live order signing not implemented in this stub. ' +
      'Integrate the official Hyperliquid SDK before enabling live mode.'
    );
  }
}

module.exports = HyperliquidAdapter;
