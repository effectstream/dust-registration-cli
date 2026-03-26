import { Lucid, Blockfrost, getAddressDetails } from '@lucid-evolution/lucid';
import { loadConfig, LOVELACE_FOR_REGISTRATION } from '../lib/config.ts';
import { loadCardanoWallet, loadMidnightWallet, saveTempFile } from '../lib/storage.ts';
import {
  getPolicyId,
  getValidatorAddress,
  getScriptCborHex,
  serializeRegistrationDatum,
  serializeCreateRedeemer,
  getLucidScript,
} from '../lib/contract.ts';

export async function buildTx(cardanoWalletName: string, midnightWalletName: string) {
  const config = loadConfig();
  const cardanoWallet = loadCardanoWallet(cardanoWalletName);
  const midnightWallet = loadMidnightWallet(midnightWalletName);

  console.log(`Building registration transaction...`);
  console.log(`  Cardano wallet: ${cardanoWalletName} (${cardanoWallet.address})`);
  console.log(`  Midnight wallet: ${midnightWalletName} (${midnightWallet.dustAddress})`);
  console.log(`  Network: ${config.network}`);

  // Initialize Lucid with Blockfrost
  const lucid = await Lucid(
    new Blockfrost(config.blockfrostUrl, config.blockfrostApiKey),
    config.network,
  );

  // Select wallet from mnemonic
  lucid.selectWallet.fromSeed(cardanoWallet.mnemonic.join(' '));

  // Get address details
  const walletAddress = await lucid.wallet().address();
  const addressDetails = getAddressDetails(walletAddress);
  const stakeKeyHash = addressDetails?.stakeCredential?.hash;

  if (!stakeKeyHash) {
    throw new Error('Could not resolve stake key hash from address. Ensure the wallet has a base address.');
  }

  // Contract data
  const policyId = getPolicyId(config.network);
  const validatorAddress = getValidatorAddress(config.network);
  const dustPKH = midnightWallet.dustAddressBytes;
  const lucidScript = getLucidScript(config.network);

  console.log(`\nContract details:`);
  console.log(`  Policy ID:         ${policyId}`);
  console.log(`  Validator Address: ${validatorAddress}`);
  console.log(`  Stake Key Hash:    ${stakeKeyHash}`);
  console.log(`  DUST PKH:          ${dustPKH}`);

  // Serialize datum and redeemer
  const datumCbor = serializeRegistrationDatum(stakeKeyHash, dustPKH);
  const redeemerCbor = serializeCreateRedeemer();

  console.log(`  Datum CBOR:        ${datumCbor.substring(0, 40)}...`);
  console.log(`  Redeemer CBOR:     ${redeemerCbor}`);

  // Find all cNIGHT UTxOs for rotation
  const utxos = await lucid.wallet().getUtxos();
  const cnightUtxos = utxos.filter((u) => u.assets[config.cnightUnit] !== undefined);

  if (cnightUtxos.length === 0) {
    throw new Error('No cNIGHT UTxOs found in wallet. You need cNIGHT tokens to register.');
  }

  console.log(`  cNIGHT UTxOs:      ${cnightUtxos.length}`);

  // Build the transaction (mirrors dApp's dustTransactionsUtils.ts)
  console.log(`\nBuilding transaction...`);
  const txBuilder = lucid.newTx();

  // Add all cNIGHT UTxOs as explicit inputs for rotation
  txBuilder.collectFrom(cnightUtxos);

  // Mint DUST NFT
  const dustNFTAssetName = policyId; // empty token name → unit = policyId
  txBuilder.mintAssets({ [dustNFTAssetName]: 1n }, redeemerCbor);
  txBuilder.attach.MintingPolicy(lucidScript);

  // Output to validator with inline datum
  txBuilder.pay.ToContract(
    validatorAddress,
    { kind: 'inline', value: datumCbor },
    {
      lovelace: LOVELACE_FOR_REGISTRATION,
      [dustNFTAssetName]: 1n,
    },
  );

  // Required signers
  txBuilder.addSigner(walletAddress);
  const stakeAddress = await lucid.wallet().rewardAddress();
  if (stakeAddress) {
    txBuilder.addSigner(stakeAddress);
  }

  // Complete transaction
  const completedTx = await txBuilder.complete();
  const unsignedTx = completedTx.toCBOR();

  // Save to file
  const filePath = saveTempFile('unsigned-tx', {
    cardanoWallet: cardanoWalletName,
    midnightWallet: midnightWalletName,
    network: config.network,
    timestamp: new Date().toISOString(),
    unsignedTx,
    policyId,
    validatorAddress,
    stakeKeyHash,
    dustPKH,
  });

  console.log(`\nTransaction built successfully!`);
  console.log(`  Saved to: ${filePath}`);
  console.log(`\nNext step: sign-tx --wallet ${cardanoWalletName} --tx-file "${filePath}"`);
}
