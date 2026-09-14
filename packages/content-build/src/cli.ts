#!/usr/bin/env node
import { join, resolve } from 'node:path';
import { Channel } from '@aba/content-schema';
import { compile } from './compile.js';
import { formatResult } from './report.js';
import { writeGenerated } from './vite-plugin.js';

function arg(name: string, fallback?: string): string | undefined {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.slice(name.length + 3) : fallback;
}

const command = process.argv[2] ?? 'check';
const projectRoot = resolve(arg('root') ?? process.cwd());
const channelInput = arg('channel') ?? process.env.ABA_CONTENT_CHANNEL ?? 'dev';
const format = (arg('format') ?? 'pretty') as 'pretty' | 'github';

const parsedChannel = Channel.safeParse(channelInput);
if (!parsedChannel.success) {
	console.error(`Unknown channel "${channelInput}". Use dev, pr, or release.`);
	process.exit(2);
}

const result = await compile({
	root: join(projectRoot, 'content'),
	channel: parsedChannel.data,
	outDir: join(projectRoot, 'src/lib/content/generated'),
	emit: command !== 'check'
});

console.log(formatResult(result, format));

if (result.ok && command === 'build') {
	await writeGenerated(join(projectRoot, 'src/lib/content/generated'), result);
	console.log(`\nWrote ${result.assets.length} asset(s).`);
}

process.exit(result.ok ? 0 : 1);
