/**
 * Given two tickers for the same asset on different exchanges,
 * determine which direction the arbitrage opportunity runs
 * (buy low exchange -> sell high exchange) and the raw price gap.
 */
function scanOpportunity(tickerA, tickerB) {
  if (!tickerA || !tickerB) return null;

  // Buy at the lower "ask" (what you'd actually pay), sell at the higher "bid"
  // (what you'd actually receive) — this is more realistic than comparing mids.
  let buySide, sellSide;

  if (tickerA.ask < tickerB.bid) {
    buySide = tickerA;
    sellSide = tickerB;
  } else if (tickerB.ask < tickerA.bid) {
    buySide = tickerB;
    sellSide = tickerA;
  } else {
    return null; // no crossed spread, no opportunity
  }

  const grossDiff = sellSide.bid - buySide.ask;
  const grossDiffPct = (grossDiff / buySide.ask) * 100;

  return {
    symbol: tickerA.symbol,
    buyExchange: buySide.exchange,
    sellExchange: sellSide.exchange,
    buyPrice: buySide.ask,
    sellPrice: sellSide.bid,
    grossDiff,
    grossDiffPct,
    detectedAt: Date.now(),
  };
}

module.exports = { scanOpportunity };
