<script lang="ts">
	import { announcer } from '../state/announcer.svelte.js';
</script>

<!--
	Mounted once, in the root layout. Both regions always exist in the DOM: creating a live
	region at the moment you want to announce something is unreliable, because assistive
	technology may not have registered it yet.
-->
<div class="visually-hidden" aria-live="polite" aria-atomic="true">{announcer.polite}</div>
<div class="visually-hidden" role="alert" aria-live="assertive" aria-atomic="true">
	{announcer.assertive}
</div>
