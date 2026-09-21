/**
 * Local storage for everything the reader does: flashcard scheduling, review history,
 * quiz attempts, and content-review decisions. IndexedDB, through `idb`.
 *
 * Rules that keep this layer safe:
 *
 * - It accepts and returns plain objects only. Svelte 5 `$state` values are Proxies, and
 *   `structuredClone` (which IndexedDB uses) throws on a Proxy — so callers snapshot
 *   before writing. The lint rule that keeps components out of `$db` exists to make that
 *   boundary real.
 * - There is no client data here and no field that could hold any. Cards are keyed by
 *   glossary term id; attempts hold question ids and counts.
 * - Migrations are an append-only ladder. `DB_VERSION` is the ladder's length, so adding
 *   a migration is the only way to bump the version, and every existing install walks
 *   the same steps in the same order.
 */
import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from 'idb';
import type { CardRecord, ReviewRecord } from './scheduler.js';
import {
	lookupId,
	MAX_LOOKUPS,
	noteLookup,
	prunable,
	type Lookup,
	type LookupKind
} from '$lib/study/lookups.js';

export interface QuizAttempt {
	id: string;
	credential: string;
	/** A domain letter, or "all". */
	domain: string;
	startedAt: number;
	finishedAt: number;
	total: number;
	correct: number;
	perDomain: Record<string, { total: number; correct: number }>;
	/** Question ids answered incorrectly, for "review what I missed". */
	missed: string[];
	/**
	 * Question ids answered correctly. The other half of `missed`, and together they are
	 * every question the run put in front of the reader.
	 *
	 * Written because "what I missed" is otherwise a list that only grows. Knowing a
	 * question was missed in March says nothing about whether it is still a weak spot;
	 * knowing it was answered correctly in April says it is not. Without this field the
	 * retry queue would keep handing back questions the reader has since learned, which is
	 * the fastest way to make somebody stop opening it.
	 *
	 * Optional for the same reason `tasks` is: runs recorded before it existed cannot
	 * answer the question, and they read as an empty list — which is honest. Those runs
	 * can only ever put a question *into* the queue, never take one out.
	 */
	right?: string[];
	/**
	 * Task codes this run actually examined, e.g. `["C.4", "F.10"]`.
	 *
	 * Codes rather than question ids because the question is "has this part of the
	 * outline been looked at", and answering it from ids would mean loading the whole
	 * question bank every time the home page paints. Optional because runs recorded
	 * before this field existed have no answer; they read as an empty list, which is
	 * honest — nothing is known about what they covered.
	 */
	tasks?: string[];
}

/**
 * One finished drill sitting.
 *
 * Deliberately a summary, not a row per item. What a reader wants back from a drill is not
 * "which of the 188 generated items did I see" — those are regenerated every build and
 * their ids mean nothing to anybody — it is how the sittings went and, far more usefully,
 * *which pairs keep catching them out*. `missedPairs` is that, and it is the reason this
 * store is worth its migration.
 *
 * `kind` is what lets one store hold more than one sort of drill. It earns that now: the
 * measurement rehearsal writes `data` sittings and the graph drill writes `graph` ones, and everything that reads this
 * store filters on it, because a pair score and an agreement percentage are different
 * measurements and pooling them would produce a number that means nothing.
 *
 * The calculation drills still record nothing on purpose: that page says out loud that the
 * tally is on screen only and goes when you leave, and quietly starting to keep it would
 * make the page a liar.
 */
export interface DrillAttempt {
	id: string;
	kind: 'pairs' | 'data' | 'graph';
	startedAt: number;
	finishedAt: number;
	total: number;
	correct: number;
	/** Term categories the sitting was drawn from. Empty means a mix of everything. */
	categories: string[];
	/**
	 * The confusions, as `a|b` with the two term ids sorted.
	 *
	 * Sorted so that mistaking A for B and B for A are the same pair, which is what a
	 * confusion is — the reader cannot tell them apart, and which way round they happened to
	 * get it wrong this time is not a second fact.
	 */
	missedPairs: string[];
}

/**
 * One reviewer's verdict on one content item.
 *
 * Kept on the device rather than sent anywhere: there is no backend, and a verdict is
 * only meaningful once it reaches the content files in git. The review page exports
 * these, and `apply-review` writes them into the frontmatter.
 */
export interface ReviewDecision {
	/** Content id — a term slug, a question id, an outline id. */
	id: string;
	kind: ReviewableKind;
	decision: 'approved' | 'needs-change';
	/** Required for `needs-change`: what is wrong. */
	note: string;
	/**
	 * How an approval was reached. Glossary terms only — nothing else may be carried by a
	 * sample, and the content schemas have no field for it anywhere else.
	 */
	method?: 'read' | 'sampled';
	/** The draw that carried a sampled approval. */
	sampledWith?: string;
	decidedAt: number;
}

export type ReviewableKind =
	| 'term'
	| 'scenario'
	| 'question'
	| 'ethics-topic'
	| 'ethics-code'
	| 'practice-guide'
	| 'graph'
	| 'credential'
	| 'outline';

