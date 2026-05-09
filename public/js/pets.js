async function renderPets() {
  const page = document.getElementById('page-pets');
  const [pets, owners] = await Promise.all([api.get('/pets'), api.get('/owners')]);

  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">🐕 Dogs</div>
        <div class="page-sub">${pets.length} registered · <span style="color:var(--text2);font-size:12px;font-style:italic">Cats coming soon!</span></div>
      </div>
      <div class="action-row">
        <input class="search-input" id="pet-search" placeholder="Search name, breed…" />
        <button class="btn btn-primary" id="add-pet-btn">+ Add Dog</button>
      </div>
    </div>
    <div class="full-card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Breed</th><th>Age</th><th>Weight</th><th>Owner</th><th>Care Notes</th><th></th></tr></thead>
          <tbody id="pets-body"></tbody>
        </table>
      </div>
    </div>
  `;

  function renderRows(list) {
    const tbody = document.getElementById('pets-body');
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="empty-state-icon">🐶</div><p>No dogs registered yet</p></div></td></tr>';
      return;
    }
    tbody.innerHTML = list.map(p => `
      <tr>
        <td><b>${p.name}</b></td>
        <td>${p.breed || '—'}</td>
        <td>${p.age ? p.age + ' yr' + (p.age > 1 ? 's' : '') : '—'}</td>
        <td>${p.weight ? p.weight + ' kg' : '—'}</td>
        <td>${p.owner_name || '—'}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text2)">${p.notes || '—'}</td>
        <td>
          <div style="display:flex;gap:4px">
            <button class="btn-icon edit-pet" data-id="${p.id}">✏️</button>
            <button class="btn-icon del-pet" data-id="${p.id}">🗑️</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  renderRows(pets);

  document.getElementById('pet-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    renderRows(pets.filter(p => p.name.toLowerCase().includes(q) || (p.breed||'').toLowerCase().includes(q)));
  });

  const dogBreeds = ['Labrador','Golden Retriever','German Shepherd','Beagle','Poodle','Bulldog','Rottweiler','Boxer','Dachshund','Shih Tzu','Pomeranian','Indie / Mixed','Other'];

  function petForm(p = {}) {
    return `
      <div class="form-grid">
        <div class="form-group">
          <label>Dog's Name</label>
          <input type="text" id="f-name" value="${p.name||''}" placeholder="e.g. Bruno" required />
        </div>
        <div class="form-group">
          <label>Owner</label>
          <select id="f-owner" required>
            <option value="">Select owner…</option>
            ${owners.map(o => `<option value="${o.id}" ${p.owner_id===o.id?'selected':''}>${o.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Breed</label>
          <select id="f-breed">
            <option value="">Select…</option>
            ${dogBreeds.map(b => `<option value="${b}" ${p.breed===b?'selected':''}>${b}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Gender</label>
          <select id="f-species">
            <option value="Dog - Male" ${p.species==='Dog - Male'?'selected':''}>Male</option>
            <option value="Dog - Female" ${p.species==='Dog - Female'?'selected':''}>Female</option>
            <option value="Dog" ${(!p.species||p.species==='Dog')?'selected':''}>Unknown</option>
          </select>
        </div>
        <div class="form-group">
          <label>Age (years)</label>
          <input type="number" id="f-age" value="${p.age||''}" placeholder="3" min="0" max="30" />
        </div>
        <div class="form-group">
          <label>Weight (kg)</label>
          <input type="number" id="f-weight" value="${p.weight||''}" placeholder="12.5" step="0.1" min="0" />
        </div>
        <div class="form-group span-2">
          <label>Medical / Care Notes</label>
          <textarea id="f-notes" placeholder="Allergies, medications, feeding instructions, temperament…">${p.notes||''}</textarea>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="save-pet-btn">Save Dog</button>
      </div>
    `;
  }

  function getFormData() {
    return {
      name: document.getElementById('f-name').value,
      owner_id: document.getElementById('f-owner').value,
      species: document.getElementById('f-species').value,
      breed: document.getElementById('f-breed').value,
      age: document.getElementById('f-age').value || null,
      weight: document.getElementById('f-weight').value || null,
      notes: document.getElementById('f-notes').value,
    };
  }

  document.getElementById('add-pet-btn').addEventListener('click', () => {
    openModal('Add Dog', petForm());
    document.getElementById('save-pet-btn').addEventListener('click', async () => {
      await api.post('/pets', getFormData());
      closeModal(); showToast('Dog added ✓'); renderPets();
    });
  });

  document.getElementById('pets-body').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.edit-pet');
    const delBtn = e.target.closest('.del-pet');
    if (editBtn) {
      const p = pets.find(x => x.id === editBtn.dataset.id);
      openModal('Edit Dog', petForm(p));
      document.getElementById('save-pet-btn').addEventListener('click', async () => {
        await api.put('/pets/' + p.id, getFormData());
        closeModal(); showToast('Dog updated ✓'); renderPets();
      });
    }
    if (delBtn) {
      if (confirm('Delete this dog profile?')) {
        await api.delete('/pets/' + delBtn.dataset.id);
        showToast('Dog removed'); renderPets();
      }
    }
  });
}
