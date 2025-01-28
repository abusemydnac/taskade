import fs from 'node:fs/promises';
import { fromSecretKey } from './wallet';

export async function getWalletsFromTxt(filePath: string) {
	try {
		const content = await fs.readFile(filePath, 'utf-8');
		const lines = content.trim().split('\n');
		return lines
			.filter((line) => line !== '')
			.map((secretKey: string) => {
				const keypair = fromSecretKey(secretKey);

				return keypair
					? {
						keypair,
						pubkey: keypair.publicKey,
						secretKey: secretKey,
					}
					: null;
			})
			.filter((item) => item !== null);
	} catch (e) {
		console.error('getWallets error', e);
		return [];
	}
}
