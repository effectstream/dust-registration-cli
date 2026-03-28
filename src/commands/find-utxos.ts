import { MeshWallet } from '@meshsdk/wallet';
import { BlockfrostProvider } from '@meshsdk/core';
import { loadConfig } from '../lib/config.ts';
import { loadCardanoWallet, saveTempFile } from '../lib/storage.ts';

export async function findUtxos(walletName: string, n?: number) {
  const config = loadConfig();
  const walletFile = loadCardanoWallet(walletName);
  const accountCount = n ?? 1;

  const provider = new BlockfrostProvider(config.blockfrostApiKey);

  let grandTotalLovelace = 0n;
  let grandTotalCnight = 0n;
  let allUtxos: any[] = [];

  for (let acct = 0; acct < accountCount; acct++) {
    const wallet = new MeshWallet({
      networkId: config.networkId,
      fetcher: provider,
      submitter: provider,
      key: {
        type: 'mnemonic',
        words: walletFile.mnemonic,
      },
      accountIndex: acct,
    });

    const address = wallet.getAddresses().baseAddressBech32 ?? wallet.getChangeAddress();
    console.log(`\n--- Account ${acct} ---`);
    console.log(`  Address: ${address}`);

    const utxos = await wallet.getUtxos();

    if (utxos.length === 0) {
      console.log('  No UTxOs found.');
      continue;
    }

    let acctLovelace = 0n;
    let acctCnight = 0n;
    const cnightUtxoIndices: number[] = [];

    for (let i = 0; i < utxos.length; i++) {
      const utxo = utxos[i];
      const lovelace = utxo.output.amount.find((a: any) => a.unit === 'lovelace');
      if (lovelace) acctLovelace += BigInt(lovelace.quantity);

      const cnight = utxo.output.amount.find((a: any) => a.unit === config.cnightUnit);
      if (cnight) {
        acctCnight += BigInt(cnight.quantity);
        cnightUtxoIndices.push(i);
      }
    }

    console.log(`  UTxOs: ${utxos.length}`);
    console.log(`  ADA:    ${Number(acctLovelace) / 1_000_000}`);
    console.log(`  cNIGHT: ${acctCnight.toString()}`);

    console.log('  UTxO Details:');
    for (let i = 0; i < utxos.length; i++) {
      const utxo = utxos[i];
      const marker = cnightUtxoIndices.includes(i) ? ' [cNIGHT]' : '';
      console.log(`    ${utxo.input.txHash}#${utxo.input.outputIndex}${marker}`);
      for (const asset of utxo.output.amount) {
        if (asset.unit === 'lovelace') {
          console.log(`      ${Number(BigInt(asset.quantity)) / 1_000_000} ADA`);
        } else {
          console.log(`      ${asset.quantity} ${asset.unit}`);
        }
      }
    }

    grandTotalLovelace += acctLovelace;
    grandTotalCnight += acctCnight;
    allUtxos.push(...utxos);
  }

  if (allUtxos.length === 0) {
    console.log('\nNo UTxOs found across all accounts. Wallet is empty.');
    return;
  }

  if (accountCount > 1) {
    console.log(`\n=== Total across ${accountCount} accounts ===`);
    console.log(`  ADA:    ${Number(grandTotalLovelace) / 1_000_000}`);
    console.log(`  cNIGHT: ${grandTotalCnight.toString()}`);
  }

  // Save to temp file
  const filePath = saveTempFile(`utxos-${walletName}`, {
    wallet: walletName,
    network: config.network,
    timestamp: new Date().toISOString(),
    accounts: accountCount,
    totalLovelace: grandTotalLovelace.toString(),
    totalCnight: grandTotalCnight.toString(),
    utxos: allUtxos,
  });

  console.log(`\nSaved to: ${filePath}`);
}