/**
 * Someone a user supervises, or the organisation they work for.
 *
 * Note what is absent. There is no `name`, no `dob`, no `address` — not because writing
 * one in would be discouraged, but because there is nowhere to put it. `code` is
 * constrained by `SUPERVISEE_CODE` to at most three letters and a number, which cannot
 * spell a name. That is the whole PHI strategy: make the unsafe thing unrepresentable,
 * and treat the note linter as the second line rather than the first.
 */
export interface Supervisee {
	id: string;
	/** A code like "S-04". Validated against SUPERVISEE_CODE before it gets here. */
	code: string;
	role: 'RBT' | 'BCaBA' | 'trainee';
	active: boolean;
	createdAt: number;
}

/** A place of work, so the 5% rule can be computed per organisation as the code requires. */
export interface Workplace {
	id: string;
	label: string;
	active: boolean;
	createdAt: number;
}

export type ContactFormat = 'individual' | 'small-group';
export type ContactModality = 'in-person' | 'live-video';

/** One supervision contact. */
export interface SupervisionEntry {
	id: string;
	/** YYYY-MM-DD. A string, not a Date: this is a calendar day, not an instant. */
	date: string;
	minutes: number;
	format: ContactFormat;
	modality: ContactModality;
	/** Whether the supervisor observed work with a client during this contact. */
	observed: boolean;
	workplaceId: string;
	/** Set when logging supervision you gave; null when logging supervision you received. */
	superviseeId: string | null;
	/** The one free-text field in the tracker, and the one the PHI linter watches. */
	note: string;
}

/**
 * Topics a question can be about.
 *
 * An enum rather than a second free-text field, for the same reason session activities are
 * one: every field this app can make a closed set, it makes a closed set, and the single
 * open line below is the only thing the linter then has to watch.
 */
export type QuestionTopic =
	| 'the-plan'
	| 'a-procedure'
	| 'data-and-measurement'
	| 'a-reaction-i-did-not-expect'
	| 'scope-and-role'
	| 'documentation'
	| 'something-else';

/**
 * A question parked for the next supervision meeting.
 *
 * The workforce research behind this app is blunt about why it exists: the technician to
 * analyst ratio moved from two to one to three to one between 2020 and 2025, and over
 * forty per cent of technicians report verbal feedback as their only supervision. "Ask
 * your BCBA" is increasingly not answerable in the moment, and a question that waits until
 * the meeting is a question that has to survive the week.
 *
 * Same structural promise as everything else here: the only identifier is a supervisee
 * code that cannot spell a name, the topic is an enum, and `question` is one line the PHI
 * linter warns about.
 */
export interface SupervisionQuestion {
	id: string;
	/** The supervisee this concerns, or null when it is the author's own question. */
	superviseeId: string | null;
	topic: QuestionTopic;
	/** One line, and the only free text. Warned about, never blocked. */
	question: string;
	raisedAt: number;
	/** When it was taken to a meeting and closed, or null while it is still open. */
	answeredAt: number | null;
}

/**
 * Hours of service delivery in one calendar month at one workplace.
 *
 * The denominator of the 5% rule, and the number nobody has to hand — so it is entered
 * once a month rather than derived from anything.
 */
/**
 * How many hours a supervisee worked in a month, as their supervisor recorded it.
 *
 * Separate from `ServiceMonth`, which holds the reader's own hours, because they are
 * different people's numbers and the percentage each owes is measured against their own.
 * A supervisor has to record this themselves: nothing else in this app knows what a
 * technician worked, and the figure comes from the technician telling them — which is
 * how the paper version of this works too.
 *
 * Keyed by workplace as well as month, because the rule is written per organisation.
 */
export interface SuperviseeMonth {
	/** `${superviseeId}:${workplaceId}:${YYYY-MM}`, so re-entering a month updates it. */
	id: string;
	superviseeId: string;
	workplaceId: string;
	/** YYYY-MM. */
	month: string;
	hours: number;
}

export interface ServiceMonth {
	/** `${workplaceId}:${YYYY-MM}`, so entering the same month twice updates it. */
	id: string;
	/** YYYY-MM. */
	month: string;
	workplaceId: string;
	hours: number;
}

/** A recertification cycle: the window units have to be earned inside. */
export interface Cycle {
	id: string;
	credential: 'RBT' | 'BCBA' | 'BCaBA';
	/** YYYY-MM-DD. */
	startDate: string;
	endDate: string;
	/** Analysts only: whether this cycle triggers the supervision-unit minimum. */
	supervisedOthers: boolean;
}

export type UnitTopic = 'general' | 'ethics' | 'supervision';
export type UnitKind =
	'learning' | 'teaching' | 'scholarship' | 'in-service' | 'university-course';

/** One professional-development entry: a PDU for a technician, a CEU for an analyst. */
export interface DevelopmentUnit {
	id: string;
	cycleId: string;
	/** YYYY-MM-DD. */
	date: string;
	units: number;
	kind: UnitKind;
	topic: UnitTopic;
	/** The event's own title, and who ran it. Neither is about a client. */
	title: string;
	provider: string;
}

export type FieldworkType = 'supervised' | 'concentrated';

