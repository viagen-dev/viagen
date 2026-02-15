export function buildClientScript(opts: {
  position: string;
  panelWidth: number;
  overlay: boolean;
}): string {
  const pos = opts.position;
  const pw = opts.panelWidth;
  const togglePos =
    pos === "bottom-left"
      ? "bottom:16px;left:16px;"
      : pos === "top-right"
        ? "top:16px;right:16px;"
        : pos === "top-left"
          ? "top:16px;left:16px;"
          : "bottom:16px;right:16px;";
  const panelSide = pos.includes("left") ? "left:0;" : "right:0;";
  const toggleSideKey = pos.includes("left") ? "left" : "right";
  const toggleClosedVal = "16px";
  const toggleOpenVal = `${pw + 16}px`;

  return /* js */ `
(function() {
  var OVERLAY_ENABLED = ${opts.overlay};

  /* ---- Error overlay: inject Fix button into shadow DOM ---- */
  if (OVERLAY_ENABLED) {
    var observer = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          if (added[j].nodeName === 'VITE-ERROR-OVERLAY') injectFixButton(added[j]);
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function injectFixButton(overlay) {
    if (!overlay.shadowRoot) return;
    setTimeout(function() {
      var root = overlay.shadowRoot;
      if (root.getElementById('viagen-fix-btn')) return;
      var win = root.querySelector('.window') || root.firstElementChild;
      if (!win) return;

      var style = document.createElement('style');
      style.textContent = [
        '.stack { display: none; }',
        '.tip { display: none; }',
        '.frame { max-height: 120px; overflow: hidden; font-size: 12px; }',
        '.window { max-width: 600px; padding: 20px; }',
        '.window.viagen-fixing .message { opacity: 0.4; }',
        '.window.viagen-fixing .file { opacity: 0.4; }',
        '.window.viagen-fixing .frame { opacity: 0.4; }',
        '#viagen-fixing-status { display: none; padding: 16px; text-align: center; font-family: system-ui, sans-serif; }',
        '#viagen-fixing-status .label { font-size: 15px; font-weight: 600; color: #e4e4e7; }',
        '#viagen-fixing-status .sub { font-size: 12px; color: #71717a; margin-top: 4px; }',
        '#viagen-fixing-status .dot { display: inline-block; animation: viagen-pulse 1.5s ease-in-out infinite; }',
        '.window.viagen-fixing #viagen-fixing-status { display: block; }',
        '.window.viagen-fixing #viagen-fix-btn { display: none; }',
        '@keyframes viagen-pulse { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }',
      ].join('\\n');
      root.appendChild(style);

      var status = document.createElement('div');
      status.id = 'viagen-fixing-status';
      status.innerHTML = '<div class="label"><span class="dot">&#9679;</span> Fixing...</div><div class="sub">Claude is working on it. Check the chat panel.</div>';
      win.appendChild(status);

      var btn = document.createElement('button');
      btn.id = 'viagen-fix-btn';
      btn.textContent = 'Fix This Error';
      btn.style.cssText = 'display:block;width:100%;margin-top:12px;padding:10px 20px;background:#3f3f46;color:#e4e4e7;border:1px solid #52525b;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:system-ui,sans-serif;transition:background 0.15s;';
      btn.onmouseenter = function() { if (!btn.disabled) btn.style.background = '#52525b'; };
      btn.onmouseleave = function() { if (!btn.disabled) btn.style.background = '#3f3f46'; };
      btn.addEventListener('click', function() { fixError(win); });
      win.appendChild(btn);
    }, 50);
  }

  async function fixError(win) {
    win.classList.add('viagen-fixing');
    try {
      var errorRes = await fetch('/via/error');
      var errorData = await errorRes.json();
      if (!errorData.error) { win.classList.remove('viagen-fixing'); return; }
      var e = errorData.error;
      var prompt = 'Fix this Vite build error in ' +
        (e.loc ? e.loc.file + ':' + e.loc.line : 'unknown file') +
        ':\\n\\n' + e.message +
        (e.frame ? '\\n\\nCode frame:\\n' + e.frame : '');
      var p = document.getElementById('viagen-panel');
      if (p && p.style.display === 'none') {
        var t = document.getElementById('viagen-toggle');
        if (t) t.click();
      }
      var f = p && p.querySelector('iframe');
      if (f && f.contentWindow) {
        f.contentWindow.postMessage({ type: 'viagen:send', message: prompt }, '*');
      }
    } catch(err) {
      console.error('[viagen] Fix error failed:', err);
      win.classList.remove('viagen-fixing');
    }
  }

  /* ---- Floating toggle + iframe panel ---- */
  var PANEL_KEY = 'viagen_panel_open';
  var panel = document.createElement('div');
  panel.id = 'viagen-panel';
  panel.style.cssText = 'position:fixed;top:0;${panelSide}bottom:0;width:${pw}px;z-index:99997;display:none;border-left:1px solid #27272a;box-shadow:-4px 0 24px rgba(0,0,0,0.5);';
  var iframe = document.createElement('iframe');
  iframe.src = '/via/ui';
  iframe.style.cssText = 'width:100%;height:100%;border:none;background:#09090b;';
  panel.appendChild(iframe);
  document.body.appendChild(panel);

  var dotColor = '#3f3f46';
  function dotHtml() { return '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + dotColor + ';vertical-align:middle;margin-right:4px;"></span>'; }

  var toggle = document.createElement('button');
  toggle.id = 'viagen-toggle';
  toggle.innerHTML = dotHtml() + 'via';
  toggle.style.cssText = 'position:fixed;${togglePos}z-index:99998;padding:8px 14px;background:#18181b;color:#a1a1aa;border:1px solid #3f3f46;border-radius:20px;font-size:12px;font-weight:600;font-family:ui-monospace,monospace;cursor:pointer;letter-spacing:0.05em;transition:border-color 0.15s,color 0.15s,background 0.15s;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
  toggle.onmouseenter = function() { toggle.style.borderColor = '#71717a'; toggle.style.color = '#e4e4e7'; };
  toggle.onmouseleave = function() { if (panel.style.display === 'none') { toggle.style.borderColor = '#3f3f46'; toggle.style.color = '#a1a1aa'; } };

  fetch('/via/health').then(function(r) { return r.json(); }).then(function(data) {
    dotColor = data.configured ? '#22c55e' : '#ef4444';
    if (panel.style.display === 'none') toggle.innerHTML = dotHtml() + 'via';
  }).catch(function() {
    dotColor = '#ef4444';
    if (panel.style.display === 'none') toggle.innerHTML = dotHtml() + 'via';
  });

  function setPanelOpen(open) {
    panel.style.display = open ? 'block' : 'none';
    toggle.innerHTML = open ? 'x' : dotHtml() + 'via';
    toggle.style.${toggleSideKey} = open ? '${toggleOpenVal}' : '${toggleClosedVal}';
    toggle.style.borderColor = open ? '#71717a' : '#3f3f46';
    toggle.style.color = open ? '#e4e4e7' : '#a1a1aa';
    toggle.style.background = open ? '#3f3f46' : '#18181b';
    try { sessionStorage.setItem(PANEL_KEY, open ? '1' : ''); } catch(e) {}
  }

  toggle.addEventListener('click', function() {
    setPanelOpen(panel.style.display === 'none');
  });
  document.body.appendChild(toggle);

  try { if (sessionStorage.getItem(PANEL_KEY)) setPanelOpen(true); } catch(e) {}
})();
`;
}
