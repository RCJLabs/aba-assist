import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	// `$lib` so app modules can be unit tested without pulling in SvelteKit's own
	// resolution. Anything importing `$app/*` still belongs in a Playwright test.
	resolve: {
		alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) }
	},
	test: {
		include: ['packages/**/*.test.ts', 'src/**/*.test.ts', 'tests/**/*.test.ts'],
		environment: 'node'
	}
});
