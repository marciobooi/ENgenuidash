/**
 * Phones and tablets: asked before the model download (DownloadNotice), and on CPU they get the
 * smaller q4 weights instead of q8. Detected automatically. Runs on the main thread, where screen
 * and pointer information is available (workers cannot see it).
 */
export function isMobileDevice(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean }; deviceMemory?: number }
  if (nav.userAgentData?.mobile) return true
  // iPadOS reports itself as a Mac; its touch points give it away.
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)) return true
  // Touch-only devices (no mouse or trackpad at all).
  if (window.matchMedia?.('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches) return true
  // Computers with little memory are treated like phones (Chromium reports up to 8 GB).
  return nav.deviceMemory !== undefined && nav.deviceMemory < 4
}
