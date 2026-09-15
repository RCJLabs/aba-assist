/**
 * CSV export for the tracker.
 *
 * The point is not convenience — it is that a supervision record has to survive this app.
 * Technicians and analysts have to keep supervision documentation for seven years, and a
 * record that lives only in one browser's IndexedDB is one cleared cache away from gone.
 * So the export is part of the feature, not an extra, and it is free.
 */
import type {
	Cycle,
	DevelopmentUnit,
	FieldworkMonth,
	FieldworkPeriod,
	ServiceMonth,
	Supervisee,
	SupervisionEntry,
	Workplace
} from '$lib/db/index.js';

/**
 * Quote a field for CSV.
 *
 * A leading `=`, `+`, `-` or `@` is prefixed with an apostrophe: spreadsheets treat those
 * as the start of a formula, and this data goes straight into one. Nothing here should
 * ever contain such a string, which is exactly why it should not execute if it does.
 */
function field(value: string | number | boolean | null | undefined): string {
	if (value === null || value === undefined) return '';
	let s = String(value);
	if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
	return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: (string | number | boolean | null)[][]): string {
	// CRLF and a trailing newline, which is what RFC 4180 says and what Excel expects.
	return [header, ...rows].map((r) => r.map(field).join(',')).join('\r\n') + '\r\n';
}

export function supervisionCsv(
	entries: SupervisionEntry[],
	workplaces: Workplace[],
	supervisees: Supervisee[],
	serviceMonths: ServiceMonth[]
): string {
	const place = new Map(workplaces.map((w) => [w.id, w.label]));
	const code = new Map(supervisees.map((s) => [s.id, s.code]));
	const hoursFor = new Map(serviceMonths.map((m) => [`${m.workplaceId}:${m.month}`, m.hours]));

	const rows = [...entries]
		.sort((a, b) => a.date.localeCompare(b.date))
		.map((e) => [
			e.date,
			place.get(e.workplaceId) ?? e.workplaceId,
			e.superviseeId ? (code.get(e.superviseeId) ?? e.superviseeId) : '',
			e.minutes,
			e.format,
			e.modality,
			e.observed ? 'yes' : 'no',
			hoursFor.get(`${e.workplaceId}:${e.date.slice(0, 7)}`) ?? '',
			e.note
		]);

	return toCsv(
		[
			'date',
			'workplace',
			'supervisee code',
			'minutes',
			'format',
			'modality',
			'observed client work',
			'service hours that month',
			'note'
		],
		rows
	);
}

export function developmentCsv(units: DevelopmentUnit[], cycles: Cycle[]): string {
	const cycleLabel = new Map(cycles.map((c) => [c.id, `${c.startDate} to ${c.endDate}`]));
	const rows = [...units]
		.sort((a, b) => a.date.localeCompare(b.date))
		.map((u) => [
			u.date,
			cycleLabel.get(u.cycleId) ?? u.cycleId,
			u.units,
			u.kind,
			u.topic,
			u.title,
			u.provider
		]);
	return toCsv(['date', 'cycle', 'units', 'type', 'topic', 'title', 'provider'], rows);
}

/**
 * The monthly fieldwork record, in the shape the verification form asks for.
 *
 * Fieldwork is verified a month at a time and audited against a log the trainee keeps,
 * which is a document that has to outlive any one browser. So this is not a convenience —
 * it is the artifact.
 */
export function fieldworkCsv(
	months: FieldworkMonth[],
	period: FieldworkPeriod | null
): string {
	const rows = [...months]
		.sort((a, b) => a.month.localeCompare(b.month))
		.map((m) => [
			m.month,
			m.type,
			period?.supervisorCode ?? '',
			m.totalHours,
			m.unrestrictedHours,
			m.totalHours - m.unrestrictedHours,
			m.supervisionHours,
			m.individualSupervisionHours,
			m.contacts,
			m.observedWithClient ? 'yes' : 'no',
			m.observationMinutes,
			m.note
		]);

	return toCsv(
		[
			'month',
			'fieldwork type',
			'supervisor code',
			'total hours',
			'unrestricted hours',
			'restricted hours',
			'supervision hours',
			'individual supervision hours',
			'supervisor contacts',
			'observed with a client',
			'observation minutes',
			'note'
		],
		rows
	);
}
