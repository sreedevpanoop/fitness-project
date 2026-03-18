/* dashboard.js – Navigation hub session guard, greeting, and profile editor */

const userJSON = sessionStorage.getItem('user');
if (!userJSON) { window.location.href = 'index.html'; }
const currentUser = JSON.parse(userJSON || '{}');

let profileGender = 'Male';

function setProfileGender(g) {
    profileGender = g;
    document.getElementById('p-g-male').classList.toggle('active', g === 'Male');
    document.getElementById('p-g-female').classList.toggle('active', g === 'Female');
}

document.addEventListener('DOMContentLoaded', () => {
    const nameEl = document.getElementById('username-display');
    const greet  = document.getElementById('dash-greeting');

    if (currentUser.isGuest) {
        nameEl.textContent = 'Guest';
        greet.textContent  = 'Explore our AI-powered fitness tools as a guest';
        document.getElementById('user-avatar-initial').textContent = '?';
    } else {
        const name = currentUser.display_name || currentUser.username.split('@')[0];
        nameEl.textContent = name;
        document.getElementById('user-avatar-initial').textContent = name.charAt(0).toUpperCase();

        const hr = new Date().getHours();
        const salutation = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
        greet.textContent = `${salutation}, ${name}! Choose a prediction tool below.`;

        // Pre-load profile data for the dropdown
        loadProfile();
    }

    // Animate cards in
    document.querySelectorAll('.dash-card').forEach((card, i) => {
        card.style.animationDelay = `${i * 0.12}s`;
        card.classList.add('card-animate');
    });
});

async function loadProfile() {
    try {
        const res  = await fetch(`/api/user/profile?email=${encodeURIComponent(currentUser.username)}`);
        const data = await res.json();
        if (!data.success) return;
        if (data.age)    document.getElementById('p-age').value    = data.age;
        if (data.height) document.getElementById('p-height').value = data.height;
        if (data.weight) document.getElementById('p-weight').value = data.weight;
        if (data.gender) setProfileGender(data.gender);
    } catch { /* ignore */ }
}

async function saveProfile() {
    const age    = document.getElementById('p-age').value;
    const height = document.getElementById('p-height').value;
    const weight = document.getElementById('p-weight').value;

    const txt  = document.getElementById('save-profile-text');
    const ldr  = document.getElementById('save-profile-loader');
    const stat = document.getElementById('profile-status');
    const btn  = document.getElementById('btn-save-profile');

    btn.disabled = true;
    txt.classList.add('hidden');
    ldr.classList.remove('hidden');
    stat.textContent = '';

    try {
        const body = { email: currentUser.username, gender: profileGender };
        if (age)    body.age    = parseFloat(age);
        if (height) body.height = parseFloat(height);
        if (weight) body.weight = parseFloat(weight);

        const res  = await fetch('/api/user/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.success) {
            stat.textContent = '✅ Saved!';
            stat.style.color = 'var(--success)';
        } else {
            stat.textContent = '❌ ' + (data.error || 'Save failed.');
            stat.style.color = 'var(--danger)';
        }
    } catch {
        stat.textContent = '❌ Could not reach server.';
        stat.style.color = 'var(--danger)';
    } finally {
        btn.disabled = false;
        txt.classList.remove('hidden');
        ldr.classList.add('hidden');
        setTimeout(() => { stat.textContent = ''; }, 3000);
    }
}

// ── UI Interactions ───────────────────────────────────────────────────────────
function toggleUserMenu() {
    const menu = document.getElementById('user-menu');
    menu.classList.toggle('active');
}

// Close dropdown if clicked outside
document.addEventListener('click', (e) => {
    const userBadge = document.getElementById('user-badge');
    const userMenu  = document.getElementById('user-menu');
    // If the click is not inside the menu, and not on the badge itself
    if (userMenu && userMenu.classList.contains('active')) {
        // Also ensure we didn't just click a button that opens a modal
        const isModalTrigger = e.target.closest('button[onclick^="open"]');
        if (!userMenu.contains(e.target) && !userBadge.contains(e.target) && !isModalTrigger) {
            userMenu.classList.remove('active');
        }
    }
});

// ── Modals (Help & Report) ────────────────────────────────────────────────────
function openHelpModal(e) {
    if (e) e.stopPropagation();
    document.getElementById('user-menu').classList.remove('active');
    setTimeout(() => {
        document.getElementById('help-modal').classList.remove('hidden');
    }, 50);
}

function openReportModal(e) {
    if (e) e.stopPropagation();
    document.getElementById('user-menu').classList.remove('active');
    setTimeout(() => {
        document.getElementById('report-modal').classList.remove('hidden');
        document.getElementById('report-err').classList.add('hidden');
        document.getElementById('report-succ').classList.add('hidden');
        document.getElementById('report-form').reset();
    }, 50);
}

function closeModals() {
    document.getElementById('help-modal').classList.add('hidden');
    document.getElementById('report-modal').classList.add('hidden');
}

async function submitReport(e) {
    e.preventDefault();
    const type = document.getElementById('r-type').value;
    const desc = document.getElementById('r-desc').value.trim();
    if (!desc) return;

    const btn = document.getElementById('btn-submit-report');
    const btext = document.getElementById('report-btn-text');
    const bload = document.getElementById('report-loader');
    const errEl = document.getElementById('report-err');
    const sucEl = document.getElementById('report-succ');

    btn.disabled = true;
    btext.classList.add('hidden');
    bload.classList.remove('hidden');
    errEl.classList.add('hidden');
    sucEl.classList.add('hidden');

    try {
        const res = await fetch('/api/report_issue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: currentUser.username, type, description: desc })
        });
        const data = await res.json();
        
        if (data.success) {
            sucEl.classList.remove('hidden');
            document.getElementById('report-form').reset();
            setTimeout(closeModals, 2000);
        } else {
            errEl.textContent = data.error || 'Failed to submit report.';
            errEl.classList.remove('hidden');
        }
    } catch {
        errEl.textContent = 'Could not reach server.';
        errEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btext.classList.remove('hidden');
        bload.classList.add('hidden');
    }
}

function logout() {
    sessionStorage.removeItem('user');
    window.location.href = 'index.html';
}
