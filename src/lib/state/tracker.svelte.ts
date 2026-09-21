import { browser } from '$app/environment';
import { TRACKER_ROLE_KEY as ROLE_KEY } from './mode.js';
import { credentials } from '$lib/content/credentials.js';
import {
	getAll,
	put,
	remove,
	removeCycle,
	removeFieldworkPeriod,
	removeSupervisee,
	type Cycle,
	type DevelopmentUnit,
	type FieldworkMonth,
	type FieldworkPeriod,
	type FieldworkSupervisorCheck,
	type ServiceMonth,
	type SuperviseeMonth,
	type ContactFormat,
	type ContactModality,
	type FieldworkType,
	type Supervisee,
	type SupervisionEntry,
	type SupervisionQuestion,
	type UnitKind,
	type UnitTopic,
	type Workplace
} from '$lib/db/index.js';
import { storage } from './storage.svelte.js';
import {
	rulesetById,
	summariseFieldwork,
	summariseFieldworkMonth,
	type FieldworkRequirement,
	type FieldworkRuleset,
	supervisorStanding,
	type SupervisorStanding
} from '$lib/tracker/fieldwork.js';
import {
	cycleEnd,
	summariseCycle,
	todayIso,
	summariseMonths,
	summariseSuperviseeMonths,
	unitsOutsideCycle,
	type CycleSummary,
	type DevelopmentRequirement,
	type MonthSummary,
	type SuperviseeMonthSummary,
	type SupervisionRequirement
} from '$lib/tracker/rules.js';

export type TrackerStatus = 'idle' | 'loading' | 'ready' | 'unavailable';
export type TrackedCredential = 'RBT' | 'BCBA' | 'BCaBA';

/*
 * Re-exported so the pages can name a record without importing the database layer, which
 * the lint rule forbids for a real reason: `$state` values are Proxies and IndexedDB's
 * `structuredClone` throws on one, so writes go through this module, which snapshots.
 */
export type {
	ContactFormat,
	ContactModality,
	Cycle,
	DevelopmentUnit,
	FieldworkMonth,
	FieldworkPeriod,
	FieldworkSupervisorCheck,
	FieldworkType,
	ServiceMonth,
	SuperviseeMonth,
	Supervisee,
	SupervisionEntry,
	UnitKind,
	UnitTopic,
	Workplace
};
export { todayIso };

function id(): string {
	return crypto.randomUUID();
}

/**
 * Supervision and professional-development tracking.
 *
 * Two things make this feature safe to build at all, and both are structural rather than
 * advisory. There is no field anywhere in it that can hold a client's identity — see the
 * store definitions — and every threshold it checks against comes from the credential
 * content, where a human verified it against the handbook, rather than from a constant
 * typed into this file.
 *
 * Everything stays on the device. The CSV export exists because supervision records have
 * to outlive one browser profile.
 */
class Tracker {
	status = $state<TrackerStatus>('idle');
	credential = $state<TrackedCredential>('RBT');

	supervisees = $state<Supervisee[]>([]);
	workplaces = $state<Workplace[]>([]);
	entries = $state<SupervisionEntry[]>([]);
	serviceMonths = $state<ServiceMonth[]>([]);
	superviseeMonths = $state<SuperviseeMonth[]>([]);
	cycles = $state<Cycle[]>([]);
	units = $state<DevelopmentUnit[]>([]);
	fieldworkPeriods = $state<FieldworkPeriod[]>([]);
	fieldworkMonths = $state<FieldworkMonth[]>([]);
	fieldworkSupervisors = $state<FieldworkSupervisorCheck[]>([]);
	questions = $state<SupervisionQuestion[]>([]);

