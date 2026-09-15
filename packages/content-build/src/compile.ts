import { createHash } from 'node:crypto';
import { join } from 'node:path';
import MiniSearch from 'minisearch';
import {
	CATEGORY_LABELS,
	CompetencyAssessment,
	ContentOutline,
	RELEASE_MINIMUM_TERMS,
	WITHHOLDING_CHANNELS,
	CredentialFacts,
	EthicsCode,
	EthicsTopic,
	PracticeGuide,
	GraphDoc,
	QuizFile,
	Scenario,
	SourceRegistry,
	Term,
	isDomainRef,
	searchOptions,
	taskRefKey,
	type QuizQuestion,
	type Source,
	type TaskRef,
	type PracticeGuide as z_PracticeGuide,
	type GraphDoc as z_GraphDoc,
	type CompetencyAssessment as z_Competency,
	type SearchIndexEntry,
	type TermIndexEntry
} from '@aba/content-schema';
import { discover, parseMarkdown, parseYamlFile } from './parse.js';
import type { CompileOptions, CompileResult, EmittedAsset, Issue } from './types.js';
import { error } from './types.js';
import {
	checkDuplicateProse,
	checkExamCoverage,
	checkPlainLanguage,
	checkReviewStatus,
	checkRights,
	checkSchema,
	checkScenarioSafety
} from './validate.js';

function sha256(s: string): string {
	return createHash('sha256').update(s).digest('hex');
}

/** Prose fields that the rights and safety lexicons are run over. */
function termProse(t: z_Term): string[] {
	return [
		t.definition.technical,
		t.definition.plain,
		t.definition.gloss,
		...t.examples.map((e) => e.text),
		...t.nonExamples.map((e) => e.text)
	];
}

type z_Term = ReturnType<typeof Term.parse>;
type z_Scenario = ReturnType<typeof Scenario.parse>;
type z_Outline = ReturnType<typeof ContentOutline.parse>;
type z_Credential = ReturnType<typeof CredentialFacts.parse>;
type z_EthicsCode = ReturnType<typeof EthicsCode.parse>;
type z_EthicsTopic = ReturnType<typeof EthicsTopic.parse>;

function topicProse(t: z_EthicsTopic): string[] {
	return [
		t.ourLabel,
		t.gloss,
		t.ourSummary,
		t.plainSummary,
		t.ifYouAreUnsure,
		...t.whatThisLooksLike,
		...t.commonPitfalls
	];
}

function guideProse(g: z_PracticeGuide): string[] {
	const base = [g.title, g.gloss, g.ourSummary, g.plainSummary, g.whoDecides];
	return g.kind === 'checklist'
		? [...base, ...g.items.flatMap((i) => [i.label, i.why, i.example ?? ''])]
		: [...base, ...g.pairs.flatMap((p) => [p.vague, p.objective, p.why])];
}

function graphProse(g: z_GraphDoc): string[] {
	return [
		g.title,
		g.gloss,
		g.teaching,
		g.plainSummary,
		g.longDescription,
		...g.phases.map((p) => `${p.label} ${p.changeNote ?? ''}`),
		...g.readings.map((r) => r.text),
		...g.callouts.flatMap((c) => [c.label, c.text])
	];
}

function scenarioProse(s: z_Scenario): string[] {
	const base = [s.title, s.situation];
	if (s.kind === 'guidance') {
		return [
			...base,
			...s.steps.flatMap((x) => [x.text, x.rationale ?? '']),
			...s.whatNotToDo,
			...s.whenToEscalate
		];
	}
	return [
		...base,
		s.escalation.immediateSafetyNote,
		s.escalation.mandatedReporterNote ?? '',
		s.escalation.legalNote,
		...s.escalation.documentation
	];
}

function competencyProse(c: z_Competency): string[] {
	return [
		c.ourOverview,
		...c.sections.flatMap((s) => [
			s.ourDescription,
			s.sectionRule ?? '',
			...s.tasks.flatMap((t) => [
				t.ourSummary,
				t.plainSummary,
				...t.alternatives.map((a) => a.ourSummary)
			])
		]),
		...c.rules.map((r) => r.value)
	].filter(Boolean);
}

function questionProse(q: QuizQuestion): string[] {
	return [q.stem, q.explanation, ...q.options.flatMap((o) => [o.text, o.rationale])];
}

