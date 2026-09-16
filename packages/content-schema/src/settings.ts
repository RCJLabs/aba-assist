/**
 * Where an example happens, as plain data.
 *
 * Split out for the same reason the categories are: the app renders these labels and must
 * not import Zod to do it. `primitives.ts` builds the enum from `SETTING_VALUES`, so there
 * is still one list.
 */
export const SETTING_VALUES = [
	'home',
	'clinic',
	'school',
	'community',
	'telehealth',
	'any'
] as const;

export type ExampleSetting = (typeof SETTING_VALUES)[number];

/**
 * Read as a place, because that is how the label is used: "at school", not "school".
 *
 * `any` has no label on purpose. An example that could happen anywhere is not telling the
 * reader where it happens, and a chip saying "anywhere" is a chip that costs a glance and
 * returns nothing — the page leaves it off instead.
 */
export const SETTING_LABELS: Record<Exclude<ExampleSetting, 'any'>, string> = {
	home: 'at home',
	clinic: 'in clinic',
	school: 'at school',
	community: 'in the community',
	telehealth: 'over telehealth'
};

/** The label for a setting, or null where there is nothing worth saying. */
export function settingLabel(setting: string): string | null {
	return setting === 'any'
		? null
		: (SETTING_LABELS[setting as Exclude<ExampleSetting, 'any'>] ?? null);
}
