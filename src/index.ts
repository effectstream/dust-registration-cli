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
  .action(async () => {
    await listWallets();
  });

program
  .command('find-utxos')
  .description('Query blockchain for UTxOs / balances (Cardano or Midnight)')
  .option('--wallet <name>', 'Cardano wallet name')
  .option('--midnight-wallet <name>', 'Midnight wallet name (queries shielded/unshielded/dust)')
  .action(async (opts) => {
    if (opts.midnightWallet) {
      await findMidnightBalance(opts.midnightWallet);
    } else if (opts.wallet) {
      await findUtxos(opts.wallet);
    } else {
      console.error('Error: Provide either --wallet (Cardano) or --midnight-wallet (Midnight)');
      process.exit(1);
    }
  });

program
  .command('build-tx')
  .description('Build a DUST registration transaction')
  .requiredOption('--cardano-wallet <name>', 'Cardano wallet name')
  .requiredOption('--midnight-wallet <name>', 'Midnight wallet name')
  .action(async (opts) => {
    await buildTx(opts.cardanoWallet, opts.midnightWallet);
  });

program
  .command('sign-tx')
  .description('Sign an unsigned transaction')
  .requiredOption('--wallet <name>', 'Cardano wallet name (for signing keys)')
  .requiredOption('--tx-file <path>', 'Path to unsigned transaction JSON file')
  .action(async (opts) => {
    await signTx(opts.wallet, opts.txFile);
  });

program
  .command('submit-tx')
  .description('Submit a signed transaction to the network')
  .requiredOption('--tx-file <path>', 'Path to signed transaction JSON file')
  .option('--poll', 'Wait for transaction confirmation', false)
  .action(async (opts) => {
    await submitTx(opts.txFile, opts.poll);
  });

program.parseAsync().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
