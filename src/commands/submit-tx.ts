import { Blockfrost } from '@lucid-evolution/lucid';
import { loadConfig } from '../lib/config.ts';
import { loadTempFile } from '../lib/storage.ts';

interface SignedTxFile {
  cardanoWallet: string;
  midnightWallet: string;
  accountIndex: number;
  network: string;
  timestamp: string;
  signedTx: string;
  policyId: string;
  validatorAddress: string;
  stakeKeyHash: string;
  dustPKH: string;
}

export async function submitTx(txFilePath: string, poll: boolean, accountIndex: number) {
  const config = loadConfig();
  const txFile = loadTempFile<SignedTxFile>(txFilePath);

  if (txFile.accountIndex !== undefined && txFile.accountIndex !== accountIndex) {
    throw new Error(
      `Account index mismatch: transaction was built with account ${txFile.accountIndex}, but --account ${accountIndex} was provided. Use --account ${txFile.accountIndex} to submit.`
    );
  }

  console.log(`Submitting transaction on ${config.network} (account ${accountIndex})...`);

  // Submit directly via Blockfrost provider
  const provider = new Blockfrost(config.blockfrostUrl, config.blockfrostApiKey);
  const txHash = await provider.submitTx(txFile.signedTx);

  console.log(`\nTransaction submitted successfully!`);
  console.log(`  Tx Hash: ${txHash}`);

  if (config.network === 'Preview') {
    console.log(`  Explorer: https://preview.cexplorer.io/tx/${txHash}`);
  } else if (config.network === 'Preprod') {
    console.log(`  Explorer: https://preprod.cexplorer.io/tx/${txHash}`);
  } else {
    console.log(`  Explorer: https://cexplorer.io/tx/${txHash}`);
  }

  // Optionally poll for confirmation
  if (poll) {
    console.log(`\nWaiting for confirmation...`);
    await pollForConfirmation(config.blockfrostApiKey, config.blockfrostUrl, txHash);
  }
}

async function pollForConfirmation(apiKey: string, blockfrostUrl: string, txHash: string) {
  const MAX_DURATION_MS = 300_000; // 5 minutes
  const INITIAL_INTERVAL_MS = 10_000;
  const MAX_INTERVAL_MS = 30_000;
  const BACKOFF_MULTIPLIER = 1.3;

  const startTime = Date.now();
  let attempt = 0;

  while (true) {
    attempt++;
    const elapsed = Date.now() - startTime;

    if (elapsed >= MAX_DURATION_MS) {
      console.log(`\nTimeout after ${attempt} attempts. Transaction may still confirm later.`);
      console.log(`Check the explorer link above to verify.`);
      return;
    }

    try {
      const response = await fetch(
        `${blockfrostUrl}/txs/${txHash}`,
        { headers: { project_id: apiKey } }
      );

      if (response.ok) {
        const data = await response.json();
        if (data && !data.error) {
          const seconds = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`  Confirmed after ${attempt} attempts (${seconds}s)`);
          return;
        }
      }
    } catch {
      // Continue polling
    }

    const interval = Math.min(
      INITIAL_INTERVAL_MS * Math.pow(BACKOFF_MULTIPLIER, attempt - 1),
      MAX_INTERVAL_MS
    );
    process.stdout.write(`  Attempt ${attempt}, next in ${(interval / 1000).toFixed(0)}s...\r`);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}
