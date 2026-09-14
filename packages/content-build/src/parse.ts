import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import matter from 'gray-matter';
import { parse as parseYaml } from 'yaml';
import { type Issue, error } from './types.js';

export interface ParsedFile {
	/** Repo-relative path, POSIX separators, for stable error messages. */
	file: string;
	/** Directory names between the collection root and the file. */
	dirs: string[];
	/** Filename without extension. */
	basename: string;
	data: unknown;
	body: string;
}

/** Recursively list files with the given extensions, sorted for deterministic builds. */
export async function discover(dir: string, exts: string[]): Promise<string[]> {
	const out: string[] = [];
	async function walk(d: string): Promise<void> {
		let entries;
		try {
			entries = await readdir(d, { withFileTypes: true });
		} catch {
			return; // collection directory does not exist yet
		}
		for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
			const p = join(d, e.name);
			if (e.isDirectory()) await walk(p);
			else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
		}
	}
	await walk(dir);
	return out.sort();
}

function toPosix(p: string): string {
	return p.split(sep).join('/');
}

export async function parseMarkdown(
	root: string,
	collectionDir: string,
	path: string
): Promise<{ parsed?: ParsedFile; issues: Issue[] }> {
	const file = toPosix(relative(root, path));
	const raw = await readFile(path, 'utf8');
	try {
		const { data, content } = matter(raw);
		const rel = toPosix(relative(collectionDir, path));
		const segs = rel.split('/');
		const name = segs.pop()!.replace(/\.md$/, '');
		return {
			parsed: { file, dirs: segs, basename: name, data, body: content.trim() },
			issues: []
		};
	} catch (e) {
		return { issues: [error('parse/frontmatter', `${(e as Error).message}`, file)] };
	}
}

export async function parseYamlFile(
	root: string,
	path: string
): Promise<{ data?: unknown; issues: Issue[] }> {
	const file = toPosix(relative(root, path));
	const raw = await readFile(path, 'utf8');
	try {
		return { data: parseYaml(raw), issues: [] };
	} catch (e) {
		return { issues: [error('parse/yaml', `${(e as Error).message}`, file)] };
	}
}

export { toPosix };
