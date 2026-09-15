import type { z } from 'zod';
import {
	ALLOWED_STATUSES,
	CLINICAL_DECISION_LEXICON,
	MAX_QUOTED_WORDS,
	NAMEABLE_WITH_FLAG,
	RESTRICTED_PROCEDURE_LEXICON,
	REQUIRED_CONTACTS,
	RISK_LEXICON,
	type Channel,
	type Citation,
	type Source
} from '@aba/content-schema';
import { type Issue, error, warning } from './types.js';
import { fleschKincaidGrade, trigramSimilarity } from './readability.js';

/** Max Flesch–Kincaid grade for a plain-language field. */
export const PLAIN_LANGUAGE_MAX_GRADE = 9.5;

/** Run a Zod schema and turn every issue into a reportable Issue, never fail-fast. */
export function checkSchema<T>(
	schema: z.ZodType<T>,
	value: unknown,
	file: string,
	rule = 'schema'
): { value?: T; issues: Issue[] } {
	const r = schema.safeParse(value);
	if (r.success) return { value: r.data, issues: [] };
	return {
		issues: r.error.issues.map((i) =>
			error(rule, `${i.path.length ? i.path.join('.') + ': ' : ''}${i.message}`, file)
		)
	};
}

/**
 * Rights rules. These are the ones that keep other people's expression out of the
 * database. The schema guard already makes `officialText` unwriteable; these catch the
 * subtler routes in — an over-long quotation, a quotation from a source that does not
 * permit it, or copyright boilerplate pasted into body prose.
 */
