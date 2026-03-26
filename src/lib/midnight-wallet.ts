/**
 * Midnight wallet facade builder and balance queries.
 *
 * Adapted from midnight-tps/faucet.ts — builds a full WalletFacade
 * (shielded + unshielded + dust) and syncs with the Midnight indexer
 * to query balances via RxJS observables.
 *
 * Required infrastructure:
 *   - Midnight indexer (HTTP + WS)
 *   - Midnight node RPC
 *   - Proof server (local, port 6300)
 */

import { Buffer } from 'node:buffer';
import * as Rx from 'rxjs';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';

// ---------- Types ----------

export interface MidnightNetworkConfig {
  indexer: string;
  indexerWS: string;
  node: string;
  proofServer: string;
}

export interface MidnightBalanceResult {
  name: string;
  unshieldedAddress: string;
  dustAddress: string;
  shieldedTokens: { tokenId: string; balance: bigint }[];
  unshieldedTokens: { tokenId: string; balance: bigint }[];
  dustBalance: bigint;
  shieldedUtxos: number;
  unshieldedUtxos: number;
  dustUtxos: number;
  error?: string;
}

// ---------- Network URLs ----------

const MIDNIGHT_INDEXER_URLS: Record<string, { http: string; ws: string }> = {
  preview: {
    http: 'https://indexer.preview.midnight.network/api/v3/graphql',
    ws: 'wss://indexer.preview.midnight.network/api/v3/graphql/ws',
  },
  preprod: {
    http: 'https://indexer.preprod.midnight.network/api/v3/graphql',
    ws: 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws',
  },
  mainnet: {
    http: 'https://indexer.mainnet.midnight.network/api/v3/graphql',
    ws: 'wss://indexer.mainnet.midnight.network/api/v3/graphql/ws',
  },
};

const MIDNIGHT_NODE_URLS: Record<string, string> = {
  preview: 'https://rpc.preview.midnight.network',
  preprod: 'https://rpc.preprod.midnight.network',
  mainnet: 'https://rpc.mainnet.midnight.network',
};

export function getMidnightNetworkConfig(networkId: string): MidnightNetworkConfig {
  const indexerUrls = MIDNIGHT_INDEXER_URLS[networkId];
  const nodeUrl = MIDNIGHT_NODE_URLS[networkId];

  if (!indexerUrls || !nodeUrl) {
    throw new Error(`Unknown Midnight network: "${networkId}". Valid: preview, preprod, mainnet`);
  }

  return {
    indexer: process.env.MIDNIGHT_INDEXER_HTTP ?? indexerUrls.http,
    indexerWS: process.env.MIDNIGHT_INDEXER_WS ?? indexerUrls.ws,
    node: process.env.MIDNIGHT_NODE_HTTP ?? nodeUrl,
    proofServer: process.env.MIDNIGHT_PROOF_SERVER_URL ?? 'http://127.0.0.1:6300',
  };
}

// ---------- Key Derivation ----------

type DerivationRole = typeof Roles.Zswap | typeof Roles.Dust | typeof Roles.NightExternal;

function deriveSeedForRole(seed: string, role: DerivationRole): Uint8Array {
  const seedBuffer = Buffer.from(seed, 'hex');
  const hdWalletResult = HDWallet.fromSeed(seedBuffer);

  if (hdWalletResult.type !== 'seedOk') {
    throw new Error(`Failed to create HD wallet: ${hdWalletResult.type}`);
  }

  const derivationResult = hdWalletResult.hdWallet
    .selectAccount(0)
    .selectRole(role)
    .deriveKeyAt(0);

  if (derivationResult.type === 'keyOutOfBounds') {
    throw new Error(`Key derivation out of bounds for role: ${role}`);
  }

  return Buffer.from(derivationResult.key);
}

// ---------- Helpers ----------

function sumUnshieldedBalances(
  balances: Map<string, bigint> | Record<string, bigint> | undefined,
): bigint {
  if (!balances) return 0n;
  if (balances instanceof Map) {
    return Array.from(balances.values()).reduce((acc, v) => acc + (v ?? 0n), 0n);
  }
  return Object.values(balances).reduce((acc: bigint, v) => acc + (v ?? 0n), 0n);
}

const WALLET_SYNC_THROTTLE_MS = 10_000;
const WALLET_SYNC_TIMEOUT_MS = 300_000; // 5 minutes

