export function buildIframeHtml(opts: { panelWidth: number }): string {
  const pw = opts.panelWidth;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>viagen</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { display: flex; height: 100vh; background: #09090b; overflow: hidden; }
    #app-frame { flex: 1; border: none; height: 100%; min-width: 200px; }
    #divider {
      width: 5px;
      cursor: col-resize;
      background: #27272a;
      transition: background 0.15s;
      flex-shrink: 0;
      position: relative;
    }
    #divider:hover, #divider.active { background: #3f3f46; }
    #collapse-btn {
      position: absolute;
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
      width: 22px;
      height: 22px;
      border-radius: 4px;
      background: #27272a;
      border: 1px solid #3f3f46;
      color: #a1a1aa;
      font-size: 11px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1;
      transition: background 0.15s, color 0.15s;
    }
    #collapse-btn:hover { background: #3f3f46; color: #e4e4e7; }
    #chat-frame { width: ${pw}px; border: none; height: 100%; min-width: 280px; }
    .dragging iframe { pointer-events: none; }
  </style>
</head>
<body>
  <iframe id="app-frame" src="/?_viagen_embed=1"></iframe>
  <div id="divider"><button id="collapse-btn" title="App only">&#x2715;</button></div>
  <iframe id="chat-frame" src="/via/ui"></iframe>
  <script>
    // Relay postMessage from app iframe to chat iframe (e.g. "Fix This Error")
    window.addEventListener('message', function(ev) {
      if (ev.data && ev.data.type === 'viagen:send') {
        document.getElementById('chat-frame').contentWindow.postMessage(ev.data, '*');
      }
    });
    // Tell chat iframe it's in split-view mode (hides pop-out button)
    var chatFrame = document.getElementById('chat-frame');
    chatFrame.addEventListener('load', function() {
      chatFrame.contentWindow.postMessage({ type: 'viagen:context', iframe: true }, '*');
    });

    // Collapse to app-only view
    document.getElementById('collapse-btn').addEventListener('click', function(e) {
      e.stopPropagation();
      window.location.href = '/';
    });

    // Drag-resizable divider
    var divider = document.getElementById('divider');
    var dragging = false;
    divider.addEventListener('mousedown', function(e) {
      e.preventDefault();
      dragging = true;
      divider.classList.add('active');
      document.body.classList.add('dragging');
    });
    document.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      var chatWidth = window.innerWidth - e.clientX - 2;
      if (chatWidth < 280) chatWidth = 280;
      if (chatWidth > window.innerWidth - 200) chatWidth = window.innerWidth - 200;
      chatFrame.style.width = chatWidth + 'px';
    });
    document.addEventListener('mouseup', function() {
      if (!dragging) return;
      dragging = false;
      divider.classList.remove('active');
      document.body.classList.remove('dragging');
    });
  </script>
</body>
</html>`;
}
