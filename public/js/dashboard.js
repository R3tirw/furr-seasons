async function renderDashboard() {
  const page = document.getElementById('page-dashboard');
  page.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text2)">Loading…</div>';

  const [stats, todayData] = await Promise.all([
    api.get('/stats'),
    api.get('/stats/today-rooms')
  ]);
  if(!stats||!todayData) return;

  const today = new Date().toISOString().split('T')[0];
  const { rooms, bookings } = todayData;

  // Categorise bookings
  const expected  = bookings.filter(b => b.status==='confirmed' && b.check_in===today);
  const checkedIn = bookings.filter(b => b.status==='checked-in');
  const dueOut    = bookings.filter(b => b.status==='checked-in' && b.check_out===today);

  // Build room status map
  const roomMap = {};
  bookings.forEach(b => {
    if(!roomMap[b.room_id]) roomMap[b.room_id] = [];
    roomMap[b.room_id].push(b);
  });

  // Room grid cells
  let roomCells = '';
  rooms.forEach(r => {
    const rBookings = roomMap[r.id] || [];
    const checkinB  = rBookings.find(b=>b.status==='checked-in');
    const expectedB = rBookings.find(b=>b.status==='confirmed'&&b.check_in===today);
    const dueOutB   = rBookings.find(b=>b.status==='checked-in'&&b.check_out===today);
    const futureB   = rBookings.find(b=>b.status==='confirmed'&&b.check_in>today);

    let cellClass='room-cell', icon='🏠', label=r.id, sublabel='', color='';
    if(dueOutB){
      cellClass+=' room-dueout'; icon='🔵'; label=dueOutB.pet_name||r.id;
      sublabel='Due out'; color='var(--info)';
    } else if(checkinB){
      cellClass+=' room-occupied'; icon='🐕'; label=checkinB.pet_name||r.id;
      sublabel='Checked in'; color='var(--success)';
    } else if(expectedB){
      cellClass+=' room-expected'; icon='🟡'; label=expectedB.pet_name||r.id;
      sublabel='Arriving today'; color='var(--accent-dark)';
    } else if(futureB){
      cellClass+=' room-future'; icon='📅'; label=r.id;
      sublabel='Future booking';
    }

    const typeTag = checkinB||expectedB ? `<span class="room-type-tag">${(checkinB||expectedB).booking_type==='overnight'?'OVN':checkinB||expectedB?'DAY':''}</span>` : '';

    roomCells += `<div class="${cellClass}" title="${label}${sublabel?' — '+sublabel:''}">
      <span class="room-icon">${icon}</span>
      <span class="room-id">${r.id}</span>
      <span class="room-pet">${label!==r.id?label:''}</span>
      <span class="room-sub">${sublabel}</span>
    </div>`;
  });

  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Good day! 🐾</div>
        <div class="page-sub">Here's what's on at Furr Seasons today</div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Occupancy</div>
        <div class="stat-value">${stats.checkedin_now}<span style="font-size:18px;opacity:0.5"> / ${MAX_CAPACITY}</span></div>
        <div class="stat-sub">${stats.expected_today} arriving · ${stats.checkout_today} departing</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Arriving Today</div>
        <div class="stat-value">${stats.expected_today}</div>
        <div class="stat-sub">Confirmed bookings</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Departing Today</div>
        <div class="stat-value">${stats.checkout_today}</div>
        <div class="stat-sub">Due to check out</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Revenue This Month</div>
        <div class="stat-value" style="font-size:22px">${formatCurrency(stats.revenue_month)}</div>
        <div class="stat-sub">Overnight ${formatCurrency(stats.revenue_overnight)} · Day ${formatCurrency(stats.revenue_day)}</div>
      </div>
    </div>

    <div class="dashboard-legend">
      <span class="legend-item"><span class="legend-dot" style="background:var(--success)"></span>Checked In</span>
      <span class="legend-item"><span class="legend-dot" style="background:var(--accent)"></span>Arriving Today</span>
      <span class="legend-item"><span class="legend-dot" style="background:var(--info)"></span>Due to Check Out</span>
      <span class="legend-item"><span class="legend-dot" style="background:var(--border)"></span>Available</span>
      <span class="legend-item"><span class="legend-dot" style="background:#C8D0F0"></span>Future Booking</span>
    </div>

    <div class="card" style="margin-bottom:24px">
      <div class="card-header">
        <div class="card-title">🏠 Room Map — ${today}</div>
        <span style="font-size:12px;color:var(--text2)">${stats.checkedin_now} occupied · ${MAX_CAPACITY-stats.checkedin_now} free</span>
      </div>
      <div class="room-type-section">
        <div class="room-type-label">Apartments</div>
        <div class="room-grid room-grid-3">${roomCells.split('</div>').slice(0,3).join('</div>')}</div>
      </div>
      <div class="room-type-section">
        <div class="room-type-label">Suites</div>
        <div class="room-grid room-grid-5">${roomCells.split('</div>').slice(3,8).join('</div>')}</div>
      </div>
      <div class="room-type-section">
        <div class="room-type-label">Cabins</div>
        <div class="room-grid room-grid-5">${roomCells.split('</div>').slice(8,18).join('</div>')}</div>
      </div>
    </div>

    <div class="cards-row">
      <div class="today-card">
        <div class="today-label">🟡 Arriving Today</div>
        <div class="today-items">
          ${expected.length ? expected.map(b=>`
            <div class="today-item">
              <div class="today-dot" style="background:var(--accent)"></div>
              <div>
                <b>${b.pet_name||'—'}</b> · ${b.owner_name||'—'}<br>
                <span style="font-size:11px;color:var(--text2)">${b.room_id} · ${BOOKING_TYPES[b.booking_type]||b.booking_type}
                ${b.special_instructions?'<br><span style="color:#FF8C00">⚠ '+b.special_instructions+'</span>':''}</span>
              </div>
            </div>`).join('') : '<div style="color:var(--text2);font-size:13px">No arrivals today</div>'}
        </div>
      </div>
      <div class="today-card">
        <div class="today-label">🟢 Currently Boarded</div>
        <div class="today-items">
          ${checkedIn.length ? checkedIn.map(b=>`
            <div class="today-item">
              <div class="today-dot" style="background:var(--success)"></div>
              <div>
                <b>${b.pet_name||'—'}</b> · ${b.owner_name||'—'}<br>
                <span style="font-size:11px;color:var(--text2)">${b.room_id} · Check-out ${formatDate(b.check_out)}
                ${b.special_instructions?'<br><span style="color:#FF8C00">⚠ '+b.special_instructions+'</span>':''}</span>
              </div>
            </div>`).join('') : '<div style="color:var(--text2);font-size:13px">No dogs currently boarded</div>'}
        </div>
      </div>
      <div class="today-card">
        <div class="today-label">🔵 Departing Today</div>
        <div class="today-items">
          ${dueOut.length ? dueOut.map(b=>`
            <div class="today-item">
              <div class="today-dot" style="background:var(--info)"></div>
              <div><b>${b.pet_name||'—'}</b> · ${b.owner_name||'—'}<br>
              <span style="font-size:11px;color:var(--text2)">${b.room_id}</span></div>
            </div>`).join('') : '<div style="color:var(--text2);font-size:13px">No departures today</div>'}
        </div>
      </div>
    </div>
  `;

  updateCapacityBar(stats.checkedin_now);
}
