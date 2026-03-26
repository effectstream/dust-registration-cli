import { loadConfig } from '../lib/config.ts';
import { saveMidnightWallet } from '../lib/storage.ts';

/**
 * Create a Midnight wallet with a DUST address.
 *
 * Generates a 24-word BIP39 mnemonic (importable in browser wallets),
 * derives the seed, then derives the DUST address via the Midnight SDK.
 */
export async function createMidnightWallet(name: string) {
  const config = loadConfig();

  console.log(`Creating Midnight wallet "${name}" on ${config.midnightNetworkId}...`);

  // Dynamic imports for ESM-only packages
  const { generateMnemonic, mnemonicToSeedSync } = await import('@scure/bip39');
  const { wordlist } = await import('@scure/bip39/wordlists/english.js');
  const { HDWallet, Roles } = await import('@midnight-ntwrk/wallet-sdk-hd');
  const { DustAddress, MidnightBech32m } = await import('@midnight-ntwrk/wallet-sdk-address-format');
  const { DustSecretKey } = await import('@midnight-ntwrk/ledger-v8');

  // 1. Generate 24-word mnemonic (can be imported in a browser wallet)
  const mnemonic = generateMnemonic(wordlist, 256);
  console.log(`Generated 24-word mnemonic.`);

  // 2. Derive seed from mnemonic (BIP39 PBKDF2, 64 bytes)
  const seedBytes = mnemonicToSeedSync(mnemonic);
  const seedHex = Buffer.from(seedBytes).toString('hex');

  // 3. Derive HD wallet keys
  const hdWallet = HDWallet.fromSeed(seedBytes);
  if (hdWallet.type !== 'seedOk') {
    throw new Error('Failed to initialize HDWallet from seed');
  }

  const derivationResult = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Dust])
    .deriveKeysAt(0);

  if (derivationResult.type !== 'keysDerived') {
    throw new Error('Failed to derive keys from seed');
  }

  const dustKeyBytes = derivationResult.keys[Roles.Dust];
  hdWallet.hdWallet.clear();

  // 4. Derive the dust public key from the dust seed
  const dustSecretKey = DustSecretKey.fromSeed(dustKeyBytes);
  const dustPublicKey = dustSecretKey.publicKey;
  dustSecretKey.clear();

  // 5. Create DustAddress from the public key
  const dustAddr = new DustAddress(dustPublicKey);

  // 6. Encode as bech32m DUST address
  const dustAddress = MidnightBech32m.encode(
    config.midnightNetworkId as any,
    dustAddr
  ).asString();

  // 7. Get serialized bytes for on-chain datum storage
  const parsed = MidnightBech32m.parse(dustAddress);
  const decoded = parsed.decode(DustAddress, config.midnightNetworkId as any);
  const serializedBytes = decoded.serialize();
  const dustAddressBytes = Buffer.from(serializedBytes).toString('hex');

  // Save to file
  const filePath = saveMidnightWallet({
    name,
    mnemonic,
    seed: seedHex,
    dustAddress,
    dustAddressBytes,
    network: config.midnightNetworkId,
    createdAt: new Date().toISOString(),
  });

  console.log(`\nMidnight wallet created successfully!`);
  console.log(`  Name:              ${name}`);
  console.log(`  Network:           ${config.midnightNetworkId}`);
  console.log(`  DUST Address:      ${dustAddress}`);
  console.log(`  DUST Address Hex:  ${dustAddressBytes}`);
  console.log(`  Saved to:          ${filePath}`);
  console.log(`\nMnemonic (KEEP SECRET — use to import in browser wallet):`);
  console.log(`  ${mnemonic}`);
}