	async load(): Promise<void> {
		if (!browser || this.status === 'loading' || this.status === 'ready') return;
		this.status = 'loading';
		try {
			const saved = localStorage.getItem(ROLE_KEY);
			if (saved === 'RBT' || saved === 'BCBA' || saved === 'BCaBA') this.credential = saved;
		} catch {
			// Storage blocked; the picker still works for this visit.
		}
		try {
			const [
				supervisees,
				workplaces,
				entries,
				serviceMonths,
				cycles,
				units,
				fieldworkPeriods,
				fieldworkMonths,
				fieldworkSupervisors,
				questions,
				superviseeMonths
			] = await Promise.all([
				getAll('supervisees'),
				getAll('workplaces'),
				getAll('supervisionEntries'),
				getAll('serviceMonths'),
				getAll('cycles'),
				getAll('developmentUnits'),
				getAll('fieldworkPeriods'),
				getAll('fieldworkMonths'),
				getAll('fieldworkSupervisors'),
				getAll('supervisionQuestions'),
				getAll('superviseeMonths')
			]);
			this.supervisees = supervisees;
			this.workplaces = workplaces;
			this.entries = entries;
			this.serviceMonths = serviceMonths;
			this.cycles = cycles;
			this.units = units;
			this.fieldworkPeriods = fieldworkPeriods;
			this.fieldworkMonths = fieldworkMonths;
			this.fieldworkSupervisors = fieldworkSupervisors;
			this.questions = questions;
			this.superviseeMonths = superviseeMonths;
			this.status = 'ready';
		} catch {
			// Without storage this tool would appear to record things and lose them, which
			// is worse than saying plainly that it cannot run.
			this.status = 'unavailable';
		}
	}

	setCredential(value: TrackedCredential): void {
		this.credential = value;
		try {
			localStorage.setItem(ROLE_KEY, value);
		} catch {
			// Storage blocked.
		}
	}

	/*
	 * Requirements come from the credential content, and only from the credential that was
	 * actually read.
	 *
	 * This used to serve the analyst facts to an assistant analyst, on the reasoning that
	 * the two are maintained alike. They are not, and the app was quietly telling a BCaBA
	 * a number nobody had checked for them. Until the assistant handbook has been read,
	 * there are no facts here for that credential and the tools say so — which is the
	 * whole posture of this project applied to our own convenience.
	 */
	private get facts() {
		return credentials[this.credential.toLowerCase()];
	}

	/** False where the credential's handbook has not been read into content yet. */
	get credentialModelled(): boolean {
		return this.facts !== undefined;
	}

	get supervisionRequirement(): SupervisionRequirement | null {
		return (this.facts?.requirements?.supervision as SupervisionRequirement | null) ?? null;
	}

	get developmentRequirement(): DevelopmentRequirement | null {
		return (this.facts?.requirements?.development as DevelopmentRequirement | null) ?? null;
	}

	get handbookVersion(): string {
		return this.facts?.handbookVersion ?? 'unknown';
	}

	get months(): MonthSummary[] {
		const req = this.supervisionRequirement;
		if (!req) return [];
		return summariseMonths(
			$state.snapshot(this.entries),
			$state.snapshot(this.serviceMonths),
			req
		);
	}

	workplaceLabel(id: string): string {
		return this.workplaces.find((w) => w.id === id)?.label ?? 'Unknown workplace';
	}

	superviseeCode(id: string | null): string | null {
		return id ? (this.supervisees.find((s) => s.id === id)?.code ?? null) : null;
	}

	/** Cycles for the selected credential, soonest deadline first. */
	get myCycles(): Cycle[] {
		return this.cycles
			.filter((c) => c.credential === this.credential)
			.slice()
			.sort((a, b) => a.endDate.localeCompare(b.endDate));
	}

	get currentCycle(): Cycle | null {
		const today = todayIso();
		return this.myCycles.find((c) => c.endDate >= today) ?? this.myCycles.at(-1) ?? null;
	}

	summaryFor(cycle: Cycle): CycleSummary | null {
		const req = this.developmentRequirement;
		if (!req) return null;
		return summariseCycle(
			$state.snapshot(cycle),
			$state.snapshot(this.units),
			req,
			todayIso()
		);
	}

	strayUnits(cycle: Cycle): DevelopmentUnit[] {
		return unitsOutsideCycle($state.snapshot(cycle), $state.snapshot(this.units));
	}

