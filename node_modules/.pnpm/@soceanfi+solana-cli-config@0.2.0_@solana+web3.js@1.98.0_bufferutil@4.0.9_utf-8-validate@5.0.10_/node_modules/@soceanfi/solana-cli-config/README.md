# Solana CLI Config

Typescript bindings for Solana CLI config (originally in rust).

No browser, intended for use in node.js based solana CLI applications.

## Example Usage

```ts
import { Connection, Keypair } from "@solana/web3.js";
import { SolanaCliConfig } from "@soceanfi/solana-cli-config"

// Load the solana CLI config file from the default path ($HOME/.config/solana/cli/config.yml)
const config = SolanaCliConfig.load();

// Load the keypair from the file path specified in the config file
const keypair: Keypair = config.loadKeypair();

// Create a `Connection` object from the config
const connection: Connection = config.createConnection();
```