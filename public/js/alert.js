(function () {
  const statusEl = document.getElementById('location-status');
  const latInput = document.getElementById('latitude');
  const lngInput = document.getElementById('longitude');
  const accInput = document.getElementById('accuracy');
  const capturedInput = document.getElementById('location_captured');

  // A fix at or under this accuracy (in meters) is good enough to stop early
  // instead of waiting out the full refine window. Real phone GPS typically
  // settles well under this within a few seconds.
  const GOOD_ACCURACY_M = 30;
  // How long to keep refining before accepting whatever we have.
  const MAX_WATCH_MS = 25000;
  // Above this, the fix is almost certainly Wi-Fi/IP based rather than GPS
  // (common on desktops and laptops, which have no GPS chip at all).
  const COARSE_THRESHOLD_M = 1000;

  let watchId = null;
  let bestPos = null;
  let finished = false;
  let hardTimer = null;

  function setStatus(state, html) {
    statusEl.dataset.state = state;
    statusEl.innerHTML = state === 'pending'
      ? '<span class="spinner"></span><span>' + html + '</span>'
      : '<span>' + html + '</span>';
  }

  function applyPosition(pos) {
    if (!bestPos || pos.coords.accuracy < bestPos.coords.accuracy) {
      bestPos = pos;
    }
    latInput.value = bestPos.coords.latitude;
    lngInput.value = bestPos.coords.longitude;
    accInput.value = bestPos.coords.accuracy;
    capturedInput.value = '1';
  }

  function attachRetryHandler() {
    const btn = document.getElementById('retry-location');
    if (btn) btn.addEventListener('click', startWatch);
  }

  function finish() {
    if (finished) return;
    finished = true;
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    if (hardTimer) {
      clearTimeout(hardTimer);
      hardTimer = null;
    }

    if (!bestPos) {
      // No reading at all — error callback already set the message, unless
      // geolocation isn't supported at all (handled in startWatch).
      return;
    }

    const acc = Math.round(bestPos.coords.accuracy);
    if (acc > COARSE_THRESHOLD_M) {
      setStatus(
        'coarse',
        'Best available location captured (accuracy \u00B1' + acc + 'm). ' +
        'This device may not have GPS. Try this on a phone for an exact location, ' +
        'or add a landmark in the note above. ' +
        '<button type="button" id="retry-location" class="link-btn">Try again</button>'
      );
      attachRetryHandler();
    } else {
      setStatus('ok', 'Location captured (accuracy \u00B1' + acc + 'm). It will be sent with your alert.');
    }
  }

  function startWatch() {
    finished = false;
    bestPos = null;
    capturedInput.value = '0';
    setStatus('pending', 'Requesting your device location&hellip;');

    if (!('geolocation' in navigator)) {
      setStatus('error', 'This device does not support location sharing. Please add detail above.');
      return;
    }

    watchId = navigator.geolocation.watchPosition(
      function (pos) {
        applyPosition(pos);
        setStatus('pending', 'Refining your location&hellip; (best so far \u00B1' + Math.round(bestPos.coords.accuracy) + 'm)');
        if (pos.coords.accuracy <= GOOD_ACCURACY_M) {
          finish();
        }
      },
      function () {
        if (!bestPos) {
          setStatus('error', 'Location unavailable. Your alert will still be sent. Add detail above so security can find you.');
        }
        finish();
      },
      { enableHighAccuracy: true, timeout: MAX_WATCH_MS, maximumAge: 0 }
    );

    hardTimer = setTimeout(finish, MAX_WATCH_MS);
  }

  startWatch();

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
      finish(); // lock in whatever location we have the moment the alert sends
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
