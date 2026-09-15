/**
 * Hand the browser a file the app generated in memory.
 *
 * Three details, each of which is a way this silently does nothing:
 *
 * - The anchor goes into the document before it is clicked. A detached anchor's
 *   programmatic click is not reliably honoured, and when it is ignored there is no error
 *   — the user taps Export and nothing happens.
 * - The object URL is revoked on the next task, not immediately. Revoking synchronously
 *   can race the browser's own read of the blob, which produces an empty or failed
 *   download rather than a thrown exception.
 * - `rel="noopener"` because the anchor briefly exists in the page.
 *
 * Used by the tracker's CSV export and the review queue's JSON export, which is two
 * places that were each about to grow their own copy.
 */
export function downloadBlob(filename: string, body: BlobPart, type: string): void {
	const url = URL.createObjectURL(new Blob([body], { type }));
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.rel = 'noopener';
	a.style.display = 'none';
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}
