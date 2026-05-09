async function doLogin() {
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('error-msg');
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  if (!username || !password) {
    err.textContent = 'Please enter both fields.';
    err.style.display = 'block';
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  err.style.display = 'none';
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ username, password }),
    });
    const data = await r.json();
    if (r.ok) {
      window.location.href = '/';
    } else {
      err.textContent = data.error || 'Login failed.';
      err.style.display = 'block';
    }
  } catch(e) {
    err.textContent = 'Network error. Please try again.';
    err.style.display = 'block';
  }
  btn.disabled = false;
  btn.textContent = 'Sign In';
}

document.getElementById('login-btn').addEventListener('click', doLogin);
document.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
