(() => {
  const ACTIVE_USER_KEY = 'studyhub_active_timer_user_v1';
  const COMMAND_KEY = 'studyhub_timer_command_v1';
  const $ = id => document.getElementById(id);
  let userId = null;
  let timer = null;
  let lastCommandId = null;

  const storageKey = () => userId ? `studyhub_timer_v1_${userId}` : null;
  const formatTime = seconds => {
    const s = Math.max(0, Math.ceil(Number(seconds) || 0));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  const writeTimer = () => {
    if (!storageKey() || !timer) return;
    try { localStorage.setItem(storageKey(), JSON.stringify(timer)); } catch (e) { $('syncLabel').textContent = 'Could not sync timer'; }
  };
  const readTimer = () => {
    const nextUserId = localStorage.getItem(ACTIVE_USER_KEY);
    if (!nextUserId) {
      userId = null; timer = null; render(); return;
    }
    if (nextUserId !== userId) userId = nextUserId;
    try {
      const raw = localStorage.getItem(storageKey());
      if (!raw) {
        timer = { remaining: 1500, total: 1500, running: false, deadline: 0, subject: '—', mode: 'focus', taskTitle: '', completionPending: false, breakDuration: 300 };
      } else timer = JSON.parse(raw);
      if (timer.running && timer.deadline) {
        timer.remaining = Math.max(0, (timer.deadline - Date.now()) / 1000);
        if (timer.remaining <= 0) {
          timer.remaining = 0; timer.running = false; timer.deadline = 0;
          timer.completionPending = timer.mode === 'focus';
          writeTimer();
        }
      }
    } catch (e) { timer = null; }
    render();
  };
  const render = () => {
    const ready = Boolean(userId && timer);
    $('toggleButton').disabled = !ready;
    $('breakButton').disabled = !ready;
    $('resetButton').disabled = !ready;
    $('clock').textContent = ready ? formatTime(timer.remaining) : '—:—';
    $('task').textContent = ready ? (timer.taskTitle || 'No task linked') : 'Sign in to StudyHub to load your timer';
    $('subject').textContent = ready ? (timer.subject || 'Study') : '—';
    $('modeBadge').textContent = ready ? (timer.mode === 'break' ? 'BREAK' : 'FOCUS') : 'OFFLINE';
    $('modeBadge').classList.toggle('break', ready && timer.mode === 'break');
    $('statusText').textContent = ready ? (timer.running ? 'Running' : timer.completionPending ? 'Complete' : 'Paused') : 'Not connected';
    $('toggleButton').textContent = ready && timer.running ? 'Pause' : 'Start';
    const total = ready ? Math.max(1, Number(timer.total) || 1) : 1;
    const remaining = ready ? Math.max(0, Number(timer.remaining) || 0) : 0;
    $('progressFill').style.width = `${Math.max(0, Math.min(100, (1 - remaining / total) * 100))}%`;
    $('syncLabel').textContent = ready ? 'Synced with StudyHub' : 'Waiting for StudyHub…';
    document.title = ready ? `${formatTime(timer.remaining)} · StudyHub` : 'StudyHub Floating Timer';
  };
  const commit = () => { writeTimer(); render(); };

  $('toggleButton').addEventListener('click', () => {
    if (!timer) return;
    if (timer.running) {
      timer.remaining = timer.deadline ? Math.max(0, (timer.deadline - Date.now()) / 1000) : timer.remaining;
      timer.running = false; timer.deadline = 0;
    } else {
      timer.running = true; timer.deadline = Date.now() + Math.max(0, timer.remaining) * 1000; timer.last = Date.now();
    }
    commit();
  });
  $('breakButton').addEventListener('click', () => {
    if (!timer) return;
    timer.mode = 'break'; timer.taskTitle = 'Break'; timer.total = timer.remaining = Math.max(60, Number(timer.breakDuration) || 300);
    timer.running = true; timer.deadline = Date.now() + timer.remaining * 1000; timer.completionPending = false;
    commit();
  });
  $('resetButton').addEventListener('click', () => {
    if (!timer) return;
    timer.running = false; timer.deadline = 0; timer.completionPending = false; timer.remaining = timer.total;
    commit();
  });
  $('openAppButton').addEventListener('click', () => window.studyHubDesktop?.focusMainWindow?.());
  $('closeButton').addEventListener('click', () => window.studyHubDesktop?.hideFloatingTimer?.());
  $('minimizeButton').addEventListener('click', () => window.studyHubDesktop?.minimizeFloatingTimer?.());
  $('pinButton').addEventListener('click', async () => {
    const enabled = await window.studyHubDesktop?.toggleAlwaysOnTop?.();
    $('pinButton').classList.toggle('active', enabled !== false);
  });

  window.addEventListener('storage', e => {
    if (e.key === ACTIVE_USER_KEY || e.key === storageKey()) readTimer();
  });
  window.addEventListener('focus', readTimer);
  window.setInterval(() => {
    if (!timer) { readTimer(); return; }
    if (timer.running && timer.deadline) {
      timer.remaining = Math.max(0, (timer.deadline - Date.now()) / 1000);
      if (timer.remaining <= 0) {
        timer.remaining = 0; timer.running = false; timer.deadline = 0;
        timer.completionPending = timer.mode === 'focus';
        writeTimer();
      }
    }
    render();
  }, 250);
  readTimer();
})();
