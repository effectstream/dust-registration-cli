import { loadConfig } from '../lib/config.ts';
import { loadMidnightWallet } from '../lib/storage.ts';
import { fetchMidnightBalance } from '../lib/midnight-wallet.ts';

export async function findMidnightBalance(walletName: string, onlyDust?: boolean) {
  const config = loadConfig();
  const walletFile = loadMidnightWallet(walletName);

  if (!onlyDust) {
    console.log(`Querying Midnight balance for "${walletName}" on ${config.midnightNetworkId}...`);
    console.log(`  DUST Address: ${walletFile.dustAddress}`);
  }

  const result = await fetchMidnightBalance(
    walletName,
    walletFile.seed,
    config.midnightNetworkId,
    undefined,
    onlyDust,
  );

  if (result.error) {
    console.error(`\nError: ${result.error}`);
    return;
  }

  if (onlyDust) {
    // Compact single-line output
    const dustInDust = Number(result.dustBalance) / 1e15;
    const dustFmt = dustInDust.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
    console.log(`[${walletName}] Dust: ${dustFmt} DUST (${result.dustUtxos} UTXOs)`);
    return;
  }

  // Full summary
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  Midnight Wallet: ${walletName}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`  Unshielded Address: ${result.unshieldedAddress}`);
  console.log(`  Dust Address:       ${result.dustAddress}`);

  console.log(`\n  Shielded: (${result.shieldedUtxos} UTXOs)`);
  if (result.shieldedTokens.length === 0) {
    console.log(`    (none)`);
  } else {
    for (const t of result.shieldedTokens) {
      console.log(`    ${t.tokenId}: ${t.balance}`);
    }
  }

  console.log(`  Unshielded: (${result.unshieldedUtxos} UTXOs)`);
  if (result.unshieldedTokens.length === 0) {
    console.log(`    (none)`);
  } else {
    for (const t of result.unshieldedTokens) {
      console.log(`    ${t.tokenId}: ${t.balance}`);
    }
  }

  const dustInDust = Number(result.dustBalance) / 1e15;
  console.log(`  Dust: ${dustInDust.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} DUST  (${result.dustUtxos} UTXOs)`);
  console.log(`\n${'='.repeat(70)}`);
}
