/**
 * The one place in this app where a user types free text about their working day — and
 * therefore the one place a client's name could end up in storage.
 *
 * The primary defence is structural and lives in the data model, not here: there is no
 * `clientName` field, no date of birth, no address. A supervisee is identified by a code
 * constrained to something that cannot spell a name, and session activities are an enum.
 * A linter is the weaker, second line, for the single free-text note that remains.
 *
 * It warns rather than blocks. A blocker that fires on "Safety Care" teaches people to
 * work around it, and this app has no way to be certain what a string means. The goal is
 * to interrupt the habit at the moment it forms, with a specific reason.
 */

/**
 * "S-04", "BT12", "RBT_7". Deliberately too narrow to hold a name: at most three letters,
 * then digits. Enforced at the schema boundary, not merely suggested in a placeholder.
 */
export const SUPERVISEE_CODE = /^[A-Z]{1,3}[-_ ]?\d{1,4}$/;

export function isSuperviseeCode(value: string): boolean {
	return SUPERVISEE_CODE.test(value.trim());
}

/** What to tell someone whose code was rejected, in terms of what to type instead. */
export const SUPERVISEE_CODE_HINT =
	'Use a short code, not a name — up to three capital letters then a number, like S-04 or BT12.';

export interface PhiWarning {
	/** Stable id, so the UI can style or test one without matching on prose. */
	id: 'ssn' | 'dob' | 'name' | 'phone' | 'email' | 'address' | 'record-number';
	message: string;
}

/*
 * Patterns are deliberately loose. A false positive costs one dismissed warning; a false
 * negative costs a client's identifying information sitting in somebody's browser.
 */
const CHECKS: { id: PhiWarning['id']; test: RegExp; message: string }[] = [
	{
		id: 'ssn',
		test: /\b\d{3}-\d{2}-\d{4}\b/,
		message: 'That looks like a social security number. Nothing like it belongs in this app.'
	},
	{
		id: 'dob',
		// Dates written as a birthday rather than as a session date: slashes or dots with a
		// four-digit year, or the word itself.
		test: /\b(?:dob|d\.o\.b|date of birth|born)\b|\b\d{1,2}[/.]\d{1,2}[/.](?:19|20)\d{2}\b/i,
		message: 'That looks like a date of birth. Record the session date, not the client’s.'
	},
	{
		id: 'name',
		// Two capitalised words in a row. Catches "Jamie Rivera" — and "Behavior Plan", which
		// is why this warns rather than blocks.
		test: /\b[A-Z][a-z]{1,15}\s+[A-Z][a-z]{1,15}\b/,
		message:
			'That may be somebody’s name. Use the supervisee code, and describe a client only by what happened.'
	},
	{
		id: 'phone',
		test: /\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/,
		message: 'That looks like a phone number. Contact details do not belong here.'
	},
	{
		id: 'email',
		test: /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/,
		message: 'That looks like an email address. Contact details do not belong here.'
	},
	{
		id: 'address',
		test: /\b\d{1,5}\s+\w+(?:\s+\w+)?\s+(?:st|street|rd|road|ave|avenue|ln|lane|dr|drive|blvd|way|ct|court)\b\.?/i,
		message: 'That looks like a street address. Location details do not belong here.'
	},
	{
		id: 'record-number',
		test: /\b(?:mrn|medical record|chart|patient id|client id)\b/i,
		message: 'Record and chart numbers identify a person. Use the supervisee code instead.'
	}
];

/**
 * Warnings for one free-text note. Empty means nothing matched — which is not a promise
 * that the text is safe, and the UI says so rather than showing a green tick.
 */
export function phiWarnings(text: string): PhiWarning[] {
	const value = text.trim();
	if (value.length === 0) return [];
	return CHECKS.filter((c) => c.test.test(value)).map(({ id, message }) => ({ id, message }));
}
