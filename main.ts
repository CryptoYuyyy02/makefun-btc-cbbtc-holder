// Buy and hold: buy on the first tradable bar, close at end (harness flattens).
import { runBars, type BarsState, type BuyInput } from './vendor/makefun-bars.ts';
const SYMBOL = 'CBBTC';
let decided = false;
await runBars({
  onBatch(state: BarsState) {
    if (decided || state.warmingUp) return [];
    const px = state.close(SYMBOL);
    if (px === null) return [];
    decided = true;
    const notional = state.cash;
    if (notional < 1_000_000n) return [];
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: 10000 } as BuyInput];
  },
});
