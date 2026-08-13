// 通过 CDP 驱动 Electron 内的 ClawPM 页面并截图
// 用法: node .tmp-cdp.mjs <hash路由> <输出png> [等待ms]
const [, , route = '/workflow', out = '.tmp-page.png', waitMs = '3500'] = process.argv;

const targets = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = targets.find(t => t.type === 'page' && t.title === 'ClawPM') || targets.find(t => t.type === 'page');
if (!page) { console.error('no page target'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  }
};
await new Promise(r => { ws.onopen = r; });

await send('Page.enable');
await send('Runtime.evaluate', { expression: `location.hash = '#${route}'` });
await new Promise(r => setTimeout(r, parseInt(waitMs)));
const shot = await send('Page.captureScreenshot', { format: 'png' });
const fs = await import('node:fs');
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log('saved', out);
ws.close();
process.exit(0);
