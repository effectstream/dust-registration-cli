import { listCardanoWallets, listMidnightWallets } from '../lib/storage.ts';

export async function listWallets() {
  const cardanoWallets = listCardanoWallets();
  const midnightWallets = listMidnightWallets();

  console.log('=== Cardano Wallets ===');
  if (cardanoWallets.length === 0) {
    console.log('  (none)');
  } else {
    for (const w of cardanoWallets) {
      console.log(`  ${w.name}: ${w.address} (${w.network})`);
    }
  }

  console.log('');
  console.log('=== Midnight Wallets ===');
  if (midnightWallets.length === 0) {
    console.log('  (none)');
  } else {
    for (const w of midnightWallets) {
      console.log(`  ${w.name}: ${w.dustAddress} (${w.network})`);
    }
  }
}
