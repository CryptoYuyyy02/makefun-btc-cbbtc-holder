// Mean-reversion bot for the cbBTC bars-replay race, tuned on the kit's dev window.
// Long only, one position, full equity. Buys when the close is far below its rolling mean
// (z-score <= -2.5 over 350 bars) and sells when it reverts to +1.1 sigma. A full round trip
// costs ~16 bps, so only deep dislocations are traded — four times on the dev window, with a
// small drawdown. Every number comes from the bar stream; no clock, no environment, no RNG.

import { runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const SPAN = 350;        // rolling window for the mean and standard deviation
const ENTRY_Z = -2.5;    // buy below this z-score
const EXIT_Z = 1.1;      // sell once price reverts above this z-score
const MAX_SLIPPAGE_BPS = 500;

interface S { closes: number[]; }
const s: S = { closes: [] };

/** The close's z-score against the last SPAN closes, or null until the window fills. */
function zscore(closes: number[]): number | null {
  const n = closes.length;
  if (n < SPAN) return null;
  let sum = 0;
  for (let i = n - SPAN; i < n; i++) sum += closes[i];
  const mean = sum / SPAN;
  let variance = 0;
  for (let i = n - SPAN; i < n; i++) variance += (closes[i] - mean) * (closes[i] - mean);
  const sd = Math.sqrt(variance / SPAN);
  if (sd <= 0) return null;
  return (closes[n - 1] - mean) / sd;
}

await runBars({
  onBatch(state: BarsState, batch) {
    for (const bar of batch.bars) {
      if (bar.symbol === SYMBOL) s.closes.push(Number(bar.c));
    }
    if (state.warmingUp) return [];
    const held = state.positions.get(SYMBOL);
    const px = state.close(SYMBOL);
    if (px === null) return [];
    const z = zscore(s.closes);
    if (z === null) return [];

    if (held !== undefined) {
      if (z >= EXIT_Z) {
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS } as SellInput];
      }
      return [];
    }

    if (z <= ENTRY_Z) {
      const notional = state.cash;
      if (notional < 1_000_000n) return [];
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS } as BuyInput];
    }
    return [];
  },
});