/**
 * One calendar month of supervised fieldwork, shaped like the monthly verification form.
 *
 * The month is the unit because that is how fieldwork is verified, and because a month
 * that misses a requirement is lost whole rather than reduced. No client appears here at
 * all: the supervisor is a code, and everything else is an hour count.
 */
export interface FieldworkMonth {
	/** `${periodId}:${YYYY-MM}`, so re-entering a month updates it. */
	id: string;
	periodId: string;
	/** YYYY-MM. */
	month: string;
	type: FieldworkType;
	totalHours: number;
	unrestrictedHours: number;
	supervisionHours: number;
	individualSupervisionHours: number;
	contacts: number;
	observedWithClient: boolean;
	/** Cumulative minutes, for the ruleset that counts them rather than asking yes or no. */
	observationMinutes: number;
	/**
	 * The largest group supervision meeting this month, counting trainees present. 0 when
	 * there was no group supervision.
	 *
	 * Recorded rather than judged. The handbook caps the size of a group, but this app has
	 * not verified the figure against the document, and a threshold it invented would be
	 * worse than none — so the number is kept and reported, and the verdict is withheld
	 * until somebody reads the handbook. Keeping it now is the point: it is trivial to note
	 * at the time and impossible to reconstruct two years later.
	 */
	maxGroupSize: number;
	/**
	 * Who supervised this month. A code like "S-01", never a name — the same rule as a
	 * supervisee.
	 *
	 * On the month rather than only on the period, because trainees change supervisors and
	 * the monthly verification form is completed per supervisor. Holding one code for the
	 * whole run meant a record produced after a change attributed every earlier month to
	 * whoever happened to be current — silently, and in the one artifact that has to be
	 * right years later.
	 */
	supervisorCode: string;
	/**
	 * Whether the monthly verification form for this month has been signed.
	 *
	 * Deliberately not part of whether the month's hours count: the rules decide that, and
	 * a signature decides whether it can be shown. Kept apart so an unsigned month is not
	 * reported as short on hours it actually met.
	 */
	verificationSigned: boolean;
	/** YYYY-MM-DD, or null while unsigned. */
	signedOn: string | null;
	note: string;
}

/**
 * A trainee's confirmation that a supervisor met the requirements.
 *
 * Their confirmation, never a verification: whether somebody holds an active
 * certification, has held it a year, and is current on their supervision continuing
 * education are facts about another person, on a registry this app cannot reach and must
 * not cache. What it holds is who was asked, what was confirmed, and when — which is what
 * an auditor asks for and what nobody can reconstruct two years later.
 *
 * Still a code and never a name, like everything else in this model.
 */
export interface FieldworkSupervisorCheck {
	/** `${periodId}:${code}`. */
	id: string;
	periodId: string;
	code: string;
	/** Ids from the credential's supervisor checklist that were confirmed. */
	confirmed: string[];
	/** When the trainee last checked. Null while nothing has been confirmed. */
	confirmedOn: string | null;
	/**
	 * When the supervision contract was signed. The one part of this the app can check,
	 * because a contract has a date and so does a month — hours before it are suspect.
	 */
	contractSignedOn: string | null;
	note: string;
}

/** A run at the fieldwork requirement: when it started and whose rules it is under. */
export interface FieldworkPeriod {
	id: string;
	/** YYYY-MM-DD. The five-year window runs from here. */
	startDate: string;
	ruleset: 'current' | '2027';
	/**
	 * The supervisor this run started with. A code like "S-01", never a name.
	 *
	 * Only a default for the month form now that each month carries its own. The
	 * authoritative answer to "who signed for these hours" is on the month.
	 */
	supervisorCode: string;
	/**
	 * When the final verification form was signed, or null.
	 *
	 * The monthly forms are tracked on each month; this is the one at the end, which is a
	 * separate document and the last thing standing between a finished run and a submitted
	 * one.
	 */
	finalFormSignedOn: string | null;
	createdAt: number;
}

interface AbaDB extends DBSchema {
	cards: {
		key: string;
		value: CardRecord;
		indexes: { 'by-due': number };
	};
	reviewLog: {
		key: number;
		value: ReviewRecord & { id?: number };
		indexes: { 'by-card': string; 'by-time': number };
	};
	quizAttempts: {
		key: string;
		value: QuizAttempt;
		indexes: { 'by-finished': number };
	};
	drillAttempts: {
		key: string;
		value: DrillAttempt;
		indexes: { 'by-finished': number };
	};
	reviewDecisions: {
		key: string;
		value: ReviewDecision;
		indexes: { 'by-kind': string };
	};
	supervisees: {
		key: string;
		value: Supervisee;
		indexes: { 'by-code': string };
	};
	workplaces: {
		key: string;
		value: Workplace;
	};
	supervisionEntries: {
		key: string;
		value: SupervisionEntry;
		indexes: { 'by-date': string; 'by-supervisee': string };
	};
	serviceMonths: {
		key: string;
		value: ServiceMonth;
		indexes: { 'by-month': string };
	};
	cycles: {
		key: string;
		value: Cycle;
	};
	developmentUnits: {
		key: string;
		value: DevelopmentUnit;
		indexes: { 'by-cycle': string; 'by-date': string };
	};
	fieldworkPeriods: {
		key: string;
		value: FieldworkPeriod;
	};
	fieldworkSupervisors: {
		key: string;
		value: FieldworkSupervisorCheck;
		indexes: { 'by-period': string };
	};
	fieldworkMonths: {
		key: string;
		value: FieldworkMonth;
		indexes: { 'by-period': string };
	};
	supervisionQuestions: {
		key: string;
		value: SupervisionQuestion;
		indexes: { 'by-raised': number };
	};
	lookups: {
		key: string;
		value: Lookup;
		indexes: { 'by-last': number };
	};
	superviseeMonths: {
		key: string;
		value: SuperviseeMonth;
		indexes: { 'by-supervisee': string };
	};
}

