import { describe, expect, it } from 'vitest';
import { CredentialFacts } from './credential.js';

/**
 * The tracker turns these numbers into a pass or fail on somebody's certification, so the
 * schema's cross-field rules are checked the same way the copyright and PHI guards are:
 * by proving they REJECT. A rule nobody has watched fire is a comment.
 */

function baseFacts(supervision: Record<string, unknown> | null) {
	return {
		id: 'bcaba',
		credential: 'BCaBA',
		label: 'Board Certified Assistant Behavior Analyst',
		issuer: 'BACB',
		handbookSourceId: 'bacb-bcaba-handbook-2026',
		handbookVersion: '06/2026',
		officialUrl: 'https://www.bacb.com/bcaba/',
		ourOverview:
			'An undergraduate-level certification whose holders deliver and supervise services under the ongoing supervision of an analyst.',
		sections: [
			{
				id: 'maintenance',
				title: 'Staying certified',
				items: [{ label: 'Cycle', value: 'Two years.' }]
			}
		],
		requirements: { supervision, development: null, fieldwork: null },
		review: { status: 'in-review', authoredBy: 'claude', authoredOn: '2026-09-16' },
		provenance: { license: 'CC-BY-SA-4.0', updated: '2026-09-16' }
	};
}

const tiered = {
	monthlyPercent: 5,
	reducedPercent: 2,
	reducedAfterServiceHours: 1000,
	contactsPerMonth: 1,
	observedContactsPerMonth: 0,
	individualContactsPerMonth: 0,
	groupMax: 10,
	locator: 'Supervision Requirements, p. 47'
};

describe('tiered supervision requirement', () => {
	it('accepts a percentage that steps down at a stated number of hours', () => {
		expect(CredentialFacts.safeParse(baseFacts(tiered)).success).toBe(true);
	});

	it('accepts a flat requirement, which is the ordinary case', () => {
		const flat = { ...tiered, reducedPercent: null, reducedAfterServiceHours: null };
		expect(CredentialFacts.safeParse(baseFacts(flat)).success).toBe(true);
	});

	it('REJECTS a reduced percentage with no threshold to apply it at', () => {
		const r = CredentialFacts.safeParse(
			baseFacts({ ...tiered, reducedAfterServiceHours: null })
		);
		expect(r.success).toBe(false);
		expect(JSON.stringify(r.error?.issues)).toMatch(/service hours it starts at/);
	});

	it('REJECTS a threshold with no reduced percentage to step to', () => {
		const r = CredentialFacts.safeParse(baseFacts({ ...tiered, reducedPercent: null }));
		expect(r.success).toBe(false);
		expect(JSON.stringify(r.error?.issues)).toMatch(/service hours it starts at/);
	});

	it('REJECTS a "reduced" percentage that is higher than the ordinary one', () => {
		const r = CredentialFacts.safeParse(
			baseFacts({ ...tiered, monthlyPercent: 2, reducedPercent: 5 })
		);
		expect(r.success).toBe(false);
		expect(JSON.stringify(r.error?.issues)).toMatch(/above the ordinary one/);
	});
});
