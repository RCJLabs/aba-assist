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
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream';

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
			if (s.isFile()) return c;
		} catch {
			// try the next candidate
		}
	}
	return null;
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

	const file = await firstExisting([
		direct,
		`${direct}.html`, // the Pages behaviour that matters here
		join(direct, 'index.html')
	]);

	if (!file) {
		const notFound = await firstExisting([join(root, '404.html')]);
		res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
		if (notFound) createReadStream(notFound).pipe(res);
		else res.end('Not found');
		return;
	}

	const ext = extname(file);
	const gzip = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');

	res.writeHead(200, {
		'content-type': TYPES[ext] ?? 'application/octet-stream',
		// Service workers must not be served from a stale cache.
		'cache-control': file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=0',
		vary: 'Accept-Encoding',
		...(gzip ? { 'content-encoding': 'gzip' } : {})
	});
	const stream = createReadStream(file);
	if (gzip) {
		pipeline(stream, createGzip(), res, () => {});
	} else {
		stream.pipe(res);
	}
});

server.listen(port, () => {
	console.log(`serving ${root} at http://localhost:${port}${base || ''}/`);
});
