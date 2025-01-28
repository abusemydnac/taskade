import { setTimeout } from 'node:timers/promises';
import type { TokenBalance } from '@solana/web3.js';
import Client from '@triton-one/yellowstone-grpc';
import type { SubscribeRequest } from '@triton-one/yellowstone-grpc';
import type { txEncode } from '@triton-one/yellowstone-grpc';

async function handleStream({
	request,
	endpoint,
	xToken = '',
	handler,
}: {
	request: SubscribeRequest;
	endpoint: string;
	xToken: string;
	handler: (data: any) => void;
}) {
	const grpc = new Client(
		// 'https://grpc.ams.shyft.to',
		// 'https://grpc-chenhao.chainbuff.com',
		// 'https://grpc.caitou.work',
		endpoint,
		xToken,
		{
			'grpc.max_receive_message_length': 64 * 1024 * 1024,
		},
	);

	const stream = await grpc.subscribe();

	const streamClosed = new Promise<void>((resolve, reject) => {
		stream.on('error', (error) => {
			console.error('ERROR', error);
			reject(error);
			stream.end();
		});
		stream.on('end', () => {
			resolve();
		});
		stream.on('close', () => {
			resolve();
		});
	});

	stream.on('data', async (data) => {
		try {
			handler(data);
		} catch (error) {
			console.error(error);
		}
	});

	await new Promise<void>((resolve, reject) => {
		stream.write(request, (err: any) => {
			if (err === null || err === undefined) {
				resolve();
			} else {
				reject(err);
			}
		});
	}).catch((reason) => {
		console.error(reason);
		throw reason;
	});

	await streamClosed;
}

export async function subscribeCommand({
	request,
	endpoint = '',
	xToken = '',
	handler,
}: {
	request: SubscribeRequest;
	endpoint?: string;
	xToken?: string;
	handler: (data: any) => void;
}) {
	while (true) {
		try {
			await handleStream({ request, endpoint, xToken, handler });
		} catch (error) {
			console.error('Stream error, restarting in 1 second...', error);
			await setTimeout(1000);
		}
	}
}

export type TokenSwapItem = Record<
	'pre' | 'post',
	Pick<TokenBalance, 'mint' | 'uiTokenAmount' | 'owner'>
>;

export function ingestTokenSwaps(
	tx: ReturnType<typeof txEncode.encode>,
	_accountAddress?: string,
) {
	const accountAddress: string =
		_accountAddress ?? tx.transaction.message.accountKeys[0];
	const createSwapItem = (balance: TokenBalance): TokenSwapItem => ({
		pre: {
			mint: balance.mint,
			uiTokenAmount: {
				uiAmount: 0,
				decimals: 0,
				amount: '0',
				uiAmountString: '0',
			},
			owner: balance.owner,
		},
		post: {
			mint: balance.mint,
			uiTokenAmount: {
				uiAmount: 0,
				decimals: 0,
				amount: '0',
				uiAmountString: '0',
			},
			owner: balance.owner,
		},
	});

	const preBalanceMap = new Map<string, TokenBalance>();
	const postBalanceMap = new Map<string, TokenBalance>();

	for (const balance of tx.meta?.preTokenBalances ?? []) {
		if (balance.owner === accountAddress) {
			preBalanceMap.set(balance.mint, balance);
		}
	}

	for (const balance of tx.meta?.postTokenBalances ?? []) {
		if (balance.owner === accountAddress) {
			postBalanceMap.set(balance.mint, balance);
		}
	}

	const tokenSwaps: Record<string, TokenSwapItem | undefined> = {};
	const processedMints = new Set([
		...preBalanceMap.keys(),
		...postBalanceMap.keys(),
	]);

	for (const mint of processedMints) {
		const preBalance = preBalanceMap.get(mint);
		const postBalance = postBalanceMap.get(mint);

		if (preBalance !== undefined || postBalance !== undefined) {
			const balance = (preBalance ?? postBalance) as TokenBalance;
			const swapItem = createSwapItem(balance);

			if (preBalance) {
				swapItem.pre = preBalance;
			}

			if (postBalance) {
				swapItem.post = postBalance;
			}

			tokenSwaps[mint] = swapItem;
		}
	}

	return tokenSwaps;
}

export function ingestSolDelta(
	tx: ReturnType<typeof txEncode.encode>,
	// accountAddress: string,
) {
	const preSolBalance = tx.meta?.preBalances[0];
	const postBalance = tx.meta?.postBalances[0];

	if (preSolBalance && postBalance) {
		const solDelta = (postBalance - preSolBalance) / 10 ** 9;

		return +solDelta.toFixed(6);
	}

	// const wSolAtaAddress = getAssociatedTokenAddressSync(
	// 	NATIVE_MINT,
	// 	new PublicKey(accountAddress),
	// );
}
