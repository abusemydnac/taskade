import { NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { type Connection, PublicKey } from '@solana/web3.js';
import { Decimal } from 'decimal.js';
import { getConnection } from './get-connection';

export type Holdings = Map<
	string,
	{
		uiAmount: number;
		amount: bigint;
		tokenAccountAddress: string;
		decimals: number;
	}
>;

export async function getHoldings({
	walletAddress,
	connection = getConnection(),
	onlyNative = false,
}: {
	walletAddress: string;
	connection?: Connection;
	onlyNative?: boolean;
}) {
	const _walletAddress = new PublicKey(walletAddress);
	const holdingsMap: Holdings = new Map();

	try {
		const solAmount = await connection.getBalance(_walletAddress);
		const solUIAmount = +(solAmount / 1e9).toFixed(9);

		holdingsMap.set(NATIVE_MINT.toBase58(), {
			amount: BigInt(solAmount),
			uiAmount: solUIAmount,
			tokenAccountAddress: '',
			decimals: 9,
		});

		if (onlyNative) {
			return holdingsMap;
		}

		const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
			_walletAddress,
			{
				programId: TOKEN_PROGRAM_ID,
			},
		);

		for (const tokenAccount of tokenAccounts.value) {
			const tokenAddress = tokenAccount.account.data.parsed.info.mint;
			const uiAmount =
				tokenAccount.account.data.parsed.info.tokenAmount.uiAmount;
			const amount = tokenAccount.account.data.parsed.info.tokenAmount.amount;
			const decimals =
				tokenAccount.account.data.parsed.info.tokenAmount.decimals;

			if (uiAmount > 0) {
				if (tokenAddress === NATIVE_MINT.toBase58()) {
					holdingsMap.set(tokenAddress, {
						uiAmount: new Decimal(uiAmount)
							.plus(holdingsMap.get(tokenAddress)?.uiAmount ?? 0)
							.toNumber(),
						amount:
							holdingsMap.get(tokenAddress)?.amount ?? 0n + BigInt(amount),
						tokenAccountAddress: tokenAccount.pubkey.toBase58(),
						decimals,
					});
				} else {
					holdingsMap.set(tokenAddress, {
						uiAmount: uiAmount,
						amount: BigInt(amount),
						tokenAccountAddress: tokenAccount.pubkey.toBase58(),
						decimals,
					});
				}
			}
		}
	} catch (e) {
		console.log('getHoldings', e);
	}

	return holdingsMap;
}
