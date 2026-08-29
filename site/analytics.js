(function () {
  var key =
    typeof window.LOOPER_POSTHOG_KEY === 'string' ? window.LOOPER_POSTHOG_KEY.trim() : '';
  if (!key) return;

  document.addEventListener('looper:install_copy_clicked', function (event) {
    var detail = event && event.detail;
    var snippet = detail && detail.snippet;
    if (snippet !== 'agent' && snippet !== 'human') return;
    if (window.posthog) {
      window.posthog.capture('install_copy_clicked', { snippet: snippet });
    }
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
  };
  document.head.appendChild(script);
})();
