import { Lucid, Blockfrost, CML } from '@lucid-evolution/lucid';
import { loadConfig } from '../lib/config.ts';
import { loadCardanoWallet, loadTempFile, saveTempFile } from '../lib/storage.ts';

interface UnsignedTxFile {
  cardanoWallet: string;
  midnightWallet: string;
  accountIndex: number;
  network: string;
  timestamp: string;
  unsignedTx: string;
  policyId: string;
  validatorAddress: string;
  stakeKeyHash: string;
  dustPKH: string;
}

export async function signTx(walletName: string, txFilePath: string, accountIndex: number) {
  const config = loadConfig();
  const walletFile = loadCardanoWallet(walletName);
  const txFile = loadTempFile<UnsignedTxFile>(txFilePath);

  if (txFile.accountIndex !== undefined && txFile.accountIndex !== accountIndex) {
    throw new Error(
      `Account index mismatch: transaction was built with account ${txFile.accountIndex}, but --account ${accountIndex} was provided. Use --account ${txFile.accountIndex} to sign.`
    );
  }

  console.log(`Signing transaction with wallet "${walletName}" (account ${accountIndex})...`);

  // Initialize Lucid with Blockfrost
  const lucid = await Lucid(
    new Blockfrost(config.blockfrostUrl, config.blockfrostApiKey),
    config.network,
  );

  // Select wallet from mnemonic at the specified account index
  lucid.selectWallet.fromSeed(walletFile.mnemonic.join(' '), { accountIndex });

  // Reconstruct the completed tx from CBOR and sign
  console.log(`Signing with payment and stake keys...`);
  const completedTx = lucid.fromTx(txFile.unsignedTx);
  const signedTx = await completedTx.sign.withWallet().complete();
  const signedTxCbor = signedTx.toCBOR();

  // Save signed tx to file
  const filePath = saveTempFile('signed-tx', {
    cardanoWallet: txFile.cardanoWallet,
    midnightWallet: txFile.midnightWallet,
    accountIndex,
    network: txFile.network,
    timestamp: new Date().toISOString(),
    signedTx: signedTxCbor,
    policyId: txFile.policyId,
    validatorAddress: txFile.validatorAddress,
    stakeKeyHash: txFile.stakeKeyHash,
    dustPKH: txFile.dustPKH,
  });

  console.log(`\nTransaction signed successfully!`);
  console.log(`  Saved to: ${filePath}`);
  console.log(`\nNext step: submit-tx --tx-file "${filePath}" --account ${accountIndex}`);
}
