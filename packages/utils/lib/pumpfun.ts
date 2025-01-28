import { AnchorProvider, type Wallet } from '@coral-xyz/anchor';
// import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
import {
	Keypair,
	PublicKey,
	Transaction,
	VersionedTransaction,
} from '@solana/web3.js';
import { getConnection } from './get-connection';
import {
	PumpFunSDK,
	calculateWithSlippageBuy,
	calculateWithSlippageSell,
} from './pumpfun-sdk';

export class LocalWallet implements Wallet {
	constructor(readonly payer: Keypair) {}

	async signTransaction<T extends Transaction | VersionedTransaction>(
		tx: T,
	): Promise<T> {
		if (tx instanceof Transaction) {
			tx.partialSign(this.payer);
		} else if (tx instanceof VersionedTransaction) {
			tx.sign([this.payer]);
		}
		return tx;
	}

	async signAllTransactions<T extends Transaction | VersionedTransaction>(
		txs: T[],
	): Promise<T[]> {
		return Promise.all(txs.map((tx) => this.signTransaction(tx)));
	}

	get publicKey(): PublicKey {
		return this.payer.publicKey;
	}
}

let pumpfunSDK: PumpFunSDK | null = null;

const getProvider = () => {
	const wallet = new LocalWallet(new Keypair());
	const connection = getConnection();

	return new AnchorProvider(connection, wallet, {
		commitment: 'finalized',
	});
};

export function getPumpfunSdk() {
	if (pumpfunSDK === null) {
		const provider = getProvider();
		pumpfunSDK = new PumpFunSDK(provider);
	}

	return pumpfunSDK;
}

export async function isPumpfunComplete(tokenMintAddress: string) {
	const pumpfunSdk = getPumpfunSdk();

	const bondingCurveAccount = await pumpfunSdk.getBondingCurveAccount(
		new PublicKey(tokenMintAddress),
	);

	return !!bondingCurveAccount?.complete;
}

export async function createPumpfunIxs({
	tokenAddress,
	user,
	inUIAmount = 0.00000001,
	swapXtoY = false,
	slippage = 0.1,
}: {
	tokenAddress: string;
	user: Keypair;
	inUIAmount?: number;
	// Y: SOL
	swapXtoY?: boolean;
	slippage?: number;
}) {
	const pumpfunSdk = getPumpfunSdk();
	const decimals = swapXtoY ? 6 : 9;
	const inAmount = BigInt((inUIAmount * 10 ** decimals).toFixed(0));
	const slippageBasisPoints = BigInt(slippage * 1000);
	const _tokenAddress = new PublicKey(tokenAddress);

	const bondingCurveAccount =
		await pumpfunSdk.getBondingCurveAccount(_tokenAddress);

	if (!bondingCurveAccount) {
		// throw new Error(
		// 	`Bonding curve account not found: ${_tokenAddress.toBase58()}`,
		// );
		return;
	}

	const globalAccount = await pumpfunSdk.getGlobalAccount();
	const feeRecipient = globalAccount.feeRecipient;

	if (swapXtoY) {
		// Sell
		const minSolOutput = bondingCurveAccount.getSellPrice(
			inAmount,
			globalAccount.feeBasisPoints,
		);

		const sellAmountWithSlippage = calculateWithSlippageSell(
			minSolOutput,
			slippageBasisPoints,
		);

		const tx = await pumpfunSdk.getSellInstructions(
			user.publicKey,
			_tokenAddress,
			feeRecipient,
			inAmount,
			sellAmountWithSlippage,
		);

		return tx.instructions;
	}

	const buyAmount = bondingCurveAccount.getBuyPrice(inAmount);
	const buyAmountWithSlippage = calculateWithSlippageBuy(
		inAmount,
		slippageBasisPoints,
	);

	const tx = await pumpfunSdk.getBuyInstructions(
		user.publicKey,
		_tokenAddress,
		feeRecipient,
		buyAmount,
		buyAmountWithSlippage,
	);

	return tx.instructions;
}

export { calculateWithSlippageSell };
