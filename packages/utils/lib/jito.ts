import { PublicKey, SystemProgram } from '@solana/web3.js';
import { to } from 'await-to-js';
import ExpiryMap from 'expiry-map';
import { ofetch } from 'ofetch';
import pMemoize from 'p-memoize';

function isBrowser() {
	return typeof globalThis.document !== 'undefined';
}

export enum JITO_GEAR {
	TIP_25 = 'landed_tips_25th_percentile',
	TIP_50 = 'landed_tips_50th_percentile',
	TIP_75 = 'landed_tips_75th_percentile',
	TIP_95 = 'landed_tips_95th_percentile',
	TIP_99 = 'landed_tips_99th_percentile',
	EMA_TIP_50 = 'ema_landed_tips_50th_percentile',
}

const getJitoTipAccounts = pMemoize(
	async () => {
		if (isBrowser()) {
			const response = await ofetch('/api/jito/tip-accounts', {
				method: 'POST',
			});

			return response?.data;
		}

		const response = await ofetch(
			'https://mainnet.block-engine.jito.wtf/api/v1/bundles',
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: {
					jsonrpc: '2.0',
					id: 1,
					method: 'getTipAccounts',
					params: [],
				},
			},
		);

		return response?.result as string[] | undefined;
	},
	{
		cache: new ExpiryMap<any, any>(30 * 60 * 1000),
	},
);

const getJitoTipFloor = pMemoize(
	async () => {
		if (isBrowser()) {
			const response = await ofetch('/api/jito/tip-floor');

			return response.data as Record<JITO_GEAR, number> | undefined;
		}

		const response = await ofetch(
			'https://bundles.jito.wtf/api/v1/bundles/tip_floor',
		);

		return response[0] as Record<JITO_GEAR, number> | undefined;
	},
	{ cache: new ExpiryMap<any, any>(10 * 1000) },
);

export async function getJitoConfig(jitoGear: JITO_GEAR = JITO_GEAR.TIP_95) {
	const [error, values] = await to(
		Promise.all([getJitoTipAccounts(), getJitoTipFloor()]),
	);

	const jitoConfig = {
		// JITO Account 8
		feeWallet: '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
		fee: 0.00004,
	};

	if (error) {
		return jitoConfig;
	}

	const [tipAccounts, tipFloor] = values;

	if (tipFloor && tipAccounts) {
		jitoConfig.feeWallet = tipAccounts?.[0];
		jitoConfig.fee = tipFloor?.[jitoGear];
	}

	return jitoConfig;
}

export const createJitoFeeInstruction = async (
	fromPubkey: string,
	jitoGear = JITO_GEAR.TIP_25,
) => {
	const jitoConfig = await getJitoConfig(jitoGear);

	return SystemProgram.transfer({
		fromPubkey: new PublicKey(fromPubkey),
		toPubkey: new PublicKey(jitoConfig.feeWallet),
		// lamports: +(jitoConfig.fee * 1e9).toFixed(0),
		lamports: +(0.0001 * 1e9).toFixed(0),
	});
};

const bundleUrls = [
	'https://mainnet.block-engine.jito.wtf/api/v1/bundles',
	'https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles',
	'https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles',
	'https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles',
	'https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles',
	'https://slc.mainnet.block-engine.jito.wtf/api/v1/bundles',
];

let currentIndex = 0;

export async function sendJitoBundle(txDatas: string[]) {
	const url = bundleUrls[currentIndex];

	currentIndex = (currentIndex + 1) % bundleUrls.length;

	try {
		const bundleId = await ofetch(url, {
			method: 'POST',
			body: {
				jsonrpc: '2.0',
				id: 1,
				method: 'sendBundle',
				params: [
					txDatas,
					{
						encoding: 'base64',
					},
				],
			},
		});
		// console.log(
		// 	`swap successfully in jito bundle:`,
		// 	`https://explorer.jito.wtf/bundle/${bundleId.result}`,
		// );

		return bundleId.result as string;
	} catch (e) {
		console.error('Jito bundle error', e);
	}
}
