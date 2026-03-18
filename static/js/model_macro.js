/* model_macro.js – Macro & Meal Plan predictor frontend logic */

const userJSON = sessionStorage.getItem('user');
if (!userJSON) { window.location.href = 'index.html'; }
const currentUser = JSON.parse(userJSON || '{}');

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('username-display').textContent =
        currentUser.isGuest ? 'Guest' : (currentUser.display_name || currentUser.username.split('@')[0]);
    if (!currentUser.isGuest) loadUserProfile();
});

// ── Load saved profile to pre-fill fields ────────────────────────────────────
async function loadUserProfile() {
    try {
        const res  = await fetch(`/api/user/profile?email=${encodeURIComponent(currentUser.username)}`);
        const data = await res.json();
        if (!data.success) return;
        if (data.age)    document.getElementById('m-age').value    = data.age;
        if (data.height) document.getElementById('m-height').value = data.height;
        if (data.weight) document.getElementById('m-weight').value = data.weight;
        if (data.gender) setMGender(data.gender);
    } catch { /* silently ignore */ }
}

function logout() {
    sessionStorage.removeItem('user');
    window.location.href = 'index.html';
}

// ── State ─────────────────────────────────────────────────────────────────────
let mGender = 'Male';
let mActivityLevel = 'Sedentary';
let mExerciseType = 'Cardio';
let mPhysiqueGoal = 'Lean';

function setMGender(g) {
    mGender = g;
    document.getElementById('mg-male').classList.toggle('active', g === 'Male');
    document.getElementById('mg-female').classList.toggle('active', g === 'Female');
}

function setOption(btn, gridId, varName) {
    document.querySelectorAll(`#${gridId} .option-btn`).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // Only update variables that belong to this page
    if (varName === 'mActivityLevel') mActivityLevel = btn.dataset.val;
    if (varName === 'mExerciseType') mExerciseType = btn.dataset.val;
    if (varName === 'mPhysiqueGoal') mPhysiqueGoal = btn.dataset.val;
}

// ── Predict ───────────────────────────────────────────────────────────────────
async function handleMacroPredict(e) {
    e.preventDefault();
    const errEl = document.getElementById('macro-error');
    errEl.classList.add('hidden');

    const age = parseInt(document.getElementById('m-age').value);
    const height = parseFloat(document.getElementById('m-height').value);
    const weight = parseFloat(document.getElementById('m-weight').value);

    if ([age, height, weight].some(v => isNaN(v))) {
        errEl.textContent = 'Please fill in Age, Height, and Weight.';
        errEl.classList.remove('hidden');
        return;
    }
    if (age < 12 || age > 100) { errEl.textContent = 'Age must be 12–100.'; errEl.classList.remove('hidden'); return; }
    if (height < 120 || height > 220) { errEl.textContent = 'Height must be 120–220 cm.'; errEl.classList.remove('hidden'); return; }
    if (weight < 30 || weight > 200) { errEl.textContent = 'Weight must be 30–200 kg.'; errEl.classList.remove('hidden'); return; }

    const btn = document.getElementById('btn-macro-predict');
    const btext = document.getElementById('macro-btn-text');
    const bload = document.getElementById('macro-loader');
    btn.disabled = true;
    btext.classList.add('hidden');
    bload.classList.remove('hidden');

    try {
        const res = await fetch('/api/predict_macro', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                age, height, weight,
                activity_level: mActivityLevel,
                exercise_type: mExerciseType,
                physique_goal: mPhysiqueGoal,
                gender: mGender,
                username: currentUser.username
            })
        });
        const data = await res.json();
        if (data.success) {
            showMacroResult(data);
            if (!currentUser.isGuest) {
                fetch('/api/log_prediction', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: currentUser.username })
                });
            }
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

// ── Result Display ────────────────────────────────────────────────────────────
function showMacroResult(data) {
    // Show macro card
    const macroCard = document.getElementById('macro-result-card');
    macroCard.classList.remove('hidden-result');
    const mealCard = document.getElementById('meal-plan-card');
    mealCard.classList.remove('hidden-result');

    // Animate macro numbers
    const maxVals = { calories: 4000, protein: 300, carbs: 500, fats: 150, fiber: 60 };

    animateMacroBar('calories', data.calories, maxVals.calories, 'kcal');
    animateMacroBar('protein', data.protein, maxVals.protein, 'g');
    animateMacroBar('carbs', data.carbs, maxVals.carbs, 'g');
    animateMacroBar('fats', data.fats, maxVals.fats, 'g');
    animateMacroBar('fiber', data.fiber, maxVals.fiber, 'g');

    // Meal plan
    const mealContent = document.getElementById('meal-plan-content');
    const meals = data.meal_plan.split('|').map(m => m.trim()).filter(Boolean);
    const mealLabels = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
    mealContent.innerHTML = meals.map((meal, i) => `
    <div class="meal-item">
      <div class="meal-label">${mealLabels[i] || 'Meal ' + (i + 1)}</div>
      <div class="meal-desc">${meal}</div>
    </div>
  `).join('');
}

function animateMacroBar(name, value, maxVal, unit) {
    const valEl = document.getElementById(`val-${name}`);
    const barEl = document.getElementById(`bar-${name}`);
    const pct = Math.min((value / maxVal) * 100, 100);

    // Animate width
    setTimeout(() => { barEl.style.width = pct + '%'; }, 100);

    // Animate number
    const start = performance.now();
    const duration = 1200;
    function step(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        valEl.textContent = (value * ease).toFixed(1);
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}
