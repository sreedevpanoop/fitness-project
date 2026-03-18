/* admin.js – Admin dashboard: session guard, stats, Chart.js charts, user management */

const ADMIN_TOKEN_KEY = 'admin_token';

// Chart instances (kept to allow destroy/re-render on refresh)
let chartSignups   = null;
let chartModels    = null;
let chartTopUsers  = null;
let chartPredDaily = null;

// Full user list for filtering
let allUsers = [];

// ── Session Guard ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (!token) {
        window.location.href = 'index.html';
        return;
    }
    // Display admin name from session
    const userData = JSON.parse(sessionStorage.getItem('user') || '{}');
    const nameEl   = document.getElementById('admin-name-display');
    if (nameEl && userData.display_name) {
        nameEl.textContent = userData.display_name;
    }
    loadAdminData();
});

function adminLogout() {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem('user');
    window.location.href = 'index.html';
}

// ── Load All Data ─────────────────────────────────────────────────────────────
async function loadAdminData() {
    const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    const headers = { 'X-Admin-Token': token };

    try {
        // Parallel fetch
        const [statsRes, usersRes, reportsRes] = await Promise.all([
            fetch('/api/admin/stats', { headers }),
            fetch('/api/admin/users', { headers }),
            fetch('/api/admin/reports', { headers })
        ]);
        const stats = await statsRes.json();
        const users = await usersRes.json();
        const reports = await reportsRes.json();

        if (stats.success) renderStats(stats);
        if (users.success) renderUsers(users);
        if (reports.success) renderReports(reports.reports);
    } catch (e) {
        console.error('Admin data load error:', e);
    }
}

// ── Stat Cards ────────────────────────────────────────────────────────────────
function renderStats(stats) {
    document.getElementById('stat-total-users').textContent = stats.total_users  || 0;
    document.getElementById('stat-total-preds').textContent = stats.total_predictions || 0;
    document.getElementById('stat-verified').textContent    = stats.verified_users || 0;
    const avg = stats.total_users > 0
        ? (stats.total_predictions / stats.total_users).toFixed(1) : '0';
    document.getElementById('stat-avg-preds').textContent = avg;

    renderSignupsChart(stats.signup_by_date      || {});
    renderModelsChart(stats.model_prediction_counts || {});
    renderTopUsersChart(stats.top_users          || []);
    renderPredsDailyChart(stats.predictions_by_date || {});
    renderRecentLogins(stats.recent_logins        || []);
}

// ── Chart Helpers ─────────────────────────────────────────────────────────────
const CHART_DEFAULTS = {
    color: '#e6edf3',
    gridColor: 'rgba(255,255,255,0.06)',
    font: { family: 'Outfit', size: 12 }
};

function fillDateRange(dataMap, days = 30) {
    const labels = [], values = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        labels.push(key.slice(5)); // MM-DD
        values.push(dataMap[key] || 0);
    }
    return { labels, values };
}

// Daily Signups – Line chart
function renderSignupsChart(signupMap) {
    const { labels, values } = fillDateRange(signupMap, 30);
    const ctx = document.getElementById('chart-signups').getContext('2d');
    if (chartSignups) chartSignups.destroy();
    chartSignups = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'New Users',
                data: values,
                fill: true,
                borderColor: '#00e5ff',
                backgroundColor: 'rgba(0,229,255,0.08)',
                tension: 0.4,
                pointRadius: 3,
                pointBackgroundColor: '#00e5ff'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: CHART_DEFAULTS.color, font: CHART_DEFAULTS.font, maxRotation: 45 }, grid: { color: CHART_DEFAULTS.gridColor } },
                y: { ticks: { color: CHART_DEFAULTS.color, font: CHART_DEFAULTS.font, stepSize: 1, precision: 0 }, grid: { color: CHART_DEFAULTS.gridColor }, beginAtZero: true }
            }
        }
    });
}