	unitsFor(cycleId: string): DevelopmentUnit[] {
		return this.units
			.filter((u) => u.cycleId === cycleId)
			.slice()
			.sort((a, b) => b.date.localeCompare(a.date));
	}

	entriesFor(month: string, workplaceId: string): SupervisionEntry[] {
		return this.entries
			.filter((e) => e.workplaceId === workplaceId && e.date.slice(0, 7) === month)
			.slice()
			.sort((a, b) => b.date.localeCompare(a.date));
	}

	// ------------------------------------------------------------------ writes
	//
	// Every write snapshots before it reaches the database: `$state` values are Proxies
	// and `structuredClone`, which IndexedDB uses, throws on a Proxy.

	async addWorkplace(label: string): Promise<Workplace> {
		const w: Workplace = {
			id: id(),
			label: label.trim(),
			active: true,
			createdAt: Date.now()
		};
		await put('workplaces', w);
		this.workplaces = [...this.workplaces, w];
		return w;
	}

	async addSupervisee(code: string, role: Supervisee['role']): Promise<Supervisee> {
		const s: Supervisee = {
			id: id(),
			code: code.trim().toUpperCase(),
			role,
			active: true,
			createdAt: Date.now()
		};
		await put('supervisees', s);
		this.supervisees = [...this.supervisees, s];
		return s;
	}

	/**
	 * Park a question for the next meeting.
	 *
	 * Written straight through rather than batched: this is typed in the ten seconds
	 * between one trial and the next, and a parked question that was still in memory when
	 * the phone was locked is the exact failure the feature exists to prevent.
	 */
	async addQuestion(
		question: Omit<SupervisionQuestion, 'id' | 'raisedAt' | 'answeredAt'>
	): Promise<void> {
		const q: SupervisionQuestion = {
			...question,
			question: question.question.trim(),
			id: id(),
			raisedAt: Date.now(),
			answeredAt: null
		};
		await put('supervisionQuestions', q);
		this.questions = [...this.questions, q];
		storage.hasData = true;
	}

	/** Close a question, or reopen one closed by mistake. */
	async setAnswered(questionId: string, answered: boolean): Promise<void> {
		const found = this.questions.find((q) => q.id === questionId);
		if (!found) return;
		const next = { ...found, answeredAt: answered ? Date.now() : null };
		await put('supervisionQuestions', next);
		this.questions = this.questions.map((q) => (q.id === questionId ? next : q));
	}

	async removeQuestion(questionId: string): Promise<void> {
		await remove('supervisionQuestions', questionId);
		this.questions = this.questions.filter((q) => q.id !== questionId);
	}

	async addEntry(entry: Omit<SupervisionEntry, 'id'>): Promise<void> {
		const e: SupervisionEntry = { ...entry, id: id() };
		await put('supervisionEntries', e);
		this.entries = [...this.entries, e];
		// A supervision record is the thing here somebody would most hate to retype, and
		// is supposed to survive seven years.
		storage.hasData = true;
		void storage.requestPersist();
	}

	async deleteEntry(entryId: string): Promise<void> {
		await remove('supervisionEntries', entryId);
		this.entries = this.entries.filter((e) => e.id !== entryId);
	}

	async deleteSupervisee(superviseeId: string): Promise<void> {
		await removeSupervisee(superviseeId);
		this.supervisees = this.supervisees.filter((s) => s.id !== superviseeId);
		this.entries = this.entries.filter((e) => e.superviseeId !== superviseeId);
	}

	/** Hours are entered once per month per workplace, so this replaces rather than appends. */
	async setServiceHours(month: string, workplaceId: string, hours: number): Promise<void> {
		const record: ServiceMonth = { id: `${workplaceId}:${month}`, month, workplaceId, hours };
		await put('serviceMonths', record);
		this.serviceMonths = [...this.serviceMonths.filter((m) => m.id !== record.id), record];
	}

