import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

export function fromSecretKey(secretKey: string) {
	return Keypair.fromSecretKey(bs58.decode(secretKey));
}

export function createWallets(count: number) {
	const wallets = [];

	for (let i = 0; i < count; i++) {
		const wallet = Keypair.generate();
		// console.log('walletPubkey', wallet.publicKey.toBase58());
		// console.log('walletSecretKey', bs58.encode(wallet.secretKey));

		console.log(bs58.encode(wallet.secretKey));
		wallets.push(wallet);
	}

	return wallets;
}
