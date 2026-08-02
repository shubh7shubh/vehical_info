/**
 * Shared form input styling. Lives in its own module (no "use client", no server
 * imports) so both the server-rendered forms and the small client islands inside
 * them can use the exact same classes.
 *
 * 16px base font-size is deliberate — anything smaller makes iOS auto-zoom on
 * focus (CLAUDE.md mobile rules).
 */
export const fieldClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 sm:text-sm";

export const labelClass =
  "mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground";
