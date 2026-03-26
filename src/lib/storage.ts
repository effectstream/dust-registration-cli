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