// ---------- Main Balance Query ----------

/**
 * Build a Midnight WalletFacade, sync with the indexer, and return balances.
 *
 * This is a heavyweight operation:
 *   1. Derives HD keys (zswap, dust, unshielded) from the seed
 *   2. Connects to the Midnight indexer via HTTP + WebSocket
 *   3. Waits for shielded, unshielded, and dust wallets to sync
 *   4. Reads balances from the synced state
 *   5. Shuts down the wallet facade
 */
export async function fetchMidnightBalance(
  walletName: string,
  seed: string,
  midnightNetworkId: string,
  timeoutMs?: number,
): Promise<MidnightBalanceResult> {
  const result: MidnightBalanceResult = {
    name: walletName,
    unshieldedAddress: '',
    dustAddress: '',
    shieldedTokens: [],
    unshieldedTokens: [],
    dustBalance: 0n,
    shieldedUtxos: 0,
    unshieldedUtxos: 0,
    dustUtxos: 0,
  };

  // Dynamic imports for ESM-only Midnight SDK packages
  const { WalletFacade } = await import('@midnight-ntwrk/wallet-sdk-facade');
  const { ShieldedWallet } = await import('@midnight-ntwrk/wallet-sdk-shielded');
  const { DustWallet } = await import('@midnight-ntwrk/wallet-sdk-dust-wallet');
  const {
    createKeystore,
    InMemoryTransactionHistoryStorage,
    PublicKey,
    UnshieldedWallet,
  } = await import('@midnight-ntwrk/wallet-sdk-unshielded-wallet');
  const { makeServerProvingService } = await import(
    '@midnight-ntwrk/wallet-sdk-capabilities/proving'
  );
  const { LedgerParameters, DustSecretKey, ZswapSecretKeys } = await import(
    '@midnight-ntwrk/ledger-v8'
  );
  const { MidnightBech32m } = await import('@midnight-ntwrk/wallet-sdk-address-format');

  // Set network ID globally
  setNetworkId(midnightNetworkId as any);

  const networkConfig = getMidnightNetworkConfig(midnightNetworkId);
  const syncTimeout = timeoutMs ?? WALLET_SYNC_TIMEOUT_MS;

  // Derive role-specific seeds
  const shieldedSeed = deriveSeedForRole(seed, Roles.Zswap);
  const dustSeed = deriveSeedForRole(seed, Roles.Dust);
  const unshieldedSeed = deriveSeedForRole(seed, Roles.NightExternal);

  // Wallet configuration
  const walletConfig = {
    indexerClientConnection: {
      indexerHttpUrl: networkConfig.indexer,
      indexerWsUrl: networkConfig.indexerWS,
    },
    relayURL: new URL(networkConfig.node.replace('http', 'ws')),
    networkId: midnightNetworkId as any,
    costParameters: {
      additionalFeeOverhead: 300_000_000_000_000n,
      feeBlocksMargin: 5,
    },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
  };

  // Create keystore and public key for unshielded wallet
  const unshieldedKeystore = createKeystore(unshieldedSeed, midnightNetworkId as any);
  const unshieldedAddress = unshieldedKeystore.getBech32Address().asString();
  const unshieldedPublicKey = PublicKey.fromKeyStore(unshieldedKeystore);
  const dustParameters = LedgerParameters.initialParameters().dust;

  result.unshieldedAddress = unshieldedAddress;

  let wallet: any = null;

  try {
    // Build wallet facade
    console.log(`[${walletName}] Connecting to Midnight indexer...`);
    console.log(`  Indexer: ${networkConfig.indexer}`);
    console.log(`  Node:    ${networkConfig.node}`);

    wallet = await WalletFacade.init({
      configuration: walletConfig,
      shielded: (config: any) => ShieldedWallet(config).startWithSeed(shieldedSeed),
      unshielded: (config: any) =>
        UnshieldedWallet(config).startWithPublicKey(unshieldedPublicKey),
      dust: (config: any) => DustWallet(config).startWithSeed(dustSeed, dustParameters),
      provingService: () =>
        makeServerProvingService({
          provingServerUrl: new URL(networkConfig.proofServer),
        }),
    });

    // Start wallet sync
    const walletZswapSecretKeys = ZswapSecretKeys.fromSeed(shieldedSeed);
    const walletDustSecretKey = DustSecretKey.fromSeed(dustSeed);
    await wallet.start(walletZswapSecretKeys, walletDustSecretKey);

    // Get dust address
    const dustState: any = await Rx.firstValueFrom((wallet as any).dust.state);
    result.dustAddress = MidnightBech32m.encode(midnightNetworkId as any, dustState.address).asString();

    console.log(`  Unshielded: ${unshieldedAddress}`);
    console.log(`  Dust:       ${result.dustAddress}`);
    console.log(`[${walletName}] Syncing wallet state...`);

    // Wait for all wallet components to sync
    const state: any = await Rx.firstValueFrom(
      wallet.state().pipe(
        Rx.throttleTime(WALLET_SYNC_THROTTLE_MS),
        Rx.tap((s: any) => {
          const isSynced = s.isSynced ?? false;
          const shieldedSynced =
            s.shielded?.state?.progress?.isStrictlyComplete?.() || isSynced;
          const dustSynced =
            s.dust?.state?.progress?.isStrictlyComplete?.() || isSynced;
          const unshieldedSynced = s.unshielded?.syncProgress?.synced ?? isSynced;
          const unshieldedBal = sumUnshieldedBalances(s.unshielded?.balances);
          console.log(
            `[${walletName}] sync: shielded=${shieldedSynced}, unshielded=${unshieldedSynced}, dust=${dustSynced} | unshieldedBal=${unshieldedBal}`,
          );
        }),
        Rx.filter((s: any) => {
          const isSynced = s.isSynced ?? false;
          const shieldedSynced =
            s.shielded?.state?.progress?.isStrictlyComplete?.() || isSynced;
          const dustSynced =
            s.dust?.state?.progress?.isStrictlyComplete?.() || isSynced;
          const unshieldedSynced = s.unshielded?.syncProgress?.synced ?? isSynced;
          return shieldedSynced && dustSynced && unshieldedSynced;
        }),
        Rx.timeout({
          each: syncTimeout,
          with: () =>
            Rx.throwError(() => new Error(`Wallet sync timeout after ${syncTimeout}ms`)),
        }),
      ),
    );

    console.log(`[${walletName}] Sync complete, reading balances...`);

    // --- Shielded tokens ---
    try {
      const shieldedBalances = state.shielded?.balances as Record<string, bigint> | undefined;
      if (shieldedBalances) {
        for (const [tokenId, balance] of Object.entries(shieldedBalances)) {
          if (balance > 0n) {
            result.shieldedTokens.push({ tokenId, balance });
          }
        }
      }
      const shieldedState: any = await Rx.firstValueFrom((wallet as any).shielded.state);
      if (shieldedState.availableCoins) result.shieldedUtxos = shieldedState.availableCoins.length;
    } catch (_e) {
      /* ignore */
    }

    // --- Unshielded tokens ---
    try {
      const unshieldedBalances = state.unshielded?.balances as
        | Map<string, bigint>
        | Record<string, bigint>
        | undefined;
      if (unshieldedBalances) {
        const entries =
          unshieldedBalances instanceof Map
            ? Array.from(unshieldedBalances.entries())
            : Object.entries(unshieldedBalances);
        for (const [tokenId, balance] of entries) {
          if (balance > 0n) {
            result.unshieldedTokens.push({ tokenId, balance });
          }
        }
      }
      const unshieldedState: any = await Rx.firstValueFrom(
        (wallet as any).unshielded.state,
      );
      if (unshieldedState.availableCoins)
        result.unshieldedUtxos = unshieldedState.availableCoins.length;
    } catch (_e) {
      /* ignore */
    }

    // --- Dust balance ---
    try {
      const dustStateSync: any = await Rx.firstValueFrom((wallet as any).dust.state);
      if (typeof dustStateSync.balance === 'function') {
        result.dustBalance = dustStateSync.balance(new Date());
      } else if (typeof dustStateSync.walletBalance === 'function') {
        result.dustBalance = dustStateSync.walletBalance(new Date());
      }
      if (dustStateSync.availableCoins) result.dustUtxos = dustStateSync.availableCoins.length;
    } catch (_e) {
      /* ignore */
    }

    console.log(`[${walletName}] Done.`);
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    console.error(`[${walletName}] Error: ${result.error}`);
  } finally {
    if (wallet) {
      try {
        await wallet.stop();
      } catch (_e) {
        /* ignore */
      }
    }
  }

  return result;
}