	/**
	 * Record how many hours a supervisee worked in a month, as they reported it.
	 *
	 * The supervisor has to enter this: nothing in this app knows what somebody else
	 * worked, and on paper the figure comes from the technician telling their supervisor
	 * too. Without it the percentage has no denominator and the month reads as unknown
	 * rather than short, which is the honest answer.
	 */
	async setSuperviseeHours(
		superviseeId: string,
		workplaceId: string,
		month: string,
		hours: number
	): Promise<void> {
		const record: SuperviseeMonth = {
			// A pipe, not a colon: ids are generated and three parts have to come back out.
			id: `${superviseeId}|${workplaceId}|${month}`,
			superviseeId,
			workplaceId,
			month,
			hours
		};
		await put('superviseeMonths', record);
		this.superviseeMonths = [
			...this.superviseeMonths.filter((m) => m.id !== record.id),
			record
		];
	}

	/**
	 * The ongoing-supervision rule a supervisee is held to, by their own role.
	 *
	 * Not the reader's. This took a failing test to notice and it is the crux of the
	 * supervisor's side: a BCBA has **no** ongoing supervision requirement, because they
	 * do not receive supervision — and a BCBA is precisely who is doing the supervising.
	 * Judging a caseload against the supervisor's own credential would have shown the
	 * person this page exists for an empty page.
	 *
	 * `trainee` returns null on purpose rather than falling back to the technician rule.
	 * A fieldwork trainee's supervision is governed by the fieldwork requirements — a
	 * percentage of *fieldwork* hours, with its own monthly floors and ceilings — and
	 * measuring them against the RBT monthly percentage would be a confident wrong
	 * answer. The fieldwork tracker is where that rule lives.
	 */
	requirementForRole(role: Supervisee['role']): SupervisionRequirement | null {
		const facts = credentials[role.toLowerCase()];
		return (facts?.requirements?.supervision as SupervisionRequirement | null) ?? null;
	}

	/** Every supervisee-month with something in it, newest first, per supervisee. */
	get caseload(): SuperviseeMonthSummary[] {
		const entries = $state.snapshot(this.entries);
		const months = $state.snapshot(this.superviseeMonths);
		const out: SuperviseeMonthSummary[] = [];
		for (const s of this.supervisees) {
			const req = this.requirementForRole(s.role);
			if (!req) continue;
			out.push(
				...summariseSuperviseeMonths(
					entries.filter((e) => e.superviseeId === s.id),
					months.filter((m) => m.superviseeId === s.id),
					req
				)
			);
		}
		return out;
	}

	/** The contacts behind one supervisee-month, so the record can show its own working. */
	contactsFor(superviseeId: string, workplaceId: string, month: string): SupervisionEntry[] {
		return this.entries
			.filter(
				(e) =>
					e.superviseeId === superviseeId &&
					e.workplaceId === workplaceId &&
					e.date.slice(0, 7) === month
			)
			.sort((a, b) => a.date.localeCompare(b.date));
	}

	async addCycle(
		credential: TrackedCredential,
		startDate: string,
		supervisedOthers: boolean
	): Promise<Cycle> {
		const years = this.developmentRequirement?.cycleYears ?? 2;
		const c: Cycle = {
			id: id(),
			credential,
			startDate,
			endDate: cycleEnd(startDate, years),
			supervisedOthers
		};
		await put('cycles', c);
		this.cycles = [...this.cycles, c];
		return c;
	}

	async setSupervisedOthers(cycleId: string, value: boolean): Promise<void> {
		const found = this.cycles.find((c) => c.id === cycleId);
		if (!found) return;
		const next: Cycle = { ...$state.snapshot(found), supervisedOthers: value };
		await put('cycles', next);
		this.cycles = this.cycles.map((c) => (c.id === cycleId ? next : c));
	}

	async deleteCycle(cycleId: string): Promise<void> {
		await removeCycle(cycleId);
		this.cycles = this.cycles.filter((c) => c.id !== cycleId);
		this.units = this.units.filter((u) => u.cycleId !== cycleId);
	}

	async addUnit(unit: Omit<DevelopmentUnit, 'id'>): Promise<void> {
		const u: DevelopmentUnit = { ...unit, id: id() };
		await put('developmentUnits', u);
		this.units = [...this.units, u];
	}

