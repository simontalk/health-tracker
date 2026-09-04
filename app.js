(function () {
  'use strict';
  const STORAGE_KEY = 'health-tracker-data';
  const SETTINGS_KEY = 'health-tracker-settings';
  const store = {
    records: [],
    settings: {
      height: null,
      gender: 'male',
      age: null,
      goalWeight: null,
      goalWaist: null,
      goalSleep: 8,
    },
    currentPeriod: 'day',
    charts: {},
  };

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) store.records = JSON.parse(raw);
    } catch (e) { store.records = []; }
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) store.settings = { ...store.settings, ...JSON.parse(raw) };
    } catch (e) {}
    sortRecords();
  }

  function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(store.records)); }
  function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(store.settings)); }
  function sortRecords() { store.records.sort((a, b) => new Date(a.date) - new Date(b.date)); }

  function addRecord(record) {
    const idx = store.records.findIndex(r => r.date === record.date);
    if (idx >= 0) store.records[idx] = { ...store.records[idx], ...record };
    else store.records.push(record);
    sortRecords();
    saveData();
  }

  function deleteRecord(date) {
    store.records = store.records.filter(r => r.date !== date);
    saveData();
  }

  function getRecord(date) { return store.records.find(r => r.date === date) || null; }

  function fmtDate(d) {
    const date = typeof d === 'string' ? new Date(d) : d;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function todayStr() { return fmtDate(new Date()); }

  function calcSleepHours(bedtime, wakeup) {
    if (!bedtime || !wakeup) return null;
    const [bh, bm] = bedtime.split(':').map(Number);
    const [wh, wm] = wakeup.split(':').map(Number);
    let bedMin = bh * 60 + bm;
    let wakeMin = wh * 60 + wm;
    if (wakeMin < bedMin) wakeMin += 24 * 60;
    return (wakeMin - bedMin) / 60;
  }

  function calcBMI(weight, height) {
    if (!weight || !height) return null;
    const h = height / 100;
    return weight / (h * h);
  }

  function bmiStatus(bmi) {
    if (!bmi) return { label: '--', class: '' };
    if (bmi < 18.5) return { label: '偏瘦', class: '' };
    if (bmi < 24) return { label: '正常', class: 'positive' };
    if (bmi < 28) return { label: '超重', class: 'negative' };
    return { label: '肥胖', class: 'negative' };
  }

  function calcBMR(weight, height, age, gender) {
    if (!weight || !height || !age) return null;
    if (gender === 'male') return 10 * weight + 6.25 * height - 5 * age + 5;
    else return 10 * weight + 6.25 * height - 5 * age - 161;
  }

  function idealWeightRange(height) {
    if (!height) return '--';
    const h = height / 100;
    return `${(18.5 * h * h).toFixed(1)} - ${(23.9 * h * h).toFixed(1)} kg`;
  }

  function calcStreak() {
    if (store.records.length === 0) return 0;
    let streak = 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dates = new Set(store.records.map(r => r.date));
    let d = new Date(today);
    if (!dates.has(fmtDate(d))) d.setDate(d.getDate() - 1);
    while (dates.has(fmtDate(d))) { streak++; d.setDate(d.getDate() - 1); }
    return streak;
  }

  function getWeight() { return store.records.filter(r => r.weight != null).map(r => ({ date: r.date, value: r.weight })); }
  function getWaist() { return store.records.filter(r => r.waist != null).map(r => ({ date: r.date, value: r.waist })); }
  function getSleep() { return store.records.filter(r => r.sleep != null).map(r => ({ date: r.date, value: r.sleep })); }

  function avg(arr) {
    if (!arr.length) return null;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }

  function daysAgo(n) {
    const d = new Date(); d.setDate(d.getDate() - n);
    return fmtDate(d);
  }

  function recentAvg(data, days) {
    const cutoff = daysAgo(days);
    const filtered = data.filter(d => d.date >= cutoff);
    return avg(filtered.map(d => d.value));
  }

  function aggregateByWeek(data) {
    if (!data.length) return [];
    const firstDate = new Date(data[0].date);
    const day = firstDate.getDay() || 7;
    const weekStart = new Date(firstDate);
    weekStart.setDate(firstDate.getDate() - (day - 1));
    const weeks = {};
    data.forEach(d => {
      const date = new Date(d.date);
      const diffDays = Math.floor((date - weekStart) / (1000 * 60 * 60 * 24));
      const weekIdx = Math.floor(diffDays / 7);
      if (!weeks[weekIdx]) weeks[weekIdx] = [];
      weeks[weekIdx].push(d.value);
    });
    return Object.keys(weeks).sort((a, b) => a - b).map(idx => {
      const start = new Date(weekStart);
      start.setDate(weekStart.getDate() + idx * 7);
      return { label: `${start.getMonth() + 1}/${start.getDate()}周`, value: avg(weeks[idx]) };
    });
  }

  function aggregateByMonth(data) {
    if (!data.length) return [];
    const months = {};
    data.forEach(d => {
      const [y, m] = d.date.split('-');
      const key = `${y}-${m}`;
      if (!months[key]) months[key] = [];
      months[key].push(d.value);
    });
    return Object.keys(months).sort().map(key => {
      const [y, m] = key.split('-');
      return { label: `${y}年${parseInt(m)}月`, value: avg(months[key]) };
    });
  }

  function weekOverWeekChange(data) {
    const weeks = aggregateByWeek(data);
    if (weeks.length < 2) return null;
    return weeks[weeks.length - 1].value - weeks[weeks.length - 2].value;
  }

  function monthOverMonthChange(data) {
    const months = aggregateByMonth(data);
    if (months.length < 2) return null;
    return months[months.length - 1].value - months[months.length - 2].value;
  }

  function sleepRegularityScore() {
    const sleepData = getSleep();
    if (sleepData.length < 7) return null;
    const values = sleepData.map(d => d.value);
    const mean = avg(values);
    const variance = avg(values.map(v => (v - mean) ** 2));
    const stdDev = Math.sqrt(variance);
    return Math.round(Math.max(0, 100 - stdDev * 15));
  }

  function sleepByDayType() {
    const sleepData = getSleep();
    const weekday = [], weekend = [];
    sleepData.forEach(d => {
      const day = new Date(d.date).getDay();
      if (day === 0 || day === 6) weekend.push(d.value);
      else weekday.push(d.value);
    });
    return { weekday: avg(weekday), weekend: avg(weekend) };
  }

  const chartColors = {
    weight: { line: '#3B82F6', bg: 'rgba(59, 130, 246, 0.1)' },
    waist: { line: '#10B981', bg: 'rgba(16, 185, 129, 0.1)' },
    sleep: { line: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.1)' },
    bmi: { line: '#F59E0B', bg: 'rgba(245, 158, 11, 0.1)' },
  };

  function getChartData(metric) {
    let data;
    if (metric === 'weight') data = getWeight();
    else if (metric === 'waist') data = getWaist();
    else if (metric === 'sleep') data = getSleep();
    else if (metric === 'bmi') {
      const h = store.settings.height;
      data = store.records.filter(r => r.weight != null && h).map(r => ({ date: r.date, value: calcBMI(r.weight, h) }));
    }
    if (store.currentPeriod === 'day') {
      return {
        labels: data.map(d => { const dt = new Date(d.date); return `${dt.getMonth() + 1}/${dt.getDate()}`; }),
        values: data.map(d => d.value),
      };
    } else if (store.currentPeriod === 'week') {
      const agg = aggregateByWeek(data);
      return { labels: agg.map(d => d.label), values: agg.map(d => d.value) };
    } else {
      const agg = aggregateByMonth(data);
      return { labels: agg.map(d => d.label), values: agg.map(d => d.value) };
    }
  }

  function createChart(canvasId, metric, type = 'line') {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const colors = chartColors[metric];
    const data = getChartData(metric);
    const config = {
      type: type,
      data: {
        labels: data.labels,
        datasets: [{
          label: metric === 'weight' ? '体重 (kg)' : metric === 'waist' ? '腰围 (cm)' : metric === 'sleep' ? '睡眠 (h)' : 'BMI',
          data: data.values,
          borderColor: colors.line,
          backgroundColor: type === 'line' ? colors.bg : colors.line,
          borderWidth: 2,
          fill: type === 'line',
          tension: 0.3,
          pointRadius: type === 'line' ? 0 : undefined,
          pointHoverRadius: type === 'line' ? 4 : undefined,
          borderRadius: type === 'bar' ? 4 : 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            titleFont: { size: 13 },
            bodyFont: { size: 13 },
            padding: 10,
            cornerRadius: 8,
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#94A3B8', font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
          },
          y: { grid: { color: 'rgba(148, 163, 184, 0.15)' }, ticks: { color: '#94A3B8', font: { size: 11 } } },
        },
        interaction: { intersect: false, mode: 'index' },
      },
    };
    return new Chart(ctx, config);
  }

  function updateCharts() {
    ['weight', 'waist', 'sleep', 'bmi'].forEach(metric => {
      if (!store.charts[metric]) return;
      const data = getChartData(metric);
      store.charts[metric].data.labels = data.labels;
      store.charts[metric].data.datasets[0].data = data.values;
      store.charts[metric].update('none');
    });
  }

  function updateDashboard() {
    const weights = getWeight();
    const waists = getWaist();
    const sleeps = getSleep();
    const s = store.settings;
    const latestWeight = weights.length ? weights[weights.length - 1].value : null;
    const firstWeight = weights.length ? weights[0].value : null;
    const latestWaist = waists.length ? waists[waists.length - 1].value : null;
    const firstWaist = waists.length ? waists[0].value : null;
    const avgSleep = avg(sleeps.map(d => d.value));
    const now = new Date();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    document.getElementById('today-date').textContent = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${weekdays[now.getDay()]}`;
    setKpi('kpi-weight', latestWeight ? latestWeight.toFixed(1) + ' kg' : '--');
    setDelta('kpi-weight-delta', latestWeight, firstWeight, 'kg');
    setKpi('kpi-waist', latestWaist ? latestWaist.toFixed(1) + ' cm' : '--');
    setDelta('kpi-waist-delta', latestWaist, firstWaist, 'cm');
    const bmi = calcBMI(latestWeight, s.height);
    const bmiInfo = bmiStatus(bmi);
    setKpi('kpi-bmi', bmi ? bmi.toFixed(1) : '--');
    const bmiEl = document.getElementById('kpi-bmi-status');
    bmiEl.textContent = bmiInfo.label;
    bmiEl.className = 'kpi-delta ' + bmiInfo.class;
    setKpi('kpi-sleep', avgSleep ? avgSleep.toFixed(1) + ' h' : '--');
    const sleep7d = recentAvg(sleeps, 7);
    const sleepDeltaEl = document.getElementById('kpi-sleep-delta');
    if (sleep7d) { sleepDeltaEl.textContent = `7日平均 ${sleep7d.toFixed(1)} h`; sleepDeltaEl.className = 'kpi-delta'; }
    else { sleepDeltaEl.textContent = '--'; sleepDeltaEl.className = 'kpi-delta'; }
    const goalEl = document.getElementById('kpi-goal');
    const goalTextEl = document.getElementById('kpi-goal-text');
    if (s.goalWeight && latestWeight) {
      const total = firstWeight - s.goalWeight;
      const done = firstWeight - latestWeight;
      const pct = total > 0 ? Math.min(100, Math.max(0, (done / total) * 100)) : 0;
      goalEl.textContent = pct.toFixed(0) + '%';
      goalTextEl.textContent = `目标 ${s.goalWeight} kg · 还差 ${(latestWeight - s.goalWeight).toFixed(1)} kg`;
    } else { goalEl.textContent = '--'; goalTextEl.textContent = '设置目标'; }
    document.getElementById('kpi-streak').textContent = calcStreak() + ' 天';
    document.getElementById('kpi-total-days').textContent = `共 ${store.records.length} 天`;
    updateCharts();
  }

  function setKpi(id, text) { document.getElementById(id).textContent = text; }

  function setDelta(id, current, base, unit) {
    const el = document.getElementById(id);
    if (current == null || base == null) { el.textContent = '--'; el.className = 'kpi-delta'; return; }
    const diff = current - base;
    const sign = diff > 0 ? '+' : '';
    el.textContent = `较开始 ${sign}${diff.toFixed(1)} ${unit}`;
    el.className = 'kpi-delta ' + (diff < 0 ? 'positive' : diff > 0 ? 'negative' : '');
  }

  function updateRecordsList(filterDate) {
    const tbody = document.getElementById('records-body');
    const empty = document.getElementById('empty-state');
    const countEl = document.getElementById('records-count');
    let records = [...store.records].reverse();
    if (filterDate) records = records.filter(r => r.date === filterDate);
    countEl.textContent = `共 ${records.length} 条记录`;
    if (records.length === 0) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    tbody.innerHTML = records.map(r => {
      const sleep = calcSleepHours(r.bedtime, r.wakeup);
      return `<tr>
        <td>${r.date}</td>
        <td>${r.weight != null ? r.weight.toFixed(1) : '-'}</td>
        <td>${r.waist != null ? r.waist.toFixed(1) : '-'}</td>
        <td>${r.breakfast || '-'}</td>
        <td>${r.lunch || '-'}</td>
        <td>${r.dinner || '-'}</td>
        <td>${r.bedtime || '-'}</td>
        <td>${r.wakeup || '-'}</td>
        <td>${sleep != null ? sleep.toFixed(1) + 'h' : '-'}</td>
        <td>
          <button class="btn-ghost btn-icon" data-edit="${r.date}">编辑</button>
          <button class="btn-ghost btn-icon" data-delete="${r.date}" style="color:var(--danger)">删除</button>
        </td>
      </tr>`;
    }).join('');
  }

  function updateStats() {
    const weights = getWeight().map(d => d.value);
    const waists = getWaist().map(d => d.value);
    const sleeps = getSleep();
    const s = store.settings;
    document.getElementById('stat-weight-max').textContent = weights.length ? Math.max(...weights).toFixed(1) + ' kg' : '--';
    document.getElementById('stat-weight-min').textContent = weights.length ? Math.min(...weights).toFixed(1) + ' kg' : '--';
    document.getElementById('stat-weight-avg').textContent = weights.length ? avg(weights).toFixed(1) + ' kg' : '--';
    document.getElementById('stat-weight-7d').textContent = (recentAvg(getWeight(), 7) || '--').toString() + (recentAvg(getWeight(), 7) ? ' kg' : '');
    document.getElementById('stat-weight-30d').textContent = (recentAvg(getWeight(), 30) || '--').toString() + (recentAvg(getWeight(), 30) ? ' kg' : '');
    const wowWeight = weekOverWeekChange(getWeight());
    const momWeight = monthOverMonthChange(getWeight());
    document.getElementById('stat-weight-week-change').textContent = wowWeight != null ? (wowWeight > 0 ? '+' : '') + wowWeight.toFixed(1) + ' kg' : '--';
    document.getElementById('stat-weight-month-change').textContent = momWeight != null ? (momWeight > 0 ? '+' : '') + momWeight.toFixed(1) + ' kg' : '--';
    document.getElementById('stat-waist-max').textContent = waists.length ? Math.max(...waists).toFixed(1) + ' cm' : '--';
    document.getElementById('stat-waist-min').textContent = waists.length ? Math.min(...waists).toFixed(1) + ' cm' : '--';
    document.getElementById('stat-waist-avg').textContent = waists.length ? avg(waists).toFixed(1) + ' cm' : '--';
    document.getElementById('stat-waist-7d').textContent = (recentAvg(getWaist(), 7) || '--').toString() + (recentAvg(getWaist(), 7) ? ' cm' : '');
    document.getElementById('stat-waist-30d').textContent = (recentAvg(getWaist(), 30) || '--').toString() + (recentAvg(getWaist(), 30) ? ' cm' : '');
    const wowWaist = weekOverWeekChange(getWaist());
    const momWaist = monthOverMonthChange(getWaist());
    document.getElementById('stat-waist-week-change').textContent = wowWaist != null ? (wowWaist > 0 ? '+' : '') + wowWaist.toFixed(1) + ' cm' : '--';
    document.getElementById('stat-waist-month-change').textContent = momWaist != null ? (momWaist > 0 ? '+' : '') + momWaist.toFixed(1) + ' cm' : '--';
    const sleepVals = sleeps.map(d => d.value);
    document.getElementById('stat-sleep-max').textContent = sleepVals.length ? Math.max(...sleepVals).toFixed(1) + ' h' : '--';
    document.getElementById('stat-sleep-min').textContent = sleepVals.length ? Math.min(...sleepVals).toFixed(1) + ' h' : '--';
    document.getElementById('stat-sleep-avg').textContent = sleepVals.length ? avg(sleepVals).toFixed(1) + ' h' : '--';
    document.getElementById('stat-sleep-7d').textContent = (recentAvg(sleeps, 7) || '--').toString() + (recentAvg(sleeps, 7) ? ' h' : '');
    document.getElementById('stat-sleep-30d').textContent = (recentAvg(sleeps, 30) || '--').toString() + (recentAvg(sleeps, 30) ? ' h' : '');
    const score = sleepRegularityScore();
    document.getElementById('stat-sleep-score').textContent = score != null ? score + ' / 100' : '--';
    const byType = sleepByDayType();
    document.getElementById('stat-sleep-weekday').textContent = byType.weekday ? byType.weekday.toFixed(1) + ' h' : '--';
    document.getElementById('stat-sleep-weekend').textContent = byType.weekend ? byType.weekend.toFixed(1) + ' h' : '--';
    const latestWeight = weights.length ? weights[weights.length - 1] : null;
    const bmi = calcBMI(latestWeight, s.height);
    const bmiInfo = bmiStatus(bmi);
    document.getElementById('stat-bmi-current').textContent = bmi ? bmi.toFixed(1) : '--';
    document.getElementById('stat-bmi-status').textContent = bmiInfo.label;
    const bmis = store.records.filter(r => r.weight != null && s.height).map(r => calcBMI(r.weight, s.height));
    document.getElementById('stat-bmi-max').textContent = bmis.length ? Math.max(...bmis).toFixed(1) : '--';
    document.getElementById('stat-bmi-min').textContent = bmis.length ? Math.min(...bmis).toFixed(1) : '--';
    const bmr = calcBMR(latestWeight, s.height, s.age, s.gender);
    document.getElementById('stat-bmr').textContent = bmr ? Math.round(bmr) + ' kcal' : '--';
    document.getElementById('stat-ideal-weight').textContent = idealWeightRange(s.height);
    updateWeekSummary();
    updateMonthSummary();
  }

  function updateWeekSummary() {
    const tbody = document.getElementById('week-summary-body');
    const wData = aggregateByWeek(getWeight());
    const waistData = aggregateByWeek(getWaist());
    const sleepData = aggregateByWeek(getSleep());
    const maxLen = Math.max(wData.length, waistData.length, sleepData.length);
    if (maxLen === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-tertiary);padding:24px">暂无数据</td></tr>'; return; }
    let html = '';
    for (let i = 0; i < maxLen; i++) {
      html += `<tr>
        <td>第${i + 1}周</td>
        <td>${wData[i]?.label || '-'}</td>
        <td>${wData[i]?.value != null ? wData[i].value.toFixed(1) + ' kg' : '-'}</td>
        <td>${waistData[i]?.value != null ? waistData[i].value.toFixed(1) + ' cm' : '-'}</td>
        <td>${sleepData[i]?.value != null ? sleepData[i].value.toFixed(1) + ' h' : '-'}</td>
      </tr>`;
    }
    tbody.innerHTML = html;
  }

  function updateMonthSummary() {
    const tbody = document.getElementById('month-summary-body');
    const wData = aggregateByMonth(getWeight());
    const waistData = aggregateByMonth(getWaist());
    const sleepData = aggregateByMonth(getSleep());
    const maxLen = Math.max(wData.length, waistData.length, sleepData.length);
    if (maxLen === 0) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-tertiary);padding:24px">暂无数据</td></tr>'; return; }
    let html = '';
    for (let i = 0; i < maxLen; i++) {
      html += `<tr>
        <td>${wData[i]?.label || '-'}</td>
        <td>${wData[i]?.value != null ? wData[i].value.toFixed(1) + ' kg' : '-'}</td>
        <td>${waistData[i]?.value != null ? waistData[i].value.toFixed(1) + ' cm' : '-'}</td>
        <td>${sleepData[i]?.value != null ? sleepData[i].value.toFixed(1) + ' h' : '-'}</td>
      </tr>`;
    }
    tbody.innerHTML = html;
  }

  function updateSettingsForm() {
    const s = store.settings;
    document.getElementById('setting-height').value = s.height || '';
    document.getElementById('setting-gender').value = s.gender || 'male';
    document.getElementById('setting-age').value = s.age || '';
    document.getElementById('setting-goal-weight').value = s.goalWeight || '';
    document.getElementById('setting-goal-waist').value = s.goalWaist || '';
    document.getElementById('setting-goal-sleep').value = s.goalSleep || '';
  }

  function openModal(date) {
    const modal = document.getElementById('edit-modal');
    const title = document.getElementById('modal-title');
    const record = date ? getRecord(date) : null;
    title.textContent = record ? '编辑记录' : '新增记录';
    document.getElementById('record-id').value = date || '';
    document.getElementById('record-date').value = date || todayStr();
    document.getElementById('record-weight').value = record?.weight || '';
    document.getElementById('record-waist').value = record?.waist || '';
    document.getElementById('record-breakfast').value = record?.breakfast || '';
    document.getElementById('record-lunch').value = record?.lunch || '';
    document.getElementById('record-dinner').value = record?.dinner || '';
    document.getElementById('record-bedtime').value = record?.bedtime || '';
    document.getElementById('record-wakeup').value = record?.wakeup || '';
    modal.classList.add('active');
  }

  function closeModal() { document.getElementById('edit-modal').classList.remove('active'); }

  function handleSubmit(e) {
    e.preventDefault();
    const date = document.getElementById('record-date').value;
    if (!date) return;
    const record = {
      date,
      weight: parseFloat(document.getElementById('record-weight').value) || null,
      waist: parseFloat(document.getElementById('record-waist').value) || null,
      breakfast: document.getElementById('record-breakfast').value.trim() || null,
      lunch: document.getElementById('record-lunch').value.trim() || null,
      dinner: document.getElementById('record-dinner').value.trim() || null,
      bedtime: document.getElementById('record-bedtime').value || null,
      wakeup: document.getElementById('record-wakeup').value || null,
      sleep: calcSleepHours(document.getElementById('record-bedtime').value, document.getElementById('record-wakeup').value),
    };
    addRecord(record);
    closeModal();
    refreshAll();
    showToast('保存成功', 'success');
  }

  function exportData() {
    const data = { version: 1, exportDate: new Date().toISOString(), records: store.records, settings: store.settings };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `health-tracker-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('数据已导出', 'success');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.records && Array.isArray(data.records)) {
          if (confirm(`即将导入 ${data.records.length} 条记录，是否合并到现有数据？\n\n点击确定：合并（相同日期会覆盖）\n点击取消：取消导入`)) {
            data.records.forEach(r => addRecord(r));
            if (data.settings) { store.settings = { ...store.settings, ...data.settings }; saveSettings(); }
            refreshAll();
            showToast('导入成功', 'success');
          }
        } else { showToast('文件格式不正确', 'error'); }
      } catch (err) { showToast('导入失败：文件解析错误', 'error'); }
    };
    reader.readAsText(file);
  }

  function clearAllData() {
    if (!confirm('确定要清空所有数据吗？此操作不可恢复！\n\n建议先导出备份。')) return;
    store.records = [];
    saveData();
    refreshAll();
    showToast('数据已清空', 'success');
  }

  let toastTimer;
  function showToast(msg, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = 'toast show ' + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.className = 'toast'; }, 2500);
  }

  function switchTab(tab) {
    document.querySelectorAll('.nav-tab').forEach(btn => { btn.classList.toggle('active', btn.dataset.tab === tab); });
    document.querySelectorAll('.page').forEach(page => { page.classList.toggle('active', page.id === 'page-' + tab); });
    if (tab === 'dashboard') updateDashboard();
    else if (tab === 'records') updateRecordsList();
    else if (tab === 'stats') updateStats();
    else if (tab === 'settings') updateSettingsForm();
  }

  function switchPeriod(period) {
    store.currentPeriod = period;
    document.querySelectorAll('.period-btn').forEach(btn => { btn.classList.toggle('active', btn.dataset.period === period); });
    updateCharts();
  }

  function refreshAll() { updateDashboard(); updateRecordsList(); updateStats(); updateSettingsForm(); }

  function init() {
    loadData();
    document.querySelectorAll('.nav-tab').forEach(btn => { btn.addEventListener('click', () => switchTab(btn.dataset.tab)); });
    document.querySelectorAll('.period-btn').forEach(btn => { btn.addEventListener('click', () => switchPeriod(btn.dataset.period)); });
    document.getElementById('btn-add').addEventListener('click', () => openModal());
    document.getElementById('btn-quick-add').addEventListener('click', () => openModal(todayStr()));
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.querySelector('.modal-backdrop').addEventListener('click', closeModal);
    document.getElementById('record-form').addEventListener('submit', handleSubmit);
    document.getElementById('records-body').addEventListener('click', e => {
      const editBtn = e.target.closest('[data-edit]');
      const deleteBtn = e.target.closest('[data-delete]');
      if (editBtn) openModal(editBtn.dataset.edit);
      else if (deleteBtn) { if (confirm('确定删除这条记录吗？')) { deleteRecord(deleteBtn.dataset.delete); refreshAll(); showToast('已删除', 'success'); } }
    });
    document.getElementById('btn-search').addEventListener('click', () => { const date = document.getElementById('search-date').value; updateRecordsList(date); });
    document.getElementById('btn-reset').addEventListener('click', () => { document.getElementById('search-date').value = ''; updateRecordsList(); });
    document.getElementById('btn-export').addEventListener('click', exportData);
    document.getElementById('btn-import').addEventListener('click', () => { document.getElementById('file-import').click(); });
    document.getElementById('file-import').addEventListener('change', e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });
    document.getElementById('btn-settings-export').addEventListener('click', exportData);
    document.getElementById('btn-settings-import').addEventListener('click', () => { document.getElementById('settings-file-import').click(); });
    document.getElementById('settings-file-import').addEventListener('change', e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });
    document.getElementById('btn-clear-data').addEventListener('click', clearAllData);
    document.getElementById('btn-save-profile').addEventListener('click', () => {
      store.settings.height = parseFloat(document.getElementById('setting-height').value) || null;
      store.settings.gender = document.getElementById('setting-gender').value;
      store.settings.age = parseInt(document.getElementById('setting-age').value) || null;
      saveSettings(); refreshAll(); showToast('已保存', 'success');
    });
    document.getElementById('btn-save-goals').addEventListener('click', () => {
      store.settings.goalWeight = parseFloat(document.getElementById('setting-goal-weight').value) || null;
      store.settings.goalWaist = parseFloat(document.getElementById('setting-goal-waist').value) || null;
      store.settings.goalSleep = parseFloat(document.getElementById('setting-goal-sleep').value) || null;
      saveSettings(); refreshAll(); showToast('已保存', 'success');
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
    store.charts.weight = createChart('chart-weight', 'weight', 'line');
    store.charts.waist = createChart('chart-waist', 'waist', 'line');
    store.charts.sleep = createChart('chart-sleep', 'sleep', 'bar');
    store.charts.bmi = createChart('chart-bmi', 'bmi', 'line');
    refreshAll();
    if ('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js').catch(() => {}); }
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
  else { init(); }
})();