import {
	NATIVE_MINT,
	TOKEN_PROGRAM_ID,
	TokenAccountNotFoundError,
	TokenInvalidAccountOwnerError,
	createAssociatedTokenAccountInstruction,
	createCloseAccountInstruction,
	getAccount,
	getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import {
	type Commitment,
	type Connection,
	type Finality,
	type PublicKey,
	SystemProgram,
	Transaction,
	TransactionInstruction,
	TransactionMessage,
	VersionedTransaction,
} from '@solana/web3.js';
import type { GetOrCreateATAResponse } from '../types/tx';
import { getConnection } from './get-connection';

export async function createTx(
	feePayer: PublicKey,
	connection = getConnection(),
) {
	const { blockhash, lastValidBlockHeight } =
		await connection.getLatestBlockhash('processed');

	return new Transaction({
		blockhash,
		lastValidBlockHeight,
		feePayer,
	});
}

export async function buildVersionedTx(
	connection: Connection,
	payer: PublicKey,
	tx: Transaction,
) {
	const { blockhash } = await connection.getLatestBlockhash();

	const messageV0 = new TransactionMessage({
		payerKey: payer,
		recentBlockhash: blockhash,
		instructions: tx.instructions,
	}).compileToV0Message();

	return new VersionedTransaction(messageV0);
}

export const unwrapSOLInstruction = (
	owner: PublicKey,
	allowOwnerOffCurve = true,
) => {
	const wSolATAAccount = getAssociatedTokenAddressSync(
		NATIVE_MINT,
		owner,
		allowOwnerOffCurve,
	);
	if (wSolATAAccount) {
		return createCloseAccountInstruction(
			wSolATAAccount,
			owner,
			owner,
			[],
			TOKEN_PROGRAM_ID,
		);
	}
	return null;
};

export const getTxDetails = async (
	connection: Connection,
	sig: string,
	commitment: Commitment = 'finalized',
	finality: Finality = 'finalized',
) => {
	const latestBlockHash = await connection.getLatestBlockhash();
	await connection.confirmTransaction(
		{
			blockhash: latestBlockHash.blockhash,
			lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
			signature: sig,
		},
		commitment,
	);

	return connection.getTransaction(sig, {
		maxSupportedTransactionVersion: 0,
		commitment: finality,
	});
};

export const getOrCreateATAInstruction = async (
	connection: Connection,
	tokenMint: PublicKey,
	owner: PublicKey,
	payer: PublicKey = owner,
	allowOwnerOffCurve = true,
): Promise<GetOrCreateATAResponse> => {
	const toAccount = getAssociatedTokenAddressSync(
		tokenMint,
		owner,
		allowOwnerOffCurve,
	);

	try {
		await getAccount(connection, toAccount);

		return { ataPubKey: toAccount, ix: undefined };
	} catch (e) {
		if (
			e instanceof TokenAccountNotFoundError ||
			e instanceof TokenInvalidAccountOwnerError
		) {
			const ix = createAssociatedTokenAccountInstruction(
				payer,
				toAccount,
				owner,
				tokenMint,
			);

			return { ataPubKey: toAccount, ix };
		}
		/* handle error */
		console.error('Error::getOrCreateATAInstruction', e);
		throw e;
	}
};

export const wrapSOLInstruction = (
	from: PublicKey,
	to: PublicKey,
	amount: bigint,
): TransactionInstruction[] => {
	return [
		SystemProgram.transfer({
			fromPubkey: from,
			toPubkey: to,
			lamports: amount,
		}),
		new TransactionInstruction({
			keys: [
				{
					pubkey: to,
					isSigner: false,
					isWritable: true,
				},
			],
			data: Buffer.from(new Uint8Array([17])),
			programId: TOKEN_PROGRAM_ID,
		}),
	];
};
