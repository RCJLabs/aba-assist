import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { Channel } from '@aba/content-schema';
import { compile } from './compile.js';
import { formatIssue, formatResult } from './report.js';
import type { CompileResult } from './types.js';

export interface AbaContentOptions {
	/** Defaults to <project>/content */
	contentRoot?: string;
	/** Defaults to <project>/src/lib/content/generated */
	generatedDir?: string;
	channel?: Channel;
}

function resolveChannel(explicit?: Channel): Channel {
	const fromEnv = process.env.ABA_CONTENT_CHANNEL;
	const parsed = Channel.safeParse(explicit ?? fromEnv);
	if (parsed.success) return parsed.data;
	return process.env.CI ? 'pr' : 'dev';
}

/**
 * The build gate.
 *
 * This runs inside `buildStart`, which is the only code path that can produce a bundle.
 * A `prebuild` npm script would be trivially bypassed — `npx vite build`, an IDE task, a
 * future pipeline change — and a bypassed content gate is not a gate. Here, an invalid
 * content tree aborts the Vite build itself.
 */
export function abaContent(options: AbaContentOptions = {}): Plugin {
	let contentRoot: string;
	let generatedDir: string;
	let result: CompileResult | undefined;
	const channel = resolveChannel(options.channel);

	async function run(): Promise<CompileResult> {
		const r = await compile({ root: contentRoot, channel, outDir: generatedDir });
		if (r.ok) await writeGenerated(generatedDir, r);
		return r;
	}

	return {
		name: 'aba-content',
		enforce: 'pre',

		configResolved(config) {
			const projectRoot = config.root ?? process.cwd();
			contentRoot = resolve(options.contentRoot ?? join(projectRoot, 'content'));
			generatedDir = resolve(
				options.generatedDir ?? join(projectRoot, 'src/lib/content/generated')
			);
		},

		async buildStart() {
			result = await run();
			for (const w of result.warnings) this.warn(formatIssue(w));
			if (result.errors.length > 0) {
				this.error(formatResult(result, 'pretty'));
			}
		},

		generateBundle() {
			// Client bundle only — emitting into the SSR bundle would duplicate every asset.
			const envName = this.environment?.name;
			if (envName && envName !== 'client') return;

			/*
			 * Only assets marked `fetchedAtRuntime` are emitted as standalone files.
			 *
			 * Everything else is already in the bundle: the app imports the compiled JSON
			 * from `src/lib/content/generated`, so Vite emits it as hashed, precached,
			 * lazily-importable chunks. Emitting the same content again here would ship the
			 * entire corpus twice and precache both copies — which is exactly what the first
			 * version of this plugin did.
			 *
			 * The mechanism stays because gated Pro packs genuinely do need to be standalone
			 * fetchable files rather than bundle chunks.
			 */
			for (const a of result?.assets ?? []) {
				if (!a.fetchedAtRuntime) continue;
				this.emitFile({ type: 'asset', fileName: a.fileName, source: a.source });
			}
		},

		configureServer(server) {
			server.watcher.add(join(contentRoot, '**/*'));
			let timer: NodeJS.Timeout | undefined;
			server.watcher.on('all', (_event, file) => {
				if (!file.startsWith(contentRoot)) return;
				clearTimeout(timer);
				timer = setTimeout(async () => {
					const r = await run();
					if (r.errors.length > 0) {
						server.ws.send({
							type: 'error',
							err: { message: formatResult(r, 'pretty'), stack: '' }
						});
					} else {
						server.ws.send({ type: 'full-reload' });
					}
				}, 120);
			});
		}
	};
}

/**
 * Mirror the compiled assets into `src/lib/content/generated` so the app can import them
 * with normal module resolution (and so `svelte-check` sees real files).
 */
export async function writeGenerated(dir: string, r: CompileResult): Promise<void> {
	await mkdir(dir, { recursive: true });
	for (const a of r.assets) {
		const name = a.name + '.json';
		const path = join(dir, name);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, a.source, 'utf8');
	}
	await writeFile(
		join(dir, 'version.json'),
		JSON.stringify(
			{ contentVersion: r.contentVersion, channel: r.channel, counts: r.counts },
			null,
			2
		),
		'utf8'
	);
}
