async function renderInvoices() {
  const page = document.getElementById('page-invoices');
  const [invoices, bookings] = await Promise.all([api.get('/invoices'), api.get('/bookings')]);

  const collected = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (parseFloat(i.total)||0), 0);
  const pending   = invoices.filter(i => i.status === 'unpaid').reduce((s, i) => s + (parseFloat(i.total)||0), 0);

  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Invoices</div>
        <div class="page-sub">${formatCurrency(collected)} collected · ${formatCurrency(pending)} outstanding</div>
      </div>
      <div class="action-row">
        <input class="search-input" id="inv-search" placeholder="Search owner…" />
        <button class="btn btn-primary" id="add-inv-btn">+ Create Invoice</button>
      </div>
    </div>
    <div class="full-card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Owner</th><th>Dog</th><th>Stay</th><th>Nights</th><th>Amount</th><th>Tax</th><th>Total</th><th>Status</th><th>Due</th><th></th></tr></thead>
          <tbody id="inv-body"></tbody>
        </table>
      </div>
    </div>
  `;

  function renderRows(list) {
    const tbody = document.getElementById('inv-body');
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="10"><div class="empty-state"><div class="empty-state-icon">🧾</div><p>No invoices yet</p></div></td></tr>';
      return;
    }
    const sm = { paid: 'badge-paid', unpaid: 'badge-unpaid', overdue: 'badge-overdue' };
    tbody.innerHTML = list.map(i => {
      const nights = nightsBetween(i.check_in, i.check_out);
      return `<tr>
        <td><b>${i.owner_name || '—'}</b></td>
        <td>${i.pet_name || '—'}</td>
        <td style="font-size:12px;white-space:nowrap">${formatDate(i.check_in)} → ${formatDate(i.check_out)}</td>
        <td style="text-align:center">${nights || '—'}</td>
        <td>${formatCurrency(i.amount)}</td>
        <td>${parseFloat(i.tax) > 0 ? formatCurrency(i.tax) : '—'}</td>
        <td><b>${formatCurrency(i.total)}</b></td>
        <td><span class="badge ${sm[i.status]||''}">${i.status}</span></td>
        <td>${formatDate(i.due_date)}</td>
        <td>
          <div style="display:flex;gap:4px">
            ${i.status === 'unpaid' ? `<button class="btn btn-sm btn-success mark-paid" data-id="${i.id}">✓ Paid</button>` : ''}
            <button class="btn-icon del-inv" data-id="${i.id}">🗑️</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  renderRows(invoices);

  document.getElementById('inv-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    renderRows(invoices.filter(i => (i.owner_name||'').toLowerCase().includes(q) || (i.pet_name||'').toLowerCase().includes(q)));
  });

  function invForm() {
    const eligible = bookings.filter(b => b.status === 'confirmed' || b.status === 'checked-out');
    return `
      <div class="form-grid">
        <div class="form-group span-2">
          <label>Booking</label>
          <select id="f-booking" required>
            <option value="">Select booking…</option>
            ${eligible.map(b => {
              const nights = nightsBetween(b.check_in, b.check_out);
              const amt = nights * (parseFloat(b.rate)||0);
              return `<option value="${b.id}" data-owner="${b.owner_id}" data-amount="${amt}">
                ${b.pet_name} — ${b.owner_name} (${formatDate(b.check_in)} → ${formatDate(b.check_out)}, ${nights} nights × ${formatCurrency(b.rate)})
              </option>`;
            }).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Amount (₹)</label>
          <input type="number" id="f-amount" placeholder="Auto-filled from booking" min="0" />
        </div>
        <div class="form-group">
          <label>Tax / GST (₹)</label>
          <input type="number" id="f-tax" value="0" min="0" />
        </div>
        <div class="form-group">
          <label>Due Date</label>
          <input type="date" id="f-due" value="${new Date(Date.now() + 7*864e5).toISOString().split('T')[0]}" />
        </div>
        <div class="form-group">
          <label>Notes</label>
          <input type="text" id="f-notes" placeholder="Optional" />
        </div>
      </div>
      <div id="inv-preview" style="margin-top:8px"></div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="save-inv-btn">Create Invoice</button>
      </div>
    `;
  }

  document.getElementById('add-inv-btn').addEventListener('click', () => {
    openModal('Create Invoice', invForm());
    document.getElementById('f-booking').addEventListener('change', e => {
      const opt = e.target.selectedOptions[0];
      if (opt && opt.dataset.amount) {
        document.getElementById('f-amount').value = opt.dataset.amount;
        const tax = parseFloat(document.getElementById('f-tax').value)||0;
        document.getElementById('inv-preview').innerHTML =
          `<div style="background:var(--bg2);border-radius:8px;padding:10px 14px;font-size:13px;color:var(--navy)">
            Total: <b>${formatCurrency(parseFloat(opt.dataset.amount) + tax)}</b>
          </div>`;
      }
    });
    document.getElementById('save-inv-btn').addEventListener('click', async () => {
      const bookingEl = document.getElementById('f-booking');
      const opt = bookingEl.selectedOptions[0];
      await api.post('/invoices', {
        booking_id: bookingEl.value,
        owner_id: opt ? opt.dataset.owner : '',
        amount: document.getElementById('f-amount').value,
        tax: document.getElementById('f-tax').value,
        due_date: document.getElementById('f-due').value,
        notes: document.getElementById('f-notes').value,
      });
      closeModal(); showToast('Invoice created ✓'); renderInvoices();
    });
  });

  document.getElementById('inv-body').addEventListener('click', async (e) => {
    const markBtn = e.target.closest('.mark-paid');
    const delBtn = e.target.closest('.del-inv');
    if (markBtn) {
      await api.put('/invoices/' + markBtn.dataset.id + '/status', { status: 'paid' });
      showToast('Marked as paid ✓'); renderInvoices();
    }
    if (delBtn) {
      if (confirm('Delete this invoice?')) {
        await api.delete('/invoices/' + delBtn.dataset.id);
        showToast('Invoice deleted'); renderInvoices();
      }
    }
  });
}
