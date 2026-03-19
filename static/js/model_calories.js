/* model_calories.js – Calorie predictor frontend logic */

const userJSON = sessionStorage.getItem('user');
if (!userJSON) { window.location.replace('index.html'); }
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
    nameEl.textContent = currentUser.isGuest ? 'Guest' : (currentUser.display_name || currentUser.username.split('@')[0]);
    if (!currentUser.isGuest) loadUserProfile();
});

// ── Load saved profile to pre-fill fields ────────────────────────────────────
async function loadUserProfile() {
    try {
        const res  = await fetch(`/api/user/profile?email=${encodeURIComponent(currentUser.username)}`);
        const data = await res.json();
        if (!data.success) return;
        if (data.age)    document.getElementById('c-age').value    = data.age;
        if (data.height) document.getElementById('c-height').value = data.height;
        if (data.weight) document.getElementById('c-weight').value = data.weight;
        if (data.gender) setCGender(data.gender);
    } catch { /* silently ignore */ }
}

function logout() {
    sessionStorage.removeItem('user');
    window.location.replace('index.html');
}

// ── State ─────────────────────────────────────────────────────────────────────
let cGender = 'Male';
let cActivityLevel = 'Sedentary';
let cExerciseType = 'Light Training';

function setCGender(g) {
    cGender = g;
    document.getElementById('cg-male').classList.toggle('active', g === 'Male');
    document.getElementById('cg-female').classList.toggle('active', g === 'Female');
}

function setOption(btn, gridId, varName) {
    document.querySelectorAll(`#${gridId} .option-btn`).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // Only update variables that belong to this page
    if (varName === 'cActivityLevel') cActivityLevel = btn.dataset.val;
    if (varName === 'cExerciseType') cExerciseType = btn.dataset.val;
}

// ── Predict ───────────────────────────────────────────────────────────────────
async function handleCaloriePredict(e) {
    e.preventDefault();
    const errEl = document.getElementById('calorie-error');
    errEl.classList.add('hidden');

    const age = parseInt(document.getElementById('c-age').value);
    const height = parseFloat(document.getElementById('c-height').value);
    const weight = parseFloat(document.getElementById('c-weight').value);
    const target_weight = parseFloat(document.getElementById('c-target').value);
    const duration_weeks = parseFloat(document.getElementById('c-weeks').value);
    const exercise_duration = parseFloat(document.getElementById('c-exdur').value);

    if ([age, height, weight, target_weight, duration_weeks, exercise_duration].some(v => isNaN(v))) {
        errEl.textContent = 'Please fill in all required fields.';
        errEl.classList.remove('hidden');
        return;
    }
    if (age < 12 || age > 100) { showErr(errEl, 'Age must be 12–100.'); return; }
    if (height < 120 || height > 220) { showErr(errEl, 'Height must be 120–220 cm.'); return; }
    if (weight < 30 || weight > 200) { showErr(errEl, 'Weight must be 30–200 kg.'); return; }

    const btn = document.getElementById('btn-calorie-predict');
    const btext = document.getElementById('calorie-btn-text');
    const bload = document.getElementById('calorie-loader');
    btn.disabled = true;
    btext.classList.add('hidden');
    bload.classList.remove('hidden');

    try {
        const res = await fetch('/api/predict_calories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                age, height, weight, target_weight, duration_weeks, exercise_duration,
                gender: cGender, activity_level: cActivityLevel, exercise_type: cExerciseType, username: currentUser.username
            })
        });
        const data = await res.json();
        if (data.success) {
            showCalorieResult(data);
            // Log prediction for registered users
            if (!currentUser.isGuest) {
                fetch('/api/log_prediction', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: currentUser.username })
                });
            }
        } else {
            showErr(errEl, data.error || 'Prediction failed.');
        }
    } catch {
        showErr(errEl, 'Could not reach server. Make sure app.py is running.');
    } finally {
        btn.disabled = false;
        btext.classList.remove('hidden');
        bload.classList.add('hidden');
    }
}

function showErr(el, msg) {
    el.textContent = msg;
    el.classList.remove('hidden');
}

function showCalorieResult(data) {
    const card = document.getElementById('calorie-result-card');
    card.classList.remove('hidden-result');

    const numEl = document.getElementById('calorie-big-num');
    animateNumber(numEl, 0, data.calories, 1200, 0);

    const badge = document.getElementById('goal-badge');
    const goalColors = { 'Weight Loss': '#ef4444', 'Weight Gain': '#22c55e', 'Maintain Weight': '#f59e0b' };
    badge.textContent = data.goal;
    badge.style.background = (goalColors[data.goal] || '#6b7280') + '22';
    badge.style.color = goalColors[data.goal] || '#6b7280';
    badge.style.borderColor = (goalColors[data.goal] || '#6b7280') + '55';

    document.getElementById('calorie-breakdown').innerHTML = `
    <div class="breakdown-row"><span>BMR</span><strong>${data.bmr} kcal</strong></div>
    <div class="breakdown-row"><span>TDEE</span><strong>${data.tdee} kcal</strong></div>
    <div class="breakdown-row"><span>Exercise Burn</span><strong>${data.exercise_calories} kcal</strong></div>
  `;

    const interp = document.getElementById('calorie-interp');
    if (data.goal === 'Weight Loss') {
        interp.textContent = 'Eating at this level will create a sustainable calorie deficit. Pair with consistent exercise.';
        interp.style.color = '#ef4444';
    } else if (data.goal === 'Weight Gain') {
        interp.textContent = 'This calorie surplus supports lean muscle gain. Combine with strength training for best results.';
        interp.style.color = '#22c55e';
    } else {
        interp.textContent = 'These calories will help you maintain your current weight and body composition.';
        interp.style.color = '#f59e0b';
    }
}

function animateNumber(el, from, to, duration, decimals = 0) {
    const start = performance.now();
    function step(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        el.textContent = (from + (to - from) * ease).toFixed(decimals);
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}
