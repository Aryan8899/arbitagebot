const fs = require('fs');
const path = require('path');
const config = require('../../config');

class Settlement {
  constructor() {
    this.trades = [];
    this.totalPnLUSD = 0;

    const dir = path.dirname(config.logFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  record(executedTrade) {
    this.trades.push(executedTrade);

    if (executedTrade.status === 'FILLED_SIMULATED' || executedTrade.status === 'FILLED_LIVE') {
      this.totalPnLUSD += executedTrade.netProfitUSD;
    }

    const line = JSON.stringify({ ...executedTrade, cumulativePnLUSD: round(this.totalPnLUSD) });
    fs.appendFileSync(config.logFile, line + '\n');

    return executedTrade.netProfitUSD || 0;
  }

  summary() {
    return {
      totalTrades: this.trades.length,
      totalPnLUSD: round(this.totalPnLUSD),
    };
  }
}

function round(n) {
  return Math.round(n * 100) / 100;
}

module.exports = Settlement;
