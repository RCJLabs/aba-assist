import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Every colour pair the themes commit to, checked against the ratio it owes.
 *
 * The dial has had its own three-way check since it was built. This is the rest of the
 * palette, and it exists because the Signal pass found two failures that had been shipping:
 * the old `--border` was 1.57 against the page while bounding real controls, and a caution
 * band drawn white-on-amber was 2.16. Neither is visible by looking; both are arithmetic.
 *
 * Read from the stylesheet rather than from a duplicate list of hexes, so a token edited in
 * `app.css` and nowhere else still has to pass.
 */
const css = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');

const luminance = (hex: string) => {
	const channel = (n: number) => {
		const v = n / 255;
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	};
	return (
		0.2126 * channel(parseInt(hex.slice(1, 3), 16)) +
		0.7152 * channel(parseInt(hex.slice(3, 5), 16)) +
		0.0722 * channel(parseInt(hex.slice(5, 7), 16))
	);
};

const ratio = (a: string, b: string) => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi! + 0.05) / (lo! + 0.05);
};

/** Each theme block, sliced from its opening declaration to the one that follows it. */
const themes = {
	light: css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: dark)')),
	'dark (system)': css.slice(
		css.indexOf("\t:root:not([data-theme='light']) {"),
		css.indexOf("\n:root[data-theme='dark'] {")
	),
	'dark (chosen)': css.slice(css.indexOf("\n:root[data-theme='dark'] {"), css.indexOf('\n* {'))
};

const token = (name: string, block: string) =>
	new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(block)?.[1] ?? null;

/**
 * `[foreground, background, minimum]`.
 *
 * 4.5 is 1.4.3 for body text; 3 is 1.4.11 for anything needed to identify a control. The
 * two weights of line are the reason that distinction is worth stating: `--border` bounds
 * controls and owes 3:1, while `--hair` only separates paragraphs and owes nothing, which
 * is exactly why it is a separate token rather than a lighter use of the same one.
 */
const PAIRS: [string, string, number][] = [
	['--text', '--bg', 4.5],
	['--text', '--surface', 4.5],
	['--text', '--surface-raised', 4.5],
	['--text-muted', '--bg', 4.5],
	['--text-muted', '--surface', 4.5],
	['--link', '--bg', 4.5],
	['--link', '--surface', 4.5],
	['--accent-text', '--accent', 4.5],
	['--yes', '--bg', 4.5],
	['--yes', '--surface', 4.5],
	['--border', '--bg', 3],
	['--border', '--surface', 3],
	['--focus', '--bg', 3],
	['--caution-text', '--caution-bg', 4.5],
	['--caution-border', '--bg', 3],
	['--stop-text', '--stop-bg', 4.5],
	['--stop-border', '--bg', 3]
];

describe('the palette', () => {
	for (const [name, block] of Object.entries(themes)) {
		describe(name, () => {
			for (const [fg, bg, need] of PAIRS) {
				it(`${fg} on ${bg} clears ${need}:1`, () => {
					const a = token(fg, block);
					const b = token(bg, block);
					expect(a, `${fg} is missing from the ${name} block`).not.toBeNull();
					expect(b, `${bg} is missing from the ${name} block`).not.toBeNull();
					expect(ratio(a!, b!)).toBeGreaterThanOrEqual(need);
				});
			}

			/*
			 * The two line weights have to stay distinguishable from each other, or the
			 * distinction they encode — this bounds a control, this only separates prose —
			 * stops being visible and somebody uses whichever is nearer to hand.
			 */
			it('separates the control border from the decorative hairline', () => {
				const border = token('--border', block);
				const hair = token('--hair', block);
				expect(border, 'no --border').not.toBeNull();
				expect(hair, 'no --hair').not.toBeNull();
				expect(border).not.toBe(hair);
				expect(ratio(border!, hair!)).toBeGreaterThan(1.5);
			});
		});
	}

	/*
	 * The theme toggle sets `data-theme` explicitly, and the media query catches everyone
	 * who never opened settings. A token defined in one and not the other is a page that
	 * changes colour depending on how the reader arrived at dark mode — which is the bug
	 * the comment at the top of `app.css` warns about, now enforced rather than described.
	 */
	it('defines the same tokens in both dark blocks, at the same values', () => {
		const names = [...themes['dark (chosen)'].matchAll(/(--[a-z-]+):\s*#[0-9a-f]{6}/gi)].map(
			(m) => m[1]!
		);
		expect(names.length).toBeGreaterThan(10);
		for (const n of names) {
			expect(token(n, themes['dark (system)']), `${n} in the media query`).toBe(
				token(n, themes['dark (chosen)'])
			);
		}
	});
});
