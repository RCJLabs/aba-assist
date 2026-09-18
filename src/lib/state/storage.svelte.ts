import { browser } from '$app/environment';
import {
	clearAll,
	DB_VERSION,
	exportAll,
	hasStoredData,
	restoreAll,
	resetDbHandle
} from '$lib/db/index.js';
import {
	backupFilename,
	backupIsOverdue,
	daysSince,
	NUDGE_AFTER_DAYS,
	totalRows,
	validateBackup,
	type BackupReport
} from '$lib/db/backup.js';
import {
	assess,
	daysSinceSeen,
	parseWitness,
	serialiseWitness,
	WITNESS_KEY,
	type DataState,
	type Witness
} from '$lib/db/witness.js';
import { downloadBlob } from '$lib/util/download.js';

const LAST_BACKUP_KEY = 'aba-assist:last-backup';
const PERSIST_ASKED_KEY = 'aba-assist:persist-asked';

export type PersistState = 'unknown' | 'granted' | 'denied' | 'unsupported';

/** Re-exported so components need one import for the whole feature. */
export { NUDGE_AFTER_DAYS };

/**
 * Keeping what the reader has done on their device, and getting it off again.
 *
 * The thing this exists to prevent is specific and documented: Safari and iOS evict
 * IndexedDB for a site that is not installed after about seven days of inactivity. For a
 * spaced-repetition app that is precisely backwards — the reader who studies once a week
 * is the one the scheduling is for, and the one who loses it. So the app asks for
 * persistent storage as soon as there is something worth persisting, and nags about a
 * backup when there has not been one for a month.
 */
class Storage {
	persist = $state<PersistState>('unknown');
	lastBackup = $state<number | null>(null);
	/** Filled by whoever knows whether there is anything stored yet. */
	hasData = $state(false);
	/**
	 * Whether data that used to be here has gone.
	 *
	 * See `$lib/db/witness.js` for what this can and cannot catch — the short version is
	 * that it catches a loss of IndexedDB alone and cannot catch a sweep that takes
	 * localStorage with it, which is the Safari case. That one is warned about in advance
	 * instead, further down this page.
	 */
	dataState = $state<DataState>('unknown');
	witness = $state<Witness | null>(null);
	busy = $state(false);
	message = $state('');
	report = $state<BackupReport | null>(null);

	load(): void {
		if (!browser) return;
		try {
			const raw = localStorage.getItem(LAST_BACKUP_KEY);
			this.lastBackup = raw ? Number(raw) || null : null;
		} catch {
			// Storage blocked; the nudge just behaves as though there has never been one.
		}
		try {
			this.witness = parseWitness(localStorage.getItem(WITNESS_KEY));
		} catch {
			// Storage blocked; nothing can be concluded, and `assess` says so.
			this.witness = null;
		}
		void this.refreshPersist();
		void this.checkData();
	}

	/**
	 * Read the database and decide what its state means.
	 *
	 * `hasStoredData` throwing is passed on as null rather than as false, which is the
	 * whole reason this is not one line. A database that cannot be opened — blocked
	 * storage, a private window, a browser refusing IndexedDB — looks exactly like an
	 * empty one from out here, and the difference between "you have nothing" and "this
	 * session cannot see what you have" is the difference between a fair warning and a
	 * false alarm about lost work.
	 */
	async checkData(): Promise<void> {
		if (!browser) return;
		let has: boolean | null;
		try {
			has = await hasStoredData();
		} catch {
			has = null;
		}
		this.hasData = has === true;
		this.dataState = assess(this.witness, has);
		// Seeing data is what makes a later absence meaningful, so record it every time.
		if (has === true) this.noteDataSeen();
	}

	/** Record that the database had something in it, so a later emptiness means something. */
	private noteDataSeen(): void {
		const w = { seenAt: Date.now() };
		this.witness = w;
		try {
			localStorage.setItem(WITNESS_KEY, serialiseWitness(w));
		} catch {
			// Storage blocked. Nothing is witnessed, which reads as "cannot tell" later —
			// the safe direction.
		}
	}

	/** Stop reporting a clearance the reader already knows about. */
	private forgetWitness(): void {
		this.witness = null;
		this.dataState = 'fresh';
		try {
			localStorage.removeItem(WITNESS_KEY);
		} catch {
			// Storage blocked.
		}
	}

	/** How long ago the app last saw data on this device, in whole days. */
	get daysSinceData(): number | null {
		return this.witness === null ? null : daysSinceSeen(this.witness, Date.now());
	}

