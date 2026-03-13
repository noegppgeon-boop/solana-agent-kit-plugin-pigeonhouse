import { type Plugin, type SolanaAgentKit } from "solana-agent-kit";
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  Keypair,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { z } from "zod";
import crypto from "crypto";

// ── Constants ──────────────────────────────────────────────────
const PROGRAM_ID = new PublicKey("BV1RxkAaD5DjXMsnofkVikFUUYdrDg1v8YgsQ3iyDNoL");
const PIGEON_MINT = new PublicKey("4fSWEw2wbYEUCcMtitzmeGUfqinoafXxkhqZrA9Gpump");
const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const SKR_MINT = new PublicKey("SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3");
const API_BASE = "https://941pigeon.fun";

// ── PDA Derivation ─────────────────────────────────────────────
function getGlobalConfigPDA(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pigeon_house_config")],
    PROGRAM_ID
  )[0];
}

function getBondingCurvePDA(tokenMint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bonding_curve"), tokenMint.toBuffer()],
    PROGRAM_ID
  )[0];
}

function getFeeVaultPDA(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fee_vault")],
    PROGRAM_ID
  )[0];
}

function getQuoteAssetPDA(quoteMint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("quote_asset"), quoteMint.toBuffer()],
    PROGRAM_ID
  )[0];
}

function getBurnAccrualVaultPDA(quoteMint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("burn_accrual"), quoteMint.toBuffer()],
    PROGRAM_ID
  )[0];
}

function getReserveVaultPDA(quoteMint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("strategic_reserve"), quoteMint.toBuffer()],
    PROGRAM_ID
  )[0];
}

function getDiscriminator(name: string): Buffer {
  return Buffer.from(
    crypto.createHash("sha256").update(`global:${name}`).digest().subarray(0, 8)
  );
}

function resolveQuoteMint(symbol: string): PublicKey {
  const s = symbol.toUpperCase();
  if (s === "SOL" || s === "WSOL") return SOL_MINT;
  if (s === "SKR") return SKR_MINT;
  return PIGEON_MINT;
}

function getQuoteTokenProgram(quoteMint: PublicKey): PublicKey {
  // SOL uses legacy SPL token for wSOL
  if (quoteMint.equals(SOL_MINT)) return new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  return TOKEN_2022_PROGRAM_ID;
}

// ── Core Methods ───────────────────────────────────────────────

