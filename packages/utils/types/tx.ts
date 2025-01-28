import type { PublicKey, TransactionInstruction } from '@solana/web3.js';

export interface GetOrCreateATAResponse {
	ataPubKey: PublicKey;
	ix?: TransactionInstruction;
}
