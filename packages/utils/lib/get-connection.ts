import { Connection } from '@solana/web3.js';

const rpcUrls = [
	'https://skilled-wild-resonance.solana-mainnet.quiknode.pro/327a2a45531bfb08ab2f1d196fca06130e0e9ad3',
	'https://shy-omniscient-sanctuary.solana-mainnet.quiknode.pro/873e7b8cd5298d3612dca005bf758e6aca1a3533',
	'https://winter-dimensional-knowledge.solana-mainnet.quiknode.pro/509dd96632af04a4958f6215c2f6aa9964a9d313',
	'https://ultra-bitter-shadow.solana-mainnet.quiknode.pro/0df84c74d40bfd3d3c48b6d419cfa89ee757e955',
	'https://rpc.shyft.to?api_key=mNwubXUNmWEBKEk9',
];

let currentIndex = 0;

export function getConnection() {
	const url = rpcUrls[currentIndex];

	currentIndex = (currentIndex + 1) % rpcUrls.length;

	return new Connection(url, 'processed');
}