type StoreName =
	| 'cards'
	| 'reviewLog'
	| 'quizAttempts'
	| 'drillAttempts'
	| 'reviewDecisions'
	| 'supervisees'
	| 'workplaces'
	| 'supervisionEntries'
	| 'serviceMonths'
	| 'cycles'
	| 'developmentUnits'
	| 'fieldworkPeriods'
	| 'fieldworkMonths'
	| 'fieldworkSupervisors'
	| 'supervisionQuestions'
	| 'lookups'
	| 'superviseeMonths';

type Migration = (
	db: IDBPDatabase<AbaDB>,
	tx: IDBPTransaction<AbaDB, StoreName[], 'versionchange'>
) => void;

const MIGRATIONS: Migration[] = [
	// v1 — flashcards, review log, quiz attempts.
	(db) => {
		const cards = db.createObjectStore('cards', { keyPath: 'id' });
		cards.createIndex('by-due', 'due');

		const log = db.createObjectStore('reviewLog', { keyPath: 'id', autoIncrement: true });
		log.createIndex('by-card', 'cardId');
		log.createIndex('by-time', 'reviewedAt');

		const attempts = db.createObjectStore('quizAttempts', { keyPath: 'id' });
		attempts.createIndex('by-finished', 'finishedAt');
	},

	// v2 — content-review decisions, for the reviewer working through the queue.
	(db) => {
		const decisions = db.createObjectStore('reviewDecisions', { keyPath: 'id' });
		decisions.createIndex('by-kind', 'kind');
	},

	// v3 — supervision and professional-development tracking.
	(db) => {
		const supervisees = db.createObjectStore('supervisees', { keyPath: 'id' });
		supervisees.createIndex('by-code', 'code', { unique: true });

		db.createObjectStore('workplaces', { keyPath: 'id' });

		const supervision = db.createObjectStore('supervisionEntries', { keyPath: 'id' });
		supervision.createIndex('by-date', 'date');
		supervision.createIndex('by-supervisee', 'superviseeId');

		const months = db.createObjectStore('serviceMonths', { keyPath: 'id' });
		months.createIndex('by-month', 'month');

		db.createObjectStore('cycles', { keyPath: 'id' });

		const units = db.createObjectStore('developmentUnits', { keyPath: 'id' });
		units.createIndex('by-cycle', 'cycleId');
		units.createIndex('by-date', 'date');
	},

	// v4 — supervised fieldwork, for analyst and assistant-analyst trainees.
	(db) => {
		db.createObjectStore('fieldworkPeriods', { keyPath: 'id' });
		const fwMonths = db.createObjectStore('fieldworkMonths', { keyPath: 'id' });
		fwMonths.createIndex('by-period', 'periodId');
	},

	// v5 — drill sittings, so a confusion that keeps recurring can be named.
	(db) => {
		const drills = db.createObjectStore('drillAttempts', { keyPath: 'id' });
		drills.createIndex('by-finished', 'finishedAt');
	},

	// v6 — questions parked for the next supervision meeting.
	(db) => {
		const questions = db.createObjectStore('supervisionQuestions', { keyPath: 'id' });
		// Indexed by when it was raised, because the ordering that matters is oldest first:
		// the question parked three weeks ago is the one that keeps not getting asked.
		questions.createIndex('by-raised', 'raisedAt');
	},

	// v7 — what has been looked up, so the reader can see their own pattern.
	(db) => {
		const lookups = db.createObjectStore('lookups', { keyPath: 'id' });
		// Only recency is indexed. "Most opened" is a sort over at most a few hundred rows
		// and is wanted whole rather than as a range, so an index would be read in full
		// every time and maintained on every write to buy nothing.
		lookups.createIndex('by-last', 'lastAt');
	},

	// v8 — a supervisee's own service hours, so the supervisor's side of the log has a
	// denominator. The percentage is owed on their hours, not on their supervisor's.
	(db) => {
		const months = db.createObjectStore('superviseeMonths', { keyPath: 'id' });
		months.createIndex('by-supervisee', 'superviseeId');
	},

	/*
	 * v9 — a supervisor and a signature on each month of fieldwork.
	 *
	 * The first rung that rewrites rows rather than adding a store, so it is worth saying
	 * what it is doing. Until now one supervisor code sat on the fieldwork period and the
	 * exported record stamped it on every month; a trainee who changed supervisors got a
	 * record attributing years of earlier months to whoever was current. The code moves to
	 * the month, and the existing months are backfilled from the period they belong to —
	 * which is the best available answer and, for anybody who never changed supervisors,
	 * the right one.
	 *
	 * `verificationSigned` starts false rather than true. Nothing in the old data says a
	 * form was signed, and inventing that claim on somebody's behalf is the one thing a
	 * compliance record must not do.
	 *
	 * Nothing downstream depends on this having run. A rewrite inside a versionchange
	 * transaction is the kind of thing that can behave differently in a browser this was
	 * never tested in, so every reader treats a missing code as "not recorded" and a
	 * missing signature as unsigned — both of which are the safe direction, and both of
	 * which are exactly what the backfill writes anyway.
	 */
	(_db, tx) => {
		const periods = tx.objectStore('fieldworkPeriods');
		const months = tx.objectStore('fieldworkMonths');
		void (async () => {
			const byId = new Map((await periods.getAll()).map((p) => [p.id, p]));
			for (const m of await months.getAll()) {
				await months.put({
					...m,
					supervisorCode: m.supervisorCode ?? byId.get(m.periodId)?.supervisorCode ?? '',
					verificationSigned: m.verificationSigned ?? false,
					signedOn: m.signedOn ?? null
				});
			}
		})();
	},

	// v10 — the trainee's confirmation that a supervisor met the requirements. Hours
	// supervised by somebody who did not are worth nothing, and that is invisible from a
	// log of hours, so it needs somewhere of its own to live.
	(db) => {
		const checks = db.createObjectStore('fieldworkSupervisors', { keyPath: 'id' });
		checks.createIndex('by-period', 'periodId');
	},

	/*
	 * v11 — the final verification form, and the size of the largest group meeting.
	 *
	 * Both default rather than being inferred. An existing run has not told us its final
	 * form is signed, and an existing month has not told us whether any of its supervision
	 * was in a group — 0 reads as "no group supervision", which is the common case and the
	 * one that raises nothing, rather than a number the app made up.
	 */
	(_db, tx) => {
		const periods = tx.objectStore('fieldworkPeriods');
		const months = tx.objectStore('fieldworkMonths');
		void (async () => {
			for (const p of await periods.getAll()) {
				await periods.put({ ...p, finalFormSignedOn: p.finalFormSignedOn ?? null });
			}
			for (const m of await months.getAll()) {
				await months.put({ ...m, maxGroupSize: m.maxGroupSize ?? 0 });
			}
		})();
	}
];

