/* auth.js – Handles Gmail login, register, email verification, forgot password, guest flow */

const API = '';  // same origin

// ── Pending verification state (backed by sessionStorage so it survives refreshes) ──
function getPendingEmail() { return sessionStorage.getItem('pending_verify_email') || ''; }
function setPendingEmail(email) {
  if (email) sessionStorage.setItem('pending_verify_email', email);
  else sessionStorage.removeItem('pending_verify_email');
}

// ── Registration profile gender state ────────────────────────────────────────
let regGender = 'Male';
function setRegGender(g) {
  regGender = g;
  document.getElementById('reg-g-male').classList.toggle('active', g === 'Male');
  document.getElementById('reg-g-female').classList.toggle('active', g === 'Female');
}

// ── Panel management ──────────────────────────────────────────────────────────
function showTab(tab) {
  const panels = ['form-login', 'form-register', 'panel-verify', 'panel-forgot'];
  panels.forEach(id => document.getElementById(id).classList.add('hidden'));

  const divider  = document.getElementById('auth-divider');
  const guestBtn = document.getElementById('btn-guest');
  const footnote = document.querySelector('.auth-footnote');
  const tabs     = document.getElementById('auth-tabs');

  // Show auth tabs only for login/register
  const showingAuthForm = (tab === 'login' || tab === 'register');
  tabs.style.display    = showingAuthForm ? '' : 'none';
  divider.style.display = showingAuthForm ? '' : 'none';
  if (guestBtn)  guestBtn.style.display  = showingAuthForm ? '' : 'none';
  if (footnote)  footnote.style.display  = showingAuthForm ? '' : 'none';

  if (tab === 'login') {
    document.getElementById('form-login').classList.remove('hidden');
    document.getElementById('tab-login').classList.add('active');
    document.getElementById('tab-register').classList.remove('active');
  } else if (tab === 'register') {
    document.getElementById('form-register').classList.remove('hidden');
    document.getElementById('tab-login').classList.remove('active');
    document.getElementById('tab-register').classList.add('active');
    setPendingEmail('');  // Cancel any pending verification when going back to register
  } else if (tab === 'verify') {
    document.getElementById('panel-verify').classList.remove('hidden');
  } else if (tab === 'forgot') {
    document.getElementById('panel-forgot').classList.remove('hidden');
  }
  clearAlert();
}

// ── On page load: restore verify panel if a pending email is stored ───────────
document.addEventListener('DOMContentLoaded', function () {
  const pendingEmail = getPendingEmail();
  if (pendingEmail) {
    document.getElementById('verify-email-display').textContent = pendingEmail;
    showTab('verify');
  }
});

function showForgot() { showTab('forgot'); }

// ── Alert helpers ─────────────────────────────────────────────────────────────
function showAlert(msg, type = 'error') {
  const el = document.getElementById('auth-alert');
  el.textContent = msg;
  el.className   = `auth-alert ${type}`;
}

function clearAlert() {
  const el = document.getElementById('auth-alert');
  el.textContent = '';
  el.className   = 'auth-alert hidden';
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  const txt = btn.querySelector('.btn-text');
  const ldr = btn.querySelector('.btn-loader');
  if (loading) {
    txt.classList.add('hidden'); ldr.classList.remove('hidden'); btn.disabled = true;
  } else {
    txt.classList.remove('hidden'); ldr.classList.add('hidden'); btn.disabled = false;
  }
}

