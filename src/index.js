const config = require('../config');
const BinanceAdapter = require('./exchanges/binance');
const HyperliquidAdapter = require('./exchanges/hyperliquid');
const { scanOpportunity } = require('./engine/scanner');
const { calculateNetProfit } = require('./engine/calculator');
const RiskValidator = require('./engine/RiskValidator');
const Executor = require('./engine/executor');
const Settlement = require('./engine/settlement');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000' }));
app.use(express.json());

const PORT = process.env.PORT || 8083;

const state = {
  opportunities: {},
  trades: [],
  lastUpdated: null,
};

let running = false;
let intervalHandle = null;

const binance = new BinanceAdapter();
const hyperliquid = new HyperliquidAdapter();
const risk = new RiskValidator();
const executor = new Executor(binance, hyperliquid, risk);
const settlement = new Settlement();

const sseClients = new Set();

function broadcastState() {
  const payload = `data: ${JSON.stringify(buildStateSnapshot())}\n\n`;
  for (const res of sseClients) res.write(payload);
}

function buildStateSnapshot() {
  return {
    mode: config.mode,
    running,
    symbols: config.symbols.map((s) => s.binance),
    config: {
      mode: config.mode,
      pollIntervalMs: config.pollIntervalMs,
      risk: {
        maxOpenPositions: config.risk.maxOpenPositions,
        maxDailyLossUSD: config.risk.maxDailyLossUSD,
      },
      // Per-symbol trade size / profit threshold / stop-loss.
      symbols: config.symbols.map((s) => ({
        binance: s.binance,
        hyperliquid: s.hyperliquid,
        tradeSizeUSD: s.tradeSizeUSD ?? config.tradeSizeUSD,
        minRequiredProfitPct: s.minRequiredProfitPct ?? config.minRequiredProfitPct,
        maxLossPct: s.maxLossPct ?? config.risk.maxLossPct,
      })),
    },
    opportunities: state.opportunities,
    trades: state.trades,
    risk: { openPositions: risk.openPositions, dailyPnL: risk.dailyPnL },
    summary: settlement.summary(),
    lastTickAt: state.lastUpdated,
  };
}

/**
 * Merge a partial config patch sent from the frontend into the live config
 * object. We mutate config's own properties (never reassign `config` itself)
 * so every module that already did `const config = require(...)` keeps
 * seeing up-to-date values without needing a restart.
 */
function mergeConfig(patch) {
  if (!patch || typeof patch !== 'object') return;

  if (patch.mode === 'paper' || patch.mode === 'live') config.mode = patch.mode;

  if (Number.isFinite(Number(patch.tradeSizeUSD)) && Number(patch.tradeSizeUSD) > 0) {
    config.tradeSizeUSD = Number(patch.tradeSizeUSD);
  }
  if (Number.isFinite(Number(patch.minRequiredProfitPct))) {
    config.minRequiredProfitPct = Number(patch.minRequiredProfitPct);
  }
  if (Number.isFinite(Number(patch.pollIntervalMs)) && Number(patch.pollIntervalMs) >= 1000) {
    config.pollIntervalMs = Number(patch.pollIntervalMs);
    // If the engine is already running, restart the interval at the new cadence.
    if (running) {
      clearInterval(intervalHandle);
      intervalHandle = setInterval(tick, config.pollIntervalMs);
    }
  }

  if (patch.risk && typeof patch.risk === 'object') {
    const r = patch.risk;
    if (Number.isFinite(Number(r.maxOpenPositions))) config.risk.maxOpenPositions = Number(r.maxOpenPositions);
    if (Number.isFinite(Number(r.maxDailyLossUSD))) config.risk.maxDailyLossUSD = Number(r.maxDailyLossUSD);
  }

  if (patch.fees && typeof patch.fees === 'object') {
    Object.assign(config.fees, patch.fees);
  }

  // Per-symbol overrides — matched by `binance` symbol name, only the fields
  // present are updated so partial patches (one symbol at a time) work fine.
  if (Array.isArray(patch.symbols)) {
    for (const s of patch.symbols) {
      const target = config.symbols.find((x) => x.binance === s.binance);
      if (!target) continue;
      if (Number.isFinite(Number(s.tradeSizeUSD)) && Number(s.tradeSizeUSD) > 0) {
        target.tradeSizeUSD = Number(s.tradeSizeUSD);
      }
      if (Number.isFinite(Number(s.minRequiredProfitPct))) {
        target.minRequiredProfitPct = Number(s.minRequiredProfitPct);
      }
      if (Number.isFinite(Number(s.maxLossPct))) {
        target.maxLossPct = Number(s.maxLossPct);
      }
    }
  }
}

