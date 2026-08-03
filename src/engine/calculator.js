const config = require('../../config');

/**
 * Takes a raw opportunity (from scanner.js) and a trade size in USD,
 * and computes the NET expected profit after fees & estimated slippage —
 * mirroring the "Profitability Calculator" step in the engine flow.
 */
function calculateNetProfit(opportunity, tradeSizeUSD = config.tradeSizeUSD) {
  const { fees } = config;

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
    meetsThreshold: netProfitPct > config.minRequiredProfitPct,
  };
}

function round(n, dp = 2) {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

module.exports = { calculateNetProfit };
