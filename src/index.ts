#!/usr/bin/env node
import { Command } from 'commander';
import { createCardanoWallet } from './commands/create-cardano-wallet.ts';
import { importCardanoWallet } from './commands/import-cardano-wallet.ts';
import { createMidnightWallet } from './commands/create-midnight-wallet.ts';
import { listWallets } from './commands/list-wallets.ts';
import { findUtxos } from './commands/find-utxos.ts';
import { findMidnightBalance } from './commands/find-midnight-balance.ts';
import { buildTx } from './commands/build-tx.ts';
import { signTx } from './commands/sign-tx.ts';
import { submitTx } from './commands/submit-tx.ts';
import { checkRegistration } from './commands/check-registration.ts';

const program = new Command();

program
  .name('dust-cli')
  .description('CLI tool for DUST address registration on Cardano')
  .version('0.1.0');

program
  .command('create-cardano-wallet')
  .description('Generate a new Cardano wallet and save keys locally')
  .requiredOption('--name <name>', 'Wallet name')
  .action(async (opts) => {
    await createCardanoWallet(opts.name);
  });

program
  .command('import-cardano-wallet')
  .description('Import a Cardano wallet from an existing mnemonic')
  .requiredOption('--name <name>', 'Wallet name')
  .requiredOption('--mnemonic <words>', 'Space-separated 24-word mnemonic phrase')
  .action(async (opts) => {
    await importCardanoWallet(opts.name, opts.mnemonic);
  });

program
  .command('create-midnight-wallet')
  .description('Generate a new Midnight wallet with DUST address')
  .requiredOption('--name <name>', 'Wallet name')
  .action(async (opts) => {
    await createMidnightWallet(opts.name);
  });

program
  .command('list-wallets')
  .description('List all saved wallets and their addresses')
  .option('--cardano-wallet <name>', 'Show a specific Cardano wallet with derived addresses')
  .option('--n <count>', 'Number of CIP-1852 addresses to derive (default: 10)', parseInt)
  .option('--stake', 'Show staking addresses instead of payment addresses')
  .action(async (opts) => {
    await listWallets(opts.cardanoWallet, opts.n, opts.stake);
  });

program
  .command('find-utxos')
  .description('Query blockchain for UTxOs / balances (Cardano or Midnight)')
  .option('--wallet <name>', 'Cardano wallet name')
  .option('--midnight-wallet <name>', 'Midnight wallet name (queries shielded/unshielded/dust)')
  .option('--all', 'Query all wallets (Cardano and Midnight)')
  .option('--n <count>', 'Number of accounts to query (default: 1)', parseInt)
  .action(async (opts) => {
    if (opts.all) {
      const { listCardanoWallets, listMidnightWallets } = await import('./lib/storage.ts');
      const cardanoWallets = listCardanoWallets();
      const midnightWallets = listMidnightWallets();
      for (const w of cardanoWallets) {
        console.log(`\n=== Cardano: ${w.name} ===`);
        await findUtxos(w.name, opts.n);
      }
      for (const w of midnightWallets) {
        console.log(`\n=== Midnight: ${w.name} ===`);
        await findMidnightBalance(w.name);
      }
      if (cardanoWallets.length === 0 && midnightWallets.length === 0) {
        console.log('No wallets found. Create one first.');
      }
    } else if (opts.midnightWallet) {
      await findMidnightBalance(opts.midnightWallet);
    } else if (opts.wallet) {
      await findUtxos(opts.wallet, opts.n);
    } else {
      console.error('Error: Provide either --wallet (Cardano), --midnight-wallet (Midnight), or --all');
      process.exit(1);
    }
  });

program
  .command('build-tx')
  .description('Build a DUST registration transaction')
  .requiredOption('--cardano-wallet <name>', 'Cardano wallet name')
  .requiredOption('--midnight-wallet <name>', 'Midnight wallet name')
  .requiredOption('--account <index>', 'CIP-1852 account index', parseInt)
  .action(async (opts) => {
    await buildTx(opts.cardanoWallet, opts.midnightWallet, opts.account);
  });

program
  .command('sign-tx')
  .description('Sign an unsigned transaction')
  .requiredOption('--wallet <name>', 'Cardano wallet name (for signing keys)')
  .requiredOption('--tx-file <path>', 'Path to unsigned transaction JSON file')
  .requiredOption('--account <index>', 'CIP-1852 account index', parseInt)
  .action(async (opts) => {
    await signTx(opts.wallet, opts.txFile, opts.account);
  });

program
  .command('submit-tx')
  .description('Submit a signed transaction to the network')
  .requiredOption('--tx-file <path>', 'Path to signed transaction JSON file')
  .requiredOption('--account <index>', 'CIP-1852 account index', parseInt)
  .option('--poll', 'Wait for transaction confirmation', false)
  .action(async (opts) => {
    await submitTx(opts.txFile, opts.poll, opts.account);
  });

program
  .command('check-registration')
  .description('Check DUST registration status via Midnight indexer')
  .requiredOption('--wallet <name>', 'Cardano wallet name')
  .requiredOption('--account <index>', 'CIP-1852 account index', parseInt)
  .action(async (opts) => {
    await checkRegistration(opts.wallet, opts.account);
  });

program.parseAsync().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
