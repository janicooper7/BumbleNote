// The launch moment, on its own so client code (the /enter countdown) can read
// it without pulling in the server-only lifecycle-email module.

/** Sunday 4 October 2026, 9:00am BST. */
export const LAUNCH_AT = new Date("2026-10-04T08:00:00Z");
