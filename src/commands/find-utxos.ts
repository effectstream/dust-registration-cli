import { MeshWallet } from '@meshsdk/wallet';
import { BlockfrostProvider } from '@meshsdk/core';
import { loadConfig } from '../lib/config.ts';
import { loadCardanoWallet, saveTempFile } from '../lib/storage.ts';

export async function findUtxos(walletName: string) {
  const config = loadConfig();
  const walletFile = loadCardanoWallet(walletName);

  console.log(`Querying UTxOs for wallet "${walletName}" on ${config.network}...`);
  console.log(`  Address: ${walletFile.address}`);

  // Reconstruct wallet from mnemonic
  const provider = new BlockfrostProvider(config.blockfrostApiKey);
  const wallet = new MeshWallet({
    networkId: config.networkId,
    fetcher: provider,
    submitter: provider,
    key: {
      type: 'mnemonic',
      words: walletFile.mnemonic,
    },
  });

  const utxos = await wallet.getUtxos();

  if (utxos.length === 0) {
    console.log('\nNo UTxOs found. Wallet is empty.');
    console.log('Fund it via the Cardano faucet for Preview testnet.');
    return;
  }

  // Categorize UTxOs
  let totalLovelace = 0n;
  let totalCnight = 0n;
  const cnightUtxoIndices: number[] = [];
  const adaOnlyIndices: number[] = [];

  for (let i = 0; i < utxos.length; i++) {
    const utxo = utxos[i];
    const lovelace = utxo.output.amount.find((a: any) => a.unit === 'lovelace');
    if (lovelace) totalLovelace += BigInt(lovelace.quantity);

    const cnight = utxo.output.amount.find((a: any) => a.unit === config.cnightUnit);
    if (cnight) {
      totalCnight += BigInt(cnight.quantity);
      cnightUtxoIndices.push(i);
    }

    if (utxo.output.amount.length === 1 && utxo.output.amount[0].unit === 'lovelace') {
      adaOnlyIndices.push(i);
    }
  }

  console.log(`\nFound ${utxos.length} UTxO(s):`);
  console.log(`  Total ADA:    ${Number(totalLovelace) / 1_000_000} ADA`);
  console.log(`  Total cNIGHT: ${totalCnight.toString()}`);
  console.log(`  cNIGHT UTxOs: ${cnightUtxoIndices.length}`);
  console.log(`  Pure ADA UTxOs (collateral candidates): ${adaOnlyIndices.length}`);

  console.log('\nUTxO Details:');
  for (let i = 0; i < utxos.length; i++) {
    const utxo = utxos[i];
    const isCnight = cnightUtxoIndices.includes(i);
    const marker = isCnight ? ' [cNIGHT]' : '';
    console.log(`  ${utxo.input.txHash}#${utxo.input.outputIndex}${marker}`);
    for (const asset of utxo.output.amount) {
      if (asset.unit === 'lovelace') {
        console.log(`    ${Number(BigInt(asset.quantity)) / 1_000_000} ADA`);
      } else {
        console.log(`    ${asset.quantity} ${asset.unit}`);
      }
    }
  }

  // Save to temp file
  const filePath = saveTempFile(`utxos-${walletName}`, {
    wallet: walletName,
    address: walletFile.address,
    network: config.network,
    timestamp: new Date().toISOString(),
    totalLovelace: totalLovelace.toString(),
    totalCnight: totalCnight.toString(),
    utxos,
    cnightUtxoIndices,
  });

  console.log(`\nSaved to: ${filePath}`);
}
