async function renderOwners() {
  const page = document.getElementById('page-owners');
  const owners = await api.get('/owners');

  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Owners</div>
        <div class="page-sub">${owners.length} pet parents on file</div>
      </div>
      <div class="action-row">
        <input class="search-input" id="owner-search" placeholder="Search name, phone…" />
        <button class="btn btn-primary" id="add-owner-btn">+ Add Owner</button>
      </div>
    </div>
    <div class="full-card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Address</th><th>Since</th><th></th></tr></thead>
          <tbody id="owners-body"></tbody>
        </table>
      </div>
    </div>
  `;

  function renderRows(list) {
    const tbody = document.getElementById('owners-body');
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="empty-state-icon">👤</div><p>No owners yet</p></div></td></tr>';
      return;
    }
    tbody.innerHTML = list.map(o => `
      <tr>
        <td><b>${o.name}</b></td>
        <td>${o.phone || '—'}</td>
        <td>${o.email || '—'}</td>
        <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.address || '—'}</td>
        <td>${formatDate(o.created_at)}</td>
        <td>
          <div style="display:flex;gap:4px">
            <button class="btn-icon edit-owner" data-id="${o.id}">✏️</button>
            <button class="btn-icon del-owner" data-id="${o.id}">🗑️</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  renderRows(owners);

  document.getElementById('owner-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    renderRows(owners.filter(o =>
      o.name.toLowerCase().includes(q) ||
      (o.phone||'').includes(q) ||
      (o.email||'').toLowerCase().includes(q)
    ));
  });

  function ownerForm(o = {}) {
    return `
      <div class="form-grid">
        <div class="form-group">
          <label>Full Name</label>
          <input type="text" id="f-name" value="${o.name||''}" placeholder="Priya Mehta" required />
        </div>
        <div class="form-group">
          <label>Phone</label>
          <input type="tel" id="f-phone" value="${o.phone||''}" placeholder="+91 98765 43210" />
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" id="f-email" value="${o.email||''}" placeholder="priya@email.com" />
        </div>
        <div class="form-group">
          <label>Address</label>
          <input type="text" id="f-address" value="${o.address||''}" placeholder="Bandra, Mumbai" />
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="save-owner-btn">Save Owner</button>
      </div>
    `;
  }

  function getFormData() {
    return {
      name: document.getElementById('f-name').value,
      phone: document.getElementById('f-phone').value,
      email: document.getElementById('f-email').value,
      address: document.getElementById('f-address').value,
    };
  }

  document.getElementById('add-owner-btn').addEventListener('click', () => {
    openModal('Add Owner', ownerForm());
    document.getElementById('save-owner-btn').addEventListener('click', async () => {
      await api.post('/owners', getFormData());
      closeModal(); showToast('Owner added ✓'); renderOwners();
    });
  });

  document.getElementById('owners-body').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.edit-owner');
    const delBtn = e.target.closest('.del-owner');
    if (editBtn) {
      const o = owners.find(x => x.id === editBtn.dataset.id);
      openModal('Edit Owner', ownerForm(o));
      document.getElementById('save-owner-btn').addEventListener('click', async () => {
        await api.put('/owners/' + o.id, getFormData());
        closeModal(); showToast('Owner updated ✓'); renderOwners();
      });
    }
    if (delBtn) {
      if (confirm('Delete this owner?')) {
        await api.delete('/owners/' + delBtn.dataset.id);
        showToast('Owner removed'); renderOwners();
      }
    }
  });
}
