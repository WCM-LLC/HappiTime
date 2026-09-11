// Pin a wide table's trailing action column so its buttons stay visible when the
// table overflows horizontally (overflow-x-auto) instead of scrolling off the
// right edge. Append these to the cell's existing padding/alignment classes.
//
// Assumes the table sits on the standard admin `bg-surface` card — the opaque
// background keeps scrolled cells from bleeding through the pinned column. If a
// table uses a different backdrop, override the bg in the consuming className.
export const STICKY_ACTION_HEAD = 'sticky right-0 bg-surface';
export const STICKY_ACTION_CELL =
  'sticky right-0 z-10 bg-surface shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.10)]';

// Position-only variants for tables whose header/rows are NOT bg-surface (e.g.
// zebra striping or a bg-background body). The caller must supply an OPAQUE
// background class matching the cell's row so the pinned column doesn't seam.
export const STICKY_HEAD_POS = 'sticky right-0';
export const STICKY_ACTION_POS =
  'sticky right-0 z-10 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.10)]';