async function pigeonhouseCreateToken(
  agent: SolanaAgentKit,
  name: string,
  symbol: string,
  uri: string,
  quoteSymbol: string = "PIGEON",
  initialBuyAmount?: number
): Promise<{ mint: string; signature: string }> {
  const connection = new Connection(agent.connection.rpcEndpoint);
  const walletPubkey = agent.wallet.publicKey;
  const quoteMint = resolveQuoteMint(quoteSymbol);
  const quoteTokenProgram = getQuoteTokenProgram(quoteMint);

  const mint = Keypair.generate();
  const globalConfig = getGlobalConfigPDA();
  const bondingCurve = getBondingCurvePDA(mint.publicKey);
  const feeVault = getFeeVaultPDA();
  const quoteAsset = getQuoteAssetPDA(quoteMint);

  const bondingCurveTokenAta = getAssociatedTokenAddressSync(
    mint.publicKey, bondingCurve, true, TOKEN_2022_PROGRAM_ID
  );
  const bondingCurveQuoteAta = getAssociatedTokenAddressSync(
    quoteMint, bondingCurve, true, quoteTokenProgram
  );
  const feeVaultPigeonAta = getAssociatedTokenAddressSync(
    PIGEON_MINT, feeVault, true, TOKEN_2022_PROGRAM_ID
  );

  const nameBytes = Buffer.from(name, "utf8");
  const symbolBytes = Buffer.from(symbol, "utf8");
  const uriBytes = Buffer.from(uri, "utf8");

  const disc = getDiscriminator("create_token");
  const data = Buffer.alloc(
    8 + 4 + nameBytes.length + 4 + symbolBytes.length + 4 + uriBytes.length + 1 + 8
  );
  let offset = 0;
  disc.copy(data, offset); offset += 8;
  data.writeUInt32LE(nameBytes.length, offset); offset += 4;
  nameBytes.copy(data, offset); offset += nameBytes.length;
  data.writeUInt32LE(symbolBytes.length, offset); offset += 4;
  symbolBytes.copy(data, offset); offset += symbolBytes.length;
  data.writeUInt32LE(uriBytes.length, offset); offset += 4;
  uriBytes.copy(data, offset); offset += uriBytes.length;

  if (initialBuyAmount !== undefined && initialBuyAmount > 0) {
    data.writeUInt8(1, offset); offset += 1;
    data.writeBigUInt64LE(BigInt(Math.floor(initialBuyAmount * 1e6)), offset);
  } else {
    data.writeUInt8(0, offset);
  }

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: globalConfig, isSigner: false, isWritable: true },
      { pubkey: mint.publicKey, isSigner: true, isWritable: true },
      { pubkey: bondingCurve, isSigner: false, isWritable: true },
      { pubkey: bondingCurveTokenAta, isSigner: false, isWritable: true },
      { pubkey: bondingCurveQuoteAta, isSigner: false, isWritable: true },
      { pubkey: feeVault, isSigner: false, isWritable: true },
      { pubkey: feeVaultPigeonAta, isSigner: false, isWritable: true },
      { pubkey: quoteMint, isSigner: false, isWritable: false },
      { pubkey: quoteAsset, isSigner: false, isWritable: false },
      { pubkey: PIGEON_MINT, isSigner: false, isWritable: true },
      { pubkey: walletPubkey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  tx.feePayer = walletPubkey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  const signed = await agent.wallet.signTransaction(tx);
  signed.partialSign(mint);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(sig);

  return { mint: mint.publicKey.toBase58(), signature: sig };
}

async function pigeonhouseBuy(
  agent: SolanaAgentKit,
  tokenMint: string,
  quoteAmount: number,
  quoteSymbol: string = "PIGEON",
  slippageBps: number = 500,
  referrer?: string
): Promise<string> {
  const connection = new Connection(agent.connection.rpcEndpoint);
  const walletPubkey = agent.wallet.publicKey;
  const tokenMintPk = new PublicKey(tokenMint);
  const quoteMint = resolveQuoteMint(quoteSymbol);
  const quoteTokenProgram = getQuoteTokenProgram(quoteMint);
  const decimals = quoteMint.equals(SOL_MINT) ? 9 : 6;
  const amountIn = BigInt(Math.floor(quoteAmount * 10 ** decimals));

  const globalConfig = getGlobalConfigPDA();
  const bondingCurve = getBondingCurvePDA(tokenMintPk);
  const feeVault = getFeeVaultPDA();
  const quoteAsset = getQuoteAssetPDA(quoteMint);

  const bondingCurveTokenAta = getAssociatedTokenAddressSync(
    tokenMintPk, bondingCurve, true, TOKEN_2022_PROGRAM_ID
  );
  const bondingCurveQuoteAta = getAssociatedTokenAddressSync(
    quoteMint, bondingCurve, true, quoteTokenProgram
  );
  const userTokenAta = getAssociatedTokenAddressSync(
    tokenMintPk, walletPubkey, false, TOKEN_2022_PROGRAM_ID
  );
  const userQuoteAta = getAssociatedTokenAddressSync(
    quoteMint, walletPubkey, false, quoteTokenProgram
  );
  const feeVaultPigeonAta = getAssociatedTokenAddressSync(
    PIGEON_MINT, feeVault, true, TOKEN_2022_PROGRAM_ID
  );

  const disc = getDiscriminator("buy");
  const data = Buffer.alloc(24);
  disc.copy(data, 0);
  data.writeBigUInt64LE(amountIn, 8);
  data.writeBigUInt64LE(BigInt(1), 16); // minTokensOut: 1 (basic protection)

  const keys: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }> = [
    { pubkey: globalConfig, isSigner: false, isWritable: true },
    { pubkey: bondingCurve, isSigner: false, isWritable: true },
    { pubkey: bondingCurveTokenAta, isSigner: false, isWritable: true },
    { pubkey: bondingCurveQuoteAta, isSigner: false, isWritable: true },
    { pubkey: feeVault, isSigner: false, isWritable: true },
    { pubkey: feeVaultPigeonAta, isSigner: false, isWritable: true },
    { pubkey: userTokenAta, isSigner: false, isWritable: true },
    { pubkey: userQuoteAta, isSigner: false, isWritable: true },
    { pubkey: tokenMintPk, isSigner: false, isWritable: false },
    { pubkey: quoteMint, isSigner: false, isWritable: false },
    { pubkey: PIGEON_MINT, isSigner: false, isWritable: true },
    { pubkey: quoteAsset, isSigner: false, isWritable: false },
    { pubkey: walletPubkey, isSigner: true, isWritable: true },
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: quoteTokenProgram, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  // Non-PIGEON quotes: must include burn accrual + reserve vault ATAs
  if (!quoteMint.equals(PIGEON_MINT)) {
    const burnAccrualVault = getBurnAccrualVaultPDA(quoteMint);
    const reserveVault = getReserveVaultPDA(quoteMint);
    keys.push(
      { pubkey: getAssociatedTokenAddressSync(quoteMint, burnAccrualVault, true, quoteTokenProgram), isSigner: false, isWritable: true },
      { pubkey: getAssociatedTokenAddressSync(quoteMint, reserveVault, true, quoteTokenProgram), isSigner: false, isWritable: true }
    );
  }

  if (referrer) {
    const referrerPk = new PublicKey(referrer);
    keys.push({
      pubkey: getAssociatedTokenAddressSync(quoteMint, referrerPk, false, quoteTokenProgram),
      isSigner: false, isWritable: true,
    });
  }

  const ix = new TransactionInstruction({ programId: PROGRAM_ID, keys, data });
  const tx = new Transaction().add(ix);
  tx.feePayer = walletPubkey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  const signed = await agent.wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(sig);
  return sig;
}

