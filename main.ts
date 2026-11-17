// Long-only, one position, full equity. Buys the universe on the first tradable
// bar and keeps it, with a single catastrophic-loss circuit breaker: if the mark
// ever drops a quarter below the running peak, it flattens and stays in cash.
// On the dev window (a narrow, rising 24h) the breaker never fires, so this is
// effectively buy-and-hold; on a violently falling window it caps the downside.
// Deterministic from the bar stream: no clock, no environment, no randomness.

import { runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const CIRCUIT_BPS = 2500; // 25% drawdown from peak before flattening

let entered = false;
let flattened = false;
let peak = 0;

await runBars({
  onBatch(state: BarsState) {
    if (state.warmingUp) return [];
    const px = state.close(SYMBOL);
    if (px === null) return [];
    const c = Number(px);
    const held = state.positions.get(SYMBOL);

    if (held !== undefined) {
      if (c > peak) peak = c;
      if (peak > 0 && (peak - c) / peak * 10000 >= CIRCUIT_BPS) {
        flattened = true;
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: 10000 } as SellInput];
      }
      return [];
    }

    if (entered || flattened) return [];
    entered = true;
    peak = c;
    const notional = state.cash;
    if (notional < 1_000_000n) return [];
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: 10000 } as BuyInput];
  },
});
