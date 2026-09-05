const config = require('../../config');

/**
 * Takes a raw opportunity (from scanner.js) and a trade size in USD,
 * and computes the NET expected profit after fees & estimated slippage —
 * mirroring the "Profitability Calculator" step in the engine flow.
 */
/**
 * Takes a raw opportunity (from scanner.js) and computes the NET expected
 * profit after fees & estimated slippage — mirroring the "Profitability
 * Calculator" step in the engine flow.
 *
 * opts.tradeSizeUSD / opts.minRequiredProfitPct let the caller pass in a
 * SYMBOL-SPECIFIC trade size and threshold (e.g. from config.symbols[i]).
 * If omitted, falls back to the global config defaults.
 */
function calculateNetProfit(opportunity, opts = {}) {
  const { fees } = config;
  const tradeSizeUSD = opts.tradeSizeUSD ?? config.tradeSizeUSD;
  const minRequiredProfitPct = opts.minRequiredProfitPct ?? config.minRequiredProfitPct;

  const buyFeeUSD = tradeSizeUSD * (fees.binanceTakerPct / 100);
  const sellFeeUSD = tradeSizeUSD * (fees.hyperliquidTakerPct / 100);
  const slippageUSD = tradeSizeUSD * (fees.slippagePct / 100) * 2; // both legs
  const withdrawalFeeUSD = fees.withdrawalFeeUSD;

  const totalCosts = buyFeeUSD + sellFeeUSD + slippageUSD + withdrawalFeeUSD;

  const grossProfitUSD = tradeSizeUSD * (opportunity.grossDiffPct / 100);
  const netProfitUSD = grossProfitUSD - totalCosts;
  const netProfitPct = (netProfitUSD / tradeSizeUSD) * 100;

  return {
    ...opportunity,
    tradeSizeUSD,
    minRequiredProfitPct,
    grossProfitUSD: round(grossProfitUSD),
    costs: {
      buyFeeUSD: round(buyFeeUSD),
      sellFeeUSD: round(sellFeeUSD),
      slippageUSD: round(slippageUSD),
      withdrawalFeeUSD: round(withdrawalFeeUSD),
      totalCosts: round(totalCosts),
    },
    netProfitUSD: round(netProfitUSD),
    netProfitPct: round(netProfitPct, 4),
    meetsThreshold: netProfitPct > minRequiredProfitPct,
  };
}

function round(n, dp = 2) {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

module.exports = { calculateNetProfit };