export async function compile(opts: CompileOptions): Promise<CompileResult> {
	const { root, channel } = opts;
	const issues: Issue[] = [];
	const push = (...i: Issue[]) => issues.push(...i);

	const inputHash = createHash('sha256');

	// ---------------------------------------------------------------- sources
	const sources = new Map<string, Source>();
	{
		const path = join(root, '_registry', 'sources.yaml');
		const { data, issues: pIssues } = await parseYamlFile(root, path);
		push(...pIssues);
		if (data !== undefined) {
			inputHash.update(JSON.stringify(data));
			const { value, issues: sIssues } = checkSchema(
				SourceRegistry,
				data,
				'_registry/sources.yaml',
				'schema/sources'
			);
			push(...sIssues);
			for (const s of value?.sources ?? []) sources.set(s.id, s);
		} else if (pIssues.length === 0) {
			push(error('parse/missing', 'content/_registry/sources.yaml not found'));
		}
	}

	// --------------------------------------------------------------- taxonomy
	const outlines = new Map<string, z_Outline>();
	/** "RBT:C-3" -> true */
	const taskCodes = new Set<string>();
	/** "RBT:C" -> true */
	const domainKeys = new Set<string>();
	/** Credentials that have an outline at all. */
	const outlinedCredentials = new Set<string>();
	{
		const dir = join(root, 'taxonomy');
		for (const path of await discover(dir, ['.yaml', '.yml'])) {
			const { data, issues: pIssues } = await parseYamlFile(root, path);
			push(...pIssues);
			if (data === undefined) continue;
			inputHash.update(JSON.stringify(data));
			const file = path.slice(root.length + 1);
			const { value, issues: sIssues } = checkSchema(
				ContentOutline,
				data,
				file,
				'schema/taxonomy'
			);
			push(...sIssues);
			if (!value) continue;
			outlines.set(value.id, value);
			outlinedCredentials.add(value.credential);
			for (const d of value.domains) {
				domainKeys.add(`${value.credential}:${d.letter}`);
				for (const t of d.tasks) taskCodes.add(`${value.credential}:${t.code}`);
			}
			if (!sources.has(value.sourceId)) {
				push(
					error(
						'refs/unknown-source',
						`outline cites unknown source "${value.sourceId}"`,
						file
					)
				);
			}
			push(...checkReviewStatus(value.review, channel, file));
		}
		for (const o of outlines.values()) {
			if (o.subsetOf && !outlines.has(o.subsetOf)) {
				push(error('refs/unresolved', `subsetOf points at unknown outline "${o.subsetOf}"`));
			}
		}
	}

	/**
	 * A task ref is valid when its credential has an outline and the code names either a
	 * domain in that outline or a verified task code. A ref to a credential with no
	 * outline is an error rather than silently unvalidated: that is how a typo'd
	 * credential would otherwise slip through.
	 */
	const checkTaskRefs = (refs: TaskRef[], file: string) => {
		for (const r of refs) {
			if (!outlinedCredentials.has(r.credential)) {
				push(
					error(
						'refs/unknown-task-code',
						`taskRef ${r.credential} ${r.code}: no outline is modelled for ${r.credential}`,
						file
					)
				);
				continue;
			}
			const key = taskRefKey(r);
			const ok = isDomainRef(r.code) ? domainKeys.has(key) : taskCodes.has(key);
			if (!ok) {
				push(
					error(
						'refs/unknown-task-code',
						`taskRef ${r.credential} ${r.code} is not in the ${r.credential} outline`,
						file
					)
				);
			}
		}
	};

	// ------------------------------------------------------------------ terms
	const terms: z_Term[] = [];
	const termFiles = new Map<string, string>();
	{
		const dir = join(root, 'terms');
		for (const path of await discover(dir, ['.md'])) {
			const { parsed, issues: pIssues } = await parseMarkdown(root, dir, path);
			push(...pIssues);
			if (!parsed) continue;
			inputHash.update(JSON.stringify(parsed.data));

			const { value, issues: sIssues } = checkSchema(
				Term,
				parsed.data,
				parsed.file,
				'schema/term'
			);
			push(...sIssues);
			if (!value) continue;

			if (value.id !== parsed.basename) {
				push(
					error(
						'structure/id-filename-mismatch',
						`id "${value.id}" does not match filename "${parsed.basename}"`,
						parsed.file
					)
				);
			}
			const dirCategory = parsed.dirs[0];
			if (dirCategory && dirCategory !== value.category) {
				push(
					error(
						'structure/category-directory-mismatch',
						`category "${value.category}" but the file lives in terms/${dirCategory}/`,
						parsed.file
					)
				);
			}
			if (termFiles.has(value.id)) {
				push(
					error(
						'structure/duplicate-id',
						`duplicate term id "${value.id}" (also in ${termFiles.get(value.id)})`,
						parsed.file
					)
				);
			}

			termFiles.set(value.id, parsed.file);
			terms.push(value);

			push(...checkRights(value, termProse(value), sources, parsed.file));
			push(...checkReviewStatus(value.review, channel, parsed.file));
			push(...checkPlainLanguage(value.definition.plain, 'definition.plain', parsed.file));
		}
	}

	// -------------------------------------------------------------- scenarios
	const scenarios: z_Scenario[] = [];
	const scenarioFiles = new Map<string, string>();
	{
		const dir = join(root, 'scenarios');
		for (const path of await discover(dir, ['.md'])) {
			const { parsed, issues: pIssues } = await parseMarkdown(root, dir, path);
			push(...pIssues);
			if (!parsed) continue;
			inputHash.update(JSON.stringify(parsed.data));

			const { value, issues: sIssues } = checkSchema(
				Scenario,
				parsed.data,
				parsed.file,
				'schema/scenario'
			);
			push(...sIssues);
			if (!value) continue;

			if (value.id !== parsed.basename) {
				push(
					error(
						'structure/id-filename-mismatch',
						`id "${value.id}" does not match filename "${parsed.basename}"`,
						parsed.file
					)
				);
			}
			if (scenarioFiles.has(value.id)) {
				push(
					error('structure/duplicate-id', `duplicate scenario id "${value.id}"`, parsed.file)
				);
			}
			scenarioFiles.set(value.id, parsed.file);
			scenarios.push(value);

			const prose = scenarioProse(value);
			push(...checkRights(value, prose, sources, parsed.file));
			push(
				...checkScenarioSafety(value as unknown as Record<string, unknown>, prose, parsed.file)
			);
			push(...checkReviewStatus(value.review, channel, parsed.file));
		}
	}

	// -------------------------------------------------------- practice guides
	const guides: z_PracticeGuide[] = [];
	const guideFiles = new Map<string, string>();
	{
		const dir = join(root, 'practice');
		for (const path of await discover(dir, ['.md'])) {
			const { parsed, issues: pIssues } = await parseMarkdown(root, dir, path);
			push(...pIssues);
			if (!parsed) continue;
			inputHash.update(JSON.stringify(parsed.data));

			const { value, issues: sIssues } = checkSchema(
				PracticeGuide,
				parsed.data,
				parsed.file,
				'schema/practice-guide'
			);
			push(...sIssues);
			if (!value) continue;

			if (value.id !== parsed.basename) {
				push(
					error(
						'structure/id-filename-mismatch',
						`id "${value.id}" does not match filename "${parsed.basename}"`,
						parsed.file
					)
				);
			}
			if (guideFiles.has(value.id)) {
				push(
					error(
						'structure/duplicate-id',
						`duplicate practice guide "${value.id}"`,
						parsed.file
					)
				);
			}
			guideFiles.set(value.id, parsed.file);
			guides.push(value);

			const prose = guideProse(value);
			push(...checkRights(value, prose, sources, parsed.file));
			push(...checkReviewStatus(value.review, channel, parsed.file));
			push(...checkPlainLanguage(value.plainSummary, 'plainSummary', parsed.file));
			/*
			 * The clinical-decision check, and only that one.
			 *
			 * The risk lexicon that guards scenarios would be actively wrong here: this is
			 * documentation guidance, and the whole point of the phrasing guide is to help
			 * somebody describe an incident — including a hard one — in terms a reader can
			 * measure. Describing what happened is required of a technician; deciding what
			 * to do about it is not theirs, which is what this check still catches.
			 */
			push(
				...checkScenarioSafety({ kind: 'practice-guide' }, prose, parsed.file).filter(
					(i) => i.rule === 'safety/clinical-decision-language'
				)
			);
		}
	}

	// --------------------------------------------------------------- graphs
	const graphs: z_GraphDoc[] = [];
	const graphFiles = new Map<string, string>();
	{
		const dir = join(root, 'graphs');
		for (const path of await discover(dir, ['.yaml', '.yml'])) {
			const { data, issues: pIssues } = await parseYamlFile(root, path);
			push(...pIssues);
			if (data === undefined) continue;
			inputHash.update(JSON.stringify(data));
			const file = path.slice(root.length + 1);

			const { value, issues: sIssues } = checkSchema(GraphDoc, data, file, 'schema/graph');
			push(...sIssues);
			if (!value) continue;

			const basename = path.slice(path.lastIndexOf('/') + 1).replace(/\.ya?ml$/, '');
			if (value.id !== basename) {
				push(
					error(
						'structure/id-filename-mismatch',
						`id "${value.id}" does not match filename "${basename}"`,
						file
					)
				);
			}
			if (graphFiles.has(value.id)) {
				push(error('structure/duplicate-id', `duplicate graph "${value.id}"`, file));
			}
			graphFiles.set(value.id, file);
			graphs.push(value);

			const prose = graphProse(value);
			push(...checkRights(value, prose, sources, file));
			push(...checkReviewStatus(value.review, channel, file));
			push(...checkPlainLanguage(value.plainSummary, 'plainSummary', file));
			/*
			 * The clinical-decision check only, for the same reason the practice guides get
			 * only that one: describing what a graph shows is reading data, which is a
			 * technician's job. Deciding what to change because of it is not, and that is
			 * what this still catches.
			 */
			push(
				...checkScenarioSafety({ kind: 'graph' }, prose, file).filter(
					(i) => i.rule === 'safety/clinical-decision-language'
				)
			);
		}
	}

	// ------------------------------------------------------------ competency
	/*
	 * Competency assessments, which are a performance requirement rather than a paper.
	 * Same treatment as the task-list outlines: the numbering, the section names, the
	 * labels and which methods are permitted are facts about a published requirement, and
	 * every description is ours. The clinical-decision check runs, for the same reason it
	 * runs over the graphs — saying what a task asks for is description, and saying what a
	 * reader should do clinically is not this app's to say.
	 */
	const competencies: z_Competency[] = [];
	const competencyFiles = new Map<string, string>();
	{
		const dir = join(root, 'competency');
		for (const path of await discover(dir, ['.yaml', '.yml'])) {
			const { data, issues: pIssues } = await parseYamlFile(root, path);
			push(...pIssues);
			if (data === undefined) continue;
			inputHash.update(JSON.stringify(data));
			const file = path.slice(root.length + 1);

			const { value, issues: sIssues } = checkSchema(
				CompetencyAssessment,
				data,
				file,
				'schema/competency'
			);
			push(...sIssues);
			if (!value) continue;

			const basename = path.slice(path.lastIndexOf('/') + 1).replace(/\.ya?ml$/, '');
			if (value.id !== basename) {
				push(
					error(
						'structure/id-filename-mismatch',
						`id "${value.id}" does not match filename "${basename}"`,
						file
					)
				);
			}
			if (competencyFiles.has(value.id)) {
				push(error('structure/duplicate-id', `duplicate competency "${value.id}"`, file));
			}
			competencyFiles.set(value.id, file);
			competencies.push(value);

			const prose = competencyProse(value);
			// No citations array: the whole document cites one source, named at the top.
			// The prose still goes through the verbatim and inline-quote heuristics.
			push(...checkRights({}, prose, sources, file));
			if (!sources.has(value.sourceId)) {
				push(
					error(
						'refs/unknown-source',
						`sourceId "${value.sourceId}" is not in the registry`,
						file
					)
				);
			}
			push(...checkReviewStatus(value.review, channel, file));
			for (const sec of value.sections) {
				for (const t of sec.tasks) {
					push(...checkPlainLanguage(t.plainSummary, `task ${t.number} plainSummary`, file));
				}
			}
			push(
				...checkScenarioSafety({ kind: 'graph' }, prose, file).filter(
					(i) => i.rule === 'safety/clinical-decision-language'
				)
			);
		}
	}

	// -------------------------------------------------------------- questions
	const questions: QuizQuestion[] = [];
	const questionFiles = new Map<string, string>();
	{
		const dir = join(root, 'questions');
		for (const path of await discover(dir, ['.yaml', '.yml'])) {
			const { data, issues: pIssues } = await parseYamlFile(root, path);
			push(...pIssues);
			if (data === undefined) continue;
			inputHash.update(JSON.stringify(data));
			const file = path.slice(root.length + 1);
			const { value, issues: sIssues } = checkSchema(QuizFile, data, file, 'schema/question');
			push(...sIssues);
			if (!value) continue;

			for (const q of value.questions) {
				if (questionFiles.has(q.id)) {
					push(
						error(
							'structure/duplicate-id',
							`duplicate question id "${q.id}" (also in ${questionFiles.get(q.id)})`,
							file
						)
					);
				}
				questionFiles.set(q.id, file);
				questions.push(q);

				push(...checkRights(q, questionProse(q), sources, file));
				push(...checkReviewStatus(q.review, channel, file));
				push(
					...checkScenarioSafety({ kind: 'question' }, questionProse(q), file).filter(
						(i) => i.rule === 'safety/clinical-decision-language'
					)
				);
			}
		}
	}

	// ------------------------------------------------------------ credentials
	const credentials: z_Credential[] = [];
	{
		const dir = join(root, 'credentials');
		for (const path of await discover(dir, ['.yaml', '.yml'])) {
			const { data, issues: pIssues } = await parseYamlFile(root, path);
			push(...pIssues);
			if (data === undefined) continue;
			inputHash.update(JSON.stringify(data));
			const file = path.slice(root.length + 1);
			const { value, issues: sIssues } = checkSchema(
				CredentialFacts,
				data,
				file,
				'schema/credential'
			);
			push(...sIssues);
			if (!value) continue;
			if (credentials.some((c) => c.id === value.id)) {
				push(error('structure/duplicate-id', `duplicate credential id "${value.id}"`, file));
			}
			credentials.push(value);
			if (!sources.has(value.handbookSourceId)) {
				push(
					error(
						'refs/unknown-source',
						`handbookSourceId "${value.handbookSourceId}" is not in the registry`,
						file
					)
				);
			}
			if (value.outlineId && !outlines.has(value.outlineId)) {
				push(
					error(
						'refs/unresolved',
						`outlineId points at unknown outline "${value.outlineId}"`,
						file
					)
				);
			}
			push(...checkReviewStatus(value.review, channel, file));
			const prose = [
				value.ourOverview,
				...value.sections.flatMap((s) => [s.ourNote ?? '', ...s.items.map((i) => i.value)])
			];
			// No citations block here: the handbook itself is the single source, named by id.
			push(...checkRights({}, prose, sources, file));
		}
	}

	// ---------------------------------------------------------------- ethics
	const ethicsCodes: z_EthicsCode[] = [];
	const ethicsTopics: z_EthicsTopic[] = [];
	const topicFiles = new Map<string, string>();
	{
		const dir = join(root, 'ethics', 'codes');
		for (const path of await discover(dir, ['.yaml', '.yml'])) {
			const { data, issues: pIssues } = await parseYamlFile(root, path);
			push(...pIssues);
			if (data === undefined) continue;
			inputHash.update(JSON.stringify(data));
			const file = path.slice(root.length + 1);
			const { value, issues: sIssues } = checkSchema(
				EthicsCode,
				data,
				file,
				'schema/ethics-code'
			);
			push(...sIssues);
			if (!value) continue;
			if (ethicsCodes.some((c) => c.id === value.id)) {
				push(error('structure/duplicate-id', `duplicate ethics code "${value.id}"`, file));
			}
			ethicsCodes.push(value);
			if (!sources.has(value.sourceId)) {
				push(error('refs/unknown-source', `cites unknown source "${value.sourceId}"`, file));
			}
			push(...checkReviewStatus(value.review, channel, file));
			push(
				...checkRights(
					{},
					[
						value.ourOverview,
						...value.corePrinciples.flatMap((x) => [x.ourLabel, x.ourSummary, x.sourceNote]),
						...value.sections.flatMap((x) => [
							x.ourLabel,
							x.ourSummary,
							...x.standards.flatMap((st) => [st.ourLabel, st.ourSummary])
						])
					],
					sources,
					file
				)
			);
		}

		const topicDir = join(root, 'ethics', 'topics');
		for (const path of await discover(topicDir, ['.md'])) {
			const { parsed, issues: pIssues } = await parseMarkdown(root, topicDir, path);
			push(...pIssues);
			if (!parsed) continue;
			inputHash.update(JSON.stringify(parsed.data));
			const { value, issues: sIssues } = checkSchema(
				EthicsTopic,
				parsed.data,
				parsed.file,
				'schema/ethics-topic'
			);
			push(...sIssues);
			if (!value) continue;
			if (value.id !== parsed.basename) {
				push(
					error(
						'structure/id-filename-mismatch',
						`id "${value.id}" does not match filename "${parsed.basename}"`,
						parsed.file
					)
				);
			}
			if (topicFiles.has(value.id)) {
				push(
					error('structure/duplicate-id', `duplicate ethics topic "${value.id}"`, parsed.file)
				);
			}
			topicFiles.set(value.id, parsed.file);
			ethicsTopics.push(value);
			push(...checkRights(value, topicProse(value), sources, parsed.file));
			push(...checkReviewStatus(value.review, channel, parsed.file));
			push(...checkPlainLanguage(value.plainSummary, 'plainSummary', parsed.file));
			push(
				...checkScenarioSafety(
					{ kind: 'ethics-topic' },
					topicProse(value),
					parsed.file
				).filter((i) => i.rule === 'safety/clinical-decision-language')
			);
		}

		// A topic must sit under a section that exists, and may only cite a standard number
		// once someone has checked that code's numbering against the document itself.
		const codesById = new Map(ethicsCodes.map((c) => [c.id, c]));
		for (const t of ethicsTopics) {
			const file = topicFiles.get(t.id)!;
			for (const ref of t.sectionRefs) {
				const code = codesById.get(ref.codeId);
				if (!code) {
					push(
						error('refs/unresolved', `sectionRef points at unknown code "${ref.codeId}"`, file)
					);
					continue;
				}
				if (!code.sections.some((s) => s.number === ref.section)) {
					push(
						error('refs/unresolved', `${ref.codeId} has no section "${ref.section}"`, file)
					);
				}
				if (ref.standardNumbers.length > 0 && !code.standardsVerified) {
					push(
						error(
							'refs/unverified-standard',
							`cites standard ${ref.standardNumbers.join(', ')} of ${ref.codeId}, but that code's standard numbers have not been verified against the document. Set standardsVerified once someone has checked them, or drop the numbers and link to the section.`,
							file
						)
					);
				}
				const known = new Set(
					code.sections.flatMap((s) => s.standards.map((st) => st.number))
				);
				for (const n of ref.standardNumbers) {
					if (!n.startsWith(ref.section + '.')) {
						push(
							error(
								'refs/unresolved',
								`standard ${n} does not belong to section ${ref.section}`,
								file
							)
						);
						continue;
					}
					// A number that looks right but is not in the code is the failure mode this
					// whole flag exists to prevent, arriving as a typo instead of a guess.
					if (code.standardsVerified && !known.has(n)) {
						push(error('refs/unresolved', `${ref.codeId} has no standard ${n}`, file));
					}
				}
			}
			// Every credential a topic claims to apply to must be one its code binds.
			const bound = new Set(
				t.sectionRefs.flatMap((r) => codesById.get(r.codeId)?.appliesTo ?? [])
			);
			for (const cred of t.appliesTo) {
				if (bound.size > 0 && !bound.has(cred)) {
					push(
						error(
							'refs/unresolved',
							`topic applies to ${cred}, but none of its codes bind ${cred}`,
							file
						)
					);
				}
			}
		}
	}

	// ------------------------------------------------------------ withholding
	/*
	 * What ships, and what is held back.
	 *
	 * A release used to fail if any entry was unapproved, so launch was all-or-nothing:
	 * every entry reviewed, or nothing public. The guarantee worth keeping is that a reader
	 * never sees unreviewed clinical content, and leaving an entry out keeps it exactly as
	 * well as refusing to build did — while letting the approved core ship and grow with
	 * each review session. Everything above still ran on every entry, withheld or not: this
	 * decides what reaches the bundle, never what gets checked.
	 */
	const withholding = WITHHOLDING_CHANNELS.has(channel);
	const ships = <T extends { review: { status: string } }>(x: T) =>
		!withholding || x.review.status === 'approved';

	/*
	 * The required kinds are filtered like everything else rather than waved through. They
	 * are guaranteed complete in a release that succeeds, by the check below; filtering
	 * them too is what keeps the summary of a release that *fails* honest, instead of
	 * reporting an unapproved outline as shipped.
	 */
	const allOutlines = [...outlines.values()];
	const shipOutlines = allOutlines.filter(ships);
	const shipCredentials = credentials.filter(ships);
	const shipCodes = ethicsCodes.filter(ships);
	const shipTerms = terms.filter(ships);
	const shipScenarios = scenarios.filter(ships);
	const shipQuestions = questions.filter(ships);
	const shipGuides = guides.filter(ships);
	const shipGraphs = graphs.filter(ships);
	const shipTopics = ethicsTopics.filter(ships);
	const shipCompetencies = competencies.filter(ships);

	const shipTermIds = new Set(shipTerms.map((t) => t.id));
	const shipScenarioIds = new Set(shipScenarios.map((x) => x.id));
	const shipTopicIds = new Set(shipTopics.map((t) => t.id));
	/** Drop references to entries this build is not shipping. */
	const keep = (ids: string[], pool: Set<string>) => ids.filter((id) => pool.has(id));

	/*
	 * Four kinds have to be complete rather than grow one entry at a time. They are the
	 * spine everything else hangs from, and a partial one is not a smaller app but a broken
	 * or an unsafe one — an unapproved outline empties the exam filters and the quiz
	 * blueprint without a word, and an escalation card withheld while its neighbours ship
	 * leaves a gap exactly where somebody is looking for the worst case.
	 */
	if (withholding) {
		const incomplete = (kind: string, items: { id: string; review: { status: string } }[]) => {
			const missing = items.filter((x) => x.review.status !== 'approved').map((x) => x.id);
			if (missing.length === 0) return;
			push(
				error(
					'release/incomplete-required',
					`every ${kind} must be approved before a release build; ${missing.length} ` +
						`are not: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ', …' : ''}`
				)
			);
		};
		incomplete('outline', allOutlines);
		incomplete('ethics code', ethicsCodes);
		incomplete('credential', credentials);
		incomplete(
			'escalation card',
			scenarios.filter((x) => x.kind === 'escalation-only')
		);

		/*
		 * And a floor on the glossary, because a nearly empty reference site is worse than no
		 * reference site: it is indexed thin and first impressions of a reference tool are
		 * hard to retake. This is the one number here that is a judgement rather than a
		 * consequence, which is why it is named and not inlined.
		 */
		const floor = opts.minimumTerms ?? RELEASE_MINIMUM_TERMS;
		if (shipTerms.length < floor) {
			push(
				error(
					'release/below-minimum',
					`a release needs at least ${floor} approved terms and has ` +
						`${shipTerms.length}. Until then the build is a preview: it is published, ` +
						`but it carries the review banner and keeps search engines out.`
				)
			);
		}
	}

	// ------------------------------------------------- referential integrity
	{
		/*
		 * Two pools, because a reference can fail in two different ways now. An id nothing
		 * answers to is a mistake and still an error. An id that resolves to an entry this
		 * build is withholding is not a mistake — it is the point — so the reference is
		 * pruned and the entry that carried it ships without a link into a page that is not
		 * there.
		 */
		const knownTerms = new Set(terms.map((t) => t.id));
		const termIds = shipTermIds;
		const retired = new Set(
			[...terms, ...scenarios].filter((x) => x.review.status === 'retired').map((x) => x.id)
		);

		const checkRefs = (
			ids: string[],
			pool: Set<string>,
			kind: string,
			file: string,
			field: string,
			known: Set<string> = pool
		) => {
			for (const id of ids) {
				if (!known.has(id)) {
					push(error('refs/unresolved', `${field} points at unknown ${kind} "${id}"`, file));
				} else if (pool.has(id) && retired.has(id)) {
					push(error('refs/retired', `${field} points at retired item "${id}"`, file));
				}
			}
		};

		for (const t of terms) {
			const file = termFiles.get(t.id)!;
			checkRefs(t.seeAlso, termIds, 'term', file, 'seeAlso', knownTerms);
			checkRefs(t.contrastWith, termIds, 'term', file, 'contrastWith', knownTerms);
			for (const c of t.citations) {
				if (!sources.has(c.sourceId)) {
					push(error('refs/unknown-source', `cites unknown source "${c.sourceId}"`, file));
				}
			}
			checkTaskRefs(t.taskRefs, file);
			// contrastWith must be symmetric — a one-way "commonly confused with" is a bug.
			for (const other of t.contrastWith) {
				const o = terms.find((x) => x.id === other);
				if (o && !o.contrastWith.includes(t.id)) {
					push(
						error(
							'refs/asymmetric-contrast',
							`"${t.id}" lists contrastWith "${other}" but "${other}" does not list it back`,
							file
						)
					);
				}
			}
		}

		for (const s of scenarios) {
			const file = scenarioFiles.get(s.id)!;
			checkRefs(s.termRefs, termIds, 'term', file, 'termRefs', knownTerms);
			for (const c of s.citations) {
				if (!sources.has(c.sourceId)) {
					push(error('refs/unknown-source', `cites unknown source "${c.sourceId}"`, file));
				}
			}
			checkTaskRefs(s.taskRefs, file);
		}

		for (const q of questions) {
			const file = questionFiles.get(q.id)!;
			checkRefs(q.termRefs, termIds, 'term', file, 'termRefs', knownTerms);
			for (const c of q.citations) {
				if (!sources.has(c.sourceId)) {
					push(error('refs/unknown-source', `cites unknown source "${c.sourceId}"`, file));
				}
			}
			checkTaskRefs([q.taskRef, ...q.secondaryTaskRefs], file);
		}

		for (const g of guides) {
			const file = guideFiles.get(g.id)!;
			checkRefs(g.termRefs, termIds, 'term', file, 'termRefs', knownTerms);
			for (const c of g.citations) {
				if (!sources.has(c.sourceId)) {
					push(error('refs/unknown-source', `cites unknown source "${c.sourceId}"`, file));
				}
			}
			checkTaskRefs(g.taskRefs, file);
		}

		const knownTopics = new Set(ethicsTopics.map((t) => t.id));
		const knownScenarios = new Set(scenarios.map((x) => x.id));
		const topicIds = shipTopicIds;
		const scenarioIdSet = shipScenarioIds;
		for (const t of ethicsTopics) {
			const file = topicFiles.get(t.id)!;
			checkRefs(t.termRefs, termIds, 'term', file, 'termRefs', knownTerms);
			checkRefs(
				t.scenarioRefs,
				scenarioIdSet,
				'scenario',
				file,
				'scenarioRefs',
				knownScenarios
			);
			checkRefs(t.relatedTopics, topicIds, 'ethics topic', file, 'relatedTopics', knownTopics);
			for (const c of t.citations) {
				if (!sources.has(c.sourceId)) {
					push(error('refs/unknown-source', `cites unknown source "${c.sourceId}"`, file));
				}
			}
			checkTaskRefs(t.taskRefs, file);
			if (t.relatedTopics.includes(t.id)) {
				push(error('refs/unresolved', `"${t.id}" lists itself as a related topic`, file));
			}
		}

		// The competency tasks point at both the glossary and the task-list codes, so a
		// candidate can go from "I have to demonstrate chaining" to the material for it.
		for (const c of competencies) {
			const file = competencyFiles.get(c.id)!;
			for (const sec of c.sections) {
				for (const t of sec.tasks) {
					checkRefs(
						t.termRefs,
						termIds,
						'term',
						file,
						`task ${t.number}.termRefs`,
						knownTerms
					);
					checkTaskRefs(
						t.taskRefs.map((r) => {
							const [credential, code] = r.split(':');
							return { credential, code } as TaskRef;
						}),
						file
					);
					for (const alt of t.alternatives) {
						checkRefs(
							alt.termRefs,
							termIds,
							'term',
							file,
							`task ${t.number} "${alt.label}".termRefs`,
							knownTerms
						);
					}
				}
			}
		}

		// Outline tasks point at terms too, so the exam page can link each task to its
		// vocabulary. Dangling links there would be invisible until someone tapped one.
		for (const o of outlines.values()) {
			for (const d of o.domains) {
				for (const t of d.tasks) {
					checkRefs(
						t.termRefs,
						termIds,
						'term',
						`taxonomy/${o.id}.yaml`,
						`${t.code}.termRefs`,
						knownTerms
					);
				}
			}
		}
	}

	/*
	 * Now drop the links that would dangle.
	 *
	 * A term that ships beside one that does not must not carry a "commonly confused with"
	 * into a page that is not there. Pruning rather than erroring is what makes a partial
	 * corpus coherent instead of merely smaller, and it keeps contrastWith symmetric within
	 * whatever shipped: both halves of a pair are pruned by the same rule.
	 */
	const emitTerms = withholding
		? shipTerms.map((t) => ({
				...t,
				seeAlso: keep(t.seeAlso, shipTermIds),
				contrastWith: keep(t.contrastWith, shipTermIds)
			}))
		: shipTerms;
	const emitScenarios = withholding
		? shipScenarios.map((x) => ({ ...x, termRefs: keep(x.termRefs, shipTermIds) }))
		: shipScenarios;
	const emitQuestions = withholding
		? shipQuestions.map((q) => ({ ...q, termRefs: keep(q.termRefs, shipTermIds) }))
		: shipQuestions;
	const emitGuides = withholding
		? shipGuides.map((g) => ({ ...g, termRefs: keep(g.termRefs, shipTermIds) }))
		: shipGuides;
	const emitTopics = withholding
		? shipTopics.map((t) => ({
				...t,
				termRefs: keep(t.termRefs, shipTermIds),
				scenarioRefs: keep(t.scenarioRefs, shipScenarioIds),
				relatedTopics: keep(t.relatedTopics, shipTopicIds)
			}))
		: shipTopics;
	const emitCompetencies = withholding
		? shipCompetencies.map((c) => ({
				...c,
				sections: c.sections.map((sec) => ({
					...sec,
					tasks: sec.tasks.map((t) => ({
						...t,
						termRefs: keep(t.termRefs, shipTermIds),
						alternatives: t.alternatives.map((a) => ({
							...a,
							termRefs: keep(a.termRefs, shipTermIds)
						}))
					}))
				}))
			}))
		: shipCompetencies;
	const emitOutlines = withholding
		? shipOutlines.map((o) => ({
				...o,
				domains: o.domains.map((d) => ({
					...d,
					tasks: d.tasks.map((t) => ({ ...t, termRefs: keep(t.termRefs, shipTermIds) }))
				}))
			}))
		: shipOutlines;

	/*
	 * Can the bank fill the paper it simulates? Warnings only, and they are the ratchet:
	 * the threshold in `checkExamCoverage` goes up as the bank grows. Measured against what
	 * ships, because a coverage figure counting questions the reader cannot reach is not a
	 * coverage figure.
	 */
	for (const o of emitOutlines) {
		push(...checkExamCoverage(o, emitQuestions, `taxonomy/${o.id}.yaml`));
	}

	// Authoring check, so it covers every file rather than only what ships: two entries
	// with the same definition are a mistake even while one of them is withheld.
	push(
		...checkDuplicateProse(
			terms.map((t) => ({
				id: t.id,
				text: t.definition.technical,
				file: termFiles.get(t.id)!
			}))
		)
	);

	// ----------------------------------------------------------------- emit
	const errors = issues.filter((i) => i.severity === 'error');
	const warnings = issues.filter((i) => i.severity === 'warning');
	const contentVersion = inputHash.digest('hex').slice(0, 12);

	/*
	 * `unreviewed` is surfaced to the app, which uses it to decide whether the whole site
	 * is still a preview: it drives the site-wide review banner and tells robots.txt to
	 * keep search engines away. Unreviewed clinical content should not be discoverable by
	 * someone searching for an ABA term, even while the author is reviewing it on a phone.
	 */
	const everything = [
		...terms,
		...scenarios,
		...questions,
		...credentials,
		...ethicsCodes,
		...ethicsTopics,
		...guides,
		...graphs,
		...allOutlines,
		...competencies
	];
	const shipped = [
		...emitTerms,
		...emitScenarios,
		...emitQuestions,
		...shipCredentials,
		...shipCodes,
		...emitTopics,
		...emitGuides,
		...shipGraphs,
		...emitOutlines,
		...emitCompetencies
	];

	/*
	 * `unreviewed` counts what a reader can actually reach, which is what it was always
	 * for: it drives the site-wide preview banner and tells robots.txt to keep search
	 * engines away from unreviewed clinical content. In a withholding build it is zero by
	 * construction — nothing unapproved ships — so the banner switches itself off at the
	 * same moment the build stops being a preview, rather than by a second rule that could
	 * disagree with the first. `withheld` is the other half of that story, and the number
	 * the author is working down.
	 */
	const unreviewed = shipped.filter((x) => x.review.status !== 'approved').length;
	const withheld = everything.length - shipped.length;

	const counts = {
		terms: emitTerms.length,
		scenarios: emitScenarios.length,
		questions: emitQuestions.length,
		sources: sources.size,
		outlines: emitOutlines.length,
		credentials: shipCredentials.length,
		ethicsTopics: emitTopics.length,
		practiceGuides: emitGuides.length,
		graphs: shipGraphs.length,
		competencyAssessments: emitCompetencies.length,
		unreviewed,
		withheld
	};

	if (errors.length > 0 || opts.emit === false) {
		return {
			ok: errors.length === 0,
			channel,
			contentVersion,
			errors,
			warnings,
			counts,
			assets: []
		};
	}

	const assets = buildAssets(
		emitTerms,
		emitScenarios,
		emitQuestions,
		emitOutlines,
		shipCredentials,
		shipCodes,
		emitTopics,
		emitGuides,
		shipGraphs,
		emitCompetencies,
		contentVersion
	);

	return { ok: true, channel, contentVersion, errors, warnings, counts, assets };
}