function isValidEmail(email) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  
  const allowedDomains = ["gmail.com", "yahoo.com", "ymail.com", "outlook.com", "hotmail.com", "live.com", "icloud.com", "me.com", "mac.com", "aol.com", "protonmail.com", "proton.me", "zoho.com"];
  const domain = email.split('@')[1].toLowerCase();
  return allowedDomains.includes(domain);
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  clearAlert();
  const email    = document.getElementById('login-email').value.trim().toLowerCase();
  const password = document.getElementById('login-pass').value;

  if (!email || !password) { showAlert('Please fill in all fields.'); return; }
  if (!isValidEmail(email)) { showAlert('Please enter a valid email address.'); return; }

  setLoading('btn-login', true);
  try {
    const res  = await fetch(`${API}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (data.success && data.pending_verification) {
      // Registration sent OTP — show verify panel
      setPendingEmail(data.email || email);
      document.getElementById('verify-email-display').textContent = getPendingEmail();
      showTab('verify');
      showAlert('A 6-digit code has been sent to ' + getPendingEmail() + '. Please check your inbox.', 'success');
    } else if (data.success) {
      // Direct login (admin or already verified edge case)
      if (data.role === 'admin') {
        sessionStorage.setItem('admin_token', data.token);
        sessionStorage.setItem('user', JSON.stringify({
          username:     data.username,
          display_name: data.display_name,
          isGuest:      false,
          isAdmin:      true
        }));
        showAlert('Welcome, Admin! Redirecting…', 'success');
        setTimeout(() => { window.location.href = 'admin.html'; }, 800);
      } else {
        sessionStorage.setItem('user', JSON.stringify({
          username:     data.username,
          display_name: data.display_name,
          isGuest:      false,
          isAdmin:      false
        }));
        showAlert('Welcome back, ' + data.display_name + '! Redirecting…', 'success');
        setTimeout(() => { window.location.href = 'dashboard.html'; }, 900);
      }
    } else if (data.pending_verification) {
      // Password matched but email unverified — show OTP panel
      setPendingEmail(data.email || email);
      document.getElementById('verify-email-display').textContent = getPendingEmail();
      showTab('verify');
      showAlert('Please verify your email. A new code has been sent to ' + getPendingEmail() + '.', 'success');
    } else {
      showAlert(data.error || 'Login failed.');
    }
  } catch {
    showAlert('Could not reach the server. Is it running?');
  } finally {
    setLoading('btn-login', false);
  }
}

// ── REGISTER ──────────────────────────────────────────────────────────────────
async function handleRegister(e) {
  e.preventDefault();
  clearAlert();
  const email    = document.getElementById('reg-email').value.trim().toLowerCase();
  const password = document.getElementById('reg-pass').value;
  const confirm  = document.getElementById('reg-confirm').value;

  if (!email || !password || !confirm) { showAlert('Please fill in all fields.'); return; }
  if (!isValidEmail(email))            { showAlert('Please enter a valid email address.'); return; }
  if (password !== confirm)            { showAlert('Passwords do not match.'); return; }
  if (password.length < 6)            { showAlert('Password must be at least 6 characters.'); return; }

  // Collect optional profile fields
  const ageVal    = document.getElementById('reg-age').value.trim();
  const heightVal = document.getElementById('reg-height').value.trim();
  const weightVal = document.getElementById('reg-weight').value.trim();

  const body = { email, password, gender: regGender };
  if (ageVal)    body.age    = parseFloat(ageVal);
  if (heightVal) body.height = parseFloat(heightVal);
  if (weightVal) body.weight = parseFloat(weightVal);

  setLoading('btn-register', true);
  try {
    const res  = await fetch(`${API}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (data.success && data.pending_verification) {
      // Registration succeeded — show OTP verification panel
      setPendingEmail(data.email || email);
      document.getElementById('verify-email-display').textContent = getPendingEmail();
      showTab('verify');
      showAlert('Check your inbox! Enter the 6-digit code sent to ' + getPendingEmail() + '.', 'success');
    } else if (data.success) {
      // Edge case: direct login without needing verification
      sessionStorage.setItem('user', JSON.stringify({
        username:     data.username,
        display_name: data.display_name,
        isGuest:      false,
        isAdmin:      false
      }));
      showAlert('Account created! Welcome to FitnessAGNT!', 'success');
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 900);
    } else {
      showAlert(data.error || 'Registration failed.');
    }
  } catch {
    showAlert('Could not reach the server. Is it running?');
  } finally {
    setLoading('btn-register', false);
  }
}

// ── VERIFY EMAIL ──────────────────────────────────────────────────────────────
async function handleVerifyCode() {
  clearAlert();
  const code  = document.getElementById('verify-code').value.trim();
  const email = getPendingEmail();
  if (!code || code.length !== 6) { showAlert('Please enter the 6-digit code.'); return; }
  if (!email) { showAlert('Session expired. Please register again.'); showTab('register'); return; }

  setLoading('btn-verify', true);
  try {
    const res  = await fetch(`${API}/api/verify_email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
    });
    const data = await res.json();

    if (data.success) {
      setPendingEmail('');  // Clear pending state on success
      sessionStorage.setItem('user', JSON.stringify({
        username:     data.username,
        display_name: data.display_name,
        isGuest:      false,
        isAdmin:      false
      }));
      showAlert('Email verified! Welcome to FitnessAGNT!', 'success');
      setTimeout(() => { window.location.replace('dashboard.html'); }, 1000);
    } else {
      showAlert(data.error || 'Verification failed.');
    }
  } catch {
    showAlert('Could not reach the server. Is it running?');
  } finally {
    setLoading('btn-verify', false);
  }
}

async function handleResendCode() {
  clearAlert();
  const email = getPendingEmail();
  if (!email) { showAlert('No email to resend to. Please register again.'); return; }
  try {
    const res  = await fetch(`${API}/api/resend_code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingVerifyEmail })
    });
    const data = await res.json();
    if (data.success) {
      showAlert('A new code has been sent to ' + pendingVerifyEmail + '.', 'success');
    } else {
      showAlert(data.error || 'Could not resend code. Please try again.');
    }
  } catch {
    showAlert('Could not reach the server. Please try again.');
  }
}

// ── FORGOT PASSWORD ───────────────────────────────────────────────────────────
async function handleForgotPassword() {
  clearAlert();
  const email = document.getElementById('forgot-email').value.trim().toLowerCase();
  if (!email)              { showAlert('Please enter your email.'); return; }
  if (!isValidEmail(email)) { showAlert('Please enter a valid email address.'); return; }

  setLoading('btn-forgot', true);
  try {
    const res  = await fetch(`${API}/api/forgot_password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (data.success) {
      showAlert('Reset link sent! Check your Gmail inbox (also check spam).', 'success');
      document.getElementById('forgot-email').value = '';
    } else {
      showAlert(data.error || 'Could not send reset email.');
    }
  } catch {
    showAlert('Could not reach the server. Is it running?');
  } finally {
    setLoading('btn-forgot', false);
  }
}

// ── GUEST ─────────────────────────────────────────────────────────────────────
function continueAsGuest() {
  sessionStorage.setItem('user', JSON.stringify({
    username: 'guest', display_name: 'Guest', isGuest: true, isAdmin: false
  }));
  window.location.href = 'dashboard.html';
}

// ── PASSWORD TOGGLE ───────────────────────────────────────────────────────────
function togglePw(id, btn) {
  const inp = document.getElementById(id);
  if (inp.type === 'password') { inp.type = 'text'; btn.textContent = 'Hide'; }
  else { inp.type = 'password'; btn.textContent = 'Show'; }
}