	async deleteUnit(unitId: string): Promise<void> {
		await remove('developmentUnits', unitId);
		this.units = this.units.filter((u) => u.id !== unitId);
	}

	// -------------------------------------------------------------- fieldwork
	//
	// Trainee fieldwork, which is a different problem from the supervision an RBT
	// receives: a different denominator, a monthly floor AND ceiling, a restricted split,
	// and a five-year window. Kept in its own stores rather than folded into the
	// supervision log, because a trainee who is also an RBT would otherwise find their
	// fieldwork supervision quietly counted toward their technician percentage.

	get fieldworkRequirement(): FieldworkRequirement | null {
		return (credentials.bcba?.requirements?.fieldwork as FieldworkRequirement | null) ?? null;
	}

	/**
	 * Fieldwork is accrued toward the analyst credential whoever is looking at it, so it
	 * cites the analyst handbook rather than whichever credential the tracker is set to.
	 */
	get fieldworkHandbookVersion(): string {
		return credentials.bcba?.handbookVersion ?? 'unknown';
	}

	get period(): FieldworkPeriod | null {
		return this.fieldworkPeriods[0] ?? null;
	}

	get ruleset(): FieldworkRuleset | null {
		const req = this.fieldworkRequirement;
		if (!req) return null;
		return rulesetById(req, this.period?.ruleset ?? 'current');
	}

	/** Months of the current period, most recent first. */
	get myFieldworkMonths(): FieldworkMonth[] {
		const id = this.period?.id;
		if (!id) return [];
		return this.fieldworkMonths
			.filter((m) => m.periodId === id)
			.slice()
			.sort((a, b) => b.month.localeCompare(a.month));
	}

	fieldworkMonthSummary(m: FieldworkMonth) {
		const req = this.fieldworkRequirement;
		const rules = this.ruleset;
		if (!req || !rules) return null;
		return summariseFieldworkMonth($state.snapshot(m), req, rules);
	}

	get fieldworkProgress() {
		const req = this.fieldworkRequirement;
		const rules = this.ruleset;
		if (!req || !rules) return null;
		return summariseFieldwork(
			$state.snapshot(this.myFieldworkMonths),
			req,
			rules,
			this.period?.startDate ?? null,
			todayIso()
		);
	}

	async startFieldwork(
		startDate: string,
		ruleset: 'current' | '2027',
		supervisorCode: string
	): Promise<FieldworkPeriod> {
		const p: FieldworkPeriod = {
			id: id(),
			startDate,
			ruleset,
			supervisorCode: supervisorCode.trim().toUpperCase(),
			createdAt: Date.now()
		};
		await put('fieldworkPeriods', p);
		this.fieldworkPeriods = [...this.fieldworkPeriods, p];
		storage.hasData = true;
		void storage.requestPersist();
		return p;
	}

	/** One row per calendar month, so saving the same month again replaces it. */
	async saveFieldworkMonth(
		periodId: string,
		month: string,
		values: Omit<FieldworkMonth, 'id' | 'periodId' | 'month'>
	): Promise<void> {
		const row: FieldworkMonth = { ...values, id: `${periodId}:${month}`, periodId, month };
		await put('fieldworkMonths', row);
		this.fieldworkMonths = [...this.fieldworkMonths.filter((m) => m.id !== row.id), row];
		storage.hasData = true;
		void storage.requestPersist();
	}

	/**
	 * Months whose monthly verification form has not been signed.
	 *
	 * Kept apart from `monthsShort` on purpose. Whether a month's hours count is decided by
	 * the rules; whether they can be shown to anybody is decided by a signature. A month
	 * can be faultless on the first and missing on the second, and folding them together
	 * would either send somebody to redo work that was fine or hide the chase they actually
	 * need to make while the supervisor who was there still remembers it.
	 */
	get unsignedFieldworkMonths(): FieldworkMonth[] {
		return this.myFieldworkMonths.filter((m) => !m.verificationSigned);
	}

