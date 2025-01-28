import type { EnvConfig } from './schemas/env.schema';

declare global {
	namespace NodeJS {
		interface ProcessEnv extends EnvConfig {}
	}
}