export const DB_NAME = 'aba-assist';
export const DB_VERSION = MIGRATIONS.length;

let handle: Promise<IDBPDatabase<AbaDB>> | null = null;

export function openAbaDB(): Promise<IDBPDatabase<AbaDB>> {
	if (!handle) {
		handle = openDB<AbaDB>(DB_NAME, DB_VERSION, {
			upgrade(db, oldVersion, _newVersion, tx) {
				for (let v = oldVersion; v < MIGRATIONS.length; v++) MIGRATIONS[v]!(db, tx);
			},
			blocking() {
				// Another tab is upgrading. Close so it can proceed; the next call reopens.
				void handle?.then((db) => db.close());
				handle = null;
			}
		});
	}
	return handle;
}

/** For tests and for "clear my data": drops the cached handle so the next call reopens. */
export function resetDbHandle(): void {
	handle = null;
}

// ------------------------------------------------------------------- cards

export async function getAllCards(): Promise<CardRecord[]> {
	const db = await openAbaDB();
	return db.getAll('cards');
}

export async function getCard(id: string): Promise<CardRecord | undefined> {
	const db = await openAbaDB();
	return db.get('cards', id);
}

export async function putCard(card: CardRecord): Promise<void> {
	const db = await openAbaDB();
	await db.put('cards', card);
}

/** Store the rescheduled card and its log entry atomically. */
export async function recordReview(card: CardRecord, review: ReviewRecord): Promise<void> {
	const db = await openAbaDB();
	const tx = db.transaction(['cards', 'reviewLog'], 'readwrite');
	await Promise.all([
		tx.objectStore('cards').put(card),
		tx.objectStore('reviewLog').add(review)
	]);
	await tx.done;
}

/**
 * The review log, oldest first, optionally from a cutoff.
 *
 * Every grade this app has ever recorded has been written here since the deck was built
 * and read by nothing but the backup file. It is the only record of whether the reader is
 * actually remembering anything, as opposed to how many cards are due — and the `by-time`
 * index means asking for the last month does not walk years of it.
 */
export async function getReviewLog(since?: number): Promise<ReviewRecord[]> {
	const db = await openAbaDB();
	if (since === undefined) return db.getAllFromIndex('reviewLog', 'by-time');
	return db.getAllFromIndex('reviewLog', 'by-time', IDBKeyRange.lowerBound(since));
}

export async function countReviews(): Promise<number> {
	const db = await openAbaDB();
	return db.count('reviewLog');
}

