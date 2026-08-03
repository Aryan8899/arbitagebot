const config = require('../config');
const BinanceAdapter = require('./exchanges/binance');
const HyperliquidAdapter = require('./exchanges/hyperliquid');
const { scanOpportunity } = require('./engine/scanner');
const { calculateNetProfit } = require('./engine/calculator');
const RiskValidator = require('./engine/RiskValidator');
const Executor = require('./engine/Executor');
const Settlement = require('./engine/settlement');

const binance = new BinanceAdapter();
const hyperliquid = new HyperliquidAdapter();
const risk = new RiskValidator();
// Pass `risk` in so Executor can re-run the same stop-loss/threshold checks
// on fresh prices right before firing live orders.
const executor = new Executor(binance, hyperliquid, risk);
const settlement = new Settlement();

async function checkSymbol(pair) {
  const [tickerBinance, tickerHL] = await Promise.all([
    binance.getTicker(pair.binance),
    hyperliquid.getTicker(pair.hyperliquid),
  ]);

  if (!tickerBinance || !tickerHL) return;

  // Normalize symbol labels so scanner can compare them
  const a = { ...tickerBinance, symbol: pair.binance };
  const b = { ...tickerHL, symbol: pair.binance };

  const opportunity = scanOpportunity(a, b);
  if (!opportunity) {
    log(`[${pair.binance}] no crossed spread right now`);
    return;
  }

  const evaluated = calculateNetProfit(opportunity);
  log(
    `[${pair.binance}] gross ${evaluated.grossDiffPct.toFixed(3)}% | ` +
    `net ${evaluated.netProfitPct}% | threshold ${config.minRequiredProfitPct}% | ` +
    (evaluated.meetsThreshold ? '✅ TRADE CANDIDATE' : '❌ skip')
  );

  const riskCheck = risk.validate(evaluated, a, b);
  if (!riskCheck.ok) {
    if (evaluated.meetsThreshold) log(`   blocked by risk validator: ${riskCheck.reason}`);
    return;
  }

  risk.registerOpenPosition();
  // Pass the pair so executor can re-fetch fresh prices from the correct
  // native symbols (pair.binance / pair.hyperliquid) and stop-loss-check
  // again right before firing live orders.
  const result = await executor.execute(evaluated, pair);
  const pnl = settlement.record(result);
  risk.registerClosedPosition(pnl);

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
  const s = settlement.summary();
  log(`--- summary: ${s.totalTrades} trades, cumulative PnL $${s.totalPnLUSD} ---\n`);
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function main() {
  log(`Starting HyperArbi engine in "${config.mode.toUpperCase()}" mode`);
  log(`Watching: ${config.symbols.map(s => s.binance).join(', ')}`);
  log(`Min required profit: ${config.minRequiredProfitPct}% | Max loss (stop-loss): ${config.risk.maxLossPct}% | Poll every ${config.pollIntervalMs}ms\n`);

  await tick();
  setInterval(tick, config.pollIntervalMs);
}

main();