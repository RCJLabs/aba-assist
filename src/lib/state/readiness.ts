/**
 * Which competency tasks somebody says they are ready for.
 *
 * Kept in localStorage rather than the database on purpose. It is nineteen booleans
 * about the reader's own confidence — not a record of anything clinical, not anything a
 * supervisor signs, and not worth a schema migration. It stays on the device, like every
 * other thing this app remembers.
 *
 * It is explicitly a self-assessment. The real assessment is a person watching you, and
 * the page says so: ticking every box here certifies nothing.
 */
const KEY = 'aba-assist:competency-readiness';

export type Readiness = Record<string, boolean>;

export function loadReadiness(): Readiness {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return {};
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== 'object' || parsed === null) return {};
		// Only keep the booleans: anything else came from a different version or a
		// different hand, and silently trusting it would be how a bug becomes permanent.
		return Object.fromEntries(
			Object.entries(parsed as Record<string, unknown>).filter(
				([, v]) => typeof v === 'boolean'
			)
		) as Readiness;
	} catch {
		// Private windows and blocked site data both land here. The page works without it.
		return {};
	}
}

export function saveReadiness(value: Readiness): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(value));
	} catch {
		// Nothing to do: the page keeps working, it just will not remember.
	}
}

export const readinessKey = (assessmentId: string, taskNumber: number): string =>
	`${assessmentId}:${taskNumber}`;
