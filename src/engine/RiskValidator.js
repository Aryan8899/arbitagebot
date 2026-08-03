const config = require('../../config');

class RiskValidator {
  constructor() {
    this.openPositions = 0;
    this.dailyPnL = 0;
    this.dailyResetAt = startOfDay();
  }

  _maybeResetDay() {
    if (Date.now() >= this.dailyResetAt + 24 * 60 * 60 * 1000) {
      this.dailyPnL = 0;
      this.dailyResetAt = startOfDay();
    }
  }

  /**
   * Returns { ok: boolean, reason?: string }
   */
  validate(evaluatedOpportunity, tickerA, tickerB) {
    this._maybeResetDay();

    // ── Stop-loss check ────────────────────────────────────
    // Ye check meetsThreshold se pehle isliye hai taaki loss-making trade ka
    // reason clearly "stop-loss" log ho, na ki generic "below threshold".
    const maxLossPct = Math.abs(config.risk.maxLossPct);
    if (evaluatedOpportunity.netProfitPct <= -maxLossPct) {
      return {
        ok: false,
        reason: `Stop-loss triggered: projected loss ${evaluatedOpportunity.netProfitPct}% exceeds max allowed loss ${maxLossPct}%`,
      };
    }

    if (!evaluatedOpportunity.meetsThreshold) {
      return { ok: false, reason: 'Below minimum required profit threshold' };
    }

    if (this.openPositions >= config.risk.maxOpenPositions) {
      return { ok: false, reason: 'Max open positions reached' };
    }

    if (this.dailyPnL <= -Math.abs(config.risk.maxDailyLossUSD)) {
      return { ok: false, reason: 'Daily loss limit reached — trading paused' };
    }

    const now = Date.now();
    const staleA = now - tickerA.timestamp > config.risk.maxPriceStalenessMs;
    const staleB = now - tickerB.timestamp > config.risk.maxPriceStalenessMs;
    if (staleA || staleB) {
      return { ok: false, reason: 'Price data too stale' };
    }

    return { ok: true };
  }

  registerOpenPosition() {
    this.openPositions += 1;
  }

  registerClosedPosition(pnlUSD) {
    this.openPositions = Math.max(0, this.openPositions - 1);
    this.dailyPnL += pnlUSD;
  }
}

function startOfDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

module.exports = RiskValidator;