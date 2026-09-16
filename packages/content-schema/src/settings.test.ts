import { describe, expect, it } from 'vitest';
import { Setting } from './primitives.js';
import { SETTING_LABELS, SETTING_VALUES, settingLabel } from './settings.js';

describe('where an example happens', () => {
	it('reads as a place, so it can follow the sentence it annotates', () => {
		expect(settingLabel('school')).toBe('at school');
		expect(settingLabel('clinic')).toBe('in clinic');
		expect(settingLabel('community')).toBe('in the community');
	});

	it('says nothing for an example that could happen anywhere', () => {
		/*
		 * A chip reading "anywhere" costs a glance and returns nothing. The absence is the
		 * information, so the page has to be able to tell "no setting" from "some setting"
		 * rather than rendering a label for every value.
		 */
		expect(settingLabel('any')).toBeNull();
	});

	it('says nothing for a value it does not know', () => {
		expect(settingLabel('somewhere-else')).toBeNull();
	});

	it('labels every setting the schema accepts except the one that means none', () => {
		// The enum is built from this list, so the two cannot drift — but a label added to
		// the list and not to the map would still ship a chip-less setting.
		const labelled = new Set(Object.keys(SETTING_LABELS));
		for (const value of SETTING_VALUES) {
			if (value === 'any') continue;
			expect(labelled.has(value)).toBe(true);
		}
		expect(Setting.options).toEqual([...SETTING_VALUES]);
	});
});
