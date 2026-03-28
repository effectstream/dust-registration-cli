import { EmbeddedWallet } from '@meshsdk/wallet';
import { listCardanoWallets, listMidnightWallets, loadCardanoWallet } from '../lib/storage.ts';
import { loadConfig } from '../lib/config.ts';

export async function listWallets(cardanoWalletName?: string, n?: number, stake?: boolean) {
  if (cardanoWalletName) {
    const wallet = loadCardanoWallet(cardanoWalletName);
    const config = loadConfig();
    const count = n ?? 10;

    const embedded = new EmbeddedWallet({
      networkId: config.networkId,
      key: { type: 'mnemonic', words: wallet.mnemonic },
    });

    console.log(`=== Cardano Wallet: ${wallet.name} (${wallet.network}) ===`);
    const label = stake ? 'staking' : 'payment';
    console.log(`CIP-1852 ${label} addresses (first ${count} accounts):\n`);
    for (let i = 0; i < count; i++) {
      const account = embedded.getAccount(i, 0);
      const addr = stake ? account.rewardAddressBech32 : account.baseAddressBech32;
      console.log(`  [${i}] ${addr}`);
    }
    return;
  }

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
