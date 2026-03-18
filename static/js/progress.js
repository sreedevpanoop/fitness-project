/* progress.js – Fetches user history and renders enhanced Chart.js progression charts */

const userJSON = sessionStorage.getItem('user');
if (!userJSON) { window.location.href = 'index.html'; }
const currentUser = JSON.parse(userJSON || '{}');

let chartRecovery = null;
let chartCalories = null;

// Dummy data for when history is empty or user is guest, keeping charts visible
const DUMMY_RECOVERY = [
    { predicted_at: new Date(Date.now() - 6 * 86400000).toISOString(), recovery_hours: 48 },
    { predicted_at: new Date(Date.now() - 4 * 86400000).toISOString(), recovery_hours: 36 },
    { predicted_at: new Date(Date.now() - 2 * 86400000).toISOString(), recovery_hours: 24 },
    { predicted_at: new Date(Date.now() - 0 * 86400000).toISOString(), recovery_hours: 42 }
];

const DUMMY_CALORIE = [
    { predicted_at: new Date(Date.now() - 6 * 86400000).toISOString(), calories: 2400 },
    { predicted_at: new Date(Date.now() - 4 * 86400000).toISOString(), calories: 2350 },
    { predicted_at: new Date(Date.now() - 2 * 86400000).toISOString(), calories: 2300 },
    { predicted_at: new Date(Date.now() - 0 * 86400000).toISOString(), calories: 2200 }
];

document.addEventListener('DOMContentLoaded', () => {
    // Populate Top Nav
    const nameEl = document.getElementById('username-display');
    if (currentUser.isGuest) {
        nameEl.textContent = 'Guest';
        document.getElementById('user-avatar-initial').textContent = '?';
        document.getElementById('progress-empty').classList.add('hidden');
        document.getElementById('progress-charts').style.display = 'grid';
        renderProgressCharts({ recovery_history: [], calorie_history: [] }); // Guest sees dummy data
    } else {
        const name = currentUser.display_name || currentUser.username.split('@')[0];
        nameEl.textContent = name;
        document.getElementById('user-avatar-initial').textContent = name.charAt(0).toUpperCase();
        loadUserProgress();
    }
});

function logout() {
    sessionStorage.removeItem('user');
    window.location.href = 'index.html';
}

async function loadUserProgress() {
    try {
        const res = await fetch(`/api/user/history?email=${encodeURIComponent(currentUser.username)}`);
        const data = await res.json();
        
        let historyData = data.success ? data : { recovery_history: [], calorie_history: [] };
        
        // Hide the empty state message and always show charts
        document.getElementById('progress-empty').classList.add('hidden');
        document.getElementById('progress-charts').style.display = 'grid';
        
        renderProgressCharts(historyData);
    } catch (e) {
        console.error("Failed to load user progress:", e);
        document.getElementById('progress-empty').classList.add('hidden');
        document.getElementById('progress-charts').style.display = 'grid';
        renderProgressCharts({ recovery_history: [], calorie_history: [] });
    }
}

function processArray(arr, dummyArr, valueKey) {
    let source = (arr && arr.length > 0) ? arr : dummyArr;
    
    // Parse date, extract metric, and sort chronologically (oldest to newest)
    return source
        .map(log => ({
            dateObj: new Date(log.predicted_at),
            value: log[valueKey]
        }))
        .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime())
        .map(item => {
            const fullDate = item.dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
            const shortDate = item.dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return {
                fullDateStr: fullDate,
                shortDateStr: shortDate,
                value: item.value
            };
        });
}

function renderProgressCharts(data) {
    const CHART_TEXT  = '#8b949e';
    const CHART_GRID  = 'rgba(255,255,255,0.05)';
    const CHART_FONT  = { family: 'Outfit', size: 11 };
    
    // Shared tooltip configuration to show the Full Date
    const tooltipConfig = {
        titleFont: { family: 'Outfit', size: 13, weight: '600' },
        bodyFont: { family: 'Outfit', size: 12 },
        padding: 10,
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        callbacks: {
            title: function(context) {
                return context[0].dataset.customLabels[context[0].dataIndex];
            }
        }
    };

    // ── 1. Recovery Trend ──
    const recoveryData = processArray(data.recovery_history, DUMMY_RECOVERY, 'recovery_hours');
    const ctxRec = document.getElementById('chart-user-recovery').getContext('2d');
    if (chartRecovery) chartRecovery.destroy();
    chartRecovery = new Chart(ctxRec, {
        type: 'line',
        data: {
            labels: recoveryData.map(d => d.shortDateStr), // X-axis
            datasets: [{
                label: 'Recovery Hours',
                data: recoveryData.map(d => d.value),
                customLabels: recoveryData.map(d => d.fullDateStr), // Tooltip
                borderColor: '#00e5ff',
                backgroundColor: 'rgba(0, 229, 255, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: '#00e5ff'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { 
                legend: { display: false },
                tooltip: tooltipConfig
            },
            scales: {
                x: { ticks: { color: CHART_TEXT, font: CHART_FONT, maxRotation: 45 }, grid: { color: CHART_GRID } },
                y: { ticks: { color: CHART_TEXT, font: CHART_FONT }, grid: { color: CHART_GRID }, beginAtZero: true }
            }
        }
    });

    // ── 2. Calorie Trend ──
    const calorieData = processArray(data.calorie_history, DUMMY_CALORIE, 'calories');
    const ctxCal = document.getElementById('chart-user-calories').getContext('2d');
    if (chartCalories) chartCalories.destroy();
    chartCalories = new Chart(ctxCal, {
        type: 'line',
        data: {
            labels: calorieData.map(d => d.shortDateStr), // X-axis
            datasets: [{
                label: 'Daily Calories',
                data: calorieData.map(d => d.value),
                customLabels: calorieData.map(d => d.fullDateStr), // Tooltip
                borderColor: '#f97316',
                backgroundColor: 'rgba(249, 115, 22, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: '#f97316'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { 
                legend: { display: false },
                tooltip: tooltipConfig
            },
            scales: {
                x: { ticks: { color: CHART_TEXT, font: CHART_FONT, maxRotation: 45 }, grid: { color: CHART_GRID } },
                y: { ticks: { color: CHART_TEXT, font: CHART_FONT }, grid: { color: CHART_GRID } }
            }
        }
    });
}
