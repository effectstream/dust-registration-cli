# DUST Registration CLI

CLI tool to register a Midnight DUST address from a Cardano wallet.

## Prerequisites

- Node.js v24+
- A Blockfrost API key ([blockfrost.io](https://blockfrost.io))

## Setup

```bash
cd cli
npm install
```

## Environment Variables


| Variable             | Required | Description                                         |
| -------------------- | -------- | --------------------------------------------------- |
| `NETWORK`            | Yes      | Cardano network: `Preview`, `Preprod`, or `Mainnet` |
| `BLOCKFROST_API_KEY` | Yes      | Blockfrost project ID for the selected network      |


Create a `.env` file or export directly:

```bash
export NETWORK=Preview
export BLOCKFROST_API_KEY=previewXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

## Commands

### Create a new Cardano wallet

```bash
node src/index.ts create-cardano-wallet --name my-wallet
```

Generates a 24-word mnemonic and derives the wallet address.

### Import an existing Cardano wallet

```bash
node src/index.ts import-cardano-wallet --name my-wallet --mnemonic "word1 word2 ... word24"
```

### Create a Midnight wallet

```bash
node src/index.ts create-midnight-wallet --name my-midnight
```

Generates a random seed and derives the DUST address.

### List wallets

```bash
node src/index.ts list-wallets
```

### Find UTxOs

```bash
node src/index.ts find-utxos --wallet my-wallet
```

Queries Blockfrost for UTxOs including cNIGHT tokens.

### Build registration transaction

```bash
node src/index.ts build-tx --cardano-wallet my-wallet --midnight-wallet my-midnight
```
Builds an unsigned transaction that mints a DUST NFT and creates the registration datum on-chain.

### Sign transaction

```bash
node src/index.ts sign-tx --wallet my-wallet --tx-file ~/.dust-cli/temp/unsigned-tx-xxx.json
```

### Submit transaction

```bash
node src/index.ts submit-tx --tx-file ~/.dust-cli/temp/signed-tx-xxx.json --poll
```

The `--poll` flag waits for on-chain confirmation.

## Wallet Storage

Wallet files are stored in `~/.dust-cli/`:

```
~/.dust-cli/
  cardano-wallets/   # Cardano wallet JSON files (contain mnemonics)
  midnight-wallets/  # Midnight wallet JSON files (contain seeds)
  temp/              # Unsigned/signed transaction files
```


## Build transaction

#### Transaction structure

The CLI builds the exact same transaction as the dApp's `buildRegistrationTransaction` in `src/lib/dustTransactionsUtils.ts`, using Lucid Evolution:

1. **Inputs** — all cNIGHT UTxOs from the wallet are collected as explicit inputs (token rotation)
2. **Mint** — 1 DUST NFT minted via the `cnight_generates_dust` PlutusV3 minting policy with a `Create` redeemer (constructor 0)
3. **Output** — sent to the validator address with an inline `DustMappingDatum` containing:
  - `c_wallet`: `VerificationKey([stakeKeyHash])` — the wallet's stake key hash (28 bytes)
  - `dust_address`: the Midnight DUST address bytes (SCALE-encoded BLS scalar, 33 bytes)
4. **Required signers** — both the payment address and the stake/reward address
5. **Output value** — 1,586,080 lovelace + 1 DUST NFT

#### Contract data (hardcoded, extracted from dApp)


| Item                        | Source                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Script CBOR (PlutusV3)      | `src/config/contract_blueprint.ts` — identical bytecode for testnet and mainnet                              |
| `DustMappingDatum` type     | `{ c_wallet: VerificationKey([stakeKeyHash]) | Script([scriptHash]), dust_address: string }` (constructor 0) |
| `DustAction` redeemer       | `Create` (constructor 0) / `Burn` (constructor 1)                                                            |
| Policy ID                   | Hash of the PlutusV3 script                                                                                  |
| Validator address           | Derived from the script via `addressFromValidator`                                                           |
| `LOVELACE_FOR_REGISTRATION` | 1,586,080 lovelace                                                                                           |


#### cNIGHT token identifiers per network


| Network | Policy ID                                                  | Encoded Name           |
| ------- | ---------------------------------------------------------- | ---------------------- |
| Preview | `` | *(empty)*              |
| Preprod | `` | *(empty)*              |
| Mainnet | `0691b2fecca1ac4f53cb6dfb00b7013e561d1f34403b957cbb5af1fa` | `4e49474854` ("NIGHT") |

