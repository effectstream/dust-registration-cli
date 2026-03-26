import { MeshWallet } from '@meshsdk/wallet';
import { BlockfrostProvider } from '@meshsdk/core';
import { loadConfig } from '../lib/config.ts';
import { saveCardanoWallet } from '../lib/storage.ts';

export async function createCardanoWallet(name: string) {
  const config = loadConfig();

  console.log(`Creating Cardano wallet "${name}" on ${config.network}...`);

  // Generate 24-word mnemonic
  const mnemonic = MeshWallet.brew() as string[];
  console.log(`Generated 24-word mnemonic.`);

  // Create wallet to derive the address
  const provider = new BlockfrostProvider(config.blockfrostApiKey);
  const wallet = new MeshWallet({
    networkId: config.networkId,
    fetcher: provider,
    submitter: provider,
    key: {
      type: 'mnemonic',
      words: mnemonic,
    },
  });

  const addresses = wallet.getAddresses();
  const address = addresses.baseAddressBech32 ?? (await wallet.getChangeAddress());
  const rewardAddress = addresses.rewardAddressBech32 ?? null;

  // Save to file
  const filePath = saveCardanoWallet({
    name,
    mnemonic,
    address,
    rewardAddress,
    network: config.network,
    createdAt: new Date().toISOString(),
  });

  console.log(`\nWallet created successfully!`);
  console.log(`  Name:           ${name}`);
  console.log(`  Network:        ${config.network}`);
  console.log(`  Address:        ${address}`);
  console.log(`  Reward Address: ${rewardAddress ?? 'N/A'}`);
  console.log(`  Saved to:       ${filePath}`);
  console.log(`\nMnemonic (KEEP SECRET):`);
  console.log(`  ${mnemonic.join(' ')}`);
}
