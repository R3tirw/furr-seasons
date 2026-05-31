async function renderCalendar() {
  const page = document.getElementById('page-calendar');
  page.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text2)">Loading calendar…</div>';

  const bookings = await api.get('/bookings/calendar');
  if(!bookings) return;

  // Date range: 7 days back, 21 days forward
  const today = new Date();
  const startDate = new Date(today); startDate.setDate(today.getDate()-3);
  const endDate = new Date(today); endDate.setDate(today.getDate()+24);

  const dates = [];
  for(let d=new Date(startDate); d<=endDate; d.setDate(d.getDate()+1)){
    dates.push(new Date(d).toISOString().split('T')[0]);
  }

  const todayStr = today.toISOString().split('T')[0];

  // Build grid
  let headerCells = '<th class="cal-room-header">Room</th>';
  dates.forEach(d => {
    const dt = new Date(d+'T00:00:00');
    const isToday = d===todayStr;
    const dayName = dt.toLocaleDateString('en-IN',{weekday:'short'});
    const dayNum = dt.getDate();
    headerCells += `<th class="cal-date-header ${isToday?'cal-today-header':''}">${dayName}<br><b>${dayNum}</b></th>`;
  });

  let rows = '';
  const roomGroups = [
    {label:'Apartments', rooms:ROOMS.filter(r=>r.type==='Apartment')},
    {label:'Suites', rooms:ROOMS.filter(r=>r.type==='Suite')},
    {label:'Cabins', rooms:ROOMS.filter(r=>r.type==='Cabin')},
  ];

  roomGroups.forEach(group => {
    rows += `<tr><td colspan="${dates.length+1}" class="cal-group-header">${group.label}</td></tr>`;
    group.rooms.forEach(room => {
      let cells = `<td class="cal-room-cell"><b>${room.id}</b><br><span style="font-size:10px;color:var(--text2)">₹${room.rate}</span></td>`;
      dates.forEach(d => {
        const dayBooking = bookings.find(b => {
          if(b.room_id!==room.id) return false;
          const bIn = b.check_in?.split('T')[0]||b.check_in;
          const bOut = b.check_out?.split('T')[0]||bIn;
          return d>=bIn && d<=bOut;
        });
        const isToday = d===todayStr;
        if(dayBooking){
          const bIn = dayBooking.check_in?.split('T')[0]||dayBooking.check_in;
          const isStart = d===bIn;
          const typeColor = TYPE_COLORS[dayBooking.booking_type]||'var(--navy)';
          const textColor = dayBooking.booking_type==='day_boarding'?'var(--navy)':'#fff';
          cells += `<td class="cal-cell cal-booked ${isToday?'cal-today-col':''}"
            style="background:${typeColor};color:${textColor};cursor:pointer"
            data-id="${dayBooking.id}" title="${dayBooking.pet_name} — ${dayBooking.owner_name}">
            ${isStart?`<span style="font-size:10px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block">${dayBooking.pet_name||'—'}</span>`:''}
          </td>`;
        } else {
          cells += `<td class="cal-cell cal-empty ${isToday?'cal-today-col':''}"
            data-room="${room.id}" data-date="${d}" style="cursor:pointer"></td>`;
        }
      });
      rows += `<tr>${cells}</tr>`;
    });
  });

  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Calendar</div>
        <div class="page-sub">Room availability overview</div>
      </div>
      <div class="action-row">
        <div class="cal-legend">
          <span class="legend-item"><span class="legend-dot" style="background:var(--navy)"></span>Overnight</span>
          <span class="legend-item"><span class="legend-dot" style="background:var(--accent-dark)"></span>Day Boarding</span>
          <span class="legend-item"><span class="legend-dot" style="background:#FF8C00"></span>Trial</span>
        </div>
      </div>
    </div>
    <div class="full-card">
      <div class="table-wrap cal-wrap">
        <table class="cal-table">
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;

  // Click on booking cell — show details
  page.querySelectorAll('.cal-booked').forEach(cell => {
    cell.addEventListener('click', async () => {
      const id = cell.dataset.id;
      const b = bookings.find(x=>x.id===id);
      if(!b) return;
      openModal('Booking Details', `
        <div style="display:flex;flex-direction:column;gap:10px;font-size:14px">
          <div><b>Dog:</b> ${b.pet_name||'—'}</div>
          <div><b>Owner:</b> ${b.owner_name||'—'}</div>
          <div><b>Type:</b> ${BOOKING_TYPES[b.booking_type]||b.booking_type}</div>
          <div><b>Room:</b> ${b.room_id}</div>
          <div><b>Check-in:</b> ${formatDate(b.check_in)} ${b.checkin_time||''}</div>
          <div><b>Check-out:</b> ${formatDate(b.check_out)} ${b.checkout_time||''}</div>
          <div><b>Status:</b> ${b.status}</div>
          ${b.notes?`<div><b>Notes:</b> ${b.notes}</div>`:''}
        </div>
        <div class="form-actions" style="margin-top:16px">
          <button class="btn btn-secondary" onclick="closeModal()">Close</button>
        </div>
      `);
    });
  });

  // Click on empty cell — new booking
  page.querySelectorAll('.cal-empty').forEach(cell => {
    cell.addEventListener('click', async () => {
      const staff = await api.get('/staff');
      // Pre-fill with room + date
      const preBooking = {
        room_id: cell.dataset.room,
        check_in: cell.dataset.date,
        check_out: cell.dataset.date,
        booking_type: 'overnight',
        num_dogs: 1,
      };
      openBookingForm(null, staff, preBooking);
    });
  });
}
