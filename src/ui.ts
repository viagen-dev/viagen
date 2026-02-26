import { buildEditorModule } from "./editor";

export function buildUiHtml(opts?: {
  editable?: boolean;
  git?: boolean;
}): string {
  const hasEditor = opts?.editable ?? false;
  const hasGit = opts?.git ?? false;
  const hasTabs = true; // Logs tab is always present
  const editor = hasEditor ? buildEditorModule() : null;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>viagen</title>
  ${hasEditor ? `<script data-manual src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"><\/script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-typescript.min.js"><\/script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-json.min.js"><\/script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-markdown.min.js"><\/script>` : ""}
  <style>
    ${editor ? editor.css : ""}
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #09090b;
      color: #e4e4e7;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      padding: 10px 16px;
      border-bottom: 1px solid #27272a;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .header h1 {
      font-size: 13px;
      font-weight: 600;
      font-family: ui-monospace, monospace;
      color: #a1a1aa;
      letter-spacing: 0.05em;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .status-dot {
      display: inline-block;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #3f3f46;
    }
    .status-dot.ok { background: #22c55e; }
    .status-dot.error { background: #ef4444; }
    .setup-banner {
      padding: 12px 16px;
      border-bottom: 1px solid #27272a;
      background: #18181b;
      font-size: 12px;
      color: #a1a1aa;
      line-height: 1.6;
      flex-shrink: 0;
      display: none;
    }
    .setup-banner code {
      font-family: ui-monospace, monospace;
      color: #d4d4d8;
      font-size: 11px;
    }
    .update-banner {
      padding: 6px 12px;
      border-bottom: 1px solid #27272a;
      background: #18181b;
      font-family: ui-monospace, monospace;
      font-size: 11px;
      color: #a1a1aa;
      flex-shrink: 0;
      display: none;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .update-banner:hover { background: #1e1e22; }
    .update-banner .update-badge {
      font-size: 9px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 3px;
      background: #365314;
      color: #86efac;
      text-transform: uppercase;
    }
    .btn {
      padding: 5px 10px;
      border: 1px solid #3f3f46;
      background: #18181b;
      color: #a1a1aa;
      border-radius: 5px;
      font-size: 11px;
      cursor: pointer;
      font-family: inherit;
      transition: border-color 0.15s, color 0.15s;
    }
    .btn:hover { border-color: #52525b; color: #e4e4e7; }
    .btn.active { border-color: #22c55e; color: #22c55e; }
    .icon-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 5px 7px;
      min-width: 28px;
      min-height: 28px;
    }
    .icon-btn.active { border-color: #52525b; color: #e4e4e7; }
    .activity-bar {
      padding: 6px 16px;
      border-bottom: 1px solid #27272a;
      background: #18181b;
      font-family: ui-monospace, monospace;
      font-size: 11px;
      color: #71717a;
      flex-shrink: 0;
      display: none;
      animation: pulse 2s ease-in-out infinite;
    }
    .activity-bar.done {
      animation: none;
      color: #a1a1aa;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .msg-summary {
      font-family: ui-monospace, monospace;
      font-size: 11px;
      color: #a1a1aa;
      padding: 4px 0;
    }
    .session-timer {
      font-family: ui-monospace, monospace;
      font-size: 11px;
      color: #52525b;
      margin-left: 8px;
    }
    .session-timer.warning { color: #f59e0b; }
    .session-timer.critical { color: #ef4444; }
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .messages:empty::after {
      content: 'Ask Claude to build features or change something...';
      color: #3f3f46;
      font-size: 13px;
      text-align: center;
      margin-top: 40%;
    }
    .msg {
      font-size: 13px;
      line-height: 1.6;
      word-wrap: break-word;
    }
    .label {
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      display: block;
      margin-bottom: 2px;
    }
    .msg-user .label { color: #a1a1aa; }
    .msg-user .text { color: #d4d4d8; }
    .msg-assistant .label { color: #d4d4d8; }
    .msg-assistant .text {
      color: #d4d4d8;
    }
    .msg-assistant .text a {
      color: #60a5fa;
      text-decoration: underline;
      text-underline-offset: 2px;
      text-decoration-color: #3b82f640;
    }
    .msg-assistant .text a:hover { text-decoration-color: #60a5fa; }
    .msg-assistant .text strong { color: #e4e4e7; }
    .msg-assistant .text em { font-style: italic; }
    .msg-assistant .text .md-code {
      font-family: ui-monospace, monospace;
      font-size: 11px;
      background: #27272a;
      padding: 1px 5px;
      border-radius: 3px;
      color: #d4d4d8;
    }
    .msg-assistant .text .md-pre {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 5px;
      padding: 8px 10px;
      margin: 6px 0;
      overflow-x: auto;
      font-family: ui-monospace, monospace;
      font-size: 11px;
      line-height: 1.5;
      color: #d4d4d8;
    }
    .msg-assistant .text .md-li {
      display: block;
      padding-left: 14px;
      text-indent: -14px;
      line-height: 1.5;
    }
    .msg-assistant .text .md-li:first-child,
    .msg-assistant .text br + .md-li { margin-top: 4px; }
    .msg-assistant .text .md-li:last-child { margin-bottom: 4px; }
    .msg-assistant .text .md-li::before {
      content: '\\2022\\00a0\\00a0';
      color: #52525b;
    }
    .msg-assistant .text .md-h {
      display: block;
      color: #e4e4e7;
      margin-top: 4px;
    }
    .msg-tool {
      font-family: ui-monospace, monospace;
      font-size: 11px;
      color: #71717a;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 5px;
      padding: 6px 10px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .msg-tool-result {
      font-family: ui-monospace, monospace;
      font-size: 10px;
      color: #52525b;
      background: #111113;
      border: 1px solid #1e1e22;
      border-top: none;
      border-radius: 0 0 5px 5px;
      padding: 0;
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.2s, padding 0.2s;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .msg-tool-result.open {
      max-height: 200px;
      padding: 6px 10px;
      overflow-y: auto;
    }
    .msg-tool.expandable {
      cursor: pointer;
      border-radius: 5px 5px 0 0;
    }
    .msg-tool.expandable::after {
      content: ' +';
      color: #3f3f46;
    }
    .msg-tool.expandable.expanded::after {
      content: ' -';
    }
    .msg-error {
      font-size: 12px;
      color: #f87171;
      background: #1c0a0a;
      border: 1px solid #7f1d1d;
      border-radius: 5px;
      padding: 6px 10px;
    }
    .input-area {
      padding: 10px 12px;
      border-top: 1px solid #27272a;
      display: flex;
      gap: 6px;
      flex-shrink: 0;
    }
    .input-area input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid #3f3f46;
      background: #18181b;
      color: #e4e4e7;
      border-radius: 6px;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.15s;
    }
    .input-area input:focus { border-color: #71717a; }
    .input-area input::placeholder { color: #52525b; }
    .input-area input:disabled { opacity: 0.5; }
    .send-btn {
      padding: 8px 16px;
      background: #3f3f46;
      color: #e4e4e7;
      border: 1px solid #52525b;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.15s, border-color 0.15s;
    }
    .send-btn:hover { background: #52525b; border-color: #71717a; }
    .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .status-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 12px;
      font-family: ui-monospace, monospace;
      font-size: 11px;
      color: #52525b;
      border-top: 1px solid #1e1e22;
      flex-shrink: 0;
    }
    .status-bar span { cursor: pointer; transition: color 0.15s; }
    .status-bar span:hover { color: #a1a1aa; }
    .status-bar .d-add { color: #4ade80; }
    .status-bar .d-del { color: #f87171; }
    .changes-branch {
      padding: 8px 12px;
      font-family: ui-monospace, monospace;
      font-size: 12px;
      color: #a1a1aa;
      border-bottom: 1px solid #1e1e22;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .changes-branch a {
      color: #52525b;
      text-decoration: none;
      font-size: 11px;
      transition: color 0.15s;
    }
    .changes-branch a:hover { color: #a1a1aa; }
    .tab-bar {
      display: flex;
      border-bottom: 1px solid #27272a;
      flex-shrink: 0;
      background: #18181b;
    }
    .tab {
      flex: 1;
      padding: 8px 16px;
      font-size: 12px;
      font-weight: 600;
      font-family: ui-monospace, monospace;
      color: #71717a;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      border-right: 1px solid #27272a;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s;
    }
    .tab:last-child { border-right: none; }
    .tab:hover { color: #a1a1aa; }
    .tab.active { color: #e4e4e7; border-bottom-color: #e4e4e7; }
    .changes-file {
      padding: 8px 16px;
      font-family: ui-monospace, monospace;
      font-size: 12px;
      color: #a1a1aa;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: background 0.1s;
      border-bottom: 1px solid #1e1e22;
    }
    .changes-file:hover { background: #18181b; color: #e4e4e7; }
    .changes-file .file-path { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .changes-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .changes-dot.M { background: #facc15; }
    .changes-dot.A { background: #4ade80; }
    .changes-dot.q { background: #4ade80; }
    .changes-dot.D { background: #f87171; }
    .changes-dot.R { background: #60a5fa; }
    .changes-badge {
      font-size: 10px;
      color: #52525b;
      font-family: ui-monospace, monospace;
    }
    .changes-summary {
      padding: 8px 16px;
      border-bottom: 1px solid #27272a;
      background: #18181b;
      font-family: ui-monospace, monospace;
      font-size: 11px;
      color: #71717a;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }
    .changes-summary .stat-add { color: #4ade80; }
    .changes-summary .stat-del { color: #f87171; }
    .changes-summary .stat-files { color: #a1a1aa; }
    .file-delta {
      font-family: ui-monospace, monospace;
      font-size: 10px;
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }
    .file-delta .d-add { color: #4ade80; }
    .file-delta .d-del { color: #f87171; }
    .diff-view {
      flex: 1;
      overflow-y: auto;
      padding: 0;
      font-family: ui-monospace, monospace;
      font-size: 11px;
      line-height: 1.6;
    }
    .diff-line {
      padding: 0 12px;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .diff-add { color: #4ade80; background: rgba(74,222,128,0.08); }
    .diff-del { color: #f87171; background: rgba(248,113,113,0.08); }
    .diff-hunk { color: #a78bfa; background: rgba(167,139,250,0.06); padding-top: 6px; margin-top: 4px; }
    .diff-meta { color: #52525b; }
    .diff-ctx { color: #71717a; }
    .changes-empty {
      padding: 16px;
      color: #52525b;
      font-size: 12px;
      font-family: ui-monospace, monospace;
      text-align: center;
      margin-top: 40%;
    }
    .logs-header {
      padding: 6px 12px;
      border-bottom: 1px solid #27272a;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
      background: #18181b;
    }
    .logs-header span {
      font-family: ui-monospace, monospace;
      font-size: 11px;
      color: #52525b;
    }
    .logs-list {
      flex: 1;
      overflow-y: auto;
      padding: 4px 0;
    }
    .log-entry {
      padding: 1px 16px;
      font-family: ui-monospace, monospace;
      font-size: 11px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-all;
      color: #a1a1aa;
    }
    .log-entry.warn { color: #facc15; }
    .log-entry.error { color: #f87171; }
    .log-time { color: #52525b; margin-right: 8px; }
    .logs-empty {
      padding: 16px;
      color: #52525b;
      font-size: 12px;
      font-family: ui-monospace, monospace;
      text-align: center;
      margin-top: 40%;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1><span class="status-dot" id="status-dot"></span> viagen <span class="session-timer" id="session-timer"></span></h1>
    <div style="display:flex;gap:4px;align-items:center;">
      <button class="btn icon-btn" id="view-preview" title="Preview app">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
      </button>
      <button class="btn icon-btn" id="view-split" title="Split view">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="3" x2="12" y2="21"></line></svg>
      </button>
      <button class="btn icon-btn" id="view-chat" title="Chat only">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
      </button>
      <button class="btn icon-btn" id="sound-btn" title="Toggle completion sound">
        <svg id="sound-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></svg>
      </button>
      <button class="btn" id="reset-btn">Reset</button>
    </div>
  </div>
  ${
    hasTabs
      ? `<div class="tab-bar" id="tab-bar">
    <button class="tab active" data-tab="chat">Chat</button>
    ${hasGit ? '<button class="tab" data-tab="changes" id="changes-tab" style="position:relative;">Changes<span id="changes-dot" style="display:none;position:absolute;top:6px;right:6px;width:6px;height:6px;border-radius:50%;background:#facc15;"></span></button>' : ""}
    ${hasEditor ? '<button class="tab" data-tab="files">Files</button>' : ""}
    <button class="tab" data-tab="logs">Logs</button>
  </div>`
      : ""
  }
  <div id="chat-view" style="display:flex;flex-direction:column;flex:1;overflow:hidden;">
    <div class="setup-banner" id="setup-banner"></div>
    <div class="update-banner" id="update-banner"><span class="update-badge">update</span><span id="update-text"></span></div>
    <div class="activity-bar" id="activity-bar"></div>
    <div class="messages" id="messages"></div>
    <div class="input-area">
      <input type="text" id="input" placeholder="What do you want to build?" autofocus />
      <button class="send-btn" id="send-btn">Send</button>
    </div>
    <div class="status-bar" id="status-bar">${hasGit ? '<span id="status-branch"></span><span id="status-diff"></span>' : ''}<span id="status-cost" style="display:none;margin-left:auto;"></span></div>
  </div>
  ${editor ? editor.html : ""}
  ${
    hasGit
      ? `<div id="changes-view" style="display:none;flex-direction:column;flex:1;overflow:hidden;">
    <div class="changes-branch" id="changes-branch" style="display:none;">
      <span id="changes-branch-name"></span>
      <a id="changes-pr-link" target="_blank" style="display:none;"></a>
    </div>
    <div class="changes-summary" id="changes-summary" style="display:none;">
      <span id="changes-stats"></span>
      <span style="flex:1;"></span>
      <button class="btn" id="commit-btn" style="font-size:11px;padding:3px 8px;">Commit</button>
      <button class="btn" id="revert-btn" style="font-size:11px;padding:3px 8px;color:#f87171;border-color:#7f1d1d;">Revert</button>
    </div>
    <div id="changes-list-view" style="flex:1;overflow-y:auto;">
      <div id="changes-list" style="padding:0;"></div>
    </div>
    <div id="changes-diff-view" style="display:none;flex-direction:column;flex:1;overflow:hidden;">
      <div class="editor-header">
        <button class="editor-back" id="diff-back" title="Back to changes">&#x2190;</button>
        <span class="editor-filename" id="diff-filename"></span>
      </div>
      <div class="diff-view" id="diff-content"></div>
    </div>
  </div>`
      : ""
  }
  <div id="logs-view" style="display:none;flex-direction:column;flex:1;overflow:hidden;">
    <div class="logs-header">
      <span id="logs-count"></span>
      <button class="btn" id="logs-refresh" style="font-size:11px;padding:2px 8px;">Refresh</button>
    </div>
    <div class="logs-list" id="logs-list"></div>
  </div>
  <script>
    var SOUND_KEY = 'viagen_sound';
    var messagesEl = document.getElementById('messages');
    var inputEl = document.getElementById('input');
    var sendBtn = document.getElementById('send-btn');
    var resetBtn = document.getElementById('reset-btn');
    var soundBtn = document.getElementById('sound-btn');
    var activityBar = document.getElementById('activity-bar');
    var currentTextSpan = null;
    var isStreaming = false;
    var chatLog = []; // Array of { type: 'user'|'text'|'tool'|'error'|'summary', content: string }
    var unloading = false;
    var historyTimestamp = 0;
    var historyPoll = null;
    var sendStartTime = 0;
    var toolCount = 0;
    var activityTimer = null;
    var soundEnabled = false;

    var soundIcon = document.getElementById('sound-icon');
    var speakerOn = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>';
    var speakerOff = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>';

    function updateSoundIcon() {
      soundIcon.innerHTML = soundEnabled ? speakerOn : speakerOff;
      soundBtn.classList.toggle('active', soundEnabled);
    }

    // Load sound preference
    try { soundEnabled = localStorage.getItem(SOUND_KEY) === '1'; } catch(e) {}
    updateSoundIcon();

    soundBtn.addEventListener('click', function() {
      soundEnabled = !soundEnabled;
      try { localStorage.setItem(SOUND_KEY, soundEnabled ? '1' : '0'); } catch(e) {}
      updateSoundIcon();
      // Play a short test beep on first enable
      if (soundEnabled) playDoneSound();
    });

    function playDoneSound() {
      if (!soundEnabled) return;
      try {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1047, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      } catch(e) {}
    }

    function scrollToBottom() {
      requestAnimationFrame(function() {
        scrollToBottom();
      });
    }

    function formatDuration(ms) {
      if (ms < 1000) return ms + 'ms';
      var secs = Math.round(ms / 1000);
      if (secs < 60) return secs + 's';
      var mins = Math.floor(secs / 60);
      secs = secs % 60;
      return mins + 'm ' + secs + 's';
    }

    function updateActivityBar() {
      if (!isStreaming) return;
      var elapsed = formatDuration(Date.now() - sendStartTime);
      var parts = [elapsed];
      if (toolCount > 0) parts.push(toolCount + (toolCount === 1 ? ' action' : ' actions'));
      activityBar.textContent = parts.join(' · ');
    }

    function showActivity() {
      activityBar.style.display = 'block';
      activityBar.classList.remove('done');
      updateActivityBar();
      activityTimer = setInterval(updateActivityBar, 1000);
    }

    var sessionCostUsd = 0;
    var sessionInputTokens = 0;
    var sessionOutputTokens = 0;

    function formatCost(usd) {
      if (usd < 0.01) return '<$0.01';
      return '$' + usd.toFixed(2);
    }

    function formatTokens(n) {
      if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
      if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
      return String(n);
    }

    function hideActivity(usage) {
      if (activityTimer) { clearInterval(activityTimer); activityTimer = null; }
      var elapsed = formatDuration(Date.now() - sendStartTime);
      var parts = ['Done in ' + elapsed];
      if (toolCount > 0) parts.push(toolCount + (toolCount === 1 ? ' action' : ' actions'));
      if (usage && usage.costUsd != null) {
        parts.push(formatCost(usage.costUsd));
        sessionCostUsd += usage.costUsd;
        sessionInputTokens += (usage.inputTokens || 0);
        sessionOutputTokens += (usage.outputTokens || 0);
      }
      activityBar.textContent = parts.join(' \\u00b7 ');
      activityBar.classList.add('done');
      setTimeout(function() { activityBar.style.display = 'none'; }, 5000);
      // Update status bar with session total
      var costEl = document.getElementById('status-cost');
      if (costEl && sessionCostUsd > 0) {
        costEl.textContent = formatCost(sessionCostUsd) + ' (' + formatTokens(sessionInputTokens + sessionOutputTokens) + ' tokens)';
        costEl.style.display = '';
      }
    }
    window.addEventListener('beforeunload', function() { unloading = true; stopHistoryPolling(); });
    window.addEventListener('pagehide', function() { unloading = true; });
    try { window.parent.addEventListener('beforeunload', function() { unloading = true; }); } catch(e) {}

    function appendHistoryEntries(entries) {
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (entry.timestamp) historyTimestamp = Math.max(historyTimestamp, entry.timestamp);
        if (entry.role === 'user' && entry.type === 'message') {
          chatLog.push({ type: 'user', content: entry.text });
          renderUserMessage(entry.text);
        } else if (entry.role === 'assistant' && entry.type === 'text') {
          chatLog.push({ type: 'text', content: entry.text });
          renderTextBlock(entry.text);
        } else if (entry.role === 'assistant' && entry.type === 'tool_use') {
          var label = formatTool(entry.name, entry.input);
          chatLog.push({ type: 'tool', content: label });
          renderToolBlock(label);
        }
        // Skip 'result' entries — they duplicate the last text block
      }
      if (entries.length > 0) messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    async function loadHistory() {
      try {
        var res = await fetch('/via/chat/history');
        var data = await res.json();
        if (!data.entries || data.entries.length === 0) return;
        chatLog = [];
        messagesEl.innerHTML = '';
        appendHistoryEntries(data.entries);
      } catch(e) {}
    }

    async function pollHistory() {
      if (isStreaming) return;
      try {
        var res = await fetch('/via/chat/history?since=' + historyTimestamp);
        var data = await res.json();
        if (data.entries && data.entries.length > 0) {
          appendHistoryEntries(data.entries);
        }
      } catch(e) {}
    }

    function startHistoryPolling() {
      stopHistoryPolling();
      historyPoll = setInterval(pollHistory, 1500);
    }

    function stopHistoryPolling() {
      if (historyPoll) { clearInterval(historyPoll); historyPoll = null; }
    }

    function escapeHtml(text) {
      var div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function renderInline(text) {
      // Split by inline code to protect it from further processing
      var parts = text.split(/(\`[^\`]+\`)/g);
      var out = '';
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (p.charAt(0) === '\`' && p.charAt(p.length - 1) === '\`') {
          out += '<span class="md-code">' + escapeHtml(p.slice(1, -1)) + '</span>';
        } else {
          var s = escapeHtml(p);
          // Bold
          s = s.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
          // Italic (single * not preceded/followed by *)
          s = s.replace(/(?:^|[^*])\\*([^*]+)\\*(?:[^*]|$)/g, function(m, g) { return m.replace('*' + g + '*', '<em>' + g + '</em>'); });
          // Links [text](url)
          s = s.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
          // Bare URLs
          s = s.replace(/(^|\\s)(https?:\\/\\/[^\\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
          out += s;
        }
      }
      return out;
    }

    function renderMarkdown(text) {
      // Split by fenced code blocks
      var parts = text.split(/(^\`\`\`[\\s\\S]*?^\`\`\`)/gm);
      // Fallback: if no code blocks matched, try non-multiline split
      if (parts.length === 1) {
        parts = text.split(/(\`\`\`[\\w]*\\n[\\s\\S]*?\\n\`\`\`)/g);
      }
      var html = '';
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (p.indexOf('\`\`\`') === 0) {
          // Code block — strip fence and optional language tag
          var code = p.replace(/^\`\`\`\\w*\\n?/, '').replace(/\\n?\`\`\`$/, '');
          html += '<pre class="md-pre">' + escapeHtml(code) + '</pre>';
        } else {
          // Process line by line
          var lines = p.split('\\n');
          var lineHtml = [];
          for (var j = 0; j < lines.length; j++) {
            var line = lines[j];
            // Headers
            if (line.match(/^### /)) { lineHtml.push('<strong class="md-h">' + renderInline(line.slice(4)) + '</strong>'); }
            else if (line.match(/^## /)) { lineHtml.push('<strong class="md-h">' + renderInline(line.slice(3)) + '</strong>'); }
            else if (line.match(/^# /)) { lineHtml.push('<strong class="md-h">' + renderInline(line.slice(2)) + '</strong>'); }
            // List items (- or *)
            else if (line.match(/^[-*] /)) { lineHtml.push('<span class="md-li">' + renderInline(line.slice(2)) + '</span>'); }
            // Normal line
            else { lineHtml.push(renderInline(line)); }
          }
          // Join lines, skipping <br> between consecutive list items
          var joined = '';
          for (var k = 0; k < lineHtml.length; k++) {
            if (k > 0) {
              var prevLi = lineHtml[k - 1].indexOf('md-li') !== -1;
              var currLi = lineHtml[k].indexOf('md-li') !== -1;
              if (!(prevLi && currLi)) joined += '<br>';
            }
            joined += lineHtml[k];
          }
          html += joined;
        }
      }
      return html;
    }

    function formatTool(name, input) {
      var i = input || {};
      switch (name) {
        case 'Read': return i.file_path ? 'Reading ' + i.file_path : 'Read';
        case 'Edit': return i.file_path ? 'Editing ' + i.file_path : 'Edit';
        case 'Write': return i.file_path ? 'Writing ' + i.file_path : 'Write';
        case 'Bash': return i.command ? '$ ' + i.command : 'Bash';
        case 'Glob': return i.pattern ? 'Finding ' + i.pattern : 'Glob';
        case 'Grep': return i.pattern ? 'Searching "' + i.pattern + '"' : 'Grep';
        case 'Task': return i.description ? 'Task: ' + i.description : 'Task';
        default: return name;
      }
    }

    function renderUserMessage(text) {
      var div = document.createElement('div');
      div.className = 'msg msg-user';
      div.innerHTML = '<span class="label">You</span><span class="text">' + escapeHtml(text) + '</span>';
      messagesEl.appendChild(div);
    }

    function renderTextBlock(text) {
      currentTextSpan = null;
      var div = document.createElement('div');
      div.className = 'msg msg-assistant';
      div.innerHTML = '<span class="label">Claude</span><span class="text stream-text"></span>';
      messagesEl.appendChild(div);
      div.querySelector('.stream-text').innerHTML = renderMarkdown(text);
    }

    var lastToolEl = null;

    function renderToolBlock(text) {
      currentTextSpan = null;
      var div = document.createElement('div');
      div.className = 'msg msg-tool';
      div.textContent = text;
      messagesEl.appendChild(div);
      lastToolEl = div;
    }

    function renderErrorBlock(text) {
      var div = document.createElement('div');
      div.className = 'msg msg-error';
      div.textContent = text;
      messagesEl.appendChild(div);
    }

    function addUserMessage(text) {
      chatLog.push({ type: 'user', content: text });

      renderUserMessage(text);
      scrollToBottom();
    }

    function appendText(text) {
      var last = chatLog[chatLog.length - 1];
      if (last && last.type === 'text') {
        last.content += text;
      } else {
        chatLog.push({ type: 'text', content: text });
      }


      if (!currentTextSpan) {
        var div = document.createElement('div');
        div.className = 'msg msg-assistant';
        div.innerHTML = '<span class="label">Claude</span><span class="text stream-text"></span>';
        messagesEl.appendChild(div);
        currentTextSpan = div.querySelector('.stream-text');
      }
      var fullText = chatLog[chatLog.length - 1].content;
      currentTextSpan.innerHTML = renderMarkdown(fullText);
      scrollToBottom();
    }

    function addToolBlock(name, input) {
      currentTextSpan = null;
      var label = formatTool(name, input);
      chatLog.push({ type: 'tool', content: label });

      renderToolBlock(label);
      scrollToBottom();
    }

    function renderToolResult(text) {
      if (!lastToolEl) return;
      lastToolEl.classList.add('expandable');
      var resultDiv = document.createElement('div');
      resultDiv.className = 'msg-tool-result';
      var truncated = text.length > 2000 ? text.slice(0, 2000) + '...' : text;
      resultDiv.textContent = truncated;
      lastToolEl.after(resultDiv);
      lastToolEl.addEventListener('click', function() {
        lastToolEl.classList.toggle('expanded');
        resultDiv.classList.toggle('open');
      });
    }

    function addToolResult(text) {
      chatLog.push({ type: 'tool_result', content: text });

      renderToolResult(text);
    }

    function addErrorBlock(text) {
      chatLog.push({ type: 'error', content: text });

      renderErrorBlock(text);
      scrollToBottom();
    }

    function setStreaming(v) {
      isStreaming = v;
      inputEl.disabled = v;
      sendBtn.disabled = v;
      sendBtn.textContent = v ? '...' : 'Send';
      if (v) stopHistoryPolling();
      else startHistoryPolling();
    }

    async function sendRaw(text) {
      try {
        var res = await fetch('/via/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text }),
        });

        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';
        var lastUsage = null;

        while (true) {
          var result = await reader.read();
          if (result.done) break;

          buffer += decoder.decode(result.value, { stream: true });
          var lines = buffer.split('\\n');
          buffer = lines.pop() || '';

          for (var i = 0; i < lines.length; i++) {
            if (!lines[i].startsWith('data: ')) continue;
            try {
              var data = JSON.parse(lines[i].slice(6));
              if (data.type === 'text') appendText(data.text);
              else if (data.type === 'tool_use') { toolCount++; updateActivityBar(); addToolBlock(data.name, data.input); }
              else if (data.type === 'tool_result') addToolResult(data.text);
              else if (data.type === 'error') addErrorBlock(data.text);
              else if (data.type === 'done') lastUsage = data;
            } catch (e) {}
          }
        }
      } catch (e) {
        if (!unloading) addErrorBlock('Connection failed');
      }

      hideActivity(lastUsage);
      playDoneSound();
      historyTimestamp = Date.now();
      setStreaming(false);
      inputEl.focus();
    }

    async function send() {
      var text = inputEl.value.trim();
      if (!text || isStreaming) return;

      addUserMessage(text);
      inputEl.value = '';
      setStreaming(true);
      currentTextSpan = null;
      sendStartTime = Date.now();
      toolCount = 0;
      showActivity();
      scrollToBottom();

      await sendRaw(text);
    }

    sendBtn.addEventListener('click', send);
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    resetBtn.addEventListener('click', async function () {
      await fetch('/via/chat/reset', { method: 'POST' });
      chatLog = [];

      messagesEl.innerHTML = '';
      currentTextSpan = null;
      inputEl.focus();
    });
    // ── View mode detection ──
    var viewMode = 'overlay';
    if (window.self === window.top) viewMode = 'standalone';

    function highlightViewMode() {
      document.getElementById('view-preview').classList.toggle('active', viewMode === 'overlay');
      document.getElementById('view-split').classList.toggle('active', viewMode === 'iframe');
      document.getElementById('view-chat').classList.toggle('active', viewMode === 'standalone');
    }

    document.getElementById('view-preview').addEventListener('click', function() {
      if (viewMode === 'overlay') return;
      var target = (window.self !== window.top) ? window.top : window;
      target.location.href = '/';
    });
    document.getElementById('view-split').addEventListener('click', function() {
      if (viewMode === 'iframe') return;
      var target = (window.self !== window.top) ? window.top : window;
      target.location.href = '/via/iframe';
    });
    document.getElementById('view-chat').addEventListener('click', function() {
      if (viewMode === 'standalone') return;
      var target = (window.self !== window.top) ? window.top : window;
      target.location.href = '/via/ui';
    });

    highlightViewMode();

    // ── Commit + Revert buttons (inside Changes summary bar) ──
    var commitBtn = document.getElementById('commit-btn');
    var revertBtn = document.getElementById('revert-btn');

    if (commitBtn) {
      commitBtn.addEventListener('click', function() {
        if (isStreaming) return;
        var chatTab = document.querySelector('.tab[data-tab="chat"]');
        if (chatTab && !chatTab.classList.contains('active')) chatTab.click();
        inputEl.value = 'Commit all changes and push to the active branch.';
        send();
      });
    }

    if (revertBtn) {
      revertBtn.addEventListener('click', function() {
        if (isStreaming) return;
        if (!confirm('Revert all changes? This cannot be undone.')) return;
        var chatTab = document.querySelector('.tab[data-tab="chat"]');
        if (chatTab && !chatTab.classList.contains('active')) chatTab.click();
        inputEl.value = 'Run git checkout -- . && git clean -fd to revert all changes.';
        send();
      });
    }

    // Accept messages from parent (e.g. "Fix This Error" button)
    window.addEventListener('message', function(ev) {
      if (ev.data && ev.data.type === 'viagen:send' && ev.data.message) {
        inputEl.value = ev.data.message;
        send();
      }
      // Detect iframe split-view mode
      if (ev.data && ev.data.type === 'viagen:context' && ev.data.iframe) {
        viewMode = 'iframe';
        highlightViewMode();
      }
    });

    function startSessionTimer(expiresAt) {
      var timerEl = document.getElementById('session-timer');
      function tick() {
        var remaining = expiresAt - Math.floor(Date.now() / 1000);
        if (remaining <= 0) {
          timerEl.textContent = 'expired';
          timerEl.className = 'session-timer critical';
          return;
        }
        var mins = Math.floor(remaining / 60);
        var secs = remaining % 60;
        timerEl.textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;
        if (remaining <= 120) timerEl.className = 'session-timer critical';
        else if (remaining <= 300) timerEl.className = 'session-timer warning';
        else timerEl.className = 'session-timer';
        setTimeout(tick, 1000);
      }
      tick();
    }

    // Health check — show status and disable input if not configured
    fetch('/via/health')
      .then(function(r) { return r.json(); })
      .then(async function(data) {
        var dot = document.getElementById('status-dot');
        var banner = document.getElementById('setup-banner');
        if (data.configured) {
          dot.className = 'status-dot ok';
        } else {
          dot.className = 'status-dot error';
          inputEl.disabled = true;
          sendBtn.disabled = true;
          inputEl.placeholder = 'Not configured — run npx viagen setup';
        }
        // Show checklist banner if anything is missing
        if (data.missing && data.missing.length > 0) {
          banner.style.display = 'block';
          var items = data.missing.map(function(v) {
            var isSet = data.missing.indexOf(v) === -1;
            return '<div style="font-family:ui-monospace,monospace;font-size:11px;padding:1px 0;">' +
              '<span style="color:' + (isSet ? '#22c55e' : '#ef4444') + ';margin-right:6px;">' + (isSet ? '&#10003;' : '&#10007;') + '</span>' +
              '<span style="color:#a1a1aa;">' + escapeHtml(v) + '</span></div>';
          });
          banner.innerHTML = '<div style="margin-bottom:6px;">Missing environment variables:</div>' +
            items.join('') +
            '<div style="margin-top:8px;">Run <code>npx viagen setup</code> to configure, then restart.</div>';
        }
        if (data.session) startSessionTimer(data.session.expiresAt);

        // Load chat history from server (source of truth)
        await loadHistory();
        startHistoryPolling();

        // Check for changes + branch info on first load
        if (data.git) {
          fetch('/via/git/status').then(function(r) { return r.json(); }).then(function(d) {
            var dot = document.getElementById('changes-dot');
            if (d.files && d.files.length > 0 && dot) dot.style.display = 'block';
            // Update status bar diff summary
            var statusDiff = document.getElementById('status-diff');
            if (statusDiff && (d.insertions || d.deletions)) {
              statusDiff.innerHTML = '<span class="d-add">+' + d.insertions + '</span> <span class="d-del">\\u2212' + d.deletions + '</span>';
            }
          }).catch(function() {});

          fetch('/via/git/branch').then(function(r) { return r.json(); }).then(function(d) {
            if (!d.branch) return;
            var branchUrl = d.pr ? d.pr.url : (d.remoteUrl ? d.remoteUrl + '/tree/' + d.branch : null);
            // Status bar
            var statusBar = document.getElementById('status-bar');
            var statusBranch = document.getElementById('status-branch');
            if (statusBar && statusBranch) {
              statusBranch.textContent = '\\u2387 ' + d.branch;
              if (branchUrl) {
                statusBranch.addEventListener('click', function() { window.open(branchUrl, '_blank'); });
              }
            }
            // Status diff click → switch to changes tab
            var statusDiff = document.getElementById('status-diff');
            if (statusDiff) {
              statusDiff.addEventListener('click', function() {
                var changesTab = document.querySelector('[data-tab="changes"]');
                if (changesTab) changesTab.click();
              });
            }
            // Changes tab branch header
            var changesBranch = document.getElementById('changes-branch');
            var changesBranchName = document.getElementById('changes-branch-name');
            var changesPrLink = document.getElementById('changes-pr-link');
            if (changesBranch && changesBranchName) {
              changesBranch.style.display = 'flex';
              changesBranchName.textContent = '\\u2387 ' + d.branch;
              if (branchUrl && !d.pr) {
                changesBranchName.innerHTML = '<a href="' + branchUrl + '" target="_blank" style="color:inherit;text-decoration:none;">' + '\\u2387 ' + escapeHtml(d.branch) + '</a>';
              }
            }
            if (changesPrLink && d.pr) {
              changesPrLink.style.display = 'inline';
              changesPrLink.href = d.pr.url;
              changesPrLink.textContent = '\\u2192 #' + d.pr.number + ' ' + d.pr.title;
            }
          }).catch(function() {});
        }

        // Check for viagen updates
        fetch('/via/version').then(function(r) { return r.json(); }).then(function(v) {
          if (v.updateAvailable && v.latest) {
            var updateBanner = document.getElementById('update-banner');
            var updateText = document.getElementById('update-text');
            if (updateBanner && updateText) {
              updateText.textContent = 'viagen ' + v.latest + ' available (current: ' + v.current + ')';
              updateBanner.style.display = 'flex';
              updateBanner.addEventListener('click', function() {
                updateBanner.style.display = 'none';
                inputEl.value = 'Update viagen to v' + v.latest + ' (npm install viagen@' + v.latest + ') and restart the dev server.';
                send();
              });
            }
          }
        }).catch(function() {});

        // Only auto-send prompt if no history exists (first boot)
        if (data.prompt && data.configured && chatLog.length === 0) {
          if (data.taskId) {
            // Task mode: show link instead of raw prompt
            var taskUrl = 'https://app.viagen.dev' + (data.projectId ? '/' + data.projectId : '') + '/' + data.taskId;
            var div = document.createElement('div');
            div.className = 'msg msg-user';
            div.innerHTML = '<span class="label">Task</span><span class="text">Received instructions from <a href="' + escapeHtml(taskUrl) + '" target="_blank" style="color:#93c5fd;text-decoration:underline;">Viagen Task</a></span>';
            messagesEl.appendChild(div);
            scrollToBottom();
            // Send the prompt silently (don't show it as a user message)
            showActivity();
            setStreaming(true);
            sendStartTime = Date.now();
            toolCount = 0;
            sendRaw(data.prompt);
          } else {
            inputEl.value = data.prompt;
            send();
          }
        }
      })
      .catch(function() {
        document.getElementById('status-dot').className = 'status-dot error';
      });

    // ── Tab switching ──
    ${
      hasTabs
        ? `
    (function() {
      var chatView = document.getElementById('chat-view');
      var filesView = document.getElementById('files-view');
      var changesView = document.getElementById('changes-view');
      var logsView = document.getElementById('logs-view');
      var tabs = document.querySelectorAll('.tab');

      tabs.forEach(function(tab) {
        tab.addEventListener('click', function() {
          tabs.forEach(function(t) { t.classList.remove('active'); });
          tab.classList.add('active');
          var target = tab.dataset.tab;
          chatView.style.display = target === 'chat' ? 'flex' : 'none';
          if (filesView) filesView.style.display = target === 'files' ? 'flex' : 'none';
          if (changesView) changesView.style.display = target === 'changes' ? 'flex' : 'none';
          if (logsView) logsView.style.display = target === 'logs' ? 'flex' : 'none';
          if (target === 'files' && window._viagenLoadFiles) window._viagenLoadFiles();
          if (target === 'changes' && window._viagenLoadChanges) window._viagenLoadChanges();
          if (target === 'logs' && window._viagenLoadLogs) window._viagenLoadLogs();
          if (target !== 'logs' && window._viagenStopLogPolling) window._viagenStopLogPolling();
          if (target === 'chat') inputEl.focus();
        });
      });
    })();
    `
        : ""
    }

    // ── File editor panel ──
    ${editor ? editor.js : ""}

    // ── Changes panel (git diff) ──
    ${
      hasGit
        ? `
    (function() {
      var changesListView = document.getElementById('changes-list-view');
      var changesDiffView = document.getElementById('changes-diff-view');
      var changesListEl = document.getElementById('changes-list');
      var diffContent = document.getElementById('diff-content');
      var diffFilename = document.getElementById('diff-filename');
      var changesTab = document.getElementById('changes-tab');
      var changesSummary = document.getElementById('changes-summary');

      var changesDotEl = document.getElementById('changes-dot');
      function updateChangesDot(hasChanges) {
        if (changesDotEl) changesDotEl.style.display = hasChanges ? 'block' : 'none';
      }

      window._viagenLoadChanges = loadChanges;

      async function loadChanges() {
        changesListView.style.display = 'block';
        changesDiffView.style.display = 'none';
        changesSummary.style.display = 'none';
        changesListEl.innerHTML = '<div style="padding:16px;color:#52525b;font-size:12px;font-family:ui-monospace,monospace;">Loading...</div>';
        try {
          var res = await fetch('/via/git/status');
          var data = await res.json();
          if (!data.git) {
            changesListEl.innerHTML = '<div class="changes-empty">Not a git repository</div>';
            updateChangesDot(false);
            return;
          }
          renderSummary(data);
          renderChanges(data.files);
        } catch(e) {
          changesListEl.innerHTML = '<div style="padding:16px;color:#f87171;font-size:12px;">Failed to load changes</div>';
        }
      }

      var changesStatsEl = document.getElementById('changes-stats');

      function renderSummary(data) {
        var ins = data.insertions || 0;
        var del = data.deletions || 0;
        var count = data.files ? data.files.length : 0;
        if (count === 0) { changesSummary.style.display = 'none'; return; }
        changesSummary.style.display = 'flex';
        changesStatsEl.innerHTML =
          '<span class="stat-files">' + count + (count === 1 ? ' file' : ' files') + '</span>' +
          (ins > 0 ? ' <span class="stat-add">+' + ins + '</span>' : '') +
          (del > 0 ? ' <span class="stat-del">-' + del + '</span>' : '');
        // Keep status bar diff in sync
        var statusDiff = document.getElementById('status-diff');
        if (statusDiff) {
          if (ins || del) {
            statusDiff.innerHTML = '<span class="d-add">+' + ins + '</span> <span class="d-del">\\u2212' + del + '</span>';
          } else {
            statusDiff.innerHTML = '';
          }
        }
      }

      function renderChanges(files) {
        changesListEl.innerHTML = '';
        updateChangesDot(files.length > 0);
        if (files.length === 0) {
          changesListEl.innerHTML = '<div class="changes-empty">No changes</div>';
          return;
        }
        files.forEach(function(f) {
          var item = document.createElement('div');
          item.className = 'changes-file';
          var dotClass = f.status === '?' ? 'q' : f.status;
          var statusLabel = f.status === '?' ? 'Untracked' : f.status === 'M' ? 'Modified' : f.status === 'A' ? 'Added' : f.status === 'D' ? 'Deleted' : f.status === 'R' ? 'Renamed' : f.status;
          var deltaHtml = '';
          if (f.insertions > 0 || f.deletions > 0) {
            deltaHtml = '<span class="file-delta">' +
              (f.insertions > 0 ? '<span class="d-add">+' + f.insertions + '</span>' : '') +
              (f.deletions > 0 ? '<span class="d-del">-' + f.deletions + '</span>' : '') +
              '</span>';
          }
          item.innerHTML = '<span class="changes-dot ' + dotClass + '" title="' + statusLabel + '"></span>' +
            '<span class="file-path" title="' + escapeHtml(f.path) + '">' + escapeHtml(f.path) + '</span>' +
            deltaHtml;
          item.addEventListener('click', function() { openDiff(f.path); });
          changesListEl.appendChild(item);
        });
      }

      async function openDiff(path) {
        changesListView.style.display = 'none';
        changesDiffView.style.display = 'flex';
        diffFilename.textContent = path;
        diffContent.innerHTML = '<div style="padding:16px;color:#52525b;font-size:12px;font-family:ui-monospace,monospace;">Loading diff...</div>';

        try {
          var res = await fetch('/via/git/diff?path=' + encodeURIComponent(path));
          var data = await res.json();
          renderDiff(data.diff);
        } catch(e) {
          diffContent.innerHTML = '<div style="padding:16px;color:#f87171;font-size:12px;">Failed to load diff</div>';
        }
      }

      function renderDiff(diff) {
        diffContent.innerHTML = '';
        if (!diff) {
          diffContent.innerHTML = '<div class="changes-empty">No diff available</div>';
          return;
        }
        var lines = diff.split('\\n');
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          var div = document.createElement('div');
          div.className = 'diff-line';
          if (line.charAt(0) === '+' && !line.startsWith('+++')) {
            div.className += ' diff-add';
          } else if (line.charAt(0) === '-' && !line.startsWith('---')) {
            div.className += ' diff-del';
          } else if (line.startsWith('@@')) {
            div.className += ' diff-hunk';
          } else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
            div.className += ' diff-meta';
          } else {
            div.className += ' diff-ctx';
          }
          div.textContent = line;
          diffContent.appendChild(div);
        }
      }

      // Back button
      document.getElementById('diff-back').addEventListener('click', function() {
        changesDiffView.style.display = 'none';
        changesListView.style.display = 'block';
      });

    })();
    `
        : ""
    }

    // ── Logs panel ──
    (function() {
      var logsList = document.getElementById('logs-list');
      var logsCount = document.getElementById('logs-count');
      var logsRefresh = document.getElementById('logs-refresh');
      var lastTimestamp = 0;
      var pollInterval = null;

      window._viagenLoadLogs = loadLogs;
      window._viagenStopLogPolling = stopPolling;

      async function loadLogs() {
        lastTimestamp = 0;
        logsList.innerHTML = '';
        await fetchLogs();
        startPolling();
      }

      async function fetchLogs() {
        try {
          var url = '/via/logs';
          if (lastTimestamp > 0) url += '?since=' + lastTimestamp;
          var res = await fetch(url);
          var data = await res.json();
          if (data.entries.length === 0 && lastTimestamp === 0) {
            logsList.innerHTML = '<div class="logs-empty">No logs yet</div>';
            logsCount.textContent = '0 entries';
            return;
          }
          if (data.entries.length > 0) {
            // Remove empty placeholder if present
            var empty = logsList.querySelector('.logs-empty');
            if (empty) empty.remove();

            for (var i = 0; i < data.entries.length; i++) {
              var entry = data.entries[i];
              var div = document.createElement('div');
              div.className = 'log-entry' + (entry.level !== 'info' ? ' ' + entry.level : '');
              var ts = new Date(entry.timestamp);
              var time = ts.toTimeString().slice(0, 8);
              div.innerHTML = '<span class="log-time">' + time + '</span>' + escapeHtml(entry.text);
              logsList.appendChild(div);
              lastTimestamp = Math.max(lastTimestamp, entry.timestamp);
            }
            // Auto-scroll to bottom
            logsList.scrollTop = logsList.scrollHeight;
          }
          // Update count
          var total = logsList.querySelectorAll('.log-entry').length;
          logsCount.textContent = total + (total === 1 ? ' entry' : ' entries');
        } catch(e) {
          // Silent fail on poll
        }
      }

      function startPolling() {
        stopPolling();
        pollInterval = setInterval(fetchLogs, 3000);
      }

      function stopPolling() {
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      }

      logsRefresh.addEventListener('click', function() {
        lastTimestamp = 0;
        logsList.innerHTML = '';
        fetchLogs();
      });
    })();
  </script>
</body>
</html>`;
}
