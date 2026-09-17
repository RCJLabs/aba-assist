/**
 * House style: American spelling, because the credentials are American.
 *
 * This corpus was written over many sessions and drifted: at one point it held 805
 * "behaviour" and 768 "behavior", sometimes inside the same question. Nothing was wrong
 * with either spelling on its own — what reads as sloppy is the mixture, and a reader
 * studying for a BACB examination has every reason to expect the American form.
 *
 * Only genuine variant pairs are listed. Words spelled `-ise` in both varieties
 * (advise, revise, arise, exercise, supervise, compromise, improvise, promise, praise,
 * surprise, advertise, disguise, devise, comprise), words where both varieties double
 * the l (filled, called, controlled, spelled, installed, billed, compelled), and
 * programmed/programming, which is the same everywhere, are deliberately absent: a rule
 * that fires on correct prose gets switched off.
 *
 * Zod-free on purpose, like `categories.ts` and `settings.ts` — the review queue and the
 * app read this without pulling a validator into the browser bundle.
 */
export const HOUSE_SPELLINGS: Readonly<Record<string, string>> = {
	// -our
	behaviour: 'behavior',
	behaviours: 'behaviors',
	behavioural: 'behavioral',
	behaviourally: 'behaviorally',
	behaviourism: 'behaviorism',
	behaviourist: 'behaviorist',
	behaviourists: 'behaviorists',
	misbehaviour: 'misbehavior',
	colour: 'color',
	colours: 'colors',
	coloured: 'colored',
	colouring: 'coloring',
	favour: 'favor',
	favours: 'favors',
	favoured: 'favored',
	favourable: 'favorable',
	favourably: 'favorably',
	favourite: 'favorite',
	honour: 'honor',
	honours: 'honors',
	honoured: 'honored',
	honouring: 'honoring',
	neighbour: 'neighbor',
	neighbours: 'neighbors',
	neighbouring: 'neighboring',
	rigour: 'rigor',
	candour: 'candor',
	endeavour: 'endeavor',
	// -re
	centre: 'center',
	centres: 'centers',
	centred: 'centered',
	metre: 'meter',
	metres: 'meters',
	fibre: 'fiber',
	litre: 'liter',
	// -ce
	licence: 'license',
	licences: 'licenses',
	defence: 'defense',
	offence: 'offense',
	// -yse
	analyse: 'analyze',
	analysed: 'analyzed',
	analysing: 'analyzing',
	paralyse: 'paralyze',
	paralysed: 'paralyzed',
	// -ise / -isation
	organise: 'organize',
	organises: 'organizes',
	organised: 'organized',
	organising: 'organizing',
	organisation: 'organization',
	organisations: 'organizations',
	organisational: 'organizational',
	generalise: 'generalize',
	generalises: 'generalizes',
	generalised: 'generalized',
	generalising: 'generalizing',
	generalisation: 'generalization',
	generalisations: 'generalizations',
	vocalise: 'vocalize',
	vocalised: 'vocalized',
	vocalisation: 'vocalization',
	vocalisations: 'vocalizations',
	minimise: 'minimize',
	minimises: 'minimizes',
	minimised: 'minimized',
	minimising: 'minimizing',
	minimisation: 'minimization',
	maximise: 'maximize',
	maximises: 'maximizes',
	maximised: 'maximized',
	maximising: 'maximizing',
	recognise: 'recognize',
	recognises: 'recognizes',
	recognised: 'recognized',
	recognising: 'recognizing',
	recognisable: 'recognizable',
	realise: 'realize',
	realises: 'realizes',
	realised: 'realized',
	realising: 'realizing',
	authorise: 'authorize',
	authorises: 'authorizes',
	authorised: 'authorized',
	authorising: 'authorizing',
	authorisation: 'authorization',
	authorisations: 'authorizations',
	unauthorised: 'unauthorized',
	prioritise: 'prioritize',
	prioritises: 'prioritizes',
	prioritised: 'prioritized',
	prioritising: 'prioritizing',
	prioritisation: 'prioritization',
	standardise: 'standardize',
	standardised: 'standardized',
	standardisation: 'standardization',
	summarise: 'summarize',
	summarises: 'summarizes',
	summarised: 'summarized',
	summarising: 'summarizing',
	anonymise: 'anonymize',
	anonymised: 'anonymized',
	anonymising: 'anonymizing',
	anonymisation: 'anonymization',
	normalise: 'normalize',
	normalises: 'normalizes',
	normalised: 'normalized',
	normalising: 'normalizing',
	randomise: 'randomize',
	randomised: 'randomized',
	randomisation: 'randomization',
	characterise: 'characterize',
	characterised: 'characterized',
	characterising: 'characterizing',
	characterisation: 'characterization',
	individualise: 'individualize',
	individualised: 'individualized',
	operationalise: 'operationalize',
	operationalised: 'operationalized',
	emphasise: 'emphasize',
	emphasised: 'emphasized',
	specialise: 'specialize',
	specialised: 'specialized',
	memorise: 'memorize',
	memorised: 'memorized',
	apologise: 'apologize',
	apologised: 'apologized',
	plagiarise: 'plagiarize',
	scrutinised: 'scrutinized',
	synthesised: 'synthesized',
	idealised: 'idealized',
	capitalised: 'capitalized',
	categorise: 'categorize',
	categorised: 'categorized',
	familiarise: 'familiarize',
	utilise: 'utilize',
	visualise: 'visualize',
	// programme, in the sense this corpus uses constantly
	programme: 'program',
	programmes: 'programs',
	// practise: a verb/noun split American English does not make
	practise: 'practice',
	practises: 'practices',
	practised: 'practiced',
	practising: 'practicing',
	unpractised: 'unpracticed',
	// doubled l after an unstressed vowel
	labelled: 'labeled',
	labelling: 'labeling',
	unlabelled: 'unlabeled',
	relabelled: 'relabeled',
	mislabelled: 'mislabeled',
	signalled: 'signaled',
	signalling: 'signaling',
	unsignalled: 'unsignaled',
	modelling: 'modeling',
	modelled: 'modeled',
	remodelled: 'remodeled',
	cancelled: 'canceled',
	cancelling: 'canceling',
	travelling: 'traveling',
	travelled: 'traveled',
	levelling: 'leveling',
	levelled: 'leveled',
	counselled: 'counseled',
	counselling: 'counseling',
	counsellor: 'counselor',
	totalled: 'totaled',
	// odds and ends
	judgement: 'judgment',
	judgements: 'judgments',
	acknowledgement: 'acknowledgment',
	acknowledgements: 'acknowledgments',
	enrolment: 'enrollment',
	fulfil: 'fulfill',
	fulfils: 'fulfills',
	catalogue: 'catalog',
	catalogues: 'catalogs',
	sceptical: 'skeptical',
	sceptic: 'skeptic',
	whilst: 'while',
	amongst: 'among',
	learnt: 'learned',
	spelt: 'spelled',
	maths: 'math',
	towards: 'toward'
};

