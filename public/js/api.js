const API_BASE = 'http://localhost:3000/api';
const MAX_CAPACITY = 20;

const api = {
  async get(path) {
    const r = await fetch(API_BASE + path);
    return r.json();
  },
  async post(path, data) {
    const r = await fetch(API_BASE + path, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
    return r.json();
  },
  async put(path, data) {
    const r = await fetch(API_BASE + path, {
      method: 'PUT',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
    return r.json();
  },
  async delete(path) {
    const r = await fetch(API_BASE + path, { method: 'DELETE' });
    return r.json();
  }
};

function showToast(msg, type = 'default') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.borderLeftColor = type === 'warn' ? '#E84040' : 'var(--accent)';
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 2800);
}

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatCurrency(n) {
  if (!n && n !== 0) return '—';
  return '₹' + parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function nightsBetween(checkin, checkout) {
  if (!checkin || !checkout) return 0;
  const d1 = new Date(checkin), d2 = new Date(checkout);
  return Math.max(0, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
}

function updateCapacityBar(active) {
  const pct = Math.min((active / MAX_CAPACITY) * 100, 100);
  const fill = document.getElementById('capacity-fill');
  const count = document.getElementById('capacity-count');
  if (!fill || !count) return;
  fill.style.width = pct + '%';
  count.textContent = active + ' / ' + MAX_CAPACITY;
  fill.className = 'capacity-fill' + (pct >= 100 ? ' full' : pct >= 75 ? ' warn' : '');
}
