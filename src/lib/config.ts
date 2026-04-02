import 'dotenv/config';

export type Network = 'Preview' | 'Preprod' | 'Mainnet';

export interface CliConfig {
  network: Network;
  networkId: 0 | 1; // 0 = testnet, 1 = mainnet
  blockfrostApiKey: string;
  blockfrostUrl: string;
  cnightPolicyId: string;
  cnightEncodedName: string;
  cnightUnit: string;
  midnightNetworkId: string; // 'preview' | 'preprod' | 'mainnet'
}

const BLOCKFROST_URLS: Record<Network, string> = {
  Preview: 'https://cardano-preview.blockfrost.io/api/v0',
  Preprod: 'https://cardano-preprod.blockfrost.io/api/v0',
  Mainnet: 'https://cardano-mainnet.blockfrost.io/api/v0',
};

const MIDNIGHT_NETWORK_MAP: Record<Network, string> = {
  Preview: 'preview',
  Preprod: 'preprod',
  Mainnet: 'mainnet',
};

const CNIGHT_POLICY_IDS: Record<Network, string> = {
  Preview: 'd2dbff622e509dda256fedbd31ef6e9fd98ed49ad91d5c0e07f68af1',
  Preprod: 'd2dbff622e509dda256fedbd31ef6e9fd98ed49ad91d5c0e07f68af1',
  Mainnet: '0691b2fecca1ac4f53cb6dfb00b7013e561d1f34403b957cbb5af1fa',
};

const CNIGHT_ENCODED_NAMES: Record<Network, string> = {
  Preview: '', // empty asset name on Preview testnet
  Preprod: '', // empty asset name on Preprod testnet
  Mainnet: '4e49474854', // "NIGHT" in hex
};

export function loadConfig(): CliConfig {
  const network = process.env.NETWORK as Network | undefined;
  if (!network || !['Preview', 'Preprod', 'Mainnet'].includes(network)) {
    throw new Error(
      `NETWORK env var is required and must be one of: Preview, Preprod, Mainnet. Got: "${network ?? '(unset)'}"`
    );
  }

  const blockfrostApiKey = process.env.BLOCKFROST_API_KEY;
  if (!blockfrostApiKey) {
    throw new Error('BLOCKFROST_API_KEY env var is required. Get a free key at https://blockfrost.io/');
  }

  const cnightPolicyId = CNIGHT_POLICY_IDS[network];
  if (!cnightPolicyId) {
    throw new Error(`cNIGHT policy ID is not configured for network: ${network}`);
  }
  const cnightEncodedName = CNIGHT_ENCODED_NAMES[network];

  return {
    network,
    networkId: network === 'Mainnet' ? 1 : 0,
    blockfrostApiKey,
    blockfrostUrl: BLOCKFROST_URLS[network],
    cnightPolicyId,
    cnightEncodedName,
    cnightUnit: cnightPolicyId + cnightEncodedName,
    midnightNetworkId: MIDNIGHT_NETWORK_MAP[network],
  };
}

/** Minimum lovelace for the registration UTxO */
export const LOVELACE_FOR_REGISTRATION = 1_586_080n;

/** Minimum ADA the wallet needs (includes fees + buffer) */
export const MIN_ADA_FOR_REGISTRATION = 2.5;
