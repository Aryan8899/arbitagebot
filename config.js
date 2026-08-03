require('dotenv').config();

module.exports = {
  // ── Mode ────────────────────────────────────────────────
  // "paper"  -> uses real live prices but simulates order execution (no real money)
  // "live"   -> places real orders on both exchanges (needs API keys below)
  mode: process.env.MODE || 'paper',

  // ── Symbols to watch ────────────────────────────────────
  // format: { binance: 'BTC/USDT', hyperliquid: 'BTC' }
  symbols: [
    { binance: 'BTC/USDT', hyperliquid: 'BTC' },
    { binance: 'ETH/USDT', hyperliquid: 'ETH' },
    { binance: 'SOL/USDT', hyperliquid: 'SOL' },

    { binance: 'DOGE/USDT', hyperliquid: 'DOGE' },
    { binance: 'AVAX/USDT', hyperliquid: 'AVAX' },
    { binance: 'APT/USDT', hyperliquid: 'APT' },
  ],

  // ── Polling ─────────────────────────────────────────────
  pollIntervalMs: 3000, // how often to check prices

  // ── Profitability thresholds ───────────────────────────
 minRequiredProfitPct: -1,   // realistic — trades tabhi ayengi jab gross gap ~0.3%+ ho // trade only executes if net profit % > this (matches doc's example)
  tradeSizeUSD: 2000,         // simulated/live position size per trade

  // ── Fee & slippage assumptions (used by profitability calculator) ─
fees: {
  binanceTakerPct: 0.10,
  hyperliquidTakerPct: 0.05,
  withdrawalFeeUSD: 0,       // pre-funded balance model, per-trade withdraw nahi hota
  slippagePct: 0.05,
},

  // ── Risk validation ─────────────────────────────────────
  // risk: {
  //   maxOpenPositions: 3,
  //   maxDailyLossUSD: 50,
  //   maxPriceStalenessMs: 5000, // reject if price data older than this

  //   // ── Stop-loss ──────────────────────────────────────────
  //   // Agar (calculated ya re-checked) netProfitPct is -maxLossPct se zyada
  //   // neeche chala jaaye (matlab loss maxLossPct% se zyada), trade abort ho jayega.
  //   // Ye minRequiredProfitPct se ALAG hai: minRequiredProfitPct entry ke liye
  //   // "kam se kam kitna profit chahiye" set karta hai, ye stop-loss "max kitna
  //   // loss allow hai" set karta hai — dono independent knobs hain.
  //   maxLossPct: 0.30,

  //   // Live mode mein: order fire karne se theen pehle ek baar fresh ticker
  //   // fetch karke opportunity/profit dobara calculate karo. Ye guard karta hai
  //   // us gap ko jab scan/calculate ke time aur actual execution ke time ke
  //   // beech price move ho jaata hai aur profitable trade loss mein badal jaati hai.
  //   revalidateBeforeExecution: true,
  // },

  risk: {
  maxOpenPositions: 3,
  maxDailyLossUSD: 50,
  maxPriceStalenessMs: 5000,
  maxLossPct: 5,            // stop-loss bhi loose kar do taaki wo bhi block na kare
  revalidateBeforeExecution: true,
},

  // ── Live trading credentials (only needed when mode = "live") ──
  binance: {
    apiKey: process.env.BINANCE_API_KEY || '',
    apiSecret: process.env.BINANCE_API_SECRET || '',
  },
  hyperliquid: {
    // Hyperliquid uses an EVM wallet private key to sign orders
    privateKey: process.env.HL_PRIVATE_KEY || '',
    walletAddress: process.env.HL_WALLET_ADDRESS || '',
    apiUrl: 'https://api.hyperliquid.xyz',
  },

  // ── Logging / persistence ───────────────────────────────
  logFile: './logs/trades.log',
};