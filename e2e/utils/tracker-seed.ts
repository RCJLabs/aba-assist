import type { Page } from '@playwright/test';

/**
 * Put tracker records straight into IndexedDB.
 *
 * Driving the supervision and development forms for every case would make these tests
 * about the forms rather than about the figures, and a month that is deliberately short
 * takes a dozen interactions to build. The app must have opened the database first —
 * opening it here by version would create an empty one without the stores the migrations
 * add, which is a confusing failure to debug.
 */
export interface SeedOptions {
	/** Hours delivered this month. Leave undefined to test the missing-denominator case. */
	serviceHours?: number;
	/** How many one-hour contacts to log this month. */
	contacts?: number;
	/** How many of those had the supervisor observe work with a client. */
	observed?: number;
	/** Units earned in the cycle, and how the cycle sits relative to today. */
	cycle?: { units: number; startMonthsAgo: number; years: number };
	/** Competency tasks to tick, 1..n. */
	competencyReady?: number;
	workplace?: string;
}

export async function seedTracker(page: Page, options: SeedOptions = {}): Promise<void> {
	await page.evaluate(async (opts: SeedOptions) => {
		const today = new Date();
		const iso = (d: Date) => {
			const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
			return local.toISOString().slice(0, 10);
		};
		const month = iso(today).slice(0, 7);
		const label = opts.workplace ?? 'Clinic';

		/*
		 * Wait for the app's own migrations, rather than assuming they have run.
		 *
		 * Opening without a version gives whatever exists — including a database the app
		 * has created but not yet upgraded, whose stores are missing. Creating them here
		 * by opening at a version would make a database the app then refuses to upgrade,
		 * so this waits for the real thing instead. The page having painted is not the
		 * signal: `tracker.load()` is still in flight at that point.
		 */
		const open = () =>
			new Promise<IDBDatabase>((res, rej) => {
				const r = indexedDB.open('aba-assist');
				r.onsuccess = () => res(r.result);
				r.onerror = () => rej(r.error);
			});

		let db = await open();
		for (let tries = 0; !db.objectStoreNames.contains('workplaces') && tries < 50; tries++) {
			db.close();
			await new Promise((res) => setTimeout(res, 100));
			db = await open();
		}
		if (!db.objectStoreNames.contains('workplaces')) {
			throw new Error('the app never created its tracker stores');
		}
		const put = (store: string, value: unknown) =>
			new Promise<void>((res, rej) => {
				const tx = db.transaction(store, 'readwrite');
				tx.objectStore(store).put(value);
				tx.oncomplete = () => res();
				tx.onerror = () => rej(tx.error);
			});

		await put('workplaces', { id: 'w1', label, active: true, createdAt: Date.now() });
		if (opts.serviceHours !== undefined) {
			await put('serviceMonths', {
				id: `w1:${month}`,
				month,
				workplaceId: 'w1',
				hours: opts.serviceHours
			});
		}
		for (let i = 0; i < (opts.contacts ?? 0); i++) {
			await put('supervisionEntries', {
				id: `e${i}`,
				date: iso(new Date(today.getFullYear(), today.getMonth(), 2 + i)),
				minutes: 60,
				format: 'individual',
				modality: 'in-person',
				observed: i < (opts.observed ?? 0),
				workplaceId: 'w1',
				superviseeId: null,
				note: ''
			});
		}

		if (opts.cycle) {
			const start = new Date(
				today.getFullYear(),
				today.getMonth() - opts.cycle.startMonthsAgo,
				1
			);
			const end = new Date(start.getFullYear() + opts.cycle.years, start.getMonth(), 0);
			await put('cycles', {
				id: 'c1',
				credential: 'RBT',
				startDate: iso(start),
				endDate: iso(end),
				supervisedOthers: false
			});
			for (let i = 0; i < opts.cycle.units; i++) {
				await put('developmentUnits', {
					id: `u${i}`,
					cycleId: 'c1',
					date: iso(new Date(start.getFullYear(), start.getMonth(), 10)),
					units: 1,
					kind: 'training',
					topic: 'general',
					title: 'Workshop',
					provider: 'Provider'
				});
			}
		}
		db.close();

		if (opts.competencyReady) {
			const ready: Record<string, boolean> = {};
			for (let n = 1; n <= opts.competencyReady; n++) ready[`rbt-ica-2026:${n}`] = true;
			localStorage.setItem('aba-assist:competency-readiness', JSON.stringify(ready));
		}
		localStorage.setItem('aba-assist:tracker-credential', 'RBT');
	}, options);
}
