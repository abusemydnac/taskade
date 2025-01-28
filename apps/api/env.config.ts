import path from 'node:path';
import process from 'node:process';
import url from 'node:url';
import { configDotenv } from 'dotenv';
import { envSchema } from './schemas/env.schema.js';

export function loadEnvConfig() {
	const envPath = path.join(url.fileURLToPath(import.meta.url), '../.env');
	// const envPath = path.join(__dirname, '.env');
	const result = configDotenv({ path: envPath });

	if (result.error) {
		throw new Error(
			`Failed to load .env file from path ${envPath}: ${result.error.message}`,
		);
	}

	const { error } = envSchema.safeParse(process.env);

	if (error) {
		const errorMessage = error?.errors.map((e) => e.message).join(', ');

		throw new Error(`Config validation error: ${errorMessage}`);
	}
}
