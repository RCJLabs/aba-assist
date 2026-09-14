import type { CompileResult, Issue } from './types.js';

export function formatIssue(i: Issue): string {
	const loc = i.file ? `${i.file}${i.line ? `:${i.line}` : ''}` : '(content)';
	return `  ${loc}\n    [${i.rule}] ${i.message}`;
}

/** GitHub Actions annotation, so failures land on the diff rather than only in the log. */
export function formatAnnotation(i: Issue): string {
	const level = i.severity === 'error' ? 'error' : 'warning';
	const parts = [i.file ? `file=${i.file}` : '', i.line ? `line=${i.line}` : '']
		.filter(Boolean)
		.join(',');
	const msg = `[${i.rule}] ${i.message}`.replace(/\n/g, '%0A');
	return `::${level} ${parts}::${msg}`;
}

export function formatResult(r: CompileResult, format: 'pretty' | 'github'): string {
	const lines: string[] = [];

	if (format === 'github') {
		for (const i of [...r.errors, ...r.warnings]) lines.push(formatAnnotation(i));
	} else {
		if (r.errors.length) {
			lines.push(`\n✗ ${r.errors.length} content error(s):\n`);
			for (const i of r.errors) lines.push(formatIssue(i));
		}
		if (r.warnings.length) {
			lines.push(`\n⚠ ${r.warnings.length} warning(s):\n`);
			for (const i of r.warnings) lines.push(formatIssue(i));
		}
	}

	const counts = Object.entries(r.counts)
		.map(([k, v]) => `${v} ${k}`)
		.join(', ');
	lines.push(
		`\n${r.ok ? '✓' : '✗'} channel=${r.channel} version=${r.contentVersion} — ${counts}`
	);

	return lines.join('\n');
}