async function pigeonhouseSell(
  agent: SolanaAgentKit,
  tokenMint: string,
  tokenAmount: number,
  quoteSymbol: string = "PIGEON",
  referrer?: string
): Promise<string> {
  const connection = new Connection(agent.connection.rpcEndpoint);
  const walletPubkey = agent.wallet.publicKey;
  const tokenMintPk = new PublicKey(tokenMint);
  const quoteMint = resolveQuoteMint(quoteSymbol);
  const quoteTokenProgram = getQuoteTokenProgram(quoteMint);
  const amountIn = BigInt(Math.floor(tokenAmount * 1e6)); // tokens always 6 decimals

  const globalConfig = getGlobalConfigPDA();
  const bondingCurve = getBondingCurvePDA(tokenMintPk);
  const feeVault = getFeeVaultPDA();
  const quoteAsset = getQuoteAssetPDA(quoteMint);

  const bondingCurveTokenAta = getAssociatedTokenAddressSync(
    tokenMintPk, bondingCurve, true, TOKEN_2022_PROGRAM_ID
  );
  const bondingCurveQuoteAta = getAssociatedTokenAddressSync(
    quoteMint, bondingCurve, true, quoteTokenProgram
  );
  const userTokenAta = getAssociatedTokenAddressSync(
    tokenMintPk, walletPubkey, false, TOKEN_2022_PROGRAM_ID
  );
  const userQuoteAta = getAssociatedTokenAddressSync(
    quoteMint, walletPubkey, false, quoteTokenProgram
  );
  const feeVaultPigeonAta = getAssociatedTokenAddressSync(
    PIGEON_MINT, feeVault, true, TOKEN_2022_PROGRAM_ID
  );

  const disc = getDiscriminator("sell");
  const data = Buffer.alloc(24);
  disc.copy(data, 0);
  data.writeBigUInt64LE(amountIn, 8);
  data.writeBigUInt64LE(BigInt(0), 16); // minQuoteOut

  // Sell has different account layout: no SystemProgram, no ASSOCIATED_TOKEN_PROGRAM_ID
  const keys: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }> = [
    { pubkey: globalConfig, isSigner: false, isWritable: true },
    { pubkey: bondingCurve, isSigner: false, isWritable: true },
    { pubkey: bondingCurveTokenAta, isSigner: false, isWritable: true },
    { pubkey: bondingCurveQuoteAta, isSigner: false, isWritable: true },
    { pubkey: feeVault, isSigner: false, isWritable: true },
    { pubkey: feeVaultPigeonAta, isSigner: false, isWritable: true },
    { pubkey: userTokenAta, isSigner: false, isWritable: true },
    { pubkey: userQuoteAta, isSigner: false, isWritable: true },
    { pubkey: tokenMintPk, isSigner: false, isWritable: false },
    { pubkey: quoteMint, isSigner: false, isWritable: false },
    { pubkey: PIGEON_MINT, isSigner: false, isWritable: true },
    { pubkey: quoteAsset, isSigner: false, isWritable: false },
    { pubkey: walletPubkey, isSigner: true, isWritable: true },
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: quoteTokenProgram, isSigner: false, isWritable: false },
  ];

  if (!quoteMint.equals(PIGEON_MINT)) {
    const burnAccrualVault = getBurnAccrualVaultPDA(quoteMint);
    const reserveVault = getReserveVaultPDA(quoteMint);
    keys.push(
      { pubkey: getAssociatedTokenAddressSync(quoteMint, burnAccrualVault, true, quoteTokenProgram), isSigner: false, isWritable: true },
      { pubkey: getAssociatedTokenAddressSync(quoteMint, reserveVault, true, quoteTokenProgram), isSigner: false, isWritable: true }
    );
  }

  if (referrer) {
    const referrerPk = new PublicKey(referrer);
    keys.push({
      pubkey: getAssociatedTokenAddressSync(quoteMint, referrerPk, false, quoteTokenProgram),
      isSigner: false, isWritable: true,
    });
  }

  const ix = new TransactionInstruction({ programId: PROGRAM_ID, keys, data });
  const tx = new Transaction().add(ix);
  tx.feePayer = walletPubkey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  const signed = await agent.wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(sig);
  return sig;
}

