(function () {
  var key =
    typeof window.LOOPER_POSTHOG_KEY === 'string' ? window.LOOPER_POSTHOG_KEY.trim() : '';
  if (!key) return;

  var installCopyQueue = [];
  var posthogReady = false;

  function captureInstallCopy(snippet) {
    if (snippet !== 'agent' && snippet !== 'human') return;
    if (posthogReady && window.posthog) {
      window.posthog.capture('install_copy_clicked', { snippet: snippet });
      return;
    }
    installCopyQueue.push(snippet);
  }

  function flushInstallCopyQueue() {
    if (!window.posthog) return;
    while (installCopyQueue.length > 0) {
      var snippet = installCopyQueue.shift();
      window.posthog.capture('install_copy_clicked', { snippet: snippet });
    }
  }

  document.addEventListener('looper:install_copy_clicked', function (event) {
    var detail = event && event.detail;
    var snippet = detail && detail.snippet;
    captureInstallCopy(snippet);
  });

  var script = document.createElement('script');
  script.src = 'https://eu.i.posthog.com/static/array.js';
  script.async = true;
  script.onload = function () {
    if (!window.posthog) return;
    window.posthog.init(key, {
      api_host: 'https://eu.i.posthog.com',
      ui_host: 'https://eu.posthog.com',
      cookieless_mode: 'always',
      autocapture: false,
      capture_pageview: true,
      capture_pageleave: false,
      disable_session_recording: true,
      disable_surveys: true,
      person_profiles: 'never',
      defaults: '2026-05-30',
    });
    posthogReady = true;
    flushInstallCopyQueue();
  };
  document.head.appendChild(script);
})();
