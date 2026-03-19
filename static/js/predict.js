/* predict.js – Form logic, API call, result animation, history */

// ── Session guard ────────────────────────────────────────────────────────────
const userJSON = sessionStorage.getItem('user');
if (!userJSON) {
    window.location.replace('index.html');
}
const currentUser = JSON.parse(userJSON || '{}');

// ── bfcache guard ─────────────────────────────────────────────────────────────
window.addEventListener('pageshow', function (event) {
    if (event.persisted || (window.performance && window.performance.getEntriesByType('navigation')[0]?.type === 'back_forward')) {
        if (!sessionStorage.getItem('user')) {
            window.location.replace('index.html');
        }
    }
});

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const nameEl = document.getElementById('username-display');
    const logoutBtn = document.getElementById('btn-logout');

    if (currentUser.isGuest) {
        nameEl.textContent = 'Guest';
        logoutBtn.textContent = 'Exit';
    } else {
        nameEl.textContent = currentUser.display_name || currentUser.username.split('@')[0];
        loadUserProfile();
    }

    // Initialize range styles
    const dur = document.getElementById('f-duration');
    const intR = document.getElementById('f-intensity');
    updateRangeStyle(dur, 10, 180);
    updateRangeStyle(intR, 1, 10);

    loadHistory();
});

// ── Auth state ────────────────────────────────────────────────────────────────
function logout() {
    sessionStorage.removeItem('user');
    window.location.href = 'index.html';
}

// ── Load saved profile to pre-fill fields ────────────────────────────────────
async function loadUserProfile() {
    if (currentUser.isGuest) return;
    try {
        const res  = await fetch(`/api/user/profile?email=${encodeURIComponent(currentUser.username)}`);
        const data = await res.json();
        if (!data.success) return;
        if (data.age)    { document.getElementById('f-age').value    = data.age; }
        if (data.height) { document.getElementById('f-height').value = data.height; }
        if (data.weight) { document.getElementById('f-weight').value = data.weight; updateBMI(); }
        if (data.gender) { setGender(data.gender); }
    } catch { /* silently ignore — pre-fill is non-critical */ }
}

// ── Selected state ──────────────────────────────────────────────────────────
let selectedGender = 'Male';
let selectedWorkout = 'Chest';

function setGender(g) {
    selectedGender = g;
    document.getElementById('g-male').classList.toggle('active', g === 'Male');
    document.getElementById('g-female').classList.toggle('active', g === 'Female');
}

function setWorkout(btn) {
    document.querySelectorAll('.workout-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedWorkout = btn.dataset.part;
}

// ── Range style update ───────────────────────────────────────────────────────
function updateRangeStyle(el, min, max) {
    const pct = ((el.value - min) / (max - min)) * 100;
    el.style.setProperty('--pct', pct + '%');
}

// ── BMI calculator ───────────────────────────────────────────────────────────
function updateBMI() {
    const h = parseFloat(document.getElementById('f-height').value);
    const w = parseFloat(document.getElementById('f-weight').value);
    const bmiVal = document.getElementById('bmi-value');
    const bmiCat = document.getElementById('bmi-category');
    if (!h || !w || h < 100 || w < 20) {
        bmiVal.textContent = '—';
        bmiCat.textContent = '';
        return;
    }
    const bmi = w / ((h / 100) ** 2);
    bmiVal.textContent = bmi.toFixed(1);
    let cat = '', col = 'var(--text-3)';
    if (bmi < 18.5) { cat = 'Underweight'; col = '#60a5fa'; }
    else if (bmi < 25) { cat = '· Healthy ✓'; col = 'var(--success)'; }
    else if (bmi < 30) { cat = '· Overweight'; col = 'var(--warn)'; }
    else { cat = '· Obese'; col = 'var(--danger)'; }
    bmiCat.textContent = cat;
    bmiCat.style.color = col;
}

// ── Predict ──────────────────────────────────────────────────────────────────
async function handlePredict(e) {
    e.preventDefault();
    const errEl = document.getElementById('predict-error');
    errEl.classList.add('hidden');

    const age = parseFloat(document.getElementById('f-age').value);
    const height = parseFloat(document.getElementById('f-height').value);
    const weight = parseFloat(document.getElementById('f-weight').value);
    const duration = parseFloat(document.getElementById('f-duration').value);
    const intensity = parseFloat(document.getElementById('f-intensity').value);
    const protein = parseFloat(document.getElementById('f-protein').value);
    const sleep = parseFloat(document.getElementById('f-sleep').value);

    // Validate
    if ([age, height, weight, protein, sleep].some(v => isNaN(v))) {
        errEl.textContent = 'Please fill in all required fields.';
        errEl.classList.remove('hidden');
        return;
    }
    if (age < 12 || age > 100) { errEl.textContent = 'Age must be between 12 and 100.'; errEl.classList.remove('hidden'); return; }
    if (height < 120 || height > 220) { errEl.textContent = 'Height must be 120–220 cm.'; errEl.classList.remove('hidden'); return; }
    if (weight < 30 || weight > 200) { errEl.textContent = 'Weight must be 30–200 kg.'; errEl.classList.remove('hidden'); return; }
    if (protein < 10 || protein > 500) { errEl.textContent = 'Protein must be 10–500 g/day.'; errEl.classList.remove('hidden'); return; }
    if (sleep < 3 || sleep > 12) { errEl.textContent = 'Sleep must be 3–12 hours.'; errEl.classList.remove('hidden'); return; }

    // Loading state
    const btn = document.getElementById('btn-predict');
    const btext = document.getElementById('predict-btn-text');
    const bload = document.getElementById('predict-loader');
    btn.disabled = true;
    btext.classList.add('hidden');
    bload.classList.remove('hidden');

    try {
        const res = await fetch('/api/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ age, height, weight, duration, intensity, protein, sleep, gender: selectedGender, workout_part: selectedWorkout, username: currentUser.username })
        });
        const data = await res.json();
        if (data.success) {
            showResult(data.recovery_hours, data.bmi, selectedWorkout, intensity);
            const inputs = { age, height, weight, duration, protein, sleep };
            addHistory(selectedWorkout, selectedGender, intensity, data.recovery_hours, inputs);
        } else {
            errEl.textContent = data.error || 'Prediction failed.';
            errEl.classList.remove('hidden');
        }
    } catch {
        errEl.textContent = 'Could not reach server. Make sure app.py is running.';
        errEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btext.classList.remove('hidden');
        bload.classList.add('hidden');
    }
}

