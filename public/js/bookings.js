async function renderBookings() {
  const page = document.getElementById('page-bookings');
  page.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text2)">Loading…</div>';

  const [bookings, staff, stats] = await Promise.all([
    api.get('/bookings'), api.get('/staff'), api.get('/stats')
  ]);
  if(!bookings) return;

  const today = new Date().toISOString().split('T')[0];
  const active = stats?.checkedin_now || 0;
  const isFull = active >= MAX_CAPACITY;

  const statusBadge = {
    'confirmed':'badge-confirmed','checked-in':'badge-checkedin',
    'checked-out':'badge-checked-out','cancelled':'badge-cancelled'
  };

  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Bookings</div>
        <div class="page-sub">${bookings.length} total · ${active} checked in · ${MAX_CAPACITY-active} rooms free</div>
      </div>
      <div class="action-row">
        <input class="search-input" id="booking-search" placeholder="Search dog or owner…" />
        <button class="btn btn-primary" id="add-booking-btn">+ New Booking</button>
      </div>
    </div>
    <div class="full-card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Dog</th><th>Owner</th><th>Type</th><th>Room</th><th>Check-in</th><th>Check-out</th><th>Dogs</th><th>Total</th><th>Status</th><th></th></tr></thead>
          <tbody id="bookings-body"></tbody>
        </table>
      </div>
    </div>
  `;

  function calcTotal(b) {
    const room = ROOMS.find(r=>r.id===b.room_id);
    const numDogs = parseInt(b.num_dogs)||1;
    if(b.booking_type==='overnight') {
      const nights = nightsBetween(b.check_in,b.check_out);
      if(!nights) return null;
      const rate = room?room.rate:0;
      const addl = Math.max(0,numDogs-1)*nights*1200;
      return rate*nights + addl;
    } else if(b.booking_type==='day_boarding') {
      return (parseFloat(b.rate)||500)*numDogs;
    } else if(b.booking_type==='trial') {
      return 500*numDogs;
    }
    return null;
  }

  function renderRows(list) {
    const tbody = document.getElementById('bookings-body');
    if(!list.length){
      tbody.innerHTML='<tr><td colspan="10"><div class="empty-state"><div class="empty-state-icon">📋</div><p>No bookings yet</p></div></td></tr>';
      return;
    }
    tbody.innerHTML = list.map(b => {
      const total = calcTotal(b);
      const typeColor = TYPE_COLORS[b.booking_type]||'var(--navy)';
      return `<tr>
        <td><b>${b.pet_name||'—'}</b>${b.special_instructions?'<br><span style="font-size:10px;color:#FF8C00">⚠ Special instructions</span>':''}</td>
        <td>${b.owner_name||'—'}<br><span style="font-size:11px;color:var(--text2)">${b.owner_phone||''}</span></td>
        <td><span class="type-pill" style="background:${typeColor};color:${b.booking_type==='day_boarding'?'var(--navy)':'#fff'}">${BOOKING_TYPES[b.booking_type]||b.booking_type}</span></td>
        <td><b>${b.room_id||'—'}</b></td>
        <td>${formatDate(b.check_in)}${b.checkin_time?'<br><span style="font-size:11px">'+b.checkin_time+'</span>':''}</td>
        <td>${b.check_out?formatDate(b.check_out):'Open'}${b.checkout_time?'<br><span style="font-size:11px">'+b.checkout_time+'</span>':''}</td>
        <td style="text-align:center">${b.num_dogs||1}</td>
        <td><b>${total!==null?formatCurrency(total):'—'}</b></td>
        <td><span class="badge ${statusBadge[b.status]||''}">${b.status}</span></td>
        <td>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            ${b.booking_type==='trial'&&b.status==='checked-in'&&!b.checkout_time?`<button class="btn btn-sm btn-orange end-trial" data-id="${b.id}">End Trial</button>`:''}
            ${b.status==='confirmed'?`<button class="btn btn-sm btn-success checkin-btn" data-id="${b.id}">Check In</button>`:''}
            <button class="btn-icon edit-booking" data-id="${b.id}">✏️</button>
            <button class="btn-icon del-booking" data-id="${b.id}">🗑️</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  renderRows(bookings);
  updateCapacityBar(active);

  document.getElementById('booking-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    renderRows(bookings.filter(b=>(b.pet_name||'').toLowerCase().includes(q)||(b.owner_name||'').toLowerCase().includes(q)));
  });

  // NEW BOOKING
  document.getElementById('add-booking-btn').addEventListener('click', () => {
    openBookingForm(null, staff);
  });

  // TABLE ACTIONS
  document.getElementById('bookings-body').addEventListener('click', async e => {
    const endBtn = e.target.closest('.end-trial');
    const checkinBtn = e.target.closest('.checkin-btn');
    const editBtn = e.target.closest('.edit-booking');
    const delBtn = e.target.closest('.del-booking');

    if(endBtn) {
      const res = await api.post('/bookings/'+endBtn.dataset.id+'/end-trial', {});
      if(res?.success){ showToast('Trial ended — '+res.checkout_time); renderBookings(); }
    }
    if(checkinBtn) {
      const b = bookings.find(x=>x.id===checkinBtn.dataset.id);
      if(b){ await api.put('/bookings/'+b.id, {...b, status:'checked-in'}); showToast('Checked in ✓'); renderBookings(); }
    }
    if(editBtn) {
      const b = bookings.find(x=>x.id===editBtn.dataset.id);
      openBookingForm(b, staff);
    }
    if(delBtn) {
      if(confirm('Delete this booking?')){ await api.delete('/bookings/'+delBtn.dataset.id); showToast('Booking deleted'); renderBookings(); }
    }
  });
}

