/**
 * Reading a backup file back in.
 *
 * This is a trust boundary. The file arrives from a file picker, so it may be any JSON on
 * the device: a different app's export, a truncated download, a file somebody edited by
 * hand. Everything here exists to make sure that whatever lands in IndexedDB is the shape
 * the rest of the app assumes, because a half-valid restore is worse than a refused one —
 * it fails later, somewhere else, with the original file already gone.
 *
 * Two rules the validation inherits from the app's own promises:
 *
 * - **A supervisee code is still a code.** The structural reason this app holds no client
 *   data is that there is nowhere to put a name. That has to be true at the import
 *   boundary too, or the guard is only a guard on the form.
 * - **Nothing is silently dropped.** Every rejected row is counted and reported, so a
 *   restore that lost something says so rather than looking like a success.
 *
 * Validated by hand rather than with a schema library: this is the only runtime validation
 * in the client, and shipping a validator to every reader to check a file most of them
 * will never import is not a trade worth making.
 */
import { isSuperviseeCode, phiWarnings } from '$lib/tracker/phi.js';
import type {
	Cycle,
	DevelopmentUnit,
	DrillAttempt,
	FieldworkMonth,
	FieldworkPeriod,
	QuizAttempt,
	ReviewDecision,
	ServiceMonth,
	Supervisee,
	SupervisionEntry,
	SupervisionQuestion,
	QuestionTopic,
	Workplace
} from './index.js';
import type { CardRecord, ReviewRecord } from './scheduler.js';

/** Marks a file as ours, so an unrelated JSON gets a useful message instead of nothing. */
export const BACKUP_KIND = 'aba-assist-backup';

export interface BackupPayload {
	kind: typeof BACKUP_KIND;
	version: number;
	exportedAt: number;
	cards: CardRecord[];
	reviewLog: ReviewRecord[];
	quizAttempts: QuizAttempt[];
	drillAttempts: DrillAttempt[];
	reviewDecisions: ReviewDecision[];
	supervisees: Supervisee[];
	workplaces: Workplace[];
	supervisionEntries: SupervisionEntry[];
	serviceMonths: ServiceMonth[];
	cycles: Cycle[];
	developmentUnits: DevelopmentUnit[];
	fieldworkPeriods: FieldworkPeriod[];
	fieldworkMonths: FieldworkMonth[];
	supervisionQuestions: SupervisionQuestion[];
}

export interface BackupReport {
	/** Rows accepted, by store. */
	counts: Record<string, number>;
	/** Rows rejected, by store, with the reason. */
	dropped: { store: string; reason: string; count: number }[];
	/** Supervision notes that look like they carry an identifier. A warning, never a block. */
	notesToCheck: number;
}

export type ValidateResult =
	{ ok: true; data: BackupPayload; report: BackupReport } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string';
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const bool = (v: unknown): v is boolean => typeof v === 'boolean';
const day = (v: unknown): v is string => str(v) && /^\d{4}-\d{2}-\d{2}$/.test(v);
const month = (v: unknown): v is string => str(v) && /^\d{4}-\d{2}$/.test(v);
const oneOf = <T extends string>(opts: readonly T[], v: unknown): v is T =>
	str(v) && (opts as readonly string[]).includes(v);

/**
 * Keep the rows that validate, count the ones that do not.
 *
 * Per-row rather than all-or-nothing: one corrupt flashcard should not cost somebody two
 * years of supervision records, and the report says exactly what was lost.
 */
function sift<T>(
	store: string,
	value: unknown,
	check: (row: Record<string, unknown>) => T | null,
	dropped: BackupReport['dropped']
): T[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) {
		dropped.push({ store, reason: 'not a list', count: 1 });
		return [];
	}
	const out: T[] = [];
	let bad = 0;
	for (const row of value) {
		const kept = isObj(row) ? check(row) : null;
		if (kept === null) bad++;
		else out.push(kept);
	}
	if (bad > 0) dropped.push({ store, reason: 'wrong shape', count: bad });
	return out;
}

