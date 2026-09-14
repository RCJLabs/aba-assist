/**
 * Screen-reader announcements.
 *
 * Two regions, mounted once in the root layout. Messages are cleared before being set so
 * that announcing the same string twice in a row is actually announced twice — assistive
 * technology ignores a live region whose text did not change, which is a classic source
 * of "the count never updates" bugs.
 */
class Announcer {
	polite = $state('');
	assertive = $state('');

	announce(message: string, politeness: 'polite' | 'assertive' = 'polite'): void {
		if (politeness === 'assertive') {
			this.assertive = '';
			queueMicrotask(() => (this.assertive = message));
		} else {
			this.polite = '';
			queueMicrotask(() => (this.polite = message));
		}
	}
}

export const announcer = new Announcer();