async function openBookingForm(booking, staff) {
  const isEdit = !!booking;

  // Build room selector HTML
  const calBookings = await api.get('/bookings/calendar');
  const today = new Date().toISOString().split('T')[0];

  function roomOptions(selectedType, selectedRoom, checkIn, checkOut, bType, excludeId) {
    return ROOMS.map(r => {
      // Check if occupied for overnight
      const conflicts = (calBookings||[]).filter(b =>
        b.room_id===r.id && b.id!==(excludeId||'') &&
        b.status!=='cancelled' && b.status!=='checked-out' &&
        b.booking_type==='overnight'
      );
      const conflicting = conflicts.some(b => {
        if(!checkIn||!checkOut) return false;
        return checkIn < (b.check_out||b.check_in) && checkOut > b.check_in;
      });
      const disabled = conflicting || (selectedType && r.type!==selectedType && bType==='overnight');
      return `<option value="${r.id}" ${selectedRoom===r.id?'selected':''} ${disabled?'disabled style="color:#aaa"':''}>
        ${r.id} — ${r.type} (₹${r.rate}/night)${conflicting?' [BOOKED]':''}
      </option>`;
    }).join('');
  }

  const html = `
    <div id="booking-form-wrap">
      <!-- DOG SEARCH -->
      <div class="form-group" style="margin-bottom:14px">
        <label>Dog</label>
        <input type="text" id="dog-search" placeholder="Type dog name to search…" autocomplete="off"
          value="${isEdit?(booking.pet_name||''):''}" />
        <div id="dog-results" style="position:relative"></div>
        <input type="hidden" id="f-pet-id" value="${isEdit?(booking.pet_id||''):''}" />
      </div>

      <!-- OWNER (auto-populated) -->
      <div class="form-grid" style="margin-bottom:14px">
        <div class="form-group">
          <label>Owner Name</label>
          <input type="text" id="f-owner-name" placeholder="Auto-filled from dog" value="${isEdit?(booking.owner_name||''):''}" readonly style="background:var(--bg2)" />
          <input type="hidden" id="f-owner-id" value="${isEdit?(booking.owner_id||''):''}" />
        </div>
        <div class="form-group">
          <label>Owner Phone</label>
          <input type="text" id="f-owner-phone" placeholder="Auto-filled" value="${isEdit?(booking.owner_phone||''):''}" readonly style="background:var(--bg2)" />
        </div>
      </div>

      <div id="new-dog-section" style="display:none;background:var(--bg2);border-radius:8px;padding:14px;margin-bottom:14px">
        <div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.06em">Register New Dog</div>
        <div class="form-grid">
          <div class="form-group"><label>Dog Name</label><input type="text" id="f-new-dog-name" /></div>
          <div class="form-group"><label>Breed</label><input type="text" id="f-new-dog-breed" list="breed-list-bk" /></div>
          <div class="form-group"><label>New Owner Name</label><input type="text" id="f-new-owner-name" /></div>
          <div class="form-group"><label>Owner Phone</label><input type="text" id="f-new-owner-phone" /></div>
        </div>
      </div>
      <datalist id="breed-list-bk">
        ${['Labrador','Golden Retriever','German Shepherd','Beagle','Poodle','Bulldog','Rottweiler','Boxer',
          'Dachshund','Shih Tzu','Pomeranian','Doberman','Husky','Great Dane','Border Collie',
          'Cocker Spaniel','Bichon Frise','Maltese','Yorkshire Terrier','French Bulldog','Pug','Indie / Mixed'].map(b=>`<option value="${b}">`).join('')}
      </datalist>

      <!-- BOOKING TYPE -->
      <div class="form-group" style="margin-bottom:14px">
        <label>Booking Type</label>
        <select id="f-type">
          <option value="overnight" ${(!isEdit||booking.booking_type==='overnight')?'selected':''}>Overnight Stay</option>
          <option value="day_boarding" ${isEdit&&booking.booking_type==='day_boarding'?'selected':''}>Day Boarding</option>
          <option value="trial" ${isEdit&&booking.booking_type==='trial'?'selected':''}>Trial Stay</option>
        </select>
      </div>

      <!-- OVERNIGHT FIELDS -->
      <div id="overnight-fields">
        <div class="form-grid" style="margin-bottom:14px">
          <div class="form-group"><label>Check-in Date</label><input type="date" id="f-checkin" value="${isEdit?(booking.check_in?.split('T')[0]||''):''}" /></div>
          <div class="form-group"><label>Check-out Date</label><input type="date" id="f-checkout" value="${isEdit?(booking.check_out?.split('T')[0]||''):''}" /></div>
        </div>
      </div>

      <!-- DAY BOARDING FIELDS -->
      <div id="day-fields" style="display:none">
        <div class="form-grid" style="margin-bottom:14px">
          <div class="form-group"><label>Date</label><input type="date" id="f-day-date" value="${isEdit?(booking.check_in?.split('T')[0]||''):''}" /></div>
          <div class="form-group"><label>Duration</label>
            <select id="f-day-rate">
              <option value="500" ${isEdit&&booking.rate==500?'selected':''}>Up to 4 hours — ₹500/dog</option>
              <option value="1000" ${isEdit&&booking.rate==1000?'selected':''}>Up to 8 hours — ₹1000/dog</option>
            </select>
          </div>
          <div class="form-group"><label>Check-in Time</label><input type="time" id="f-checkin-time" value="${isEdit?(booking.checkin_time||''):''}" /></div>
          <div class="form-group"><label>Check-out Time</label><input type="time" id="f-checkout-time" value="${isEdit?(booking.checkout_time||''):''}" /></div>
        </div>
      </div>

      <!-- TRIAL FIELDS -->
      <div id="trial-fields" style="display:none">
        <div class="form-grid" style="margin-bottom:14px">
          <div class="form-group"><label>Date</label><input type="date" id="f-trial-date" value="${isEdit?(booking.check_in?.split('T')[0]||''):''}" /></div>
          <div class="form-group"><label>Start Time</label><input type="time" id="f-trial-start" value="${isEdit?(booking.checkin_time||''):''}" /></div>
          <div class="form-group"><label>End Time (optional)</label><input type="time" id="f-trial-end" value="${isEdit?(booking.checkout_time||''):''}" /></div>
        </div>
      </div>

      <!-- ROOM & DOGS -->
      <div class="form-grid" style="margin-bottom:14px">
        <div class="form-group">
          <label>Room</label>
          <select id="f-room">
            <option value="">Select room…</option>
            ${roomOptions(null, isEdit?booking.room_id:null, null, null, 'overnight', isEdit?booking.id:null)}
          </select>
          <div id="room-conflict-msg" style="color:#FF8C00;font-size:12px;margin-top:4px"></div>
        </div>
        <div class="form-group">
          <label>Number of Dogs</label>
          <input type="number" id="f-num-dogs" value="${isEdit?(booking.num_dogs||1):1}" min="1" max="10" />
        </div>
      </div>

      ${isEdit?`<div class="form-group" style="margin-bottom:14px">
        <label>Status</label>
        <select id="f-status">
          ${['confirmed','checked-in','checked-out','cancelled'].map(s=>`<option value="${s}" ${booking.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>`:''}

      <div class="form-group" style="margin-bottom:14px">
        <label>Assigned Staff</label>
        <select id="f-staff">
          <option value="">Unassigned</option>
          ${(staff||[]).map(s=>`<option value="${s.id}" ${isEdit&&booking.staff_id===s.id?'selected':''}>${s.name} — ${s.role||''}</option>`).join('')}
        </select>
      </div>

      <div class="form-group" style="margin-bottom:14px">
        <label>Notes</label>
        <textarea id="f-notes">${isEdit?(booking.notes||''):''}</textarea>
      </div>

      <!-- RATE PREVIEW -->
      <div id="rate-preview" style="background:var(--bg2);border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:13px;display:none">
        <b>Estimated Total:</b> <span id="rate-total"></span>
        <div id="rate-lines" style="font-size:12px;color:var(--text2);margin-top:4px"></div>
      </div>

      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="save-booking-btn">${isEdit?'Update Booking':'Create Booking'}</button>
      </div>
    </div>
  `;

  openModal(isEdit?'Edit Booking':'New Booking', html, true);

  // Type switcher
  function switchType() {
    const t = document.getElementById('f-type').value;
    document.getElementById('overnight-fields').style.display = t==='overnight'?'':'none';
    document.getElementById('day-fields').style.display = t==='day_boarding'?'':'none';
    document.getElementById('trial-fields').style.display = t==='trial'?'':'none';
    updateRatePreview();
  }
  document.getElementById('f-type').addEventListener('change', switchType);
  switchType();

  // Rate preview updater
  function updateRatePreview() {
    const t = document.getElementById('f-type').value;
    const roomId = document.getElementById('f-room').value;
    const numDogs = parseInt(document.getElementById('f-num-dogs').value)||1;
    let preview = null;
    if(t==='overnight') {
      const ci = document.getElementById('f-checkin').value;
      const co = document.getElementById('f-checkout').value;
      const nights = nightsBetween(ci,co);
      if(nights>0&&roomId) preview=calcRate('overnight',roomId,numDogs,nights,null);
    } else if(t==='day_boarding') {
      const rate = parseInt(document.getElementById('f-day-rate').value)||500;
      preview=calcRate('day_boarding',roomId,numDogs,1,rate);
    } else if(t==='trial') {
      preview=calcRate('trial',roomId,numDogs,1,null);
    }
    const pv=document.getElementById('rate-preview');
    if(preview&&preview.total>0) {
      pv.style.display='';
      document.getElementById('rate-total').textContent=formatCurrency(preview.total);
      document.getElementById('rate-lines').innerHTML=preview.lines.join('<br>');
    } else pv.style.display='none';
  }

  ['f-checkin','f-checkout','f-room','f-num-dogs','f-day-rate','f-day-date'].forEach(id => {
    const el=document.getElementById(id);
    if(el) el.addEventListener('change',updateRatePreview);
  });
  updateRatePreview();

  // Dog search
  let searchTimeout;
  document.getElementById('dog-search').addEventListener('input', e => {
    clearTimeout(searchTimeout);
    const q = e.target.value.trim();
    if(q.length<2){ document.getElementById('dog-results').innerHTML=''; return; }
    searchTimeout = setTimeout(async () => {
      const pets = await api.get('/pets/search?q='+encodeURIComponent(q));
      if(!pets) return;
      const resultsEl = document.getElementById('dog-results');
      if(pets.length===0){
        resultsEl.innerHTML=`<div class="dog-search-results">
          <div class="dog-result-item" id="register-new-dog" style="color:var(--navy);font-weight:600">+ Register "${q}" as new dog</div>
        </div>`;
        document.getElementById('register-new-dog').addEventListener('click',()=>{
          document.getElementById('new-dog-section').style.display='';
          document.getElementById('f-new-dog-name').value=q;
          resultsEl.innerHTML='';
        });
      } else {
        resultsEl.innerHTML=`<div class="dog-search-results">
          ${pets.map(p=>`<div class="dog-result-item" data-id="${p.id}" data-owner-id="${p.owner_id||''}" data-owner-name="${p.owner_name||''}" data-owner-phone="${p.owner_phone||''}">
            <b>${p.name}</b> — ${p.breed||p.species||'Dog'}<br>
            <span style="font-size:11px;color:var(--text2)">Owner: ${p.owner_name||'Unknown'} ${p.owner_phone?'· '+p.owner_phone:''}</span>
          </div>`).join('')}
          <div class="dog-result-item" id="register-new-dog" style="color:var(--navy);font-weight:600">+ Register new dog</div>
        </div>`;
        resultsEl.querySelectorAll('.dog-result-item[data-id]').forEach(item=>{
          item.addEventListener('click',()=>{
            document.getElementById('dog-search').value=item.querySelector('b').textContent;
            document.getElementById('f-pet-id').value=item.dataset.id;
            document.getElementById('f-owner-id').value=item.dataset.ownerId;
            document.getElementById('f-owner-name').value=item.dataset.ownerName;
            document.getElementById('f-owner-phone').value=item.dataset.ownerPhone;
            document.getElementById('new-dog-section').style.display='none';
            resultsEl.innerHTML='';
          });
        });
        document.getElementById('register-new-dog')?.addEventListener('click',()=>{
          document.getElementById('new-dog-section').style.display='';
          resultsEl.innerHTML='';
        });
      }
    },300);
  });

  // SAVE
  document.getElementById('save-booking-btn').addEventListener('click', async () => {
    const btype = document.getElementById('f-type').value;
    let petId = document.getElementById('f-pet-id').value;
    let ownerId = document.getElementById('f-owner-id').value;

    // Register new dog/owner if needed
    const newSection = document.getElementById('new-dog-section');
    if(newSection.style.display!=='none' && !petId) {
      const dogName = document.getElementById('f-new-dog-name').value.trim();
      const dogBreed = document.getElementById('f-new-dog-breed').value.trim();
      const ownerName = document.getElementById('f-new-owner-name').value.trim();
      const ownerPhone = document.getElementById('f-new-owner-phone').value.trim();
      if(!dogName||!ownerName){ showToast('Please enter dog name and owner name','warn'); return; }
      const ownerRes = await api.post('/owners',{name:ownerName,phone:ownerPhone});
      if(!ownerRes?.id){ showToast('Failed to create owner','warn'); return; }
      const petRes = await api.post('/pets',{name:dogName,breed:dogBreed,owner_id:ownerRes.id,species:'Dog'});
      if(!petRes?.id){ showToast('Failed to create dog','warn'); return; }
      petId = petRes.id; ownerId = ownerRes.id;
    }

    let checkIn, checkOut, checkinTime, checkoutTime, rate;
    if(btype==='overnight'){
      checkIn=document.getElementById('f-checkin').value;
      checkOut=document.getElementById('f-checkout').value;
      if(!checkIn||!checkOut||checkIn>=checkOut){showToast('Please select valid check-in and check-out dates','warn');return;}
    } else if(btype==='day_boarding'){
      checkIn=document.getElementById('f-day-date').value;
      checkOut=checkIn;
      checkinTime=document.getElementById('f-checkin-time').value;
      checkoutTime=document.getElementById('f-checkout-time').value;
      rate=parseInt(document.getElementById('f-day-rate').value)||500;
      if(!checkIn){showToast('Please select a date','warn');return;}
    } else {
      checkIn=document.getElementById('f-trial-date').value;
      checkOut=checkIn;
      checkinTime=document.getElementById('f-trial-start').value;
      checkoutTime=document.getElementById('f-trial-end').value;
      rate=500;
      if(!checkIn){showToast('Please select a date','warn');return;}
    }

    const roomId = document.getElementById('f-room').value;
    if(!roomId){showToast('Please select a room','warn');return;}

    const data = {
      pet_id:petId, owner_id:ownerId,
      staff_id:document.getElementById('f-staff').value,
      check_in:checkIn, check_out:checkOut||checkIn,
      checkin_time:checkinTime||null, checkout_time:checkoutTime||null,
      booking_type:btype, room_id:roomId,
      num_dogs:parseInt(document.getElementById('f-num-dogs').value)||1,
      rate:rate||null,
      notes:document.getElementById('f-notes').value,
      status:document.getElementById('f-status')?document.getElementById('f-status').value:'confirmed',
    };

    const btn=document.getElementById('save-booking-btn');
    btn.disabled=true; btn.textContent='Saving…';

    const res = isEdit
      ? await api.put('/bookings/'+booking.id, data)
      : await api.post('/bookings', data);

    if(res?.error){ showToast(res.error,'warn'); btn.disabled=false; btn.textContent=isEdit?'Update Booking':'Create Booking'; return; }
    closeModal(); showToast(isEdit?'Booking updated ✓':'Booking created ✓'); renderBookings();
  });
}
