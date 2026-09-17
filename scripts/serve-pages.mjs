#!/usr/bin/env node
/**
 * A static server that resolves URLs the way GitHub Pages does.
 *
 * Why this exists rather than `vite preview` or `python -m http.server`: the service
 * worker precaches extensionless URLs (`glossary`, not `glossary.html`), because that is
 * what SvelteKit emits with `trailingSlash: 'never'`. GitHub Pages serves those from the
 * matching `.html` file with a 200. A plain static server instead returns a 301 to the
 * directory form, and Workbox treats a redirect during precaching as a failure — so the
 * service worker installs forever and offline silently never works.
 *
 * Testing offline against a server that routes differently from production tells you
 * nothing, which is exactly how that bug stayed invisible.
 *
 * Usage: node scripts/serve-pages.mjs [--dir build] [--base /aba-help] [--port 4173]
 */
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const arg = (name, fallback) => {
	const i = process.argv.indexOf(`--${name}`);
	return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const root = resolve(arg('dir', 'build'));
const base = arg('base', '').replace(/\/$/, '');
const port = Number(arg('port', '4173'));

const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.webmanifest': 'application/manifest+json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.ico': 'image/x-icon',
	'.txt': 'text/plain; charset=utf-8',
	'.woff2': 'font/woff2',
	'.map': 'application/json; charset=utf-8'
};

/**
 * Types GitHub Pages compresses. Serving these uncompressed is not a neutral
 * simplification: it roughly quadruples what a performance audit thinks the app costs,
 * and the first run of Lighthouse against this server blamed the app for half a megabyte
 * that production never sends.
 */
const COMPRESSIBLE = new Set([
	'.html',
	'.js',
	'.mjs',
	'.css',
	'.json',
	'.webmanifest',
	'.svg',
	'.txt',
	'.map'
]);

async function firstExisting(candidates) {
	for (const c of candidates) {
		try {
			const s = await stat(c);
			if (s.isFile()) return { file: c, stat: s };
		} catch {
			// try the next candidate
		}
	}
	return null;
}

/**
 * Read once, compress once.
 *
 * The suite asks for the same few hundred files over and over — one Playwright project
 * alone reloads the largest chunk dozens of times — and the first version of this server
 * re-read and re-gzipped every byte on every request. That is a fixed cost per page load
 * paid entirely by the test run, so the bodies are held in memory, keyed by the file's
 * mtime and size so a rebuild between runs is still picked up.
 *
 * The budget exists so this cannot quietly become a memory leak if the build grows or
 * somebody points the server at a large directory; past it, files are served by reading
 * them each time, exactly as before.
 */
const CACHE_BUDGET = 64 * 1024 * 1024;
const cache = new Map();
let cached = 0;

async function body(file, info) {
	const hit = cache.get(file);
	if (hit && hit.mtimeMs === info.mtimeMs && hit.size === info.size) return hit;

	const raw = await readFile(file);
	const digest = createHash('sha1').update(raw).digest('base64url');
	const entry = {
		mtimeMs: info.mtimeMs,
		size: info.size,
		raw,
		gz: COMPRESSIBLE.has(extname(file)) ? gzipSync(raw) : null,
		/*
		 * Pages sends one too, and it is what turns a repeated request into a 304 rather
		 * than another full transfer. Two of them, because an entity tag identifies a
		 * representation and not a file: the gzipped and identity bodies are different
		 * bytes, so handing both the same tag would let a cache validate one against the
		 * other. `Vary` alone is not a substitute for that.
		 */
		etag: `"${digest}"`,
		gzEtag: `"${digest}-gz"`
	};

	if (hit) cached -= hit.raw.length + (hit.gz?.length ?? 0);
	const cost = entry.raw.length + (entry.gz?.length ?? 0);
	if (cached + cost <= CACHE_BUDGET) {
		cache.set(file, entry);
		cached += cost;
	} else if (hit) {
		cache.delete(file);
	}
	return entry;
}

const server = createServer(async (req, res) => {
	const url = new URL(req.url ?? '/', 'http://localhost');
	let pathname = decodeURIComponent(url.pathname);

	if (base && pathname.startsWith(base)) pathname = pathname.slice(base.length) || '/';
	else if (base && pathname !== '/') {
		res.writeHead(404).end('Not found (outside base path)');
		return;
	}

	// Block traversal above the served root.
	const rel = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
	const direct = join(root, rel);

	const found = await firstExisting([
		direct,
		`${direct}.html`, // the Pages behaviour that matters here
		join(direct, 'index.html')
	]);

	if (!found) {
		const notFound = await firstExisting([join(root, '404.html')]);
		res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
		if (notFound) res.end((await body(notFound.file, notFound.stat)).raw);
		else res.end('Not found');
		return;
	}

	const { file } = found;
	const ext = extname(file);
	const entry = await body(file, found.stat);
	const gzip = entry.gz !== null && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');

	const headers = {
		'content-type': TYPES[ext] ?? 'application/octet-stream',
		/*
		 * Unchanged, deliberately: this server exists to route and compress the way Pages
		 * does, so the caching policy a performance audit sees has to stay the real one.
		 * The ETag below is a revalidation hint on top of that, not a longer lifetime.
		 */
		'cache-control': file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=0',
		vary: 'Accept-Encoding',
		etag: gzip ? entry.gzEtag : entry.etag
	};

	if (req.headers['if-none-match'] === headers.etag) {
		res.writeHead(304, headers).end();
		return;
	}

	const payload = gzip ? entry.gz : entry.raw;
	res.writeHead(200, {
		...headers,
		'content-length': String(payload.length),
		...(gzip ? { 'content-encoding': 'gzip' } : {})
	});
	res.end(req.method === 'HEAD' ? undefined : payload);
});

server.listen(port, () => {
	console.log(`serving ${root} at http://localhost:${port}${base || ''}/`);
});