	/** Every supervisor code appearing in this run, oldest month first. */
	get fieldworkSupervisorCodes(): string[] {
		// Oldest month first, each code once. A plain filter rather than a Set: at the
		// handful of supervisors a fieldwork run actually has, the quadratic scan is free
		// and reads as what it is.
		return [...this.myFieldworkMonths]
			.reverse()
			.map((m) => m.supervisorCode)
			.filter((code, i, all) => code !== '' && all.indexOf(code) === i);
	}

	/**
	 * Where each supervisor in this record stands.
	 *
	 * Derived from the months rather than from a list somebody maintains: a supervisor
	 * exists in this record because a month names them, so there is no way to log hours
	 * under somebody the checklist then fails to ask about.
	 */
	get fieldworkStandings(): SupervisorStanding[] {
		const req = this.fieldworkRequirement;
		const periodId = this.period?.id;
		if (!req || !periodId) return [];
		const months = this.myFieldworkMonths.map((m) => ({
			month: m.month,
			supervisorCode: m.supervisorCode
		}));
		return this.fieldworkSupervisorCodes.map((code) =>
			supervisorStanding(
				code,
				this.fieldworkSupervisors.find((c) => c.periodId === periodId && c.code === code) ??
					null,
				months,
				req.supervisor
			)
		);
	}

	async saveSupervisorCheck(
		periodId: string,
		code: string,
		values: { confirmed: string[]; contractSignedOn: string | null; note: string }
	): Promise<void> {
		const row: FieldworkSupervisorCheck = {
			id: `${periodId}:${code}`,
			periodId,
			code,
			/*
			 * Snapshotted, not passed through. `confirmed` arrives from a `$state` array in
			 * the page, `$state` returns a Proxy, and `structuredClone` on a Proxy throws
			 * `DataCloneError` — so the write fails at the IndexedDB boundary with an error
			 * nothing on the page surfaces. This is the one Svelte 5 hazard the storage layer
			 * exists to be protected from, and the first array to reach it from a component.
			 */
			confirmed: $state.snapshot(values.confirmed),
			/*
			 * Stamped here rather than taken from the form. The date that matters is when
			 * somebody actually went and looked, and a date they can type is a date they can
			 * backdate without meaning to.
			 */
			confirmedOn: values.confirmed.length > 0 ? todayIso() : null,
			contractSignedOn: values.contractSignedOn,
			note: values.note
		};
		await put('fieldworkSupervisors', row);
		this.fieldworkSupervisors = [
			...this.fieldworkSupervisors.filter((c) => c.id !== row.id),
			row
		];
		storage.hasData = true;
		void storage.requestPersist();
	}

	async deleteFieldworkMonth(monthId: string): Promise<void> {
		await remove('fieldworkMonths', monthId);
		this.fieldworkMonths = this.fieldworkMonths.filter((m) => m.id !== monthId);
	}

	async deleteFieldworkPeriod(periodId: string): Promise<void> {
		await removeFieldworkPeriod(periodId);
		this.fieldworkPeriods = this.fieldworkPeriods.filter((p) => p.id !== periodId);
		this.fieldworkMonths = this.fieldworkMonths.filter((m) => m.periodId !== periodId);
		this.fieldworkSupervisors = this.fieldworkSupervisors.filter(
			(c) => c.periodId !== periodId
		);
	}

	/** Plain snapshots, for the CSV writers. */
	snapshot() {
		return {
			supervisees: $state.snapshot(this.supervisees),
			workplaces: $state.snapshot(this.workplaces),
			entries: $state.snapshot(this.entries),
			serviceMonths: $state.snapshot(this.serviceMonths),
			superviseeMonths: $state.snapshot(this.superviseeMonths),
			cycles: $state.snapshot(this.cycles),
			units: $state.snapshot(this.units),
			fieldworkPeriods: $state.snapshot(this.fieldworkPeriods),
			fieldworkMonths: $state.snapshot(this.myFieldworkMonths),
			fieldworkSupervisors: $state.snapshot(this.fieldworkSupervisors)
		};
	}
}

export const tracker = new Tracker();
