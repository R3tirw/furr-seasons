const pages = {
  dashboard: renderDashboard,
  bookings:  renderBookings,
  calendar:  renderCalendar,
  pets:      renderPets,
  owners:    renderOwners,
  invoices:  renderInvoices,
  staff:     renderStaff,
  settings:  renderSettings,
};

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('visible');
}

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  document.querySelector(`.nav-link[data-page="${page}"]`)?.classList.add('active');
  closeSidebar();
  if(pages[page]) pages[page]();
}

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => navigateTo(link.dataset.page));
});

document.getElementById('hamburger').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('visible');
});
document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});
  window.location.href='/login';
});

document.getElementById('today-date').textContent = new Date().toLocaleDateString('en-IN',{
  weekday:'short',day:'numeric',month:'short',year:'numeric'
});

navigateTo('dashboard');
