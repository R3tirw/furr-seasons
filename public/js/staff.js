async function renderStaff() {
  const page = document.getElementById('page-staff');
  const staff = await api.get('/staff');
  if(!staff) return;

  page.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Staff</div><div class="page-sub">${staff.length} team members</div></div>
      <div class="action-row">
        <input class="search-input" id="staff-search" placeholder="Search name, role…" />
        <button class="btn btn-primary" id="add-staff-btn">+ Add Staff</button>
      </div>
    </div>
    <div class="full-card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Email</th><th>Shift</th><th>Joined</th><th></th></tr></thead>
          <tbody id="staff-body"></tbody>
        </table>
      </div>
    </div>
  `;

  function renderRows(list) {
    const tbody=document.getElementById('staff-body');
    if(!list.length){tbody.innerHTML='<tr><td colspan="7"><div class="empty-state"><div class="empty-state-icon">👥</div><p>No staff yet</p></div></td></tr>';return;}
    tbody.innerHTML=list.map(s=>`<tr>
      <td><b>${s.name}</b></td><td>${s.role||'—'}</td><td>${s.phone||'—'}</td>
      <td>${s.email||'—'}</td><td>${s.shift||'—'}</td><td>${formatDate(s.created_at)}</td>
      <td><div style="display:flex;gap:4px">
        <button class="btn-icon edit-staff" data-id="${s.id}">✏️</button>
        <button class="btn-icon del-staff" data-id="${s.id}">🗑️</button>
      </div></td>
    </tr>`).join('');
  }
  renderRows(staff);

  document.getElementById('staff-search').addEventListener('input',e=>{
    const q=e.target.value.toLowerCase();
    renderRows(staff.filter(s=>s.name.toLowerCase().includes(q)||(s.role||'').toLowerCase().includes(q)));
  });

  function staffForm(s={}) {
    return `<div class="form-grid">
      <div class="form-group"><label>Full Name</label><input type="text" id="f-name" value="${s.name||''}" required /></div>
      <div class="form-group"><label>Role</label>
        <select id="f-role">${['Manager','Caretaker','Dog Trainer','Groomer','Vet Assistant','Receptionist','Other'].map(r=>`<option value="${r}" ${s.role===r?'selected':''}>${r}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label>Phone</label><input type="tel" id="f-phone" value="${s.phone||''}" /></div>
      <div class="form-group"><label>Email</label><input type="email" id="f-email" value="${s.email||''}" /></div>
      <div class="form-group span-2"><label>Shift</label>
        <select id="f-shift">${['Morning (6am–2pm)','Afternoon (2pm–10pm)','Night (10pm–6am)','Full Day','Flexible'].map(sh=>`<option value="${sh}" ${s.shift===sh?'selected':''}>${sh}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="save-staff-btn">Save</button>
    </div>`;
  }

  function getFormData(){return{name:document.getElementById('f-name').value,role:document.getElementById('f-role').value,phone:document.getElementById('f-phone').value,email:document.getElementById('f-email').value,shift:document.getElementById('f-shift').value};}

  document.getElementById('add-staff-btn').addEventListener('click',()=>{
    openModal('Add Staff Member',staffForm());
    document.getElementById('save-staff-btn').addEventListener('click',async()=>{
      const d=getFormData();if(!d.name){showToast('Please enter a name','warn');return;}
      await api.post('/staff',d);closeModal();showToast('Staff added ✓');renderStaff();
    });
  });

  document.getElementById('staff-body').addEventListener('click',async e=>{
    const editBtn=e.target.closest('.edit-staff');
    const delBtn=e.target.closest('.del-staff');
    if(editBtn){
      const s=staff.find(x=>x.id===editBtn.dataset.id);
      openModal('Edit Staff Member',staffForm(s));
      document.getElementById('save-staff-btn').addEventListener('click',async()=>{
        const d=getFormData();if(!d.name){showToast('Please enter a name','warn');return;}
        await api.put('/staff/'+s.id,d);closeModal();showToast('Staff updated ✓');renderStaff();
      });
    }
    if(delBtn){if(confirm('Remove staff member?')){await api.delete('/staff/'+delBtn.dataset.id);showToast('Staff removed');renderStaff();}}
  });
}
