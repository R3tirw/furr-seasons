async function renderBookings() {
  const page = document.getElementById('page-bookings');
  const [bookings, pets, owners, staff, stats] = await Promise.all([
    api.get('/bookings'), api.get('/pets'), api.get('/owners'), api.get('/staff'), api.get('/stats')
  ]);

  const today = new Date().toISOString().split('T')[0];
  const active = stats.active_bookings;
  const isFull = active >= MAX_CAPACITY;
  const isWarn = active >= MAX_CAPACITY * 0.75;

  const statusColor = { confirmed: 'badge-confirmed', 'checked-out': 'badge-checked-out', cancelled: 'badge-cancelled' };

  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Bookings</div>
        <div class="page-sub">${bookings.length} total · ${active} active · ${MAX_CAPACITY - active} slots free</div>
      </div>
      <div class="action-row">
        <input class="search-input" id="booking-search" placeholder="Search pet or owner…" />
        <button class="btn btn-primary" id="add-booking-btn" ${isFull ? 'disabled style="opacity:0.5;cursor:not-allowed"' : ''}>
          + New Booking ${isFull ? '(Full)' : ''}
        </button>
      </div>
    </div>
    ${isFull ? '<div class="capacity-warning full" style="margin-bottom:16px">⚠️ All 20 kennels are currently occupied. Check out a dog before adding a new booking.</div>' :
      isWarn ? `<div class="capacity-warning" style="margin-bottom:16px">🟡 ${MAX_CAPACITY - active} kennels remaining — running low on space.</div>` : ''}
    <div class="full-card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Dog</th><th>Owner</th><th>Check-in</th><th>Check-out</th><th>Nights</th><th>Kennel</th><th>Rate/Night</th><th>Total</th><th>Status</th><th>Staff</th><th></th></tr></thead>
          <tbody id="bookings-body"></tbody>
        </table>
      </div>
    </div>
  `;

  function renderRows(list) {
    const tbody = document.getElementById('bookings-body');
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="11"><div class="empty-state"><div class="empty-state-icon">📋</div><p>No bookings yet. Add your first!</p></div></td></tr>';
      return;
    }
    tbody.innerHTML = list.map(b => {
      const nights = nightsBetween(b.check_in, b.check_out);
      const total = nights * (parseFloat(b.rate) || 0);
      return `<tr>
        <td><b>${b.pet_name || '—'}</b><br><span style="color:var(--text2);font-size:11px">${b.species || 'Dog'}</span></td>
        <td>${b.owner_name || '—'}<br><span style="color:var(--text2);font-size:11px">${b.owner_phone || ''}</span></td>
        <td>${formatDate(b.check_in)}</td>
        <td>${formatDate(b.check_out)}</td>
        <td style="text-align:center">${nights}</td>
        <td><b>${b.kennel || '—'}</b></td>
        <td>${formatCurrency(b.rate)}</td>
        <td><b>${total ? formatCurrency(total) : '—'}</b></td>
        <td><span class="badge ${statusColor[b.status] || ''}">${b.status}</span></td>
        <td>${b.staff_name || '—'}</td>
        <td>
          <div style="display:flex;gap:4px">
            <button class="btn-icon edit-booking" data-id="${b.id}" title="Edit">✏️</button>
            <button class="btn-icon del-booking" data-id="${b.id}" title="Delete">🗑️</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  renderRows(bookings);
  updateCapacityBar(active);

  document.getElementById('booking-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    renderRows(bookings.filter(b =>
      (b.pet_name||'').toLowerCase().includes(q) || (b.owner_name||'').toLowerCase().includes(q)
    ));
  });

  // Kennel options — K1–K20
  const kennelOptions = Array.from({length: MAX_CAPACITY}, (_, i) => 'K' + (i + 1));
  const usedKennels = bookings.filter(b => b.status === 'confirmed' && b.check_out >= today).map(b => b.kennel);

  function bookingForm(b = {}) {
    const remaining = MAX_CAPACITY - active;
    const warn = remaining <= 5 && !b.id;
    return `
      ${warn ? `<div class="capacity-warning" style="margin-bottom:14px">Only ${remaining} kennel${remaining !== 1 ? 's' : ''} available.</div>` : ''}
      <div class="form-grid">
        <div class="form-group">
          <label>Dog</label>
          <select id="f-pet" required>
            <option value="">Select dog…</option>
            ${pets.map(p => `<option value="${p.id}" ${b.pet_id===p.id?'selected':''}>${p.name} (${p.breed || p.species || 'Dog'})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Owner</label>
          <select id="f-owner" required>
            <option value="">Select owner…</option>
            ${owners.map(o => `<option value="${o.id}" ${b.owner_id===o.id?'selected':''}>${o.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Check-in Date</label>
          <input type="date" id="f-checkin" value="${b.check_in ? b.check_in.split('T')[0] : ''}" required />
        </div>
        <div class="form-group">
          <label>Check-out Date</label>
          <input type="date" id="f-checkout" value="${b.check_out ? b.check_out.split('T')[0] : ''}" required />
        </div>
        <div class="form-group">
          <label>Kennel</label>
          <select id="f-kennel">
            <option value="">Unassigned</option>
            ${kennelOptions.map(k => {
              const occupied = usedKennels.includes(k) && b.kennel !== k;
              return `<option value="${k}" ${b.kennel===k?'selected':''} ${occupied?'disabled':''}>
                ${k} ${occupied ? '(occupied)' : ''}
              </option>`;
            }).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Rate per Night (₹)</label>
          <input type="number" id="f-rate" value="${b.rate||''}" placeholder="800" />
        </div>
        <div class="form-group">
          <label>Assigned Staff</label>
          <select id="f-staff">
            <option value="">Unassigned</option>
            ${staff.map(s => `<option value="${s.id}" ${b.staff_id===s.id?'selected':''}>${s.name} — ${s.role || ''}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="f-status">
            ${['confirmed','checked-out','cancelled'].map(s => `<option value="${s}" ${(b.status||'confirmed')===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group span-2">
          <label>Notes</label>
          <textarea id="f-notes">${b.notes||''}</textarea>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="save-booking-btn">Save Booking</button>
      </div>
    `;
  }

  function getFormData() {
    return {
      pet_id: document.getElementById('f-pet').value,
      owner_id: document.getElementById('f-owner').value,
      check_in: document.getElementById('f-checkin').value,
      check_out: document.getElementById('f-checkout').value,
      kennel: document.getElementById('f-kennel').value,
      rate: document.getElementById('f-rate').value,
      staff_id: document.getElementById('f-staff').value,
      status: document.getElementById('f-status') ? document.getElementById('f-status').value : 'confirmed',
      notes: document.getElementById('f-notes').value,
    };
  }

  document.getElementById('add-booking-btn').addEventListener('click', () => {
    if (isFull) return;
    openModal('New Booking', bookingForm());
    document.getElementById('save-booking-btn').addEventListener('click', async () => {
      await api.post('/bookings', getFormData());
      closeModal(); showToast('Booking created ✓'); renderBookings();
    });
  });

  document.getElementById('bookings-body').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.edit-booking');
    const delBtn = e.target.closest('.del-booking');
    if (editBtn) {
      const b = bookings.find(x => x.id === editBtn.dataset.id);
      openModal('Edit Booking', bookingForm(b));
      document.getElementById('save-booking-btn').addEventListener('click', async () => {
        await api.put('/bookings/' + b.id, getFormData());
        closeModal(); showToast('Booking updated ✓'); renderBookings();
      });
    }
    if (delBtn) {
      if (confirm('Delete this booking?')) {
        await api.delete('/bookings/' + delBtn.dataset.id);
        showToast('Booking deleted'); renderBookings();
      }
    }
  });
}