	/**
	 * Acknowledge a reported clearance without restoring anything.
	 *
	 * Somebody who has no backup can do nothing about it, and a notice they cannot act on
	 * and cannot dismiss is just a scold on every visit.
	 */
	dismissClearedNotice(): void {
		if (this.dataState === 'cleared') this.forgetWitness();
	}

	async refreshPersist(): Promise<void> {
		if (!browser || !navigator.storage?.persisted) {
			this.persist = 'unsupported';
			return;
		}
		try {
			this.persist = (await navigator.storage.persisted()) ? 'granted' : 'denied';
		} catch {
			this.persist = 'unsupported';
		}
	}

	/**
	 * Ask the browser to stop evicting this app's data.
	 *
	 * Called after the reader does something worth keeping — a first review, a first
	 * logged contact — rather than on arrival. Some browsers show a prompt, and a
	 * permission request from a page somebody has not used yet is the kind that gets
	 * denied permanently. Asking once is also enough: a denial is remembered so this does
	 * not become a thing that happens every session.
	 */
	async requestPersist(): Promise<void> {
		if (!browser || !navigator.storage?.persist) return;
		try {
			if (localStorage.getItem(PERSIST_ASKED_KEY)) {
				await this.refreshPersist();
				return;
			}
		} catch {
			// Storage blocked; fall through and ask.
		}
		try {
			if (await navigator.storage.persisted()) {
				this.persist = 'granted';
				return;
			}
			const granted = await navigator.storage.persist();
			this.persist = granted ? 'granted' : 'denied';
			localStorage.setItem(PERSIST_ASKED_KEY, '1');
		} catch {
			this.persist = 'unsupported';
		}
	}

	get overdue(): boolean {
		return backupIsOverdue(this.lastBackup, this.hasData, Date.now());
	}

	get daysSinceBackup(): number | null {
		return this.lastBackup === null ? null : daysSince(this.lastBackup, Date.now());
	}

	private noteBackup(): void {
		const now = Date.now();
		this.lastBackup = now;
		try {
			localStorage.setItem(LAST_BACKUP_KEY, String(now));
		} catch {
			// Storage blocked; the nudge will reappear, which is the safe direction.
		}
	}

	async exportBackup(): Promise<void> {
		this.busy = true;
		this.message = '';
		this.report = null;
		try {
			const data = await exportAll();
			downloadBlob(
				backupFilename(new Date()),
				JSON.stringify(data, null, 2),
				'application/json'
			);
			this.noteBackup();
			this.message = 'Backup downloaded. Keep it somewhere that is not this device.';
		} catch {
			this.message = 'Could not read your data to back it up.';
		} finally {
			this.busy = false;
		}
	}

	/**
	 * Replace everything with a file.
	 *
	 * Validated before a single row is written, and refused outright if the file is not
	 * ours or was written by a newer build. Anything that survives validation but was
	 * dropped is reported, because a restore that quietly lost a year of supervision
	 * records should not look like a success.
	 */
	async importBackup(file: File): Promise<boolean> {
		this.busy = true;
		this.message = '';
		this.report = null;
		try {
			const text = await file.text();
			let raw: unknown;
			try {
				raw = JSON.parse(text);
			} catch {
				this.message = 'That file is not valid JSON.';
				return false;
			}
			const result = validateBackup(raw, DB_VERSION);
			if (!result.ok) {
				this.message = result.error;
				return false;
			}
			await restoreAll(result.data);
			this.report = result.report;
			// Restored data is data: witness it, and stop reporting the loss it just fixed.
			this.noteDataSeen();
			this.dataState = 'present';
			const rows = totalRows(result.report.counts);
			this.message = `Restored ${rows} ${rows === 1 ? 'record' : 'records'}.`;
			this.noteBackup();
			await this.requestPersist();
			return true;
		} catch {
			this.message = 'Could not write the restored data to this device.';
			return false;
		} finally {
			this.busy = false;
		}
	}

	async eraseEverything(): Promise<void> {
		this.busy = true;
		this.message = '';
		this.report = null;
		try {
			await clearAll();
			resetDbHandle();
			this.hasData = false;
			this.lastBackup = null;
			/*
			 * Deleting your own data is not a clearance to be warned about. Without this
			 * the app would greet somebody who had just pressed "delete everything" with a
			 * notice that their data had gone, which is both obvious and alarming.
			 */
			this.forgetWitness();
			try {
				localStorage.removeItem(LAST_BACKUP_KEY);
			} catch {
				// Storage blocked.
			}
			this.message = 'Everything stored on this device has been deleted.';
		} catch {
			this.message = 'Could not delete the stored data.';
		} finally {
			this.busy = false;
		}
	}
}

export const storage = new Storage();
