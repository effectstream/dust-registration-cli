import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE_DIR = path.join(os.homedir(), '.dust-cli');
const CARDANO_DIR = path.join(BASE_DIR, 'cardano-wallets');
const MIDNIGHT_DIR = path.join(BASE_DIR, 'midnight-wallets');
const TEMP_DIR = path.join(BASE_DIR, 'temp');

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

// --- Cardano Wallets ---

export interface CardanoWalletFile {
  name: string;
  mnemonic: string[];
  address: string;
  rewardAddress: string | null;
  network: string;
  createdAt: string;
}

export function saveCardanoWallet(wallet: CardanoWalletFile): string {
  ensureDir(CARDANO_DIR);
  const filePath = path.join(CARDANO_DIR, `${wallet.name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(wallet, null, 2));
  return filePath;
}

export function loadCardanoWallet(name: string): CardanoWalletFile {
  const filePath = path.join(CARDANO_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Cardano wallet "${name}" not found at ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function listCardanoWallets(): CardanoWalletFile[] {
  ensureDir(CARDANO_DIR);
  return fs
    .readdirSync(CARDANO_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(CARDANO_DIR, f), 'utf-8')));
}

// --- Midnight Wallets ---

export interface MidnightWalletFile {
  name: string;
  mnemonic: string;
  seed: string;
  dustAddress: string;
  dustAddressBytes: string;
  network: string;
  createdAt: string;
}

export function saveMidnightWallet(wallet: MidnightWalletFile): string {
  ensureDir(MIDNIGHT_DIR);
  const filePath = path.join(MIDNIGHT_DIR, `${wallet.name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(wallet, null, 2));
  return filePath;
}

export function loadMidnightWallet(name: string): MidnightWalletFile {
  const filePath = path.join(MIDNIGHT_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Midnight wallet "${name}" not found at ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function listMidnightWallets(): MidnightWalletFile[] {
  ensureDir(MIDNIGHT_DIR);
  return fs
    .readdirSync(MIDNIGHT_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(MIDNIGHT_DIR, f), 'utf-8')));
}

// --- Dust Wallet State Cache ---

const DUST_STATE_DIR = path.join(BASE_DIR, 'dust-state');

export function saveDustState(walletName: string, network: string, serializedState: string): string {
  ensureDir(DUST_STATE_DIR);
  const filePath = path.join(DUST_STATE_DIR, `${walletName}.${network}.json`);
  fs.writeFileSync(filePath, serializedState);
  return filePath;
}

export function loadDustState(walletName: string, network: string): string | null {
  const filePath = path.join(DUST_STATE_DIR, `${walletName}.${network}.json`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

// --- UTXO Snapshots (per-wallet cache for quick lookups) ---

const CARDANO_SNAPSHOT_DIR = path.join(BASE_DIR, 'cardano-utxo-snapshots');
const MIDNIGHT_SNAPSHOT_DIR = path.join(BASE_DIR, 'midnight-balance-snapshots');

export interface CardanoUtxoSnapshot {
  wallet: string;
  network: string;
  timestamp: string;
  accounts: number;
  totalLovelace: string;
  totalCnight: string;
  utxos: unknown[];
}

export interface MidnightBalanceSnapshot {
  wallet: string;
  network: string;
  timestamp: string;
  dustBalance: string;
  dustUtxos: number;
  shieldedTokens: { tokenId: string; balance: string }[];
  shieldedUtxos: number;
  unshieldedTokens: { tokenId: string; balance: string }[];
  unshieldedUtxos: number;
}

export function saveCardanoUtxoSnapshot(walletName: string, network: string, data: CardanoUtxoSnapshot): string {
  ensureDir(CARDANO_SNAPSHOT_DIR);
  const filePath = path.join(CARDANO_SNAPSHOT_DIR, `${walletName}.${network}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

export function loadCardanoUtxoSnapshot(walletName: string, network: string): CardanoUtxoSnapshot | null {
  const filePath = path.join(CARDANO_SNAPSHOT_DIR, `${walletName}.${network}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function saveMidnightBalanceSnapshot(walletName: string, network: string, data: MidnightBalanceSnapshot): string {
  ensureDir(MIDNIGHT_SNAPSHOT_DIR);
  const filePath = path.join(MIDNIGHT_SNAPSHOT_DIR, `${walletName}.${network}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

export function loadMidnightBalanceSnapshot(walletName: string, network: string): MidnightBalanceSnapshot | null {
  const filePath = path.join(MIDNIGHT_SNAPSHOT_DIR, `${walletName}.${network}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// --- Temp Files ---

export function saveTempFile(prefix: string, data: unknown): string {
  ensureDir(TEMP_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(TEMP_DIR, `${prefix}-${timestamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

export function loadTempFile<T = unknown>(filePath: string): T {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}
