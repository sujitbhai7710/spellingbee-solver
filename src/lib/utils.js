export const API_BASE = 'https://spelling-bee-api.sbsolver.workers.dev';

export async function fetchAPI(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function formatDate(dateStr) {
  // "September 9, 2025" -> "september-9-2025"
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  if (isNaN(d.getTime())) {
    // Already in "Month Day, Year" format
    return dateStr.toLowerCase().replace(/,\s*/g, '-').replace(/\s+/g, '-');
  }
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

export function formatDateURL(dateStr) {
  // "September 9, 2025" -> "september-9-2025"
  return dateStr.toLowerCase().replace(/,\s*/g, '-').replace(/\s+/g, '-');
}

export function getOuterLetters(allLetters, centerLetter) {
  if (!allLetters || !centerLetter) return [];
  return allLetters.split('').filter(l => l !== centerLetter);
}

export function calculatePoints(words) {
  let total = 0;
  if (!words) return 0;
  for (const w of words) {
    if (w.length === 4) total += 1;
    else if (w.length > 4) total += w.length;
    if (w.is_pangram) total += 7;
  }
  return total;
}

export function getProgressLevel(points, maxPoints) {
  const pct = maxPoints > 0 ? (points / maxPoints) * 100 : 0;
  if (pct >= 100) return { name: 'Queen Bee', emoji: '👑', color: '#8B5CF6' };
  if (pct >= 70) return { name: 'Genius', emoji: '🌟', color: '#7C3AED' };
  if (pct >= 40) return { name: 'Amazing', emoji: '🔥', color: '#DC2626' };
  if (pct >= 25) return { name: 'Great', emoji: '⭐', color: '#EA580C' };
  if (pct >= 15) return { name: 'Good', emoji: '👍', color: '#D97706' };
  if (pct >= 8) return { name: 'Nice', emoji: '😊', color: '#65A30D' };
  if (pct >= 5) return { name: 'Solid', emoji: '💪', color: '#0891B2' };
  if (pct >= 2) return { name: 'Starting', emoji: '🌱', color: '#2563EB' };
  return { name: 'Beginner', emoji: '🐝', color: '#6B7280' };
}

export const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