/**
 * How many cards are due right now, counted by the index rather than read.
 *
 * A key-range count over `by-due`, so this never pulls a card record into memory. It runs
 * on load and whenever the app is hidden, on a phone, to decide a number on an icon —
 * reading the whole deck to answer it would be the wrong trade, and the index already
 * exists for the review queue.
 *
 * Unfiltered on purpose. See `$lib/study/badge.ts`: the badge reports the work, not
 * whatever glossary filter happened to be left on.
 */
export async function countDue(now = Date.now()): Promise<number> {
	const db = await openAbaDB();
	return db.countFromIndex('cards', 'by-due', IDBKeyRange.upperBound(now));
}

export async function deleteCards(ids: string[]): Promise<void> {
	const db = await openAbaDB();
	const tx = db.transaction('cards', 'readwrite');
	await Promise.all(ids.map((id) => tx.store.delete(id)));
	await tx.done;
}

// ------------------------------------------------------- review decisions

export async function getDecisions(): Promise<ReviewDecision[]> {
	const db = await openAbaDB();
	return db.getAll('reviewDecisions');
}

export async function putDecision(decision: ReviewDecision): Promise<void> {
	const db = await openAbaDB();
	await db.put('reviewDecisions', decision);
}

export async function clearDecision(id: string): Promise<void> {
	const db = await openAbaDB();
	await db.delete('reviewDecisions', id);
}

export async function clearDecisions(): Promise<void> {
	const db = await openAbaDB();
	await db.clear('reviewDecisions');
}

// ----------------------------------------------------------------- tracker

/*
 * Generic accessors rather than six near-identical triples. Every tracker store is keyed
 * by `id` and read whole — these are tens of rows, not thousands — so the only thing that
 * varies is the store name, and the type parameter keeps that honest at the call site.
 */
type TrackerStore =
	| 'supervisees'
	| 'workplaces'
	| 'supervisionEntries'
	| 'serviceMonths'
	| 'cycles'
	| 'developmentUnits'
	| 'fieldworkPeriods'
	| 'fieldworkMonths'
	| 'fieldworkSupervisors'
	| 'supervisionQuestions'
	| 'superviseeMonths';

export async function getAll<S extends TrackerStore>(store: S): Promise<AbaDB[S]['value'][]> {
	const db = await openAbaDB();
	return db.getAll(store);
}

export async function put<S extends TrackerStore>(
	store: S,
	value: AbaDB[S]['value']
): Promise<void> {
	const db = await openAbaDB();
	await db.put(store, value);
}

export async function remove(store: TrackerStore, id: string): Promise<void> {
	const db = await openAbaDB();
	await db.delete(store, id);
}

/**
 * Delete a supervisee and everything logged against them, in one transaction.
 *
 * Halfway through would leave contacts pointing at nobody, which the monthly summary
 * would then quietly drop from its totals — a compliance number that silently got smaller.
 *
 * Parked questions go the same way. One left behind would sit on the agenda attached to a
 * supervisee who no longer exists, which reads as a bug and is worse than one: it is a
 * line of free text about somebody, outliving the record it was filed under.
 */
export async function removeSupervisee(id: string): Promise<void> {
	const db = await openAbaDB();
	const tx = db.transaction(
		['supervisees', 'supervisionEntries', 'supervisionQuestions', 'superviseeMonths'],
		'readwrite'
	);
	const entries = await tx
		.objectStore('supervisionEntries')
		.index('by-supervisee')
		.getAllKeys(id);
	const questions = await tx.objectStore('supervisionQuestions').getAll();
	// Their recorded hours go too. A months row outliving the person it belongs to is a
	// number about somebody the log no longer names, which is the shape of record this
	// app is built to not keep.
	const months = await tx
		.objectStore('superviseeMonths')
		.index('by-supervisee')
		.getAllKeys(id);
	await Promise.all([
		tx.objectStore('supervisees').delete(id),
		...entries.map((key) => tx.objectStore('supervisionEntries').delete(key)),
		...months.map((key) => tx.objectStore('superviseeMonths').delete(key)),
		...questions
			.filter((q) => q.superviseeId === id)
			.map((q) => tx.objectStore('supervisionQuestions').delete(q.id))
	]);
	await tx.done;
}

/** Same reasoning for a fieldwork period and the months logged inside it. */
export async function removeFieldworkPeriod(id: string): Promise<void> {
	const db = await openAbaDB();
	const tx = db.transaction(
		['fieldworkPeriods', 'fieldworkMonths', 'fieldworkSupervisors'],
		'readwrite'
	);
	const months = await tx.objectStore('fieldworkMonths').index('by-period').getAllKeys(id);
	// The supervisor confirmations go with it. A record of who was checked, outliving the
	// fieldwork it was checked for, is the shape of orphan row this data model exists to
	// make impossible.
	const checks = await tx
		.objectStore('fieldworkSupervisors')
		.index('by-period')
		.getAllKeys(id);
	await Promise.all([
		tx.objectStore('fieldworkPeriods').delete(id),
		...months.map((key) => tx.objectStore('fieldworkMonths').delete(key)),
		...checks.map((key) => tx.objectStore('fieldworkSupervisors').delete(key))
	]);
	await tx.done;
}