export function checkRights(
	item: { citations?: Citation[] },
	prose: string[],
	sources: Map<string, Source>,
	file: string
): Issue[] {
	const issues: Issue[] = [];

	for (const c of item.citations ?? []) {
		const src = sources.get(c.sourceId);
		if (!src) continue; // referential check reports this separately
		if (c.useType === 'quotation') {
			if (!src.quotationAllowed) {
				issues.push(
					error(
						'rights/quotation-not-permitted',
						`cites "${c.sourceId}" as a quotation, but that source does not permit quotation (rights: ${src.rights}). Paraphrase in your own words and use "fact-reference" or "original-synthesis".`,
						file
					)
				);
			}
			const words = (c.quotedText ?? '').trim().split(/\s+/).filter(Boolean).length;
			if (words > MAX_QUOTED_WORDS) {
				issues.push(
					error(
						'rights/quotation-too-long',
						`quotation is ${words} words; the limit is ${MAX_QUOTED_WORDS} even from a permitted source`,
						file
					)
				);
			}
		}
	}

	for (const text of prose) {
		// A long run inside quote marks is a copied sentence wearing a disguise.
		const quoted = text.match(/["“]([^"”]{60,})["”]/);
		if (quoted) {
			const words = quoted[1].trim().split(/\s+/).length;
			if (words > 12) {
				issues.push(
					error(
						'rights/inline-quote',
						`prose contains a ${words}-word quoted run. Quotations belong in a citation with useType "quotation", not in body text.`,
						file
					)
				);
			}
		}
		if (/©\s*\d{4}|All rights reserved/i.test(text)) {
			issues.push(
				error(
					'rights/copyright-notice-in-prose',
					'prose contains a copyright notice — attribution belongs in citations, not body text',
					file
				)
			);
		}
	}

	return issues;
}

/**
 * Safety rules.
 *
 * The scenario schema already makes procedural instruction on a high-risk scenario a
 * parse error. These rules catch the author who never set `riskFlags` in the first
 * place, and the one who described a physical technique inside an escalation card.
 */
export function checkScenarioSafety(
	scenario: Record<string, unknown>,
	prose: string[],
	file: string
): Issue[] {
	const issues: Issue[] = [];
	const kind = scenario.kind as string;
	const joined = prose.join('\n');

	if (kind === 'guidance') {
		const hit = joined.match(RISK_LEXICON);
		if (hit) {
			issues.push(
				error(
					'safety/risk-language-in-guidance',
					`risk language detected ("${hit[0]}") in a guidance scenario. If this situation can involve harm, restraint, seclusion, or suspected abuse, it must be kind: "escalation-only" with riskFlags — that shape has no "steps" field, because there is no procedure for this app to give.`,
					file
				)
			);
		}
	}

	if (kind === 'escalation-only') {
		const esc = scenario.escalation as {
			contacts?: string[];
			mandatedReporterNote?: unknown;
			immediateSafetyNote?: string;
			legalNote?: string;
			documentation?: string[];
		};
		const flags = (scenario.riskFlags as string[]) ?? [];
		const contacts = esc?.contacts ?? [];

		/*
		 * Two different standards, because the two halves of a card do different jobs.
		 *
		 * The escalation block is where the APP speaks, and nothing in the restricted
		 * lexicon belongs there at all. The title and situation are where the card repeats
		 * back what has happened to the READER, and a card that cannot say "you have been
		 * told to restrain a learner" is a card nobody recognises as theirs at the one
		 * moment it matters. So there, and only there, a word may be named — and only when
		 * the matching riskFlag is declared, so naming a situation and classifying it
		 * cannot come apart.
		 */
		const answered = [
			esc?.immediateSafetyNote ?? '',
			typeof esc?.mandatedReporterNote === 'string' ? esc.mandatedReporterNote : '',
			esc?.legalNote ?? '',
			...(esc?.documentation ?? [])
		].join('\n');

		const spoken = answered.match(RESTRICTED_PROCEDURE_LEXICON);
		if (spoken) {
			issues.push(
				error(
					'safety/procedure-in-escalation',
					`escalation content describes a physical procedure ("${spoken[0]}"). Physical management is a certified hands-on competency, not readable knowledge. Say who to contact and what to document instead.`,
					file
				)
			);
		}

		const reported = [scenario.title, scenario.situation]
			.filter((x) => typeof x === 'string')
			.join('\n');
		const allowed = flags
			.map((f) => NAMEABLE_WITH_FLAG[f as keyof typeof NAMEABLE_WITH_FLAG])
			.filter((re): re is RegExp => re !== undefined);
		const everyHit = reported.matchAll(new RegExp(RESTRICTED_PROCEDURE_LEXICON.source, 'gi'));
		for (const m of everyHit) {
			if (allowed.some((re) => re.test(m[0]))) continue;
			issues.push(
				error(
					'safety/procedure-in-escalation',
					`the situation describes a physical procedure ("${m[0]}"). A card may name what it is refusing — "restraint", "seclusion", with the matching riskFlag set — but never how it is done.`,
					file
				)
			);
		}

		for (const flag of flags) {
			const required = REQUIRED_CONTACTS[flag as keyof typeof REQUIRED_CONTACTS];
			for (const c of required ?? []) {
				if (!contacts.includes(c)) {
					issues.push(
						error(
							'safety/missing-required-contact',
							`riskFlag "${flag}" requires escalation contact "${c}"`,
							file
						)
					);
				}
			}
		}

		if (flags.includes('suspected-abuse')) {
			const hasProtective =
				contacts.includes('child-protective-services') ||
				contacts.includes('adult-protective-services');
			if (!hasProtective) {
				issues.push(
					error(
						'safety/missing-required-contact',
						'riskFlag "suspected-abuse" requires child or adult protective services as a contact',
						file
					)
				);
			}
			if (!esc?.mandatedReporterNote) {
				issues.push(
					error(
						'safety/missing-mandated-reporter-note',
						'riskFlag "suspected-abuse" requires a mandatedReporterNote — reasonable suspicion is the reporting standard, not proof',
						file
					)
				);
			}
		}
	}

	const clinical = joined.match(CLINICAL_DECISION_LEXICON);
	if (clinical && kind !== 'escalation-only') {
		issues.push(
			error(
				'safety/clinical-decision-language',
				`content uses clinical-decision language ("${clinical[0]}"). This app never diagnoses or advises on medication.`,
				file
			)
		);
	}

	return issues;
}

/** Review-status gate for the channel being built. */
export function checkReviewStatus(
	review: {
		status: string;
		reviewedBy?: string | null;
		reviewedOn?: string | null;
		authoredBy: string;
	},
	channel: Channel,
	file: string
): Issue[] {
	const issues: Issue[] = [];
	const allowed = ALLOWED_STATUSES[channel];

	if (!allowed.includes(review.status as never)) {
		issues.push(
			error(
				'review/status-not-shippable',
				`reviewStatus "${review.status}" cannot ship in the "${channel}" channel (allowed: ${allowed.join(', ')})`,
				file
			)
		);
	}

	if (review.status === 'approved') {
		if (!review.reviewedBy || !review.reviewedOn) {
			issues.push(
				error(
					'review/approved-without-reviewer',
					'status "approved" requires both reviewedBy and reviewedOn',
					file
				)
			);
		} else if (review.reviewedBy === review.authoredBy) {
			issues.push(
				error(
					'review/self-review',
					`"${review.reviewedBy}" both authored and approved this item; review must be independent`,
					file
				)
			);
		}
	}

	return issues;
}

/** Plain-language readability gate. */
export function checkPlainLanguage(text: string, field: string, file: string): Issue[] {
	const { grade, words } = fleschKincaidGrade(text);
	if (words < 8) return [];
	if (grade > PLAIN_LANGUAGE_MAX_GRADE) {
		return [
			error(
				'editorial/plain-language-too-hard',
				`${field} reads at grade ${grade} (limit ${PLAIN_LANGUAGE_MAX_GRADE}). This field exists so a new technician or a paraeducator can read it — shorten the sentences and drop the jargon.`,
				file
			)
		];
	}
	return [];
}

/** Two terms defined in near-identical prose usually means one was pasted over the other. */
export function checkDuplicateProse(
	items: { id: string; text: string; file: string }[]
): Issue[] {
	const issues: Issue[] = [];
	for (let i = 0; i < items.length; i++) {
		for (let j = i + 1; j < items.length; j++) {
			const sim = trigramSimilarity(items[i].text, items[j].text);
			if (sim > 0.92) {
				issues.push(
					error(
						'editorial/duplicate-prose',
						`definition is ${Math.round(sim * 100)}% similar to "${items[j].id}"`,
						items[i].file
					)
				);
			} else if (sim > 0.8) {
				issues.push(
					warning(
						'editorial/similar-prose',
						`definition is ${Math.round(sim * 100)}% similar to "${items[j].id}"`,
						items[i].file
					)
				);
			}
		}
	}
	return issues;
}
