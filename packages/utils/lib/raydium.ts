import {
	AMM_V4,
	type AmmV4Keys,
	type AmmV5Keys,
	type ComputeAmountOutParam,
	Raydium,
	liquidityStateV4Layout,
	makeAMMSwapInstruction,
} from '@raydium-io/raydium-sdk-v2';
import { NATIVE_MINT } from '@solana/spl-token';
import {
	type Keypair,
	PublicKey,
	type TransactionInstruction,
} from '@solana/web3.js';
import { to } from 'await-to-js';
import BN from 'bn.js';
import Decimal from 'decimal.js';
import ExpiryMap from 'expiry-map';
import { ofetch } from 'ofetch';
import pMemoize from 'p-memoize';
import { getConnection } from './get-connection';
import {
	getOrCreateATAInstruction,
	unwrapSOLInstruction,
	wrapSOLInstruction,
} from './tx-utils';

let raydium: Raydium;

export async function loadRaydium() {
	if (!raydium) {
		const connection = getConnection();

		raydium = await Raydium.load({
			connection: connection,
		});
	}

	return raydium;
}

export const getRaydiumPoolInfoFromRpc = pMemoize(
	async (poolId: string) => {
		const raydium = await loadRaydium();

		return await raydium.liquidity.getPoolInfoFromRpc({
			poolId,
		});
	},
	{
		cache: new ExpiryMap(5 * 1000),
	},
);

export const getSwapQuoteForRaydium = async ({
	poolInfo,
	inUIAmount,
	swapXtoY = false,
	slippage = 0.2,
}: {
	poolInfo: ComputeAmountOutParam['poolInfo'];
	inUIAmount: number;
	// Y is Sol
	swapXtoY?: boolean;
	slippage?: number;
}) => {
	const raydium = await loadRaydium();

	const baseIn = NATIVE_MINT.toBase58() === poolInfo.mintA.address;

	const [_mintIn, _mintOut] = baseIn
		? [poolInfo.mintA, poolInfo.mintB]
		: [poolInfo.mintB, poolInfo.mintA];

	const [mintIn, mintOut] = swapXtoY
		? [_mintOut, _mintIn]
		: [_mintIn, _mintOut];

	const inDecimals = mintIn.decimals;
	const outDecimals = mintOut.decimals;

	const amountIn = new BN((inUIAmount * 10 ** inDecimals).toFixed(0));

	const swapQuote = raydium.liquidity.computeAmountOut({
		poolInfo,
		amountIn,
		mintIn: mintIn.address,
		mintOut: mintOut.address,
		slippage,
	});

	return {
		swapQuote,
		inAmount: amountIn,
		inTokenAddrss: mintIn.address,
		outTokenAddress: mintOut.address,
		outUIAmount: new Decimal(swapQuote.amountOut.toString()).div(
			10 ** outDecimals,
		),
	};
};

const getAmmPoolIdFromRpc = pMemoize(
	async (tokenAddress: string) => {
		const base = NATIVE_MINT.toBase58();
		const connection = getConnection();

		const accounts = await connection.getProgramAccounts(AMM_V4, {
			filters: [
				{ dataSize: liquidityStateV4Layout.span },
				{
					memcmp: {
						offset: liquidityStateV4Layout.offsetOf('baseMint'),
						bytes: base,
					},
				},
				{
					memcmp: {
						offset: liquidityStateV4Layout.offsetOf('quoteMint'),
						bytes: tokenAddress,
					},
				},
			],
		});

		const account = accounts.find((account) => {
			return account.account.owner.equals(AMM_V4);
		});

		return account?.pubkey.toBase58();
	},
	{
		cache: new ExpiryMap(30 * 1000),
	},
);

const getAmmPoolFromGeckoterminal = pMemoize(
	async (tokenAddress: string) => {
		const res = await ofetch(
			`https://api.geckoterminal.com/api/v2/search/pools?query=${tokenAddress}&page=1`,
		);

		return res.data?.find((pool: any) => {
			return pool.relationships.dex.data.id === 'raydium';
		});
	},
	{
		cache: new ExpiryMap(30 * 1000),
	},
);

export const getAmmPoolId = async (tokenAddress: string) => {
	const [getAmmPoolFromGeckoterminalError, pool] = await to(
		getAmmPoolFromGeckoterminal(tokenAddress),
	);

	if (getAmmPoolFromGeckoterminalError) {
		return await getAmmPoolIdFromRpc(tokenAddress);
	}

	const poolId = pool.id.split('_')[1];

	if (poolId) {
		return poolId as string;
	}
};

export async function createRaydiumIx({
	poolId,
	user,
	payer = user,
	inUIAmount = 0.00000001,
	// inUIAmount = 0.008,
	swapXtoY = false,
	poolInfo: poolInfoParam,
	poolKeys: poolKeysParam,
	slippage = 0.1,
}: {
	poolId: string;
	user: Keypair;
	payer?: Keypair;
	inUIAmount?: number;
	swapXtoY?: boolean;
	poolInfo?: ComputeAmountOutParam['poolInfo'];
	poolKeys?: AmmV4Keys | AmmV5Keys;
	slippage?: number;
}) {
	let poolInfo = poolInfoParam;
	let poolKeys = poolKeysParam;

	if (!poolInfo || !poolKeys) {
		const { poolInfo: _poolInfo, poolKeys: _poolKeys } =
			await getRaydiumPoolInfoFromRpc(poolId);

		poolInfo = _poolInfo;
		poolKeys = _poolKeys;
	}

	const connection = getConnection();
	const { swapQuote, inAmount, inTokenAddrss, outTokenAddress } =
		await getSwapQuoteForRaydium({
			poolInfo,
			swapXtoY,
			inUIAmount,
			slippage,
		});

	const instructions: TransactionInstruction[] = [];
	const preInstructions: TransactionInstruction[] = [];
	const postInstructions: TransactionInstruction[] = [];

	const [
		{ ataPubKey: userTokenIn, ix: createInTokenAccountIx },
		{ ataPubKey: userTokenOut, ix: createOutTokenAccountIx },
	] = await Promise.all([
		getOrCreateATAInstruction(
			connection,
			new PublicKey(inTokenAddrss),
			user.publicKey,
			payer.publicKey,
		),
		getOrCreateATAInstruction(
			connection,
			new PublicKey(outTokenAddress),
			user.publicKey,
			payer.publicKey,
		),
	]);

	createInTokenAccountIx && preInstructions.push(createInTokenAccountIx);
	createOutTokenAccountIx && preInstructions.push(createOutTokenAccountIx);

	if (!swapXtoY) {
		const wrapSOLIx = wrapSOLInstruction(
			user.publicKey,
			userTokenIn,
			BigInt(inAmount.toString()),
		);

		preInstructions.push(...wrapSOLIx);
	}

	const ammSwapIx = makeAMMSwapInstruction({
		version: 4,
		poolKeys,
		userKeys: {
			tokenAccountIn: userTokenIn,
			tokenAccountOut: userTokenOut,
			owner: user.publicKey,
		},
		amountIn: inAmount,
		amountOut: swapQuote.minAmountOut,
		fixedSide: 'in',
	});

	instructions.push(ammSwapIx);

	if (swapXtoY) {
		const closeWrappedSOLIx = unwrapSOLInstruction(user.publicKey);
		closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
	}

	return [...preInstructions, ...instructions, ...postInstructions];
}
