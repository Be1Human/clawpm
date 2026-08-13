// 检查页面状态 + 控制台错误
const targets = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const logs = [];
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const mid = ++id; pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); }
  if (msg.method === 'Runtime.consoleAPICalled' && ['error','warning'].includes(msg.params.type)) logs.push(msg.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  if (msg.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
};
await new Promise(r => { ws.onopen = r; });
await send('Runtime.enable');
await new Promise(r => setTimeout(r, 3000));
const res = await send('Runtime.evaluate', { expression: `JSON.stringify({hash: location.hash, bodyLen: document.body.innerHTML.length, rootLen: document.getElementById('root')?.innerHTML.length ?? -1, text: document.body.innerText.slice(0,200)})`, returnByValue: true });
console.log(res.result.value);
console.log('--- console errors ---');
logs.slice(0, 10).forEach(l => console.log(l.slice(0, 300)));
process.exit(0);