// ── Result display ───────────────────────────────────────────────────────────
function showResult(hours, bmi, workout, intensity) {
    const card = document.getElementById('result-card');
    card.classList.remove('hidden-result');

    // Animate number
    const hoursEl = document.getElementById('ring-hours');
    animateNumber(hoursEl, 0, hours, 1200);

    // Animate ring: max scale = 48hr → full circle; clamp to 0..48
    const ring = document.getElementById('ring-fill');
    const maxHrs = 48;
    const pct = Math.min(hours / maxHrs, 1);
    const circumference = 2 * Math.PI * 80; // 502.65
    const offset = circumference * (1 - pct);
    ring.style.strokeDashoffset = offset;

    // Interpretation
    const interpEl = document.getElementById('result-interp');
    let msg = '', color = 'var(--text-2)';
    if (hours < 24) { msg = '✅ Fast recovery! Light intensity or good conditioning.'; color = 'var(--success)'; }
    else if (hours < 36) { msg = '⚡ Moderate recovery. Rest and nutrition are key.'; color = 'var(--warn)'; }
    else if (hours < 48) { msg = '⚠️ Heavy recovery needed. Prioritize sleep & protein.'; color = '#fb923c'; }
    else { msg = '🔴 Extended recovery. Consider deload or active rest.'; color = 'var(--danger)'; }
    interpEl.textContent = msg;
    interpEl.style.color = color;
    interpEl.style.borderColor = color + '44';

    // BMI info
    const bmiInfoEl = document.getElementById('result-bmi-info');
    bmiInfoEl.textContent = bmi ? `Your BMI: ${bmi} · Workout: ${workout} · Intensity: ${intensity}/10` : '';
}

function animateNumber(el, from, to, duration) {
    const start = performance.now();
    function step(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        const current = from + (to - from) * ease;
        el.textContent = current.toFixed(2);
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// ── History ───────────────────────────────────────────────────────────────────
const HISTORY_KEY = 'fitnessagnt_history';

function loadHistory() {
    const hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    renderHistory(hist);
}

function addHistory(workout, gender, intensity, hours, inputs = null) {
    const hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    hist.unshift({ workout, gender, intensity, hours: hours.toFixed(2), time: new Date().toLocaleTimeString(), inputs });
    if (hist.length > 6) hist.pop();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
    renderHistory(hist);
}

function renderHistory(hist) {
    const listEl = document.getElementById('history-list');
    if (!hist.length) {
        listEl.innerHTML = '<div class="history-empty">No predictions yet — make your first one!</div>';
        return;
    }
    listEl.innerHTML = hist.map((h, i) => `
    <div class="history-item" style="cursor:pointer; display:block; padding:12px 16px;" onclick="const d = document.getElementById('hdet-${i}'); if(d) d.style.display = d.style.display==='none'?'block':'none';">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="h-label">${h.workout} · ${h.gender} · Lvl ${h.intensity}</span>
        <span class="h-value">${h.hours}h</span>
      </div>
      ${h.inputs ? `
      <div id="hdet-${i}" style="display:none; margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.05); font-size:12px; color:var(--text-3); text-align:left;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
          <div><span style="opacity:0.7">Workout:</span> ${h.workout}</div>
          <div><span style="opacity:0.7">Gender:</span> ${h.gender}</div>
          <div><span style="opacity:0.7">Intensity:</span> ${h.intensity}/10</div>
          <div><span style="opacity:0.7">Age:</span> ${h.inputs.age}</div>
          <div><span style="opacity:0.7">Duration:</span> ${h.inputs.duration}m</div>
          <div><span style="opacity:0.7">Height:</span> ${h.inputs.height}cm</div>
          <div><span style="opacity:0.7">Protein:</span> ${h.inputs.protein}g</div>
          <div><span style="opacity:0.7">Weight:</span> ${h.inputs.weight}kg</div>
          <div><span style="opacity:0.7">Sleep:</span> ${h.inputs.sleep}h</div>
        </div>
      </div>
      ` : ''}
    </div>
  `).join('');
}
