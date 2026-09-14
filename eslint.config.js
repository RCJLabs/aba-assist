import js from '@eslint/js';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		}
	},
	{
		// `.svelte.ts` modules (the runes-based state classes) are plain TypeScript and
		// need the TS parser, not the Svelte template parser.
		files: ['**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: { parser: ts.parser }
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: { parser: ts.parser }
		},
		rules: {
			/*
			 * The database layer is plain TypeScript that accepts plain objects. Components
			 * hold Svelte 5 `$state` proxies, and `structuredClone` throws DataCloneError on
			 * a proxy — so every write has to go through `$state.snapshot()` at a boundary.
			 * Keeping components out of `$db` entirely is what makes that boundary real
			 * rather than a convention people forget.
			 */
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['$db/*', '$lib/db/*'],
							message:
								'Components must not touch the database directly. Go through a module in $lib/state, which snapshots $state proxies before writing.'
						}
					]
				}
			]
		}
	},
	{
		files: ['e2e/**/*.ts'],
		rules: {
			/*
			 * An accessibility baseline file never shrinks. If a rule genuinely cannot
			 * apply, exclude the specific selector with a comment linking a tracking issue
			 * rather than switching the rule off for the whole suite.
			 */
			'no-restricted-syntax': [
				'error',
				{
					selector: "CallExpression[callee.property.name='disableRules']",
					message:
						'Do not disable axe rules. Use .exclude(selector) with a comment linking a tracking issue.'
				}
			]
		}
	},
	{
		ignores: [
			'node_modules/',
			'.svelte-kit/',
			'build/',
			'dist/',
			'packages/*/dist/',
			'src/lib/content/generated/'
		]
	}
);
