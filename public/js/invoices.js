async function renderInvoices() {
  const page = document.getElementById('page-invoices');
  const invoices = await api.get('/invoices');
  if(!invoices) return;

  const collected = invoices.filter(i=>i.status==='paid').reduce((s,i)=>s+(parseFloat(i.total)||0),0);
  const pending   = invoices.filter(i=>i.status!=='paid').reduce((s,i)=>s+(parseFloat(i.total)||0),0);
  const needsReview = invoices.filter(i=>i.needs_review).length;

  page.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Invoices</div>
        <div class="page-sub">${formatCurrency(collected)} collected · ${formatCurrency(pending)} outstanding
        ${needsReview?` · <span style="color:#FF8C00;font-weight:600">⚠ ${needsReview} need review</span>`:''}
        </div>
      </div>
      <div class="action-row">
        <select id="inv-filter" style="padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px">
          <option value="">All invoices</option>
          <option value="draft">Draft</option>
          <option value="finalised">Finalised</option>
          <option value="paid">Paid</option>
          <option value="review">Needs Review</option>
        </select>
        <input class="search-input" id="inv-search" placeholder="Search owner…" style="width:160px" />
      </div>
    </div>
    <div class="full-card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Owner</th><th>Dog</th><th>Type</th><th>Stay</th><th>Total</th><th>Status</th><th>Due</th><th></th></tr></thead>
          <tbody id="inv-body"></tbody>
        </table>
      </div>
    </div>
  `;

  const statusMap={paid:'badge-paid',finalised:'badge-confirmed',draft:'badge-unpaid'};

  function renderRows(list) {
    const tbody=document.getElementById('inv-body');
    if(!list.length){tbody.innerHTML='<tr><td colspan="8"><div class="empty-state"><div class="empty-state-icon">🧾</div><p>No invoices</p></div></td></tr>';return;}
    tbody.innerHTML=list.map(i=>`<tr ${i.needs_review?'style="background:#FFF8EC"':''}>
      <td><b>${i.owner_name||'—'}</b></td>
      <td>${i.pet_name||'—'}</td>
      <td><span class="type-pill" style="background:${TYPE_COLORS[i.booking_type]||'var(--navy)'};color:${i.booking_type==='day_boarding'?'var(--navy)':'#fff'}">${BOOKING_TYPES[i.booking_type]||i.booking_type||'—'}</span></td>
      <td style="font-size:12px">${formatDate(i.check_in)}${i.check_out&&i.check_out!==i.check_in?'→'+formatDate(i.check_out):''}</td>
      <td><b>${formatCurrency(i.total)}</b></td>
      <td>
        ${i.needs_review?'<span style="color:#FF8C00;font-size:11px;font-weight:700">⚠ REVIEW</span><br>':''}
        <span class="badge ${statusMap[i.status]||''}">${i.status}</span>
      </td>
      <td>${formatDate(i.due_date)}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn btn-sm btn-secondary view-inv" data-id="${i.id}">View</button>
          ${i.status==='draft'?`<button class="btn btn-sm btn-navy finalise-inv" data-id="${i.id}">Finalise</button>`:''}
          ${i.status==='finalised'?`<button class="btn btn-sm btn-success mark-paid" data-id="${i.id}">Mark Paid</button>`:''}
        </div>
      </td>
    </tr>`).join('');
  }

  renderRows(invoices);

  function filterRows() {
    const filter=document.getElementById('inv-filter').value;
    const q=document.getElementById('inv-search').value.toLowerCase();
    renderRows(invoices.filter(i=>{
      if(filter==='review'&&!i.needs_review) return false;
      if(filter&&filter!=='review'&&i.status!==filter) return false;
      if(q&&!(i.owner_name||'').toLowerCase().includes(q)&&!(i.pet_name||'').toLowerCase().includes(q)) return false;
      return true;
    }));
  }
  document.getElementById('inv-filter').addEventListener('change',filterRows);
  document.getElementById('inv-search').addEventListener('input',filterRows);

  document.getElementById('inv-body').addEventListener('click',async e=>{
    const viewBtn=e.target.closest('.view-inv');
    const finaliseBtn=e.target.closest('.finalise-inv');
    const paidBtn=e.target.closest('.mark-paid');

    if(viewBtn) openInvoiceDetail(viewBtn.dataset.id);
    if(finaliseBtn){await api.put('/invoices/'+finaliseBtn.dataset.id+'/status',{status:'finalised'});showToast('Invoice finalised ✓');renderInvoices();}
    if(paidBtn){await api.put('/invoices/'+paidBtn.dataset.id+'/status',{status:'paid'});showToast('Marked as paid ✓');renderInvoices();}
  });
}

async function openInvoiceDetail(invId) {
  const inv = await api.get('/invoices/'+invId);
  if(!inv) return;

  const itemsHtml = inv.items?.map(item=>`
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid var(--border)">${item.description}</td>
      <td style="padding:8px 12px;border-bottom:1px solid var(--border);text-align:right"><b>${formatCurrency(item.amount)}</b></td>
      <td style="padding:8px 4px;border-bottom:1px solid var(--border)">
        ${!item.is_auto?`<button class="btn-icon del-item" data-id="${item.id}" style="font-size:11px">🗑️</button>`:''}
      </td>
    </tr>`).join('') || '';

  openModal('Invoice — '+inv.pet_name, `
    ${inv.needs_review?'<div class="capacity-warning" style="margin-bottom:14px">⚠ This invoice needs review — the booking was changed after invoicing. Please review and re-finalise.</div>':''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;margin-bottom:16px">
      <div><b>Owner:</b> ${inv.owner_name||'—'}</div>
      <div><b>Dog:</b> ${inv.pet_name||'—'}</div>
      <div><b>Stay:</b> ${formatDate(inv.check_in)} → ${formatDate(inv.check_out)}</div>
      <div><b>Status:</b> <span class="badge ${inv.status==='paid'?'badge-paid':inv.status==='finalised'?'badge-confirmed':'badge-unpaid'}">${inv.status}</span></div>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
      <thead><tr style="background:var(--bg2)">
        <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.07em">Description</th>
        <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.07em">Amount</th>
        <th style="width:32px"></th>
      </tr></thead>
      <tbody id="inv-items-body">${itemsHtml}</tbody>
      <tfoot>
        <tr style="background:var(--bg2)">
          <td style="padding:10px 12px;font-weight:700">Total</td>
          <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:16px" id="inv-grand-total">${formatCurrency(inv.total)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>

    ${inv.status!=='paid'?`
    <div style="background:var(--bg2);border-radius:8px;padding:12px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--navy);margin-bottom:8px">Add Extra Charge</div>
      <div style="display:flex;gap:8px">
        <input type="text" id="extra-desc" placeholder="Description (e.g. Vet visit)" style="flex:1;padding:8px;border:1.5px solid var(--border);border-radius:7px;font-size:13px" />
        <input type="number" id="extra-amt" placeholder="Amount" style="width:100px;padding:8px;border:1.5px solid var(--border);border-radius:7px;font-size:13px" min="0" />
        <button class="btn btn-navy" id="add-extra-btn" style="white-space:nowrap">Add</button>
      </div>
    </div>
    <div style="margin-bottom:12px">
      <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--text2)">Notes</label>
      <textarea id="inv-notes" style="width:100%;margin-top:4px;padding:8px;border:1.5px solid var(--border);border-radius:7px;font-size:13px">${inv.notes||''}</textarea>
    </div>`:''}

    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Close</button>
      ${inv.status==='draft'?`<button class="btn btn-navy" id="inv-finalise-btn">Finalise Invoice</button>`:''}
      ${inv.status==='finalised'?`<button class="btn btn-success" id="inv-paid-btn">Mark as Paid</button>`:''}
    </div>
  `, true);

  // Delete item
  document.getElementById('inv-items-body')?.addEventListener('click', async e => {
    const delBtn=e.target.closest('.del-item');
    if(delBtn){
      const res=await api.delete('/invoices/'+invId+'/items/'+delBtn.dataset.id);
      if(res?.total!==undefined) document.getElementById('inv-grand-total').textContent=formatCurrency(res.total);
      delBtn.closest('tr').remove();
    }
  });

  // Add extra
  document.getElementById('add-extra-btn')?.addEventListener('click', async () => {
    const desc=document.getElementById('extra-desc').value.trim();
    const amt=parseFloat(document.getElementById('extra-amt').value);
    if(!desc||!amt){showToast('Enter description and amount','warn');return;}
    const res=await api.post('/invoices/'+invId+'/items',{description:desc,amount:amt});
    if(res?.success){
      document.getElementById('extra-desc').value='';
      document.getElementById('extra-amt').value='';
      document.getElementById('inv-grand-total').textContent=formatCurrency(res.total);
      const tbody=document.getElementById('inv-items-body');
      tbody.innerHTML+=`<tr><td style="padding:8px 12px;border-bottom:1px solid var(--border)">${desc}</td><td style="padding:8px 12px;border-bottom:1px solid var(--border);text-align:right"><b>${formatCurrency(amt)}</b></td><td><button class="btn-icon del-item" data-id="${res.itemId}" style="font-size:11px">🗑️</button></td></tr>`;
      showToast('Charge added ✓');
    }
  });

  document.getElementById('inv-finalise-btn')?.addEventListener('click', async () => {
    const notes=document.getElementById('inv-notes')?.value;
    if(notes) await api.put('/invoices/'+invId+'/notes',{notes});
    await api.put('/invoices/'+invId+'/status',{status:'finalised'});
    closeModal(); showToast('Invoice finalised ✓'); renderInvoices();
  });

  document.getElementById('inv-paid-btn')?.addEventListener('click', async () => {
    await api.put('/invoices/'+invId+'/status',{status:'paid'});
    closeModal(); showToast('Marked as paid ✓'); renderInvoices();
  });
}
