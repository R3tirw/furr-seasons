async function renderSettings() {
  const page = document.getElementById('page-settings');

  page.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Settings</div><div class="page-sub">Export data and manage your facility</div></div>
    </div>

    <div class="full-card" style="max-width:640px">
      <div class="card-header"><div class="card-title">📊 Export Data</div></div>
      <div style="padding:22px">
        <p style="font-size:13px;color:var(--text2);margin-bottom:20px">
          Export your data as an Excel file (.xlsx). Each sheet includes linked owner and dog information — no cross-referencing needed.
        </p>

        <div style="margin-bottom:16px">
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--text2)">Date Range (optional)</label>
          <div style="display:flex;gap:10px;margin-top:6px;flex-wrap:wrap">
            <input type="date" id="exp-from" style="padding:8px 12px;border:1.5px solid var(--border);border-radius:7px;font-size:13px" />
            <span style="align-self:center;color:var(--text2)">to</span>
            <input type="date" id="exp-to" style="padding:8px 12px;border:1.5px solid var(--border);border-radius:7px;font-size:13px" />
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          ${[
            {type:'owners',label:'👤 Owners',desc:'All owners with linked dogs'},
            {type:'pets',label:'🐕 Dogs',desc:'All dog profiles with vaccination records'},
            {type:'bookings',label:'📅 Bookings',desc:'All bookings with owner and room data'},
            {type:'invoices',label:'🧾 Invoices',desc:'All invoices with line items'},
            {type:'all',label:'📦 Full Export',desc:'Everything in one file'},
          ].map(e=>`
            <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:16px">
              <div style="font-weight:600;font-size:14px;margin-bottom:4px">${e.label}</div>
              <div style="font-size:12px;color:var(--text2);margin-bottom:12px">${e.desc}</div>
              <button class="btn btn-navy export-btn" data-type="${e.type}">Download .xlsx</button>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  page.querySelectorAll('.export-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const from = document.getElementById('exp-from').value;
      const to = document.getElementById('exp-to').value;
      let url = `/api/export/${type}`;
      if(from && to) url += `?from=${from}&to=${to}`;
      window.location.href = url;
      showToast('Downloading…');
    });
  });
}
