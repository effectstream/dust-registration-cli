import { loadConfig } from '../lib/config.ts';
import { loadMidnightWallet, saveMidnightBalanceSnapshot, loadMidnightBalanceSnapshot } from '../lib/storage.ts';
import { fetchMidnightBalance } from '../lib/midnight-wallet.ts';

export async function findMidnightBalance(walletName: string, onlyDust?: boolean) {
  const config = loadConfig();
  const walletFile = loadMidnightWallet(walletName);

  // Load previous snapshot
  const prev = loadMidnightBalanceSnapshot(walletName);
  if (prev && !onlyDust) {
    const prevDust = Number(BigInt(prev.dustBalance)) / 1e15;
    const prevDustFmt = prevDust.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
    console.log(`  Previous (${prev.timestamp}): ${prevDustFmt} DUST (${prev.dustUtxos} UTXOs), ${prev.shieldedUtxos} shielded, ${prev.unshieldedUtxos} unshielded`);
  } else if (prev && onlyDust) {
    const prevDust = Number(BigInt(prev.dustBalance)) / 1e15;
    const prevDustFmt = prevDust.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
    console.log(`  [${walletName}] Previous: ${prevDustFmt} DUST (${prev.dustUtxos} UTXOs)`);
  }

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

  // Save per-wallet snapshot
  const snapshot = {
    wallet: walletName,
    network: config.midnightNetworkId,
    timestamp: new Date().toISOString(),
    dustBalance: result.dustBalance?.toString() ?? '0',
    dustUtxos: result.dustUtxos ?? 0,
    shieldedTokens: (result.shieldedTokens ?? []).map((t: any) => ({ tokenId: t.tokenId, balance: t.balance.toString() })),
    shieldedUtxos: result.shieldedUtxos ?? 0,
    unshieldedTokens: (result.unshieldedTokens ?? []).map((t: any) => ({ tokenId: t.tokenId, balance: t.balance.toString() })),
    unshieldedUtxos: result.unshieldedUtxos ?? 0,
  };
  saveMidnightBalanceSnapshot(walletName, snapshot);

  if (onlyDust) {
    // Compact single-line output
    const dustInDust = Number(result.dustBalance) / 1e15;
    const dustFmt = dustInDust.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
    let line = `[${walletName}] Dust: ${dustFmt} DUST (${result.dustUtxos} UTXOs)`;

    // Show delta
    if (prev) {
      const prevBal = BigInt(prev.dustBalance);
      const curBal = BigInt(snapshot.dustBalance);
      const delta = curBal - prevBal;
      if (delta !== 0n) {
        const sign = delta > 0n ? '+' : '';
        const deltaFmt = (Number(delta) / 1e15).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
        line += ` (${sign}${deltaFmt})`;
      }
    }
    console.log(line);
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

  // Show delta from previous
  if (prev) {
    const prevDustBal = BigInt(prev.dustBalance);
    const curDustBal = BigInt(snapshot.dustBalance);
    const deltaDust = curDustBal - prevDustBal;
    if (deltaDust !== 0n) {
      const sign = deltaDust > 0n ? '+' : '';
      const deltaFmt = (Number(deltaDust) / 1e15).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
      console.log(`  Delta:  ${sign}${deltaFmt} DUST`);
    } else {
      console.log(`  No change from previous snapshot.`);
    }
  }

  console.log(`\n${'='.repeat(70)}`);
}
