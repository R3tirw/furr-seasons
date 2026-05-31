async function renderPets() {
  const page = document.getElementById('page-pets');
  const [pets, owners] = await Promise.all([api.get('/pets'), api.get('/owners')]);
  if(!pets) return;

  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">🐕 Dogs</div>
        <div class="page-sub">${pets.length} registered</div>
      </div>
      <div class="action-row">
        <input class="search-input" id="pet-search" placeholder="Search name, breed…" />
        <button class="btn btn-primary" id="add-pet-btn">+ Add Dog</button>
      </div>
    </div>
    <div class="full-card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Breed</th><th>Age</th><th>Weight</th><th>Owner</th><th>Vaccinations</th><th>Notes</th><th></th></tr></thead>
          <tbody id="pets-body"></tbody>
        </table>
      </div>
    </div>
  `;

  function vaccBadge(pet) {
    const warns = vaccinationWarnings(pet);
    if(warns.length) return `<span style="color:#FF8C00;font-size:11px">⚠ ${warns.join(', ')}</span>`;
    const lines = [];
    if(pet.arv_vaccinated) lines.push('ARV ✓');
    if(pet.kc_vaccinated) lines.push('KC ✓');
    return lines.length ? `<span style="color:var(--success);font-size:11px">${lines.join(' · ')}</span>` : '<span style="color:var(--text2);font-size:11px">—</span>';
  }

  function renderRows(list) {
    const tbody = document.getElementById('pets-body');
    if(!list.length){ tbody.innerHTML='<tr><td colspan="8"><div class="empty-state"><div class="empty-state-icon">🐶</div><p>No dogs yet</p></div></td></tr>'; return; }
    tbody.innerHTML = list.map(p=>`<tr>
      <td><b>${p.name}</b>${p.special_instructions?'<br><span style="font-size:10px;color:#FF8C00">⚠ Special instructions</span>':''}</td>
      <td>${p.breed||'—'}</td>
      <td>${p.age?p.age+' yr'+(p.age>1?'s':''):'—'}</td>
      <td>${p.weight?p.weight+' kg':'—'}</td>
      <td>${p.owner_name||'—'}<br><span style="font-size:11px;color:var(--text2)">${p.owner_phone||''}</span></td>
      <td>${vaccBadge(p)}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text2)">${p.notes||'—'}</td>
      <td><div style="display:flex;gap:4px">
        <button class="btn-icon edit-pet" data-id="${p.id}">✏️</button>
        <button class="btn-icon del-pet" data-id="${p.id}">🗑️</button>
      </div></td>
    </tr>`).join('');
  }

  renderRows(pets);

  document.getElementById('pet-search').addEventListener('input', e => {
    const q=e.target.value.toLowerCase();
    renderRows(pets.filter(p=>p.name.toLowerCase().includes(q)||(p.breed||'').toLowerCase().includes(q)));
  });

  const dogBreeds=['Labrador','Golden Retriever','German Shepherd','Beagle','Poodle','Bulldog','Rottweiler','Boxer',
    'Dachshund','Shih Tzu','Pomeranian','Doberman','Dalmatian','Husky','Malamute','Great Dane','Saint Bernard',
    'Border Collie','Australian Shepherd','Cocker Spaniel','Cavalier King Charles','Bichon Frise','Maltese',
    'Yorkshire Terrier','Miniature Schnauzer','Lhasa Apso','Shiba Inu','Samoyed','French Bulldog',
    'Boston Terrier','Pug','Chihuahua','Weimaraner','Vizsla','Rhodesian Ridgeback','Indie / Mixed','Other'];

  function petForm(p={}) {
    const warns = vaccinationWarnings(p);
    return `
      ${warns.length?`<div class="capacity-warning" style="margin-bottom:14px">⚠ ${warns.join('<br>')}</div>`:''}
      <div class="form-grid">
        <div class="form-group"><label>Dog's Name</label><input type="text" id="f-name" value="${p.name||''}" required /></div>
        <div class="form-group"><label>Owner</label>
          <select id="f-owner">
            <option value="">Select owner…</option>
            ${(owners||[]).map(o=>`<option value="${o.id}" ${p.owner_id===o.id?'selected':''}>${o.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Breed</label>
          <input type="text" id="f-breed" value="${p.breed||''}" list="breed-list" placeholder="Type or pick…" autocomplete="off" />
          <datalist id="breed-list">${dogBreeds.map(b=>`<option value="${b}">`).join('')}</datalist>
        </div>
        <div class="form-group"><label>Gender</label>
          <select id="f-species">
            <option value="Dog - Male" ${p.species==='Dog - Male'?'selected':''}>Male</option>
            <option value="Dog - Female" ${p.species==='Dog - Female'?'selected':''}>Female</option>
            <option value="Dog" ${(!p.species||p.species==='Dog')?'selected':''}>Unknown</option>
          </select>
        </div>
        <div class="form-group"><label>Age (years)</label><input type="number" id="f-age" value="${p.age||''}" min="0" max="30" /></div>
        <div class="form-group"><label>Weight (kg)</label><input type="number" id="f-weight" value="${p.weight||''}" step="0.1" min="0" /></div>
        <div class="form-group span-2"><label>Care Notes</label><textarea id="f-notes">${p.notes||''}</textarea></div>
        <div class="form-group span-2"><label>⚠ Special Instructions</label><textarea id="f-special" placeholder="Feeding times, medication, handling notes, behaviour alerts…">${p.special_instructions||''}</textarea></div>
      </div>

      <div style="background:var(--bg2);border-radius:8px;padding:14px;margin-top:8px">
        <div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.06em">Vaccination Records</div>
        <div class="form-grid">
          <div class="form-group"><label>ARV Vaccinated</label>
            <select id="f-arv"><option value="0" ${!p.arv_vaccinated?'selected':''}>No</option><option value="1" ${p.arv_vaccinated?'selected':''}>Yes</option></select>
          </div>
          <div class="form-group"><label>ARV Expiry Date</label><input type="date" id="f-arv-exp" value="${p.arv_expiry||''}" /></div>
          <div class="form-group"><label>Kennel Cough Vaccinated</label>
            <select id="f-kc"><option value="0" ${!p.kc_vaccinated?'selected':''}>No</option><option value="1" ${p.kc_vaccinated?'selected':''}>Yes</option></select>
          </div>
          <div class="form-group"><label>Kennel Cough Expiry</label><input type="date" id="f-kc-exp" value="${p.kc_expiry||''}" /></div>
        </div>
      </div>

      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="save-pet-btn">Save Dog</button>
      </div>`;
  }

  function getFormData() {
    return {
      name:document.getElementById('f-name').value,
      owner_id:document.getElementById('f-owner').value,
      species:document.getElementById('f-species').value,
      breed:document.getElementById('f-breed').value,
      age:document.getElementById('f-age').value||null,
      weight:document.getElementById('f-weight').value||null,
      notes:document.getElementById('f-notes').value,
      special_instructions:document.getElementById('f-special').value,
      arv_vaccinated:document.getElementById('f-arv').value==='1',
      arv_expiry:document.getElementById('f-arv-exp').value||null,
      kc_vaccinated:document.getElementById('f-kc').value==='1',
      kc_expiry:document.getElementById('f-kc-exp').value||null,
    };
  }

  document.getElementById('add-pet-btn').addEventListener('click', () => {
    openModal('Add Dog', petForm());
    document.getElementById('save-pet-btn').addEventListener('click', async () => {
      const d=getFormData(); if(!d.name){showToast('Please enter a name','warn');return;}
      await api.post('/pets',d); closeModal(); showToast('Dog added ✓'); renderPets();
    });
  });

  document.getElementById('pets-body').addEventListener('click', async e => {
    const editBtn=e.target.closest('.edit-pet');
    const delBtn=e.target.closest('.del-pet');
    if(editBtn){
      const p=pets.find(x=>x.id===editBtn.dataset.id);
      openModal('Edit Dog',petForm(p));
      document.getElementById('save-pet-btn').addEventListener('click',async()=>{
        const d=getFormData(); if(!d.name){showToast('Please enter a name','warn');return;}
        await api.put('/pets/'+p.id,d); closeModal(); showToast('Dog updated ✓'); renderPets();
      });
    }
    if(delBtn){
      if(confirm('Delete this dog profile?')){ await api.delete('/pets/'+delBtn.dataset.id); showToast('Dog removed'); renderPets(); }
    }
  });
}
