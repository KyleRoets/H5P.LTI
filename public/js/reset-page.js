// "Choose a new password" page opened from an admin-created reset link.
const form = document.getElementById('reset-form');
const err = form.querySelector('.error');
const token = new URLSearchParams(location.search).get('token') || '';
history.replaceState(null, '', '/reset'); // keep the token out of the address bar and history

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  err.classList.add('hidden');
  const { password, confirm } = Object.fromEntries(new FormData(form));
  const fail = (m) => { err.textContent = m; err.classList.remove('hidden'); };
  if (password.length < 8) return fail('Your password must be at least 8 characters.');
  if (password !== confirm) return fail('The two passwords don\'t match.');
  const btn = form.querySelector('button');
  btn.disabled = true;
  try {
    const res = await fetch('/api/auth/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    form.classList.add('hidden');
    document.querySelector('.reset-card .help').classList.add('hidden');
    document.querySelector('.reset-card .done').classList.remove('hidden');
  } catch (ex) { fail(ex.message); btn.disabled = false; }
});
if (!token) { form.querySelector('button').disabled = true; err.textContent = 'This link is incomplete. Ask your admin for a new reset link.'; err.classList.remove('hidden'); }
