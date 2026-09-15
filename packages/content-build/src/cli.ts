#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Channel } from '@aba/content-schema';
import { applyDecisions, parseExport } from './apply-review.js';
import { compile } from './compile.js';
import { formatResult } from './report.js';
import { writeGenerated } from './vite-plugin.js';

function arg(name: string, fallback?: string): string | undefined {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.slice(name.length + 3) : fallback;
}

function flag(name: string): boolean {
	return process.argv.includes(`--${name}`);
}

const command = process.argv[2] ?? 'check';
const projectRoot = resolve(arg('root') ?? process.cwd());

if (command === 'apply-review') {
	const file = arg('file');
	if (!file) {
		console.error('Usage: aba-content apply-review --file=decisions.json [--dry-run]');
		process.exit(2);
	}
	const raw = await readFile(resolve(file), 'utf8');
	const parsed = parseExport(raw);
	if (parsed.errors.length > 0) {
		for (const e of parsed.errors) console.error(`✗ ${e}`);
		process.exit(1);
	}
	const result = await applyDecisions({
		root: projectRoot,
		decisions: parsed.decisions,
		reviewer: arg('reviewer') ?? parsed.reviewer,
		today: arg('date') ?? new Date().toISOString().slice(0, 10),
		dryRun: flag('dry-run')
	});

	for (const e of result.errors) console.error(`✗ ${e}`);
	if (result.ok) {
		const approved = result.applied.filter((a) => a.status === 'approved').length;
		const flagged = result.applied.length - approved;
		console.log(
			`${flag('dry-run') ? 'Would apply' : 'Applied'} ${result.applied.length} decision(s): ` +
				`${approved} approved, ${flagged} needing an update.`
		);
		for (const file of result.files) console.log(`  ${file}`);
		for (const file of result.expandedAnchors) {
			console.log(`  (expanded the shared review anchor in ${file})`);
		}
		for (const item of result.applied) {
			if (item.droppedNote) {
				console.log(
					`  note dropped on approving ${item.kind} ${item.id}: ${item.droppedNote}`
				);
			}
		}
	}
	process.exit(result.ok ? 0 : 1);
}

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