export function validateBackup(raw: unknown, currentVersion: number): ValidateResult {
	if (!isObj(raw))
		return { ok: false, error: 'That file is not a backup — it is not an object.' };
	if (raw.kind !== BACKUP_KIND) {
		return {
			ok: false,
			error:
				'That file was not exported by this app. Choose the JSON file you downloaded from Settings.'
		};
	}
	if (!num(raw.version))
		return { ok: false, error: 'That backup has no version, so it cannot be read safely.' };
	if (raw.version > currentVersion) {
		// A newer build wrote it. Importing would quietly drop whatever this build has no
		// store for, which is the kind of loss somebody discovers months later.
		return {
			ok: false,
			error: `That backup was written by a newer version of the app (data version ${raw.version}, this build reads ${currentVersion}). Update the app first.`
		};
	}

	const dropped: BackupReport['dropped'] = [];

	const cards = sift<CardRecord>(
		'cards',
		raw.cards,
		(r) =>
			str(r.id) &&
			num(r.due) &&
			num(r.stability) &&
			num(r.difficulty) &&
			num(r.reps) &&
			num(r.lapses) &&
			num(r.state)
				? {
						id: r.id,
						due: r.due,
						stability: r.stability,
						difficulty: r.difficulty,
						elapsedDays: num(r.elapsedDays) ? r.elapsedDays : 0,
						scheduledDays: num(r.scheduledDays) ? r.scheduledDays : 0,
						learningSteps: num(r.learningSteps) ? r.learningSteps : 0,
						reps: r.reps,
						lapses: r.lapses,
						state: r.state,
						lastReview: num(r.lastReview) ? r.lastReview : null,
						createdAt: num(r.createdAt) ? r.createdAt : Date.now()
					}
				: null,
		dropped
	);

	const reviewLog = sift<ReviewRecord>(
		'reviewLog',
		raw.reviewLog,
		(r) =>
			str(r.cardId) && num(r.grade) && num(r.reviewedAt)
				? {
						cardId: r.cardId,
						grade: r.grade as ReviewRecord['grade'],
						reviewedAt: r.reviewedAt,
						scheduledDays: num(r.scheduledDays) ? r.scheduledDays : 0,
						state: num(r.state) ? r.state : 0
					}
				: null,
		dropped
	);

	const quizAttempts = sift<QuizAttempt>(
		'quizAttempts',
		raw.quizAttempts,
		(r) =>
			str(r.id) && str(r.credential) && num(r.total) && num(r.correct) && num(r.finishedAt)
				? {
						id: r.id,
						credential: r.credential,
						domain: str(r.domain) ? r.domain : 'all',
						startedAt: num(r.startedAt) ? r.startedAt : r.finishedAt,
						finishedAt: r.finishedAt,
						total: r.total,
						correct: r.correct,
						perDomain: isObj(r.perDomain) ? (r.perDomain as QuizAttempt['perDomain']) : {},
						missed: Array.isArray(r.missed) ? r.missed.filter(str) : [],
						tasks: Array.isArray(r.tasks) ? r.tasks.filter(str) : []
					}
				: null,
		dropped
	);

	/*
	 * Drill sittings. Added in v5, so a file exported before then simply has none — which is
	 * the ordinary case for a while and must not read as a rejected store.
	 *
	 * `missedPairs` is filtered down to strings that look like the `a|b` key the app writes,
	 * because it is rendered as two glossary links: anything else would either 404 or, worse,
	 * be interpolated into a href. A hand-edited file is exactly the input this is for.
	 */
	const drillAttempts = sift<DrillAttempt>(
		'drillAttempts',
		raw.drillAttempts,
		(r) =>
			str(r.id) && num(r.total) && num(r.correct) && num(r.finishedAt)
				? {
						id: r.id,
						// Never defaulted to 'pairs': a restored measurement sitting that came back
						// as a pair sitting would be counted into the pair statistics, silently and
						// plausibly, and nothing on screen would look wrong.
						kind: r.kind === 'data' || r.kind === 'graph' ? r.kind : 'pairs',
						startedAt: num(r.startedAt) ? r.startedAt : r.finishedAt,
						finishedAt: r.finishedAt,
						total: r.total,
						correct: r.correct,
						categories: Array.isArray(r.categories) ? r.categories.filter(str) : [],
						missedPairs: Array.isArray(r.missedPairs)
							? r.missedPairs.filter(
									(x): x is string => str(x) && /^[a-z0-9-]+\|[a-z0-9-]+$/.test(x)
								)
							: []
					}
				: null,
		dropped
	);

	const reviewDecisions = sift<ReviewDecision>(
		'reviewDecisions',
		raw.reviewDecisions,
		(r) =>
			str(r.id) &&
			str(r.kind) &&
			oneOf(['approved', 'needs-change'] as const, r.decision) &&
			num(r.decidedAt)
				? {
						id: r.id,
						kind: r.kind as ReviewDecision['kind'],
						decision: r.decision,
						note: str(r.note) ? r.note : '',
						decidedAt: r.decidedAt
					}
				: null,
		dropped
	);

	// The one guard that is about safety rather than shape.
	let namedSupervisees = 0;
	const supervisees = sift<Supervisee>(
		'supervisees',
		raw.supervisees,
		(r) => {
			if (!str(r.id) || !str(r.code)) return null;
			if (!isSuperviseeCode(r.code)) {
				namedSupervisees++;
				return null;
			}
			return {
				id: r.id,
				code: r.code.toUpperCase(),
				role: oneOf(['RBT', 'BCaBA', 'trainee'] as const, r.role) ? r.role : 'RBT',
				active: bool(r.active) ? r.active : true,
				createdAt: num(r.createdAt) ? r.createdAt : Date.now()
			};
		},
		dropped
	);
	if (namedSupervisees > 0) {
		dropped.push({
			store: 'supervisees',
			reason: 'the code was not a code — this app does not store names',
			count: namedSupervisees
		});
	}

	const workplaces = sift<Workplace>(
		'workplaces',
		raw.workplaces,
		(r) =>
			str(r.id) && str(r.label)
				? {
						id: r.id,
						label: r.label.slice(0, 120),
						active: bool(r.active) ? r.active : true,
						createdAt: num(r.createdAt) ? r.createdAt : Date.now()
					}
				: null,
		dropped
	);

	let notesToCheck = 0;
	const supervisionEntries = sift<SupervisionEntry>(
		'supervisionEntries',
		raw.supervisionEntries,
		(r) => {
			if (!str(r.id) || !day(r.date) || !num(r.minutes) || !str(r.workplaceId)) return null;
			const note = str(r.note) ? r.note.slice(0, 2000) : '';
			if (note && phiWarnings(note).length > 0) notesToCheck++;
			return {
				id: r.id,
				date: r.date,
				minutes: r.minutes,
				format: oneOf(['individual', 'small-group'] as const, r.format)
					? r.format
					: 'individual',
				modality: oneOf(['in-person', 'live-video'] as const, r.modality)
					? r.modality
					: 'in-person',
				observed: bool(r.observed) ? r.observed : false,
				workplaceId: r.workplaceId,
				superviseeId: str(r.superviseeId) ? r.superviseeId : null,
				note
			};
		},
		dropped
	);

	const serviceMonths = sift<ServiceMonth>(
		'serviceMonths',
		raw.serviceMonths,
		(r) =>
			str(r.id) && month(r.month) && str(r.workplaceId) && num(r.hours)
				? { id: r.id, month: r.month, workplaceId: r.workplaceId, hours: r.hours }
				: null,
		dropped
	);

	const cycles = sift<Cycle>(
		'cycles',
		raw.cycles,
		(r) =>
			str(r.id) &&
			oneOf(['RBT', 'BCBA', 'BCaBA'] as const, r.credential) &&
			day(r.startDate) &&
			day(r.endDate)
				? {
						id: r.id,
						credential: r.credential,
						startDate: r.startDate,
						endDate: r.endDate,
						supervisedOthers: bool(r.supervisedOthers) ? r.supervisedOthers : false
					}
				: null,
		dropped
	);

	const developmentUnits = sift<DevelopmentUnit>(
		'developmentUnits',
		raw.developmentUnits,
		(r) =>
			str(r.id) && str(r.cycleId) && day(r.date) && num(r.units)
				? {
						id: r.id,
						cycleId: r.cycleId,
						date: r.date,
						units: r.units,
						kind: oneOf(
							[
								'learning',
								'teaching',
								'scholarship',
								'in-service',
								'university-course'
							] as const,
							r.kind
						)
							? r.kind
							: 'learning',
						topic: oneOf(['general', 'ethics', 'supervision'] as const, r.topic)
							? r.topic
							: 'general',
						title: str(r.title) ? r.title.slice(0, 200) : 'Untitled',
						provider: str(r.provider) ? r.provider.slice(0, 200) : ''
					}
				: null,
		dropped
	);

	// A fieldwork period names its supervisor by code, and the code rule holds here too.
	let namedSupervisors = 0;
	const fieldworkPeriods = sift<FieldworkPeriod>(
		'fieldworkPeriods',
		raw.fieldworkPeriods,
		(r) => {
			if (!str(r.id) || !day(r.startDate)) return null;
			const code = str(r.supervisorCode) ? r.supervisorCode.toUpperCase() : '';
			if (code && !isSuperviseeCode(code)) {
				namedSupervisors++;
				return null;
			}
			return {
				id: r.id,
				startDate: r.startDate,
				ruleset: oneOf(['current', '2027'] as const, r.ruleset) ? r.ruleset : 'current',
				supervisorCode: code,
				createdAt: num(r.createdAt) ? r.createdAt : Date.now()
			};
		},
		dropped
	);
	if (namedSupervisors > 0) {
		dropped.push({
			store: 'fieldworkPeriods',
			reason: 'the supervisor code was not a code — this app does not store names',
			count: namedSupervisors
		});
	}

	const fieldworkMonths = sift<FieldworkMonth>(
		'fieldworkMonths',
		raw.fieldworkMonths,
		(r) => {
			if (!str(r.id) || !str(r.periodId) || !month(r.month) || !num(r.totalHours)) return null;
			const note = str(r.note) ? r.note.slice(0, 2000) : '';
			if (note && phiWarnings(note).length > 0) notesToCheck++;
			return {
				id: r.id,
				periodId: r.periodId,
				month: r.month,
				type: oneOf(['supervised', 'concentrated'] as const, r.type) ? r.type : 'supervised',
				totalHours: r.totalHours,
				unrestrictedHours: num(r.unrestrictedHours) ? r.unrestrictedHours : 0,
				supervisionHours: num(r.supervisionHours) ? r.supervisionHours : 0,
				individualSupervisionHours: num(r.individualSupervisionHours)
					? r.individualSupervisionHours
					: 0,
				contacts: num(r.contacts) ? r.contacts : 0,
				observedWithClient: bool(r.observedWithClient) ? r.observedWithClient : false,
				observationMinutes: num(r.observationMinutes) ? r.observationMinutes : 0,
				note
			};
		},
		dropped
	);

	const TOPICS = [
		'the-plan',
		'a-procedure',
		'data-and-measurement',
		'a-reaction-i-did-not-expect',
		'scope-and-role',
		'documentation',
		'something-else'
	] as const;

	/*
	 * Parked questions. The one free-text field here gets the same treatment as a supervision
	 * note — counted toward the warning, never rejected for it — and an unknown topic falls
	 * back rather than dropping the row: the question is the part worth keeping, and losing
	 * it because a future build renamed a topic would be the wrong trade.
	 */
	const supervisionQuestions = sift<SupervisionQuestion>(
		'supervisionQuestions',
		raw.supervisionQuestions,
		(r) => {
			if (!str(r.id) || !str(r.question) || !num(r.raisedAt)) return null;
			const question = r.question.slice(0, 500);
			if (question && phiWarnings(question).length > 0) notesToCheck++;
			return {
				id: r.id,
				superviseeId: str(r.superviseeId) ? r.superviseeId : null,
				topic: (oneOf(TOPICS, r.topic) ? r.topic : 'something-else') as QuestionTopic,
				question,
				raisedAt: r.raisedAt,
				answeredAt: num(r.answeredAt) ? r.answeredAt : null
			};
		},
		dropped
	);

	const data: BackupPayload = {
		kind: BACKUP_KIND,
		version: raw.version,
		exportedAt: num(raw.exportedAt) ? raw.exportedAt : Date.now(),
		cards,
		reviewLog,
		quizAttempts,
		drillAttempts,
		reviewDecisions,
		supervisees,
		workplaces,
		supervisionEntries,
		serviceMonths,
		cycles,
		developmentUnits,
		fieldworkPeriods,
		fieldworkMonths,
		supervisionQuestions
	};

	const counts: Record<string, number> = {
		cards: cards.length,
		reviewLog: reviewLog.length,
		quizAttempts: quizAttempts.length,
		drillAttempts: drillAttempts.length,
		reviewDecisions: reviewDecisions.length,
		supervisees: supervisees.length,
		workplaces: workplaces.length,
		supervisionEntries: supervisionEntries.length,
		serviceMonths: serviceMonths.length,
		cycles: cycles.length,
		developmentUnits: developmentUnits.length,
		fieldworkPeriods: fieldworkPeriods.length,
		fieldworkMonths: fieldworkMonths.length,
		supervisionQuestions: supervisionQuestions.length
	};

	if (Object.values(counts).every((n) => n === 0)) {
		return {
			ok: false,
			error: 'That backup is readable but contains nothing this app can restore.'
		};
	}

	return { ok: true, data, report: { counts, dropped, notesToCheck } };
}

/** Total rows a report accounts for, for a one-line summary. */
export function totalRows(counts: Record<string, number>): number {
	return Object.values(counts).reduce((a, b) => a + b, 0);
}

/** After this long without a backup, the app starts saying so. */
export const NUDGE_AFTER_DAYS = 30;

export function daysSince(then: number, now: number): number {
	return Math.floor((now - then) / 86_400_000);
}

/**
 * Whether the reader should be told to take a backup.
 *
 * Never before they have anything worth backing up, and never on the strength of an
 * export they took this month. A `lastBackup` of null means they have never taken one,
 * which is the case that matters most.
 */
export function backupIsOverdue(
	lastBackup: number | null,
	hasData: boolean,
	now: number
): boolean {
	if (!hasData) return false;
	if (lastBackup === null) return true;
	return daysSince(lastBackup, now) >= NUDGE_AFTER_DAYS;
}

export function backupFilename(now: Date): string {
	return `aba-assist-backup-${now.toISOString().slice(0, 10)}.json`;
}
