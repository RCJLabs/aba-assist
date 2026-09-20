<script lang="ts">
	/**
	 * Pass this page to somebody.
	 *
	 * This audience circulates things in group chats and staff WhatsApp threads, not on
	 * the open web, and until now there was no way to do it from inside the app at all —
	 * you had to find the address bar, which on an installed PWA is not there.
	 *
	 * Two paths, in order of how good they are. `navigator.share` opens the real system
	 * sheet, which is what somebody expects on a phone. Where it is absent — most desktop
	 * browsers, Firefox everywhere — the link goes to the clipboard instead, which is the
	 * thing they would have done by hand.
	 */
	import { browser } from '$app/environment';
	import { announcer } from '$lib/state/announcer.svelte.js';

	let { title, text = null }: { title: string; text?: string | null } = $props();

	/*
	 * Feature-detected at click time rather than at render.
	 *
	 * These pages are prerendered, so a value read during render is decided on the server
	 * where neither API exists, and hydration would have to correct it. Deciding inside
	 * the handler also means one button whose label does not change under the reader's
	 * finger — it says "Share", and what that opens is the platform's business.
	 */
	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	/**
	 * Where we are, without query or hash.
	 *
	 * `location` rather than the build-time canonical origin: a reader on a preview
	 * deployment sharing a link to production would be sharing a page they are not
	 * looking at. The pathname is enough — these pages carry no meaningful query.
	 */
	function here(): string {
		return `${location.origin}${location.pathname}`;
	}

	async function share() {
		if (!browser) return;
		const url = here();

		if (typeof navigator.share === 'function') {
			try {
				await navigator.share({ title, url, ...(text ? { text } : {}) });
				return;
			} catch (err) {
				/*
				 * Cancelling the sheet rejects with `AbortError`, and that is somebody
				 * changing their mind rather than a failure — falling back to the clipboard
				 * there would put a link they decided not to send on their clipboard.
				 * Anything else means the sheet did not open, so the fallback is right.
				 */
				if (err instanceof DOMException && err.name === 'AbortError') return;
			}
		}

		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			announcer.announce('Link copied.');
			clearTimeout(timer);
			timer = setTimeout(() => (copied = false), 2500);
		} catch {
			// No clipboard permission, or an insecure context. Nothing useful to offer and
			// nothing worth an error dialogue over — the address bar still exists.
			announcer.announce('This browser would not let the app copy the link.');
		}
	}
</script>

<button type="button" class="share" onclick={share} data-share>
	{copied ? 'Link copied' : 'Share this page'}
</button>

<style>
	.share {
		/* 44px, like every other target in this app. */
		min-height: 44px;
		font-size: 0.95rem;
	}
</style>