/** Same reasoning for a cycle and the units earned inside it. */
export async function removeCycle(id: string): Promise<void> {
	const db = await openAbaDB();
	const tx = db.transaction(['cycles', 'developmentUnits'], 'readwrite');
	const units = await tx.objectStore('developmentUnits').index('by-cycle').getAllKeys(id);
	await Promise.all([
		tx.objectStore('cycles').delete(id),
		...units.map((key) => tx.objectStore('developmentUnits').delete(key))
	]);
	await tx.done;
}

// ---------------------------------------------------------- drill attempts

export async function putDrillAttempt(attempt: DrillAttempt): Promise<void> {
	const db = await openAbaDB();
	await db.put('drillAttempts', attempt);
}

/** Most recent first, like `recentAttempts` — the page that reads them wants both orders. */
export async function recentDrillAttempts(limit = 100): Promise<DrillAttempt[]> {
	const db = await openAbaDB();
	const out: DrillAttempt[] = [];
	let cursor = await db
		.transaction('drillAttempts')
		.store.index('by-finished')
		.openCursor(null, 'prev');
	while (cursor && out.length < limit) {
		out.push(cursor.value);
		cursor = await cursor.continue();
	}
	return out;
}

// ----------------------------------------------------------------- lookups

/**
 * Record that a content page was opened.
 *
 * Read-then-write in one transaction, because whether this visit counts depends on when
 * the last one did. Two tabs opening the same term at once would otherwise both read
 * `count: 3` and both write `4`.
 *
 * Failure is swallowed by the caller, not here — this runs on every content page view and
 * must never be the reason a page fails to render, but the database layer saying so is
 * how the caller gets to make that choice.
 */
export async function recordLookup(
	kind: LookupKind,
	slug: string,
	title: string,
	now = Date.now()
): Promise<void> {
	const db = await openAbaDB();
	const tx = db.transaction('lookups', 'readwrite');
	const existing = await tx.store.get(lookupId(kind, slug));
	await tx.store.put(noteLookup(existing, kind, slug, title, now));
	await tx.done;

	// Pruning is behind a count check so the ordinary write stays a get and a put. `count`
	// is a key-range count rather than a read of every row, so this costs nothing until
	// there is something to do.
	const total = await db.count('lookups');
	if (total <= MAX_LOOKUPS) return;
	const drop = prunable(await db.getAll('lookups'));
	if (drop.length === 0) return;
	const cull = db.transaction('lookups', 'readwrite');
	await Promise.all(drop.map((id) => cull.store.delete(id)));
	await cull.done;
}

export async function getLookups(): Promise<Lookup[]> {
	const db = await openAbaDB();
	return db.getAll('lookups');
}

/**
 * Forget the reading history, and only that.
 *
 * Separate from `clearAll` on purpose. "I would rather you did not keep a list of what I
 * read" is a different request from "delete everything", and answering the first with the
 * second would cost somebody two years of supervision records.
 */
export async function clearLookups(): Promise<void> {
	const db = await openAbaDB();
	await db.clear('lookups');
}

// ---------------------------------------------------------------- attempts

export async function putAttempt(attempt: QuizAttempt): Promise<void> {
	const db = await openAbaDB();
	await db.put('quizAttempts', attempt);
}

export async function recentAttempts(limit = 20): Promise<QuizAttempt[]> {
	const db = await openAbaDB();
	const out: QuizAttempt[] = [];
	let cursor = await db
		.transaction('quizAttempts')
		.store.index('by-finished')
		.openCursor(null, 'prev');
	while (cursor && out.length < limit) {
		out.push(cursor.value);
		cursor = await cursor.continue();
	}
	return out;
}

// ------------------------------------------------------------------ export

/** Everything, as one JSON-serialisable object. The free-tier answer to "I got a new phone". */
export async function exportAll(): Promise<{
	kind: 'aba-assist-backup';
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
	lookups: Lookup[];
	superviseeMonths: SuperviseeMonth[];
}> {
	const db = await openAbaDB();
	const [
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
		supervisionQuestions,
		lookups,
		superviseeMonths
	] = await Promise.all([
		db.getAll('cards'),
		db.getAll('reviewLog'),
		db.getAll('quizAttempts'),
		db.getAll('drillAttempts'),
		db.getAll('reviewDecisions'),
		db.getAll('supervisees'),
		db.getAll('workplaces'),
		db.getAll('supervisionEntries'),
		db.getAll('serviceMonths'),
		db.getAll('cycles'),
		db.getAll('developmentUnits'),
		db.getAll('fieldworkPeriods'),
		db.getAll('fieldworkMonths'),
		db.getAll('supervisionQuestions'),
		db.getAll('lookups'),
		db.getAll('superviseeMonths')
	]);
	return {
		// Marks the file as ours, so importing somebody's tax return gets a useful message
		// rather than a silent nothing.
		kind: 'aba-assist-backup',
		version: DB_VERSION,
		exportedAt: Date.now(),
		cards,
		reviewLog: reviewLog.map((r) => {
			const { id, ...rest } = r;
			void id;
			return rest;
		}),
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
		supervisionQuestions,
		lookups,
		superviseeMonths
	};
}

