// Leaderboard client: talks to the small SQLite-backed API on the server.
const API = './api';

export async function fetchBoard(limit = 10) {
  const r = await fetch(`${API}/leaderboard?limit=${limit}`, { cache: 'no-store' });
  if (!r.ok) throw new Error('offline');
  return (await r.json()).entries;
}

export async function submitScore(name, score, distance) {
  const r = await fetch(`${API}/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, score, distance }),
  });
  let data = {};
  try { data = await r.json(); } catch { /* non-JSON error page */ }
  if (!r.ok) throw new Error(data.error || 'Leaderboard is offline');
  return data;
}

export function renderBoard(ol, entries, me = null) {
  ol.textContent = '';
  if (!entries || !entries.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = entries ? 'No scores yet. Be the first!' : 'Leaderboard offline';
    ol.appendChild(li);
    return;
  }
  for (const e of entries) {
    const li = document.createElement('li');
    if (me && e.name.toLowerCase() === me.name.toLowerCase() && e.score === me.score) li.classList.add('me');
    for (const [cls, text] of [['r', '#' + e.rank], ['n', e.name], ['s', e.score.toLocaleString()]]) {
      const span = document.createElement('span');
      span.className = cls;
      span.textContent = text;
      li.appendChild(span);
    }
    ol.appendChild(li);
  }
}

export async function loadInto(ol) {
  try { renderBoard(ol, await fetchBoard(10)); } catch { renderBoard(ol, null); }
}
