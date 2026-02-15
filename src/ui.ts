export function buildUiHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>viagen</title>
  <style>
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
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .messages:empty::after {
      content: 'Ask Claude to build something...';
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
      white-space: pre-wrap;
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
  </style>
</head>
<body>
  <div class="header">
    <h1><span class="status-dot" id="status-dot"></span> viagen</h1>
    <div style="display:flex;gap:4px;">
      <button class="btn" id="publish-btn" style="display:none">Publish</button>
      <button class="btn" id="reset-btn">Reset</button>
    </div>
  </div>
  <div class="setup-banner" id="setup-banner"></div>
  <div class="messages" id="messages"></div>
  <div class="input-area">
    <input type="text" id="input" placeholder="What do you want to build?" autofocus />
    <button class="send-btn" id="send-btn">Send</button>
  </div>
  <script>
    var STORAGE_KEY = 'viagen_chatLog';
    var messagesEl = document.getElementById('messages');
    var inputEl = document.getElementById('input');
    var sendBtn = document.getElementById('send-btn');
    var resetBtn = document.getElementById('reset-btn');
    var publishBtn = document.getElementById('publish-btn');
    var currentTextSpan = null;
    var isStreaming = false;
    var chatLog = []; // Array of { type: 'user'|'text'|'tool'|'error', content: string }
    var unloading = false;
    window.addEventListener('beforeunload', function() { unloading = true; });
    window.addEventListener('pagehide', function() { unloading = true; });
    try { window.parent.addEventListener('beforeunload', function() { unloading = true; }); } catch(e) {}

    function saveHistory() {
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(chatLog)); } catch(e) {}
    }

    function loadHistory() {
      try {
        var saved = sessionStorage.getItem(STORAGE_KEY);
        if (!saved) return;
        chatLog = JSON.parse(saved);
        for (var i = 0; i < chatLog.length; i++) {
          var entry = chatLog[i];
          if (entry.type === 'user') renderUserMessage(entry.content);
          else if (entry.type === 'text') renderTextBlock(entry.content);
          else if (entry.type === 'tool') renderToolBlock(entry.content);
          else if (entry.type === 'error') renderErrorBlock(entry.content);
        }
        messagesEl.scrollTop = messagesEl.scrollHeight;
      } catch(e) {}
    }

    function escapeHtml(text) {
      var div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function formatTool(name, input) {
      switch (name) {
        case 'Read': return 'Reading ' + (input.file_path || '');
        case 'Edit': return 'Editing ' + (input.file_path || '');
        case 'Write': return 'Writing ' + (input.file_path || '');
        case 'Bash': return '$ ' + (input.command || '');
        case 'Glob': return 'Finding ' + (input.pattern || '');
        case 'Grep': return 'Searching "' + (input.pattern || '') + '"';
        default: return name + ': ' + JSON.stringify(input).slice(0, 80);
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
      div.querySelector('.stream-text').textContent = text;
    }

    function renderToolBlock(text) {
      currentTextSpan = null;
      var div = document.createElement('div');
      div.className = 'msg msg-tool';
      div.textContent = text;
      messagesEl.appendChild(div);
    }

    function renderErrorBlock(text) {
      var div = document.createElement('div');
      div.className = 'msg msg-error';
      div.textContent = text;
      messagesEl.appendChild(div);
    }

    function addUserMessage(text) {
      chatLog.push({ type: 'user', content: text });
      saveHistory();
      renderUserMessage(text);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function appendText(text) {
      var last = chatLog[chatLog.length - 1];
      if (last && last.type === 'text') {
        last.content += text;
      } else {
        chatLog.push({ type: 'text', content: text });
      }
      saveHistory();

      if (!currentTextSpan) {
        var div = document.createElement('div');
        div.className = 'msg msg-assistant';
        div.innerHTML = '<span class="label">Claude</span><span class="text stream-text"></span>';
        messagesEl.appendChild(div);
        currentTextSpan = div.querySelector('.stream-text');
      }
      currentTextSpan.textContent += text;
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function addToolBlock(name, input) {
      currentTextSpan = null;
      var label = formatTool(name, input);
      chatLog.push({ type: 'tool', content: label });
      saveHistory();
      renderToolBlock(label);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function addErrorBlock(text) {
      chatLog.push({ type: 'error', content: text });
      saveHistory();
      renderErrorBlock(text);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function setStreaming(v) {
      isStreaming = v;
      inputEl.disabled = v;
      sendBtn.disabled = v;
      sendBtn.textContent = v ? '...' : 'Send';
    }

    async function send() {
      var text = inputEl.value.trim();
      if (!text || isStreaming) return;

      addUserMessage(text);
      inputEl.value = '';
      setStreaming(true);
      currentTextSpan = null;

      try {
        var res = await fetch('/via/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text }),
        });

        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';

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
              else if (data.type === 'tool_use') addToolBlock(data.name, data.input);
              else if (data.type === 'error') addErrorBlock(data.text);
            } catch (e) {}
          }
        }
      } catch (e) {
        if (!unloading) addErrorBlock('Connection failed');
      }

      setStreaming(false);
      inputEl.focus();
    }

    sendBtn.addEventListener('click', send);
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    resetBtn.addEventListener('click', async function () {
      await fetch('/via/chat/reset', { method: 'POST' });
      chatLog = [];
      saveHistory();
      messagesEl.innerHTML = '';
      currentTextSpan = null;
      inputEl.focus();
    });
    publishBtn.addEventListener('click', function () {
      if (isStreaming) return;
      inputEl.value = 'Commit all changes and push to the remote repository';
      send();
    });

    // Accept messages from parent (e.g. "Fix This Error" button)
    window.addEventListener('message', function(ev) {
      if (ev.data && ev.data.type === 'viagen:send' && ev.data.message) {
        inputEl.value = ev.data.message;
        send();
      }
    });

    // Health check — show status and disable input if not configured
    fetch('/via/health')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var dot = document.getElementById('status-dot');
        var banner = document.getElementById('setup-banner');
        if (data.configured) {
          dot.className = 'status-dot ok';
          if (data.git) publishBtn.style.display = '';
        } else {
          dot.className = 'status-dot error';
          inputEl.disabled = true;
          sendBtn.disabled = true;
          inputEl.placeholder = 'API key not configured';
          banner.style.display = 'block';
          banner.innerHTML = 'Set <code>ANTHROPIC_API_KEY</code> in your <code>.env</code> file and restart the dev server.<br><a href="/via/docs" target="_top" style="color:#71717a;text-decoration:underline;text-underline-offset:2px;">Setup docs</a>';
        }
      })
      .catch(function() {
        document.getElementById('status-dot').className = 'status-dot error';
      });

    loadHistory();
  </script>
</body>
</html>`;
}
