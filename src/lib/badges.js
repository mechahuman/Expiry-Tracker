/**
 * Placeholder for Module 9 (Rewards/Badges). Called after the two actions the
 * roadmap ties points/badges to -- adding an item and marking one used -- so
 * those call sites exist now and Module 9 only has to fill this in, not go
 * hunt down where to hook in.
 *
 * Deliberately a no-op: does nothing, never throws, doesn't need to be
 * awaited. Safe to call from anywhere before Module 9 exists.
 *
 * CONTRACT FOR MODULE 9: every caller treats this as fire-and-forget and
 * swallows rejections, because awarding a badge must never block or fail the
 * action the user actually took -- saving an item matters, gamification
 * doesn't. Handle errors internally (log them, surface them separately);
 * don't rely on a caller to catch them, and don't make callers await.
 */
export async function checkBadgeProgress(_userId) {}
