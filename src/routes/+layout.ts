// Every route is prerendered: each term gets a real, indexable HTML page, which for a
// reference app is the cheapest acquisition channel there is. Offline navigation is
// handled by the service worker rendering from precached JSON, not by precaching the HTML.
export const prerender = true;
export const trailingSlash = 'never';
