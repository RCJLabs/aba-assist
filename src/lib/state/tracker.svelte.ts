import { browser } from '$app/environment';
import { credentials } from '$lib/content/load.js';
import {
	getAll,
	put,
	remove,
	removeCycle,
	removeSupervisee,
	type Cycle,
	type DevelopmentUnit,
	type ServiceMonth,
	type ContactFormat,
	type ContactModality,
	type Supervisee,
	type SupervisionEntry,
	type UnitKind,
	type UnitTopic,
	type Workplace
} from '$lib/db/index.js';
import {
	cycleEnd,
	summariseCycle,
	todayIso,
	summariseMonths,
	unitsOutsideCycle,
	type CycleSummary,
	type DevelopmentRequirement,
	type MonthSummary,
	type SupervisionRequirement
} from '$lib/tracker/rules.js';

export type TrackerStatus = 'idle' | 'loading' | 'ready' | 'unavailable';
export type TrackedCredential = 'RBT' | 'BCBA' | 'BCaBA';

const ROLE_KEY = 'aba-assist:tracker-credential';

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
	ServiceMonth,
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
	cycles = $state<Cycle[]>([]);
	units = $state<DevelopmentUnit[]>([]);

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
			const [supervisees, workplaces, entries, serviceMonths, cycles, units] =
				await Promise.all([
					getAll('supervisees'),
					getAll('workplaces'),
					getAll('supervisionEntries'),
					getAll('serviceMonths'),
					getAll('cycles'),
					getAll('developmentUnits')
				]);
			this.supervisees = supervisees;
			this.workplaces = workplaces;
			this.entries = entries;
			this.serviceMonths = serviceMonths;
			this.cycles = cycles;
			this.units = units;
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
	 * Requirements come from the credential content. A BCaBA maintains certification on the
	 * analyst rules, so it reads the analyst facts rather than carrying a third copy.
	 */
	private get facts() {
		return credentials[this.credential === 'BCaBA' ? 'bcba' : this.credential.toLowerCase()];
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

	async addEntry(entry: Omit<SupervisionEntry, 'id'>): Promise<void> {
		const e: SupervisionEntry = { ...entry, id: id() };
		await put('supervisionEntries', e);
		this.entries = [...this.entries, e];
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

	/** Plain snapshots, for the CSV writers. */
	snapshot() {
		return {
			supervisees: $state.snapshot(this.supervisees),
			workplaces: $state.snapshot(this.workplaces),
			entries: $state.snapshot(this.entries),
			serviceMonths: $state.snapshot(this.serviceMonths),
			cycles: $state.snapshot(this.cycles),
			units: $state.snapshot(this.units)
		};
	}
}

export const tracker = new Tracker();