function startEngine() {
  if (running) return;
  if (config.mode === 'live' && !config.binance.apiKey) {
    throw new Error('Cannot start in LIVE mode — Binance API key is not configured on the backend');
  }
  running = true;
  log(`Engine started — mode ${config.mode.toUpperCase()}, trade size $${config.tradeSizeUSD}, poll every ${config.pollIntervalMs}ms`);
  tick();
  intervalHandle = setInterval(tick, config.pollIntervalMs);
}

function stopEngine() {
  if (!running) return;
  running = false;
  clearInterval(intervalHandle);
  intervalHandle = null;
  log('Engine stopped');
}

function recordTrade(symbol, { status, reason = null, netProfitUSD = null, at = Date.now() }) {
  state.trades.unshift({ symbol, at, status, reason, netProfitUSD });
  state.trades = state.trades.slice(0, 100);
}

async function checkSymbol(pair) {
  const symbol = pair.binance;

  const [tickerBinance, tickerHL] = await Promise.all([
    binance.getTicker(pair.binance),
    hyperliquid.getTicker(pair.hyperliquid),
  ]);

  if (!tickerBinance || !tickerHL) {
    state.opportunities[symbol] = { crossed: false, binance: tickerBinance, hyperliquid: tickerHL };
    log(`[${symbol}] failed to fetch one or both tickers`);
    return;
  }

  const a = { ...tickerBinance, symbol };
  const b = { ...tickerHL, symbol };

  const opportunity = scanOpportunity(a, b);
  if (!opportunity) {
    state.opportunities[symbol] = { crossed: false, binance: tickerBinance, hyperliquid: tickerHL };
    log(`[${symbol}] no crossed spread right now`);
    return;
  }

  const evaluated = calculateNetProfit(opportunity, {
    tradeSizeUSD: pair.tradeSizeUSD,
    minRequiredProfitPct: pair.minRequiredProfitPct,
  });
  evaluated.maxLossPct = pair.maxLossPct ?? config.risk.maxLossPct;

  log(
    `[${symbol}] gross ${evaluated.grossDiffPct.toFixed(3)}% | ` +
    `net ${evaluated.netProfitPct}% | threshold ${evaluated.minRequiredProfitPct}% | ` +
    (evaluated.meetsThreshold ? '✅ TRADE CANDIDATE' : '❌ skip')
  );

  const riskCheck = risk.validate(evaluated, a, b);

  state.opportunities[symbol] = {
    crossed: true,
    binance: tickerBinance,
    hyperliquid: tickerHL,
    evaluated,
    riskOk: false,
    riskReason: riskCheck.reason || null,
  };

  if (!riskCheck.ok) {
    if (evaluated.meetsThreshold) {
      log(`   blocked by risk validator: ${riskCheck.reason}`);
      recordTrade(symbol, { status: 'BLOCKED', reason: riskCheck.reason });
    }
    return;
  }

  risk.registerOpenPosition();
  const result = await executor.execute(evaluated, pair);
  const pnl = settlement.record(result);
  risk.registerClosedPosition(pnl);

  state.opportunities[symbol].riskOk = true;
  recordTrade(symbol, {
    status: result.status,
    reason: result.reason || null,
    netProfitUSD: result.netProfitUSD ?? null,
    at: result.executedAt,
  });

  if (result.status === 'ABORTED_STOP_LOSS') {
    log(`   🛑 STOP-LOSS ABORT: ${result.reason}`);
  } else {
    log(`   EXECUTED (${result.mode}/${result.status}) net PnL: $${pnl}`);
  }
}

async function tick() {
  for (const pair of config.symbols) {
    try {
      await checkSymbol(pair);
    } catch (err) {
      log(`Error checking ${pair.binance}: ${err.message}`);
    }
  }
  state.lastUpdated = Date.now();

  const s = settlement.summary();
  log(`--- summary: ${s.totalTrades} trades, cumulative PnL $${s.totalPnLUSD} ---\n`);

  broadcastState();
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'HyperArbi engine is running', mode: config.mode });
});

app.get('/api/state', (req, res) => {
  res.json(buildStateSnapshot());
});

app.get('/api/config', (req, res) => {
  res.json(buildStateSnapshot().config);
});

app.post('/api/config', (req, res) => {
  try {
    mergeConfig(req.body);
    log(`Config updated via API: ${JSON.stringify(req.body)}`);
    res.json(buildStateSnapshot());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/engine/start', (req, res) => {
  try {
    if (req.body && Object.keys(req.body).length) mergeConfig(req.body);
    startEngine();
    res.json(buildStateSnapshot());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/engine/stop', (req, res) => {
  stopEngine();
  res.json(buildStateSnapshot());
});

app.get('/api/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  res.write(`data: ${JSON.stringify(buildStateSnapshot())}\n\n`);

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

async function main() {
  app.listen(PORT, '127.0.0.1', () => {
    log(`HTTP server listening on http://localhost:${PORT}`);
    log(`Engine is idle — waiting for POST /api/engine/start (set config from the frontend first)\n`);
  });
}

main();