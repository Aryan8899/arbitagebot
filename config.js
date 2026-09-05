const path = require('path');

/**
 * Live, mutable config. Every backend module does `const config = require(...)`
 * and Node caches that as the SAME object reference everywhere, so index.js's
 * mergeConfig() can update these properties in place (config.tradeSizeUSD = X)
 * and every module (calculator, riskValidator, executor, adapters) picks up
 * the new value immediately — no restart needed.
 *
 * IMPORTANT: never do `module.exports = {...}` again after this, and never
 * do `config = {...}` elsewhere — always mutate existing keys, or every
 * other file's reference to the old object goes stale.
 */
const config = {
  // 'paper' = simulate fills only. 'live' = place real orders (needs API keys below).
  mode: process.env.MODE || 'paper',

  // Which pairs to watch, each with its OWN trade size / threshold / stop-loss.
  // `binance` is ccxt's symbol format, `hyperliquid` is the coin ticker.
  symbols: [
    { binance: 'BTC/USDT', hyperliquid: 'BTC', tradeSizeUSD: 5000, minRequiredProfitPct: 0.15, maxLossPct: -0.5 },
    { binance: 'ETH/USDT', hyperliquid: 'ETH', tradeSizeUSD: 3000, minRequiredProfitPct: 0.15, maxLossPct: -0.5 },
    { binance: 'SOL/USDT', hyperliquid: 'SOL', tradeSizeUSD: 2000, minRequiredProfitPct: 0.20, maxLossPct: -0.6 },
  ],

  // Fallback defaults — only used if a symbol entry above is missing a field.
  tradeSizeUSD: 5000,
  minRequiredProfitPct: 0.15,
  pollIntervalMs: 5000,

  fees: {
    binanceTakerPct: 0.1,
    hyperliquidTakerPct: 0.035,
    slippagePct: 0.02,
    withdrawalFeeUSD: 1,
  },

  risk: {
    maxOpenPositions: 3,
    maxDailyLossUSD: 250,
    maxLossPct: -0.5, // stop-loss: abort/flag if projected loss exceeds this %
    maxPriceStalenessMs: 5000,
    revalidateBeforeExecution: true,
  },

  binance: {
    apiKey: process.env.BINANCE_API_KEY || '',
    apiSecret: process.env.BINANCE_API_SECRET || '',
  },

  hyperliquid: {
    apiUrl: process.env.HYPERLIQUID_API_URL || 'https://api.hyperliquid.xyz',
    privateKey: process.env.HYPERLIQUID_PRIVATE_KEY || '',
  },

  logFile: path.join(__dirname, 'logs', 'trades.log'),
};

module.exports = config;