# HyperArbi Engine — Binance ↔ Hyperliquid Cross-Exchange Arbitrage

Real implementation of the "Arbitrage Engine Flow" (Market Data Aggregator →
Opportunity Scanner → Profitability Calculator → Risk Validation → Trade
Execution → P/L Settlement). No referral/MLM logic — just the trading engine.

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` and `config.js` as needed. By default `MODE=paper`.

## Run

```bash
npm start
```

This polls Binance and Hyperliquid public price feeds every few seconds,
looks for a crossed spread, calculates the **net** profit after fees +
slippage, and only "trades" if net profit exceeds `minRequiredProfitPct`
in `config.js` (default 0.30%, matching the deck's example).

## Modes

- **paper** (default): uses real live market prices but simulates fills.
  Nothing is sent to any exchange. Safe to run and tune thresholds.
- **live**: places real orders.
  - Binance: works out of the box via `ccxt` once you add API keys to `.env`.
  - Hyperliquid: `src/exchanges/hyperliquid.js` has a **stub** for order
    placement — Hyperliquid requires EIP-712 signed actions from your wallet
    key, which is protocol-specific and easy to get wrong. Before flipping
    to live mode, swap in the official Hyperliquid SDK for order signing
    rather than relying on this stub. Market data reads (prices) already
    work live in both modes.

## Files

```
config.js                  all tunable parameters (symbols, fees, thresholds, risk limits)
src/exchanges/binance.js       Binance price feed + order placement (ccxt)
src/exchanges/hyperliquid.js   Hyperliquid price feed (live) + order stub
src/engine/scanner.js          finds crossed-spread opportunities
src/engine/calculator.js       nets out fees/slippage -> real expected profit
src/engine/riskValidator.js    position limits, daily loss cap, stale-price guard
src/engine/executor.js         simulates or places the two trade legs
src/engine/settlement.js       logs every trade + running P&L to logs/trades.log
src/index.js                   main loop tying it all together
```

## ⚠️ Before going live

- Start in paper mode and watch `logs/trades.log` for at least a few days.
  Real cross-exchange arbitrage margins are usually thin (fractions of a
  percent) and can vanish in the time it takes to execute both legs —
  the deck's 7–45%/month figures are not realistic for spot arbitrage.
- You need capital pre-positioned on **both** exchanges — arbitrage isn't
  profitable if you have to transfer funds between venues each time (transfer
  time + fees usually exceed the spread).
- Add proper error handling, retries, and partial-fill handling before
  risking real funds — this is a starting framework, not a production system.
