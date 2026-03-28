import { EmbeddedWallet } from '@meshsdk/wallet';
import { loadConfig } from '../lib/config.ts';
import { loadCardanoWallet } from '../lib/storage.ts';

interface DustGenerationStatus {
  cardanoRewardAddress: string;
  dustAddress: string | null;
  registered: boolean;
  nightBalance: string;
  generationRate: string;
  currentCapacity: string;
}

interface GraphQLResponse {
  data?: { dustGenerationStatus: DustGenerationStatus[] };
  errors?: { message: string }[];
}

export async function checkRegistration(walletName: string, accountIndex: number) {
  const config = loadConfig();
  const walletFile = loadCardanoWallet(walletName);

  const embedded = new EmbeddedWallet({
    networkId: config.networkId,
    key: { type: 'mnemonic', words: walletFile.mnemonic },
  });

  const account = embedded.getAccount(accountIndex, 0);
  const stakeAddress = account.rewardAddressBech32;

  console.log(`Checking DUST registration for wallet "${walletName}" (account ${accountIndex})...`);
  console.log(`  Stake address: ${stakeAddress}`);

  const indexerUrl = `https://indexer.${config.midnightNetworkId}.midnight.network/api/v3/graphql`;

  const response = await fetch(indexerUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: `query { dustGenerationStatus(cardanoRewardAddresses: ["${stakeAddress}"]) { cardanoRewardAddress dustAddress registered nightBalance generationRate currentCapacity } }`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Indexer request failed: ${response.status} ${response.statusText}`);
  }

  const result: GraphQLResponse = await response.json();

  if (result.errors?.length) {
    throw new Error(`GraphQL error: ${result.errors[0].message}`);
  }

  const statuses = result.data?.dustGenerationStatus ?? [];

  if (statuses.length === 0) {
    console.log('\n  Not registered.');
    return;
  }

  const s = statuses[0];
  console.log(`\n  Registered:        ${s.registered}`);
  console.log(`  DUST address:      ${s.dustAddress ?? 'N/A'}`);
  console.log(`  NIGHT balance:     ${s.nightBalance}`);
  console.log(`  Generation rate:   ${s.generationRate}`);
  console.log(`  Current capacity:  ${s.currentCapacity}`);
}