/**
 * Words and phrases that are correctly spelled but name the wrong country's world.
 *
 * A confidentiality example set in "the car park", or a renewal cycle measured in
 * "a fortnight", is not a spelling mistake; it is a British author showing through, and
 * it reads as strangely to the intended reader as a misspelling does.
 *
 * Much shorter than the spelling list, and on purpose. "Corridor", "timetable" and
 * "cupboard" are ordinary American words as well as British ones, so they were fixed by
 * hand where they read oddly and left out of the rule: a guard that fires on correct
 * prose is a guard somebody adds an exception to, and then another, and then removes.
 */
export const HOUSE_IDIOM: Readonly<Record<string, string>> = {
	'car park': 'parking lot',
	fortnight: 'two weeks',
	'head teacher': 'principal',
	'per cent': 'percent',
	alright: 'all right',
	'lose marks': 'lose points'
};

const ALL: Readonly<Record<string, string>> = { ...HOUSE_SPELLINGS, ...HOUSE_IDIOM };

/*
 * Longest first, so "head teacher" is reported as itself rather than as a bare word
 * inside it, and word-bounded at both ends so "programme" never fires on "programmed".
 */
const PATTERN = new RegExp(
	`\\b(${Object.keys(ALL)
		.sort((a, b) => b.length - a.length)
		.join('|')})\\b`,
	'gi'
);

export type HouseStyleHit = { found: string; expected: string };

/** Every house-style slip in a piece of prose, in the order they appear. */
export function houseStyleHits(text: string): HouseStyleHit[] {
	PATTERN.lastIndex = 0;
	const hits: HouseStyleHit[] = [];
	for (const m of text.matchAll(PATTERN)) {
		hits.push({ found: m[0], expected: ALL[m[0].toLowerCase()] });
	}
	return hits;
}
