// 本机预览构建后的前端，不提供实际游戏 API。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), 'dist');
const port = Number(process.env.PORT || 5173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname); }
  catch { response.writeHead(400).end(); return; }
  if (pathname.startsWith('/api/')) { response.writeHead(404).end(); return; }
  let file = resolve(root, '.' + pathname);
  if (file !== root && !file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  if (file === root || !extname(pathname)) file = resolve(root, 'index.html');
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch { response.writeHead(404).end('File not found'); }
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Close the old preview first.` : 'Preview could not start.'); process.exit(1); });
server.listen(port, '127.0.0.1', () => console.log(`Frontend preview: http://127.0.0.1:${port}/\nDemo only. Press Ctrl+C to stop.`));