async function pigeonhouseGetTokens(
  _agent: SolanaAgentKit
): Promise<any[]> {
  const res = await fetch(`${API_BASE}/api/platform`);
  const data = await res.json();
  return data.tokens || [];
}

async function pigeonhouseGetTokenInfo(
  _agent: SolanaAgentKit,
  tokenMint: string
): Promise<any> {
  const res = await fetch(`${API_BASE}/api/token/${tokenMint}`);
  return res.json();
}

async function pigeonhouseGetBurnStats(
  _agent: SolanaAgentKit
): Promise<{ totalBurned: number; tokensLaunched: number; graduated: number }> {
  const res = await fetch(`${API_BASE}/api/defillama`);
  const data = await res.json();
  return {
    totalBurned: data.pigeonBurned || 0,
    tokensLaunched: data.tokensLaunched || 0,
    graduated: data.graduated || 0,
  };
}

async function pigeonhouseGetTrades(
  _agent: SolanaAgentKit,
  tokenMint: string,
  limit: number = 30
): Promise<any[]> {
  const res = await fetch(`${API_BASE}/api/trades/${tokenMint}?limit=${limit}`);
  const data = await res.json();
  return data.trades || [];
}

// ── Plugin Definition ──────────────────────────────────────────

const PigeonHousePlugin: Plugin = {
  name: "pigeonhouse",
  methods: {
    pigeonhouseCreateToken,
    pigeonhouseBuy,
    pigeonhouseSell,
    pigeonhouseGetTokens,
    pigeonhouseGetTokenInfo,
    pigeonhouseGetBurnStats,
    pigeonhouseGetTrades,
  },
  actions: [
    {
      name: "PIGEONHOUSE_CREATE_TOKEN",
      description:
        "Create a new token on PigeonHouse with a bonding curve. Every trade on PigeonHouse burns PIGEON tokens. The token uses Token-2022 standard with 1B supply and 6 decimals.",
      similes: [
        "launch token on pigeonhouse",
        "create pigeonhouse token",
        "deploy bonding curve token",
        "launch token that burns pigeon",
      ],
      examples: [
        {
          input: { text: "Create a token called 'My Token' with symbol MTK on PigeonHouse" },
          output: { result: "Token created: mint address Abc123..." },
          explanation: "Creates a new token with a bonding curve on PigeonHouse",
        },
      ],
      schema: z.object({
        name: z.string().describe("Token name"),
        symbol: z.string().describe("Token symbol (ticker)"),
        uri: z.string().describe("Metadata URI (Arweave/IPFS link with name, symbol, image)"),
        quoteSymbol: z.string().default("PIGEON").describe("Quote asset: PIGEON, SOL, or SKR"),
        initialBuyAmount: z.number().optional().describe("Optional initial buy amount in quote asset"),
      }),
      handler: async (agent, input) => {
        const { name, symbol, uri, quoteSymbol, initialBuyAmount } = input as any;
        const result = await pigeonhouseCreateToken(agent, name, symbol, uri, quoteSymbol, initialBuyAmount);
        return { status: "success", ...result };
      },
    },
    {
      name: "PIGEONHOUSE_BUY",
      description:
        "Buy tokens on a PigeonHouse bonding curve. Specify the amount of quote asset (PIGEON/SOL/SKR) to spend. 2% fee applies: 1.5% burns PIGEON (on PIGEON pairs) or goes to reserves (SOL/SKR pairs), 0.5% to treasury.",
      similes: [
        "buy on pigeonhouse",
        "buy pigeonhouse token",
        "purchase token on bonding curve",
        "buy token and burn pigeon",
      ],
      examples: [
        {
          input: { text: "Buy 500 PIGEON worth of token Abc123 on PigeonHouse" },
          output: { result: "Bought tokens, tx: 5xY..." },
          explanation: "Buys tokens by spending 500 PIGEON on the bonding curve",
        },
      ],
      schema: z.object({
        tokenMint: z.string().describe("Token mint address to buy"),
        quoteAmount: z.number().describe("Amount of quote asset to spend (human readable, e.g. 500 for 500 PIGEON)"),
        quoteSymbol: z.string().default("PIGEON").describe("Quote asset: PIGEON, SOL, or SKR"),
        slippageBps: z.number().default(500).describe("Slippage tolerance in basis points (500 = 5%)"),
        referrer: z.string().optional().describe("Optional referrer wallet address for 0.5% fee share"),
      }),
      handler: async (agent, input) => {
        const { tokenMint, quoteAmount, quoteSymbol, slippageBps, referrer } = input as any;
        const sig = await pigeonhouseBuy(agent, tokenMint, quoteAmount, quoteSymbol, slippageBps, referrer);
        return { status: "success", signature: sig };
      },
    },
    {
      name: "PIGEONHOUSE_SELL",
      description:
        "Sell tokens back to a PigeonHouse bonding curve for quote asset. 2% fee applies with PIGEON burn on PIGEON-paired tokens.",
      similes: [
        "sell on pigeonhouse",
        "sell pigeonhouse token",
        "sell token on bonding curve",
      ],
      examples: [
        {
          input: { text: "Sell 10000 tokens of Abc123 on PigeonHouse" },
          output: { result: "Sold tokens, received PIGEON, tx: 7zK..." },
          explanation: "Sells tokens back to the bonding curve",
        },
      ],
      schema: z.object({
        tokenMint: z.string().describe("Token mint address to sell"),
        tokenAmount: z.number().describe("Amount of tokens to sell (human readable, e.g. 10000)"),
        quoteSymbol: z.string().default("PIGEON").describe("Quote asset: PIGEON, SOL, or SKR"),
        referrer: z.string().optional().describe("Optional referrer wallet address"),
      }),
      handler: async (agent, input) => {
        const { tokenMint, tokenAmount, quoteSymbol, referrer } = input as any;
        const sig = await pigeonhouseSell(agent, tokenMint, tokenAmount, quoteSymbol, referrer);
        return { status: "success", signature: sig };
      },
    },
    {
      name: "PIGEONHOUSE_GET_TOKENS",
      description: "Get all active tokens on PigeonHouse with bonding curve data, prices, and market caps.",
      similes: [
        "list pigeonhouse tokens",
        "show pigeonhouse board",
        "what tokens are on pigeonhouse",
      ],
      examples: [
        {
          input: { text: "Show me all tokens on PigeonHouse" },
          output: { result: "[{name: 'LOW IQ', symbol: 'LOWIQ', ...}]" },
          explanation: "Lists all active tokens on PigeonHouse",
        },
      ],
      schema: z.object({}),
      handler: async (agent) => {
        const tokens = await pigeonhouseGetTokens(agent);
        return { status: "success", tokens };
      },
    },
    {
      name: "PIGEONHOUSE_GET_TOKEN_INFO",
      description: "Get detailed information about a specific token on PigeonHouse including bonding curve state, price, and creator.",
      similes: [
        "pigeonhouse token info",
        "token details on pigeonhouse",
        "check pigeonhouse token",
      ],
      examples: [
        {
          input: { text: "Get info about token DRQwGjE... on PigeonHouse" },
          output: { result: "{name: 'LOW IQ', virtualReserves: ...}" },
          explanation: "Gets detailed bonding curve state for a token",
        },
      ],
      schema: z.object({
        tokenMint: z.string().describe("Token mint address"),
      }),
      handler: async (agent, input) => {
        const { tokenMint } = input as any;
        const info = await pigeonhouseGetTokenInfo(agent, tokenMint);
        return { status: "success", ...info };
      },
    },
    {
      name: "PIGEONHOUSE_GET_BURN_STATS",
      description: "Get PigeonHouse platform burn statistics: total PIGEON burned, tokens launched, graduated tokens.",
      similes: [
        "pigeonhouse burn stats",
        "how much pigeon burned",
        "pigeonhouse statistics",
      ],
      examples: [
        {
          input: { text: "How much PIGEON has been burned on PigeonHouse?" },
          output: { result: "{totalBurned: 4334, tokensLaunched: 62}" },
          explanation: "Shows total PIGEON burned and platform statistics",
        },
      ],
      schema: z.object({}),
      handler: async (agent) => {
        const stats = await pigeonhouseGetBurnStats(agent);
        return { status: "success", ...stats };
      },
    },
    {
      name: "PIGEONHOUSE_GET_TRADES",
      description: "Get recent trades for a token on PigeonHouse with price, amount, direction, and trader address.",
      similes: [
        "pigeonhouse trades",
        "recent trades on pigeonhouse",
        "token trade history",
      ],
      examples: [
        {
          input: { text: "Show recent trades for token DRQwGjE..." },
          output: { result: "[{type: 'buy', price: 0.001, ...}]" },
          explanation: "Lists recent trades for a PigeonHouse token",
        },
      ],
      schema: z.object({
        tokenMint: z.string().describe("Token mint address"),
        limit: z.number().default(30).describe("Number of trades to return (max 100)"),
      }),
      handler: async (agent, input) => {
        const { tokenMint, limit } = input as any;
        const trades = await pigeonhouseGetTrades(agent, tokenMint, limit);
        return { status: "success", trades };
      },
    },
  ],
  initialize: function () {
    Object.entries(this.methods).forEach(([methodName, method]) => {
      if (typeof method === "function") {
        this.methods[methodName] = method;
      }
    });
  },
};

export default PigeonHousePlugin;
export {
  pigeonhouseCreateToken,
  pigeonhouseBuy,
  pigeonhouseSell,
  pigeonhouseGetTokens,
  pigeonhouseGetTokenInfo,
  pigeonhouseGetBurnStats,
  pigeonhouseGetTrades,
  PROGRAM_ID,
  PIGEON_MINT,
  SOL_MINT,
  SKR_MINT,
};
