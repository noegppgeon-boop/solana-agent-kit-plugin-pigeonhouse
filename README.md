# solana-agent-kit-plugin-pigeonhouse

PigeonHouse plugin for [Solana Agent Kit](https://github.com/sendaifun/solana-agent-kit) V2. Enables AI agents to create tokens, buy, sell, and query data on PigeonHouse, where every trade permanently burns PIGEON.

## Installation

```bash
npm install solana-agent-kit-plugin-pigeonhouse
```

## Usage

```typescript
import { SolanaAgentKit, createVercelAITools, KeypairWallet } from "solana-agent-kit";
import PigeonHousePlugin from "solana-agent-kit-plugin-pigeonhouse";

const agent = new SolanaAgentKit(wallet, RPC_URL, {})
  .use(PigeonHousePlugin);

// Use with Vercel AI SDK
const tools = createVercelAITools(agent, agent.actions);

// Or call methods directly
const tokens = await agent.methods.pigeonhouseGetTokens(agent);
const stats = await agent.methods.pigeonhouseGetBurnStats(agent);
```

## Actions

| Action | Description |
|--------|-------------|
| `PIGEONHOUSE_CREATE_TOKEN` | Create a new token on a bonding curve (Token-2022, 1B supply) |
| `PIGEONHOUSE_BUY` | Buy tokens by spending PIGEON, SOL, or SKR |
| `PIGEONHOUSE_SELL` | Sell tokens back to the bonding curve |
| `PIGEONHOUSE_GET_TOKENS` | List all active tokens with prices and market caps |
| `PIGEONHOUSE_GET_TOKEN_INFO` | Get detailed bonding curve state for a token |
| `PIGEONHOUSE_GET_BURN_STATS` | Get total PIGEON burned and platform stats |
| `PIGEONHOUSE_GET_TRADES` | Get recent trades for a token |

## Methods

```typescript
// Create a token with PIGEON quote pair
const { mint, signature } = await agent.methods.pigeonhouseCreateToken(
  agent, "My Token", "MTK", "https://arweave.net/metadata.json", "PIGEON"
);

// Buy 500 PIGEON worth of tokens
const sig = await agent.methods.pigeonhouseBuy(
  agent, "TOKEN_MINT_ADDRESS", 500, "PIGEON", 500
);

// Sell 10000 tokens
const sig = await agent.methods.pigeonhouseSell(
  agent, "TOKEN_MINT_ADDRESS", 10000, "PIGEON"
);

// Get burn stats
const stats = await agent.methods.pigeonhouseGetBurnStats(agent);
console.log(`Total burned: ${stats.totalBurned} PIGEON`);
```

## Fee Structure

| Quote | Total Fee | Burn | Reserve | Treasury |
|-------|-----------|------|---------|----------|
| PIGEON | 2% | 1.5% | - | 0.5% |
| SOL | 2% | - | 1.5% | 0.5% |
| SKR | 2% | - | 1.5% | 0.5% |

## Protocol

- **Program:** `BV1RxkAaD5DjXMsnofkVikFUUYdrDg1v8YgsQ3iyDNoL`
- **Verified:** [OtterSec](https://verify.osec.io/status/BV1RxkAaD5DjXMsnofkVikFUUYdrDg1v8YgsQ3iyDNoL)
- **Source:** [GitHub](https://github.com/noegppgeon-boop/Pigeonhouse)
- **Website:** [941pigeon.fun](https://941pigeon.fun)

## License

MIT
