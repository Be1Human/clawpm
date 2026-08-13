// 重载页面并捕获加载期异常 + 网络失败
const targets = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const mid = ++id; pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); }
  if (msg.method === 'Runtime.exceptionThrown') console.log('EXC:', (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text || '').slice(0, 500));
  if (msg.method === 'Network.loadingFailed') console.log('NETFAIL:', msg.params.errorText, msg.params.type);
  if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) console.log('HTTP', msg.params.response.status, msg.params.response.url);
};
await new Promise(r => { ws.onopen = r; });
await send('Runtime.enable');
await send('Network.enable');
await send('Page.enable');
await send('Page.reload', { ignoreCache: true });
await new Promise(r => setTimeout(r, 8000));
const res = await send('Runtime.evaluate', { expression: `document.getElementById('root')?.innerHTML.length ?? -1`, returnByValue: true });
console.log('rootLen after reload:', res.result.value);
process.exit(0);
