import { MeshWallet } from '@meshsdk/wallet';
import { BlockfrostProvider } from '@meshsdk/core';
import { loadConfig } from '../lib/config.ts';
import { saveCardanoWallet } from '../lib/storage.ts';

export async function importCardanoWallet(name: string, mnemonicStr: string) {
  const config = loadConfig();

  const mnemonic = mnemonicStr.trim().split(/\s+/);
  if (mnemonic.length !== 24) {
    throw new Error(`Expected 24 mnemonic words, got ${mnemonic.length}`);
  }

  console.log(`Importing Cardano wallet "${name}" on ${config.network}...`);

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

  const filePath = saveCardanoWallet({
    name,
    mnemonic,
    address,
    rewardAddress,
    network: config.network,
    createdAt: new Date().toISOString(),
  });

  console.log(`\nWallet imported successfully!`);
  console.log(`  Name:           ${name}`);
  console.log(`  Network:        ${config.network}`);
  console.log(`  Address:        ${address}`);
  console.log(`  Reward Address: ${rewardAddress ?? 'N/A'}`);
  console.log(`  Saved to:       ${filePath}`);
}
