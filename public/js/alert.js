(function () {
  const statusEl = document.getElementById('location-status');
  const statusText = document.getElementById('location-status-text');
  const latInput = document.getElementById('latitude');
  const lngInput = document.getElementById('longitude');
  const accInput = document.getElementById('accuracy');
  const capturedInput = document.getElementById('location_captured');

  function setStatus(state, text) {
    statusEl.dataset.state = state;
    statusEl.innerHTML = state === 'pending'
      ? '<span class="spinner"></span><span>' + text + '</span>'
      : '<span>' + text + '</span>';
  }

  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        latInput.value = pos.coords.latitude;
        lngInput.value = pos.coords.longitude;
        accInput.value = pos.coords.accuracy;
        capturedInput.value = '1';
        setStatus('ok', 'Location captured (accuracy \u00B1' + Math.round(pos.coords.accuracy) + 'm). It will be sent with your alert.');
      },
      function () {
        capturedInput.value = '0';
        setStatus('error', 'Location unavailable. Your alert will still be sent \u2014 add detail above so security can find you.');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  } else {
    setStatus('error', 'This device does not support location sharing. Please add detail above.');
  }

  // Press-and-hold to confirm, so the button can't be triggered by an accidental tap.
  const holdBtn = document.getElementById('hold-btn');
  const holdFill = document.getElementById('hold-fill');
  const holdLabel = document.getElementById('hold-label');
  const form = document.getElementById('alert-form');
  const HOLD_MS = 2000;
  let holdTimer = null;
  let holdStart = null;
  let raf = null;

  function startHold() {
    if (holdBtn.disabled) return;
    holdStart = Date.now();
    holdLabel.textContent = 'Keep holding\u2026';
    tick();
    holdTimer = setTimeout(function () {
      holdBtn.disabled = true;
      holdLabel.textContent = 'Sending\u2026';
      cancelAnimationFrame(raf);
      form.submit();
    }, HOLD_MS);
  }

  function tick() {
    const elapsed = Date.now() - holdStart;
    const pct = Math.min(100, (elapsed / HOLD_MS) * 100);
    holdFill.style.width = pct + '%';
    if (elapsed < HOLD_MS) raf = requestAnimationFrame(tick);
  }

  function cancelHold() {
    if (holdTimer) clearTimeout(holdTimer);
    if (raf) cancelAnimationFrame(raf);
    holdFill.style.width = '0%';
    if (!holdBtn.disabled) holdLabel.textContent = 'Press and hold to send alert';
  }

  holdBtn.addEventListener('mousedown', startHold);
  holdBtn.addEventListener('touchstart', function (e) { e.preventDefault(); startHold(); }, { passive: false });
  ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(function (evt) {
    holdBtn.addEventListener(evt, cancelHold);
  });
})();
