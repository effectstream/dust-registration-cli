import { Lucid, Blockfrost, Data, getAddressDetails } from '@lucid-evolution/lucid';
import { loadConfig, LOVELACE_FOR_REGISTRATION } from '../lib/config.ts';
import { loadCardanoWallet, loadMidnightWallet, saveTempFile } from '../lib/storage.ts';
import {
  getPolicyId,
  getValidatorAddress,
  getStakeAddress,
  serializeRegistrationDatum,
  getLucidScript,
} from '../lib/contract.ts';

/**
 * Find the existing registration UTxO at the validator address for this user's stake key.
 * Queries Blockfrost for UTxOs holding the DUST NFT, then matches the inline datum's
 * stake key hash against the wallet's stake credential.
 */
async function findRegistrationUtxo(
  blockfrostUrl: string,
  blockfrostApiKey: string,
  validatorAddress: string,
  dustNftUnit: string,
  stakeKeyHash: string,
) {
  // Query UTxOs at the validator address that hold the DUST NFT
  const url = `${blockfrostUrl}/addresses/${validatorAddress}/utxos/${dustNftUnit}?order=desc`;
  const response = await fetch(url, {
    headers: { project_id: blockfrostApiKey },
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Blockfrost API error: ${response.status} ${response.statusText}`);
  }

  const utxos = await response.json();

  for (const utxo of utxos) {
    const hasAuthToken = utxo.amount?.some(
      (a: { unit: string; quantity: string }) => a.unit === dustNftUnit && a.quantity === '1',
    );
    if (!hasAuthToken || !utxo.inline_datum) continue;

    try {
      const { Constr } = await import('@lucid-evolution/lucid');
      const datumData = Data.from(utxo.inline_datum);
      if (!(datumData instanceof Constr) || datumData.index !== 0 || datumData.fields?.length !== 2) continue;

      const [cWalletConstr, dustPKHFromDatum] = datumData.fields as [typeof Constr.prototype, string];
      if (!(cWalletConstr instanceof Constr) || cWalletConstr.index !== 0 || !cWalletConstr.fields?.length) continue;

      const datumStakeKeyHash = cWalletConstr.fields[0] as string;
      if (datumStakeKeyHash !== stakeKeyHash) continue;

      // Found matching registration
      const assets: Record<string, bigint> = {};
      for (const a of utxo.amount || []) {
        assets[a.unit] = BigInt(a.quantity);
      }

      return {
        txHash: utxo.tx_hash as string,
        outputIndex: utxo.output_index as number,
        address: validatorAddress,
        assets,
        datum: utxo.inline_datum as string,
        currentDustPKH: dustPKHFromDatum as string,
      };
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Query the script stake address status via Blockfrost.
 * Returns { registered, withdrawableRewards }.
 */
async function getStakeAddressStatus(
  blockfrostUrl: string,
  blockfrostApiKey: string,
  stakeAddress: string,
): Promise<{ registered: boolean; withdrawableRewards: bigint }> {
  const url = `${blockfrostUrl}/accounts/${stakeAddress}`;
  const response = await fetch(url, {
    headers: { project_id: blockfrostApiKey },
  });

  if (!response.ok) {
    return { registered: false, withdrawableRewards: 0n };
  }

  const data = await response.json();
  return {
    registered: true, // 200 response means the account exists (registered)
    withdrawableRewards: BigInt(data.withdrawable_amount || '0'),
  };
}

export async function buildUpdateTx(cardanoWalletName: string, midnightWalletName: string) {
  const config = loadConfig();
  const cardanoWallet = loadCardanoWallet(cardanoWalletName);
  const midnightWallet = loadMidnightWallet(midnightWalletName);

  console.log(`Building update transaction...`);
  console.log(`  Cardano wallet: ${cardanoWalletName} (${cardanoWallet.address})`);
  console.log(`  New Midnight wallet: ${midnightWalletName} (${midnightWallet.dustAddress})`);
  console.log(`  Network: ${config.network}`);

  // Initialize Lucid with Blockfrost
  const lucid = await Lucid(
    new Blockfrost(config.blockfrostUrl, config.blockfrostApiKey),
    config.network,
  );

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
  const scriptStakeAddress = getStakeAddress(config.network);
  const newDustPKH = midnightWallet.dustAddressBytes;
  const lucidScript = getLucidScript(config.network);
  const dustNftUnit = policyId; // empty token name

  console.log(`\nContract details:`);
  console.log(`  Policy ID:            ${policyId}`);
  console.log(`  Validator Address:    ${validatorAddress}`);
  console.log(`  Script Stake Address: ${scriptStakeAddress}`);
  console.log(`  Stake Key Hash:       ${stakeKeyHash}`);
  console.log(`  New DUST PKH:         ${newDustPKH}`);

  // Find existing registration UTxO
  console.log(`\nSearching for existing registration UTxO...`);
  const regUtxo = await findRegistrationUtxo(
    config.blockfrostUrl,
    config.blockfrostApiKey,
    validatorAddress,
    dustNftUnit,
    stakeKeyHash,
  );

  if (!regUtxo) {
    throw new Error(
      'No existing registration UTxO found for this stake key. Use build-tx to register first.',
    );
  }

  console.log(`  Found registration UTxO: ${regUtxo.txHash}#${regUtxo.outputIndex}`);
  console.log(`  Current DUST PKH:        ${regUtxo.currentDustPKH}`);

  if (regUtxo.currentDustPKH === newDustPKH) {
    throw new Error('The new DUST address is the same as the current one. No update needed.');
  }

  // Check script stake address registration and rewards
  const stakeStatus = await getStakeAddressStatus(
    config.blockfrostUrl,
    config.blockfrostApiKey,
    scriptStakeAddress,
  );
  console.log(`  Script stake registered:      ${stakeStatus.registered}`);
  console.log(`  Script withdrawable rewards:  ${stakeStatus.withdrawableRewards}`);

  // If the script stake address is not registered, build a registration tx first
  if (!stakeStatus.registered) {
    console.log(`\nScript stake address is not registered on-chain.`);
    console.log(`Building stake registration transaction first...`);

    const regTxBuilder = lucid.newTx();
    regTxBuilder.registerStake(scriptStakeAddress);
    regTxBuilder.addSigner(walletAddress);

    const completedRegTx = await regTxBuilder.complete();
    const unsignedRegTx = completedRegTx.toCBOR();

    const regFilePath = saveTempFile('unsigned-stake-reg-tx', {
      cardanoWallet: cardanoWalletName,
      network: config.network,
      timestamp: new Date().toISOString(),
      unsignedTx: unsignedRegTx,
      scriptStakeAddress,
      purpose: 'Register script stake address before update',
    });

    console.log(`\nStake registration transaction built successfully!`);
    console.log(`  Saved to: ${regFilePath}`);
    console.log(`\nYou must sign and submit this FIRST, then re-run build-update-tx:`);
    console.log(`  1. sign-tx --wallet ${cardanoWalletName} --tx-file "${regFilePath}"`);
    console.log(`  2. submit-tx --tx-file <signed-tx-file> --poll`);
    console.log(`  3. build-update-tx --cardano-wallet ${cardanoWalletName} --midnight-wallet ${midnightWalletName}`);
    return;
  }

  // Serialize new datum
  const datumCbor = serializeRegistrationDatum(stakeKeyHash, newDustPKH);

  // Find all cNIGHT UTxOs for rotation
  const utxos = await lucid.wallet().getUtxos();
  const cnightUtxos = utxos.filter((u) => u.assets[config.cnightUnit] !== undefined);

  if (cnightUtxos.length === 0) {
    throw new Error('No cNIGHT UTxOs found in wallet. You need cNIGHT tokens to update.');
  }

  console.log(`  cNIGHT UTxOs:             ${cnightUtxos.length}`);

  // Build the update transaction
  console.log(`\nBuilding transaction...`);
  const txBuilder = lucid.newTx();

  // Add all cNIGHT UTxOs as explicit inputs for rotation
  txBuilder.collectFrom(cnightUtxos);

  // Consume existing registration UTxO with void redeemer
  const spendRedeemer = Data.void();
  txBuilder.collectFrom(
    [
      {
        txHash: regUtxo.txHash,
        outputIndex: regUtxo.outputIndex,
        address: regUtxo.address,
        assets: regUtxo.assets,
        datum: regUtxo.datum,
      },
    ],
    spendRedeemer,
  );
  txBuilder.attach.SpendingValidator(lucidScript);

  // Create new registration UTxO with same NFT but updated datum
  txBuilder.pay.ToContract(
    validatorAddress,
    { kind: 'inline', value: datumCbor },
    {
      lovelace: LOVELACE_FOR_REGISTRATION,
      [dustNftUnit]: 1n,
    },
  );

  // Add withdrawal for script authorization
  txBuilder.withdraw(scriptStakeAddress, stakeStatus.withdrawableRewards, Data.void());
  txBuilder.attach.WithdrawalValidator(lucidScript);

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
  const filePath = saveTempFile('unsigned-update-tx', {
    cardanoWallet: cardanoWalletName,
    midnightWallet: midnightWalletName,
    network: config.network,
    timestamp: new Date().toISOString(),
    unsignedTx,
    policyId,
    validatorAddress,
    stakeKeyHash,
    dustPKH: newDustPKH,
    previousDustPKH: regUtxo.currentDustPKH,
    registrationUtxo: `${regUtxo.txHash}#${regUtxo.outputIndex}`,
  });

  console.log(`\nUpdate transaction built successfully!`);
  console.log(`  Saved to: ${filePath}`);
  console.log(`\nNext step: sign-tx --wallet ${cardanoWalletName} --tx-file "${filePath}"`);
}
