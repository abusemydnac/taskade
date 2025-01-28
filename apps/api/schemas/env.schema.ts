import { z } from 'zod';

export const envSchema = z.object({
	DATABASE_URL: z.string(),
	GRPC_ENDPOINT: z.string(),
	GRPC_X_TOKEN: z.string(),
	REDIS_HOST: z.string(),
	REDIS_PORT: z.string(),
	REDIS_USERNAME: z.string(),
	REDIS_PASSWORD: z.string(),
});

export type EnvConfig = z.infer<typeof envSchema>;
