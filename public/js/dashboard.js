async function renderDashboard() {
  const page = document.getElementById('page-dashboard');
  page.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text2)">Loading…</div>';

  const [stats, bookings, invoices] = await Promise.all([
    api.get('/stats'), api.get('/bookings'), api.get('/invoices')
  ]);

  const today = new Date().toISOString().split('T')[0];
  const active = bookings.filter(b => b.status === 'confirmed' && b.check_out >= today);
  const checkins = bookings.filter(b => b.check_in && b.check_in.startsWith(today));
  const checkouts = bookings.filter(b => b.check_out && b.check_out.startsWith(today));
  const unpaid = invoices.filter(i => i.status === 'unpaid').slice(0, 6);

  // Kennel grid — 20 slots
  const kennelMap = {};
  active.forEach(b => { if (b.kennel) kennelMap[b.kennel] = b; });

  const pct = (stats.active_bookings / MAX_CAPACITY) * 100;
  const capClass = pct >= 100 ? 'critical' : pct >= 75 ? 'warn' : '';

  // Build kennel cells for named kennels + free slots
  const usedKennels = active.map(b => b.kennel).filter(Boolean);
  const freeCount = MAX_CAPACITY - stats.active_bookings;

  let kennelCells = '';
  for (let i = 1; i <= MAX_CAPACITY; i++) {
    const label = 'K' + i;
    const b = kennelMap[label];
    if (b) {
      kennelCells += `<div class="kennel-cell occupied" title="${b.pet_name} — ${b.owner_name}">
        <span class="kennel-icon">🐕</span>
        <span class="kennel-name">${b.pet_name}</span>
        <span class="kennel-num">${label}</span>
      </div>`;
    } else {
      kennelCells += `<div class="kennel-cell">
        <span class="kennel-icon" style="opacity:0.25">🏠</span>
        <span class="kennel-num">${label}</span>
      </div>`;
    }
  }

  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Good day! 🐾</div>
        <div class="page-sub">Here's what's on at Furr Seasons today</div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card capacity-stat ${capClass}">
        <div class="stat-label">Occupancy</div>
        <div class="stat-value">${stats.active_bookings}<span style="font-size:18px;opacity:0.5"> / ${MAX_CAPACITY}</span></div>
        <div class="stat-sub">${freeCount} kennel${freeCount !== 1 ? 's' : ''} free</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Check-ins Today</div>
        <div class="stat-value">${stats.checkins_today}</div>
        <div class="stat-sub">Expected arrivals</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Check-outs Today</div>
        <div class="stat-value">${stats.checkouts_today}</div>
        <div class="stat-sub">Departures</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Revenue This Month</div>
        <div class="stat-value" style="font-size:26px">${formatCurrency(stats.revenue_month)}</div>
        <div class="stat-sub">${stats.unpaid_invoices} invoice${stats.unpaid_invoices !== 1 ? 's' : ''} pending</div>
      </div>
    </div>

    <div class="cards-row">
      <div class="card">
        <div class="card-header">
          <div class="card-title">🏠 Kennel Map</div>
          <span style="font-size:12px;color:var(--text2)">${stats.active_bookings} occupied · ${freeCount} free</span>
        </div>
        <div class="kennel-grid">${kennelCells}</div>
      </div>

      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="today-card" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius)">
          <div class="today-label">📥 Arriving Today</div>
          <div class="today-items">
            ${checkins.length
              ? checkins.map(b => `<div class="today-item"><div class="today-dot"></div><span><b>${b.pet_name}</b> · ${b.owner_name} · Kennel ${b.kennel || '?'}</span></div>`).join('')
              : '<div style="color:var(--text2);font-size:13px">No arrivals scheduled</div>'}
          </div>
        </div>
        <div class="today-card" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius)">
          <div class="today-label">📤 Departing Today</div>
          <div class="today-items">
            ${checkouts.length
              ? checkouts.map(b => `<div class="today-item"><div class="today-dot" style="background:var(--navy)"></div><span><b>${b.pet_name}</b> · ${b.owner_name}</span></div>`).join('')
              : '<div style="color:var(--text2);font-size:13px">No departures today</div>'}
          </div>
        </div>
        <div class="today-card" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius)">
          <div class="today-label">🧾 Pending Invoices</div>
          <div class="today-items">
            ${unpaid.length
              ? unpaid.map(i => `<div class="today-item"><div class="today-dot" style="background:#FF9900"></div><span><b>${i.owner_name || '—'}</b> · ${formatCurrency(i.total)}</span></div>`).join('')
              : '<div style="color:var(--success);font-size:13px;font-weight:600">All invoices settled ✓</div>'}
          </div>
        </div>
      </div>
    </div>
  `;

  updateCapacityBar(stats.active_bookings);
}
