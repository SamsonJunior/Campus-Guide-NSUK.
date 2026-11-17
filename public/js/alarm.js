// Rings an on-screen siren and banner on the security desk while any alert
// is still "pending". Polls every 5 seconds. Browsers only allow sound after
// the user has interacted with the page, hence the "enable alarm sound" button.
(function () {
  var banner = document.getElementById('alarm-banner');
  if (!banner) return;
  var title = document.getElementById('alarm-title');
  var detail = document.getElementById('alarm-detail');
  var muteBtn = document.getElementById('alarm-mute');
  var enableBtn = document.getElementById('alarm-enable');

  var audioCtx = null;
  var sirenTimer = null;
  var mutedUpTo = 0;      // alerts with id <= this are silenced
  var baseTitle = document.title;
  var flashTimer = null;

  function unlockAudio() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    enableBtn.hidden = true;
  }
  enableBtn.addEventListener('click', unlockAudio);
  document.addEventListener('click', unlockAudio, { once: true });

  function beep(freq) {
    if (!audioCtx || audioCtx.state !== 'running') return;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.45);
  }

  function startSiren() {
    if (sirenTimer) return;
    var hi = false;
    sirenTimer = setInterval(function () { hi = !hi; beep(hi ? 950 : 650); }, 500);
    if (!flashTimer) {
      var on = false;
      flashTimer = setInterval(function () {
        on = !on;
        document.title = on ? '\u{1F6A8} ALERT \u2013 CampusGuard' : baseTitle;
      }, 800);
    }
  }
  function stopSiren() {
    if (sirenTimer) { clearInterval(sirenTimer); sirenTimer = null; }
    if (flashTimer) { clearInterval(flashTimer); flashTimer = null; document.title = baseTitle; }
  }

  function label(a) {
    var where = a.nearest_location ? ' near ' + a.nearest_location + ' (~' + Math.round(a.nearest_distance_m) + ' m)' : '';
    return a.full_name + ': ' + a.category + where;
  }

  var newestId = 0;
  muteBtn.addEventListener('click', function () { mutedUpTo = newestId; stopSiren(); });

  function poll() {
    fetch('/admin/api/pending', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok || (r.headers.get('content-type') || '').indexOf('json') === -1) throw new Error('not signed in');
        return r.json();
      })
      .then(function (data) {
        var pending = data.pending || [];
        if (pending.length === 0) {
          banner.hidden = true;
          stopSiren();
          return;
        }
        newestId = pending[0].id;
        title.textContent = pending.length === 1 ? 'EMERGENCY ALERT' : pending.length + ' EMERGENCY ALERTS PENDING';
        detail.textContent = label(pending[0]);
        document.getElementById('alarm-open').href = pending.length === 1 ? '/admin/alerts/' + pending[0].id : '/admin/alerts?status=pending';
        banner.hidden = false;
        if (newestId > mutedUpTo) {
          startSiren();
          if (!audioCtx || audioCtx.state !== 'running') enableBtn.hidden = false;
        } else {
          stopSiren();
        }
      })
      .catch(function () { /* signed out or offline: try again next tick */ });
  }

  poll();
  setInterval(poll, 5000);
})();