/**
 * Whether there is anything on this device worth backing up.
 *
 * Counts rather than reads: this runs on page load to decide whether to nag somebody, and
 * pulling the whole database to answer a yes/no question would be the wrong trade.
 */
export async function hasStoredData(): Promise<boolean> {
	const db = await openAbaDB();
	/*
	 * `lookups` is deliberately absent, though it is exported and erased with everything
	 * else. This list decides whether to warn somebody that their data has gone, and a
	 * reading history is not data anybody grieves. Counting it would mean a reader who
	 * has only ever browsed the glossary gets "your progress has been deleted" after a
	 * cleared cache — the exact false positive the notice is built to avoid, and the one
	 * that teaches people to ignore the true warning.
	 */
	const stores: StoreName[] = [
		'cards',
		'quizAttempts',
		'drillAttempts',
		'reviewDecisions',
		'supervisionEntries',
		'developmentUnits',
		'fieldworkMonths',
		'supervisionQuestions'
	];
	const counts = await Promise.all(stores.map((s) => db.count(s)));
	return counts.some((n) => n > 0);
}

/**
 * Replace everything with a validated backup, in one transaction.
 *
 * Replace rather than merge. Merging two devices' flashcard schedules means deciding
 * which review history is true, and getting that wrong silently corrupts the thing the
 * reader most wants back. "I got a new phone" is the case this exists for, and on a new
 * phone there is nothing to merge with — so the semantics are one clear thing the UI can
 * state plainly and the reader can confirm.
 *
 * One transaction so a failure halfway through leaves the old data rather than half of
 * each. The caller has already validated; this writes what it is given.
 */
export async function restoreAll(data: {
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
	lookups: Lookup[];
	superviseeMonths: SuperviseeMonth[];
}): Promise<void> {
	const db = await openAbaDB();
	const stores: StoreName[] = [
		'cards',
		'reviewLog',
		'quizAttempts',
		'drillAttempts',
		'reviewDecisions',
		'supervisees',
		'workplaces',
		'supervisionEntries',
		'serviceMonths',
		'cycles',
		'developmentUnits',
		'fieldworkPeriods',
		'fieldworkMonths',
		'fieldworkSupervisors',
		'supervisionQuestions',
		'lookups',
		'superviseeMonths'
	];
	const tx = db.transaction(stores, 'readwrite');
	await Promise.all(stores.map((s) => tx.objectStore(s).clear()));
	await Promise.all([
		// `reviewLog` has an auto-incrementing key and the export strips it, so these are
		// added rather than put.
		...data.reviewLog.map((r) => tx.objectStore('reviewLog').add(r)),
		...data.cards.map((c) => tx.objectStore('cards').put(c)),
		...data.quizAttempts.map((a) => tx.objectStore('quizAttempts').put(a)),
		...data.drillAttempts.map((a) => tx.objectStore('drillAttempts').put(a)),
		...data.reviewDecisions.map((d) => tx.objectStore('reviewDecisions').put(d)),
		...data.supervisees.map((x) => tx.objectStore('supervisees').put(x)),
		...data.workplaces.map((x) => tx.objectStore('workplaces').put(x)),
		...data.supervisionEntries.map((x) => tx.objectStore('supervisionEntries').put(x)),
		...data.serviceMonths.map((x) => tx.objectStore('serviceMonths').put(x)),
		...data.cycles.map((x) => tx.objectStore('cycles').put(x)),
		...data.developmentUnits.map((x) => tx.objectStore('developmentUnits').put(x)),
		...data.fieldworkPeriods.map((x) => tx.objectStore('fieldworkPeriods').put(x)),
		...data.fieldworkMonths.map((x) => tx.objectStore('fieldworkMonths').put(x)),
		...data.supervisionQuestions.map((x) => tx.objectStore('supervisionQuestions').put(x)),
		...data.lookups.map((x) => tx.objectStore('lookups').put(x)),
		...data.superviseeMonths.map((x) => tx.objectStore('superviseeMonths').put(x))
	]);
	await tx.done;
}

export async function clearAll(): Promise<void> {
	const db = await openAbaDB();
	const stores: StoreName[] = [
		'cards',
		'reviewLog',
		'quizAttempts',
		'drillAttempts',
		'reviewDecisions',
		'supervisees',
		'workplaces',
		'supervisionEntries',
		'serviceMonths',
		'cycles',
		'developmentUnits',
		'fieldworkPeriods',
		'fieldworkMonths',
		'fieldworkSupervisors',
		'supervisionQuestions',
		'lookups',
		'superviseeMonths'
	];
	const tx = db.transaction(stores, 'readwrite');
	await Promise.all(stores.map((s) => tx.objectStore(s).clear()));
	await tx.done;
}

/**
 * Write several cards in one transaction.
 *
 * Used when a quiz run makes the terms it caught out due for review: either all of them
 * land or none do, so a half-written batch cannot leave the deck in a state the reader
 * would have to work out for themselves.
 */
export async function putCards(cards: CardRecord[]): Promise<void> {
	if (cards.length === 0) return;
	const db = await openAbaDB();
	const tx = db.transaction('cards', 'readwrite');
	await Promise.all(cards.map((c) => tx.store.put(c)));
	await tx.done;
}