function buildAssets(
	terms: z_Term[],
	scenarios: z_Scenario[],
	questions: QuizQuestion[],
	outlines: z_Outline[],
	credentials: z_Credential[],
	ethicsCodes: z_EthicsCode[],
	ethicsTopics: z_EthicsTopic[],
	guides: z_PracticeGuide[],
	graphs: z_GraphDoc[],
	competencies: z_Competency[],
	contentVersion: string
): EmittedAsset[] {
	const assets: EmittedAsset[] = [];
	const base = `data/${contentVersion}`;

	const index: TermIndexEntry[] = terms.map((t) => ({
		i: t.id,
		t: t.term,
		a: t.aliases,
		c: t.category,
		g: t.definition.gloss,
		b: t.searchBoost,
		r: t.taskRefs.map(taskRefKey),
		f: t.flashcard.enabled
	}));
	assets.push({
		name: 'terms.index',
		fileName: `${base}/terms.index.json`,
		source: JSON.stringify(index),
		fetchedAtRuntime: false
	});

	// Category buckets: one representation serves both client-side navigation and the
	// offline precache, and sibling terms in a category are exactly what a reader opens
	// next — so bucket locality is a cache win rather than waste.
	const byCategory = new Map<string, z_Term[]>();
	for (const t of terms) {
		const list = byCategory.get(t.category) ?? [];
		list.push(t);
		byCategory.set(t.category, list);
	}
	for (const [category, list] of [...byCategory].sort((a, b) => a[0].localeCompare(b[0]))) {
		const record = Object.fromEntries(list.map((t) => [t.id, t]));
		assets.push({
			name: `terms.${category}`,
			fileName: `${base}/terms.${category}.json`,
			source: JSON.stringify(record),
			fetchedAtRuntime: false
		});
	}

	assets.push({
		name: 'scenarios',
		fileName: `${base}/scenarios.json`,
		source: JSON.stringify(Object.fromEntries(scenarios.map((s) => [s.id, s]))),
		fetchedAtRuntime: false
	});

	// One bucket per exam: a candidate studying for one credential never downloads the
	// other bank, and the quiz loads a bucket only when a session starts.
	const byCredential = new Map<string, QuizQuestion[]>();
	for (const q of questions) {
		const list = byCredential.get(q.credential) ?? [];
		list.push(q);
		byCredential.set(q.credential, list);
	}
	for (const [credential, list] of [...byCredential].sort((a, b) =>
		a[0].localeCompare(b[0])
	)) {
		assets.push({
			name: `questions.${credential}`,
			fileName: `${base}/questions.${credential}.json`,
			source: JSON.stringify(list),
			fetchedAtRuntime: false
		});
	}

	assets.push({
		name: 'taxonomy',
		fileName: `${base}/taxonomy.json`,
		source: JSON.stringify(Object.fromEntries(outlines.map((o) => [o.id, o]))),
		fetchedAtRuntime: false
	});

	assets.push({
		name: 'credentials',
		fileName: `${base}/credentials.json`,
		source: JSON.stringify(Object.fromEntries(credentials.map((c) => [c.id, c]))),
		fetchedAtRuntime: false
	});

	// Two small documents that are opened together, so one file rather than two requests.
	assets.push({
		name: 'practice-guides',
		fileName: `${base}/practice-guides.json`,
		source: JSON.stringify(Object.fromEntries(guides.map((g) => [g.id, g]))),
		fetchedAtRuntime: false
	});

	assets.push({
		name: 'graphs',
		fileName: `${base}/graphs.json`,
		source: JSON.stringify(Object.fromEntries(graphs.map((g) => [g.id, g]))),
		fetchedAtRuntime: false
	});

	assets.push({
		name: 'competency',
		fileName: `${base}/competency.json`,
		source: JSON.stringify(Object.fromEntries(competencies.map((c) => [c.id, c]))),
		fetchedAtRuntime: false
	});

	assets.push({
		name: 'ethics-codes',
		fileName: `${base}/ethics-codes.json`,
		source: JSON.stringify(Object.fromEntries(ethicsCodes.map((c) => [c.id, c]))),
		fetchedAtRuntime: false
	});

	// Topics ship as one bundle rather than per-topic chunks: the whole reference is a
	// few dozen kilobytes, and someone reading one ethics topic usually reads the next.
	assets.push({
		name: 'ethics-topics',
		fileName: `${base}/ethics-topics.json`,
		source: JSON.stringify(Object.fromEntries(ethicsTopics.map((t) => [t.id, t]))),
		fetchedAtRuntime: false
	});

	/*
	 * Everything searchable, of every kind.
	 *
	 * The home screen is a search box, so this is the app's primary interface and what it
	 * covers decides what the app appears to contain. Indexing only the glossary meant a
	 * technician typing "gift" got a definition and not the ethics topic that answers the
	 * question they were actually asking.
	 *
	 * `b` is the ranking weight. Kind weights scale the author's own boost so that the
	 * thing most likely to be an answer wins a tie: a definition or an obligation beats a
	 * task statement, which is a pointer into an outline rather than a reading.
	 */
	const KIND_WEIGHT = {
		term: 1,
		'ethics-topic': 1,
		scenario: 0.95,
		'practice-guide': 0.9,
		graph: 0.9,
		task: 0.55
	} as const;

	const searchDocs: (SearchIndexEntry & { body: string })[] = [];

	for (const t of terms) {
		searchDocs.push({
			i: t.id,
			k: 'term',
			t: t.term,
			a: t.aliases,
			l: CATEGORY_LABELS[t.category],
			g: t.definition.gloss,
			c: t.category,
			b: t.searchBoost * KIND_WEIGHT.term,
			r: t.taskRefs.map(taskRefKey),
			p: null,
			body: `${t.definition.technical} ${t.definition.plain}`
		});
	}

	for (const sc of scenarios) {
		searchDocs.push({
			i: sc.id,
			k: 'scenario',
			t: sc.title,
			/*
			 * Risk flags as aliases, which is where the crisis vocabulary lives.
			 *
			 * Somebody reaching for this app mid-incident types "restraint", "seclusion",
			 * "elopement" — the flag names themselves — not the sentence the card is titled
			 * with. Hyphens are split as well as kept, so "self-injury" and "self injury"
			 * both land.
			 */
			a: sc.riskFlags.flatMap((f) => [f, f.replace(/-/g, ' ')]),
			l: sc.kind === 'escalation-only' ? 'Stop and escalate' : 'Situation',
			g: sc.situation.slice(0, 160),
			c: null,
			b: KIND_WEIGHT.scenario,
			r: sc.taskRefs.map(taskRefKey),
			p: null,
			// The same prose the rights check reads, so there is one definition of what a
			// scenario says and the index cannot drift from it.
			body: scenarioProse(sc).join(' ')
		});
	}

	for (const t of ethicsTopics) {
		searchDocs.push({
			i: t.id,
			k: 'ethics-topic',
			t: t.ourLabel,
			a: [],
			l: 'Ethics',
			g: t.gloss,
			c: null,
			b: KIND_WEIGHT['ethics-topic'],
			r: t.taskRefs.map(taskRefKey),
			p: null,
			body: topicProse(t).join(' ')
		});
	}

	for (const g of guides) {
		searchDocs.push({
			i: g.id,
			k: 'practice-guide',
			t: g.title,
			a: [],
			l: 'Practice guide',
			g: g.gloss,
			c: null,
			b: KIND_WEIGHT['practice-guide'],
			r: g.taskRefs.map(taskRefKey),
			p: null,
			body: guideProse(g).join(' ')
		});
	}

	for (const g of graphs) {
		searchDocs.push({
			i: g.id,
			k: 'graph',
			t: g.title,
			// Somebody looking for a picture types the thing they cannot picture: "trend",
			// "phase change line", "ABAB". The design name and every feature named in a
			// reading are aliases for exactly that reason.
			a: [g.design, g.design.replace(/-/g, ' '), ...new Set(g.readings.map((r) => r.feature))],
			l: 'Graph',
			g: g.gloss,
			c: null,
			b: KIND_WEIGHT.graph,
			r: g.taskRefs.map(taskRefKey),
			p: null,
			body: graphProse(g).join(' ')
		});
	}

	// Exam tasks. Searchable because people arrive knowing a code — "what is C.5" — far
	// more often than they arrive knowing what it is called.
	for (const o of outlines) {
		for (const d of o.domains) {
			for (const task of d.tasks) {
				searchDocs.push({
					i: `${o.id}-${task.code.toLowerCase().replace(/\./g, '-')}`,
					k: 'task',
					t: task.code,
					a: [task.code],
					l: `${o.credential} exam task`,
					g: task.plainSummary,
					c: null,
					b: KIND_WEIGHT.task,
					r: [`${o.credential}:${task.code}`],
					p: o.id,
					body: `${task.ourSummary} ${task.plainSummary} ${task.keywords.join(' ')}`
				});
			}
		}
	}

	// Prebuild the search index so the client never pays indexing cost at startup.
	const mini = new MiniSearch(searchOptions());
	// MiniSearch needs one id space, and a term and a situation can share a slug.
	mini.addAll(searchDocs.map((d) => ({ ...d, id: `${d.k}:${d.i}` })));
	assets.push({
		name: 'search-index',
		fileName: `${base}/search-index.json`,
		source: JSON.stringify(mini),
		fetchedAtRuntime: false
	});

	const manifest = {
		contentVersion,
		builtAt: new Date().toISOString(),
		assets: Object.fromEntries(
			assets.map((a) => [
				a.name,
				{
					url: `/${a.fileName}`,
					sha256: sha256(a.source),
					bytes: Buffer.byteLength(a.source),
					fetchedAtRuntime: a.fetchedAtRuntime
				}
			])
		)
	};
	assets.push({
		name: 'manifest',
		fileName: `${base}/manifest.json`,
		source: JSON.stringify(manifest, null, 2),
		fetchedAtRuntime: false
	});

	return assets;
}