// Model Usage – Doughnut chart
function renderModelsChart(counts) {
    const ctx = document.getElementById('chart-models').getContext('2d');
    if (chartModels) chartModels.destroy();
    const labels = ['Recovery', 'Calorie', 'Macro'];
    const data   = [counts.recovery || 0, counts.calorie || 0, counts.macro || 0];
    const colors = ['#00e5ff', '#f97316', '#10b981'];
    chartModels = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data, backgroundColor: colors, borderColor: 'rgba(255,255,255,0.05)', borderWidth: 2, hoverOffset: 8 }]
        },
        options: {
            responsive: true, maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.parsed} predictions` } }
            },
            cutout: '68%'
        }
    });
    // Custom legend
    const legendEl = document.getElementById('chart-models-legend');
    if (legendEl) {
        legendEl.innerHTML = labels.map((l, i) => `
          <div class="legend-item">
            <span class="legend-dot" style="background:${colors[i]}"></span>
            <span>${l}</span>
            <span class="legend-val">${data[i]}</span>
          </div>`).join('');
    }
}

// Top Users – Horizontal Bar chart
function renderTopUsersChart(topUsers) {
    if (!topUsers.length) return;
    const ctx    = document.getElementById('chart-topusers').getContext('2d');
    const labels = topUsers.map(u => u.email.split('@')[0]);
    const values = topUsers.map(u => u.prediction_count || 0);
    if (chartTopUsers) chartTopUsers.destroy();
    chartTopUsers = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Predictions',
                data: values,
                backgroundColor: 'rgba(168,85,247,0.55)',
                borderColor: '#a855f7',
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: CHART_DEFAULTS.color, font: CHART_DEFAULTS.font, precision: 0 }, grid: { color: CHART_DEFAULTS.gridColor }, beginAtZero: true },
                y: { ticks: { color: CHART_DEFAULTS.color, font: CHART_DEFAULTS.font } , grid: { display: false } }
            }
        }
    });
}

// Daily Predictions – Line chart
function renderPredsDailyChart(predMap) {
    const { labels, values } = fillDateRange(predMap, 30);
    const ctx = document.getElementById('chart-preds-daily').getContext('2d');
    if (chartPredDaily) chartPredDaily.destroy();
    chartPredDaily = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Predictions',
                data: values,
                fill: true,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16,185,129,0.08)',
                tension: 0.4,
                pointRadius: 3,
                pointBackgroundColor: '#10b981'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: CHART_DEFAULTS.color, font: CHART_DEFAULTS.font, maxRotation: 45 }, grid: { color: CHART_DEFAULTS.gridColor } },
                y: { ticks: { color: CHART_DEFAULTS.color, font: CHART_DEFAULTS.font, precision: 0 }, grid: { color: CHART_DEFAULTS.gridColor }, beginAtZero: true }
            }
        }
    });
}

// ── Recent Logins Table ───────────────────────────────────────────────────────
let allRecentLogins = [];

function renderRecentLogins(logins, showAll = false) {
    if (logins) allRecentLogins = logins;
    const loginsToRender = showAll ? allRecentLogins : allRecentLogins.slice(0, 10);
    const tbody = document.getElementById('logins-table-body');
    if (!allRecentLogins.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="table-loading">No logins recorded yet.</td></tr>';
        return;
    }
    
    let html = loginsToRender.map((l, i) => `
      <tr>
        <td class="row-num">${i + 1}</td>
        <td class="row-user">
          <div class="user-avatar">${(l.email || '?')[0].toUpperCase()}</div>
          <span>${l.email || 'Unknown'}</span>
        </td>
        <td class="row-date">${formatDate(l.logged_in_at)}</td>
        <td style="color:var(--text-3);font-size:13px;">${l.ip_address || '—'}</td>
      </tr>`).join('');
      
    if (!showAll && allRecentLogins.length > 10) {
        html += `
        <tr>
            <td colspan="4" style="text-align: center; padding: 12px; border-bottom: none;">
                <button onclick="renderRecentLogins(null, true)" style="background: transparent; border: 1px solid rgba(255,255,255,0.1); color: #00e5ff; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-family: 'Outfit', sans-serif; font-size: 13px; transition: all 0.3s;" onmouseover="this.style.background='rgba(0,229,255,0.1)'" onmouseout="this.style.background='transparent'">Show More (${allRecentLogins.length - 10} remaining)</button>
            </td>
        </tr>`;
    } else if (showAll && allRecentLogins.length > 10) {
        html += `
        <tr>
            <td colspan="4" style="text-align: center; padding: 12px; border-bottom: none;">
                <button onclick="renderRecentLogins(null, false)" style="background: transparent; border: 1px solid rgba(255,255,255,0.1); color: #8b949e; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-family: 'Outfit', sans-serif; font-size: 13px; transition: all 0.3s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">Show Less</button>
            </td>
        </tr>`;
    }
    
    tbody.innerHTML = html;
}

// ── Users Table ───────────────────────────────────────────────────────────────
function renderUsers(data) {
    allUsers = data.users || [];
    renderUsersTable(allUsers);
}

function renderUsersTable(users) {
    const tbody = document.getElementById('admin-table-body');
    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="table-loading">No users registered yet.</td></tr>';
        return;
    }
    tbody.innerHTML = users.map((u, i) => `
      <tr class="user-row" id="row-${encodeURIComponent(u.email)}" onclick="toggleUserDetails('${encodeURIComponent(u.email)}')">
        <td class="row-num">${i + 1}</td>
        <td class="row-user">
          <div class="user-avatar">${(u.email || '?')[0].toUpperCase()}</div>
          <span>${u.email}</span>
        </td>
        <td>
          <span class="verified-badge ${u.is_verified ? 'verified' : 'unverified'}">
            ${u.is_verified ? '✓ Verified' : '✗ Unverified'}
          </span>
        </td>
        <td class="row-date">${formatDate(u.joined)}</td>
        <td class="row-date">${u.last_login === 'Never' ? 'Never' : formatDate(u.last_login)}</td>
        <td class="row-preds"><span class="pred-badge">${u.prediction_count}</span></td>
        <td>
          <button class="btn-delete" onclick="event.stopPropagation(); deleteUser('${u.email}')">Delete</button>
        </td>
      </tr>
      <tr class="user-details-row" id="details-${encodeURIComponent(u.email)}" style="display: none; background: rgba(255, 255, 255, 0.02);">
        <td colspan="7" style="padding: 16px 24px; border-top: none;">
          <div style="display: flex; gap: 32px; font-size: 13px; color: var(--text-2);">
            <div><strong style="color: var(--text-1);">Age:</strong> ${u.age || '—'}</div>
            <div><strong style="color: var(--text-1);">Gender:</strong> ${u.gender || '—'}</div>
            <div><strong style="color: var(--text-1);">Height:</strong> ${u.height ? u.height + ' cm' : '—'}</div>
            <div><strong style="color: var(--text-1);">Weight:</strong> ${u.weight ? u.weight + ' kg' : '—'}</div>
          </div>
        </td>
      </tr>`).join('');
}

function toggleUserDetails(encodedEmail) {
    const detailsRow = document.getElementById(`details-${encodedEmail}`);
    if (detailsRow) {
        detailsRow.style.display = detailsRow.style.display === 'none' ? 'table-row' : 'none';
    }
}

function filterUsers(query) {
    const q = query.toLowerCase().trim();
    if (!q) { renderUsersTable(allUsers); return; }
    renderUsersTable(allUsers.filter(u => u.email.toLowerCase().includes(q)));
}

// ── Delete User ───────────────────────────────────────────────────────────────
async function deleteUser(email) {
    if (!confirm(`Delete user "${email}"?\nAll their prediction history will also be removed. This cannot be undone.`)) return;
    const token  = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    const errEl  = document.getElementById('admin-table-error');
    errEl.classList.add('hidden');

    try {
        const res  = await fetch('/api/admin/delete_user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (data.success) {
            const encodedId = encodeURIComponent(email);
            const row = document.getElementById(`row-${encodedId}`);
            if (row) {
                row.style.transition = 'opacity 0.4s, transform 0.4s';
                row.style.opacity    = '0';
                row.style.transform  = 'translateX(40px)';
                setTimeout(() => loadAdminData(), 500);
            }
        } else {
            errEl.textContent = data.error || 'Failed to delete user.';
            errEl.classList.remove('hidden');
        }
    } catch {
        errEl.textContent = 'Server error while deleting user.';
        errEl.classList.remove('hidden');
    }
}

// ── Util ──────────────────────────────────────────────────────────────────────
function formatDate(iso) {
    if (!iso || iso === 'Never') return 'Never';
    try {
        return new Date(iso).toLocaleString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch { return iso; }
}

// ── Reports Table ─────────────────────────────────────────────────────────────
function renderReports(reports) {
    const tbody = document.getElementById('reports-table-body');
    if (!tbody) return; // Prevent errors if on a different admin tab
    
    if (!reports || !reports.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-loading">No reports submitted yet.</td></tr>';
        return;
    }
    
    tbody.innerHTML = reports.map((r, i) => `
      <tr>
        <td class="row-num">${i + 1}</td>
        <td class="row-user">
          <div class="user-avatar">${(r.email && r.email !== "Guest" ? r.email[0] : '?').toUpperCase()}</div>
          <span>${r.email || 'Guest'}</span>
        </td>
        <td><span style="background: rgba(168,85,247,0.15); color: #a855f7; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 500;">${r.type}</span></td>
        <td style="color:var(--text-2); font-size: 13px; max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${r.description}">${r.description}</td>
        <td class="row-date">${formatDate(r.created_at)}</td>
      </tr>`).join('');
}
