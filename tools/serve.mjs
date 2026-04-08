import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PORT = 3456;

/** Parse a .dev.vars or .env file into a key-value object */
function parseEnvFile(filepath) {
  if (!existsSync(filepath)) return {};
  const vars = {};
  for (const line of readFileSync(filepath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return vars;
}

/** Extract KV namespace ID from wrangler.toml */
function parseWranglerToml(filepath) {
  if (!existsSync(filepath)) return {};
  const content = readFileSync(filepath, 'utf-8');
  const result = {};

  // Extract kv namespace id (binding = "SUBDOMAINS")
  const kvMatch = content.match(/\[\[kv_namespaces\]\][^[]*?id\s*=\s*"([^"]+)"/s);
  if (kvMatch) result.kvNamespaceId = kvMatch[1];

  return result;
}

/** Build prefill config from project files */
function getProjectConfig() {
  const devVars = parseEnvFile(join(ROOT, '.dev.vars'));
  const envVars = parseEnvFile(join(ROOT, '.env'));
  const wrangler = parseWranglerToml(join(ROOT, 'wrangler.toml'));

  // .dev.vars takes priority over .env
  const vars = { ...envVars, ...devVars };

  return {
    apiToken: vars.CF_API_TOKEN || '',
    zoneId: vars.CF_ZONE_ID || '',
    kvNamespaceId: wrangler.kvNamespaceId || '',
    webhookUrl: vars.WEBHOOK_URL || '',
  };
}

const server = createServer(async (req, res) => {
  // Serve prefill config from project files
  if (req.method === 'GET' && req.url === '/config') {
    const config = getProjectConfig();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(config));
    return;
  }

  // Serve dashboard
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    const html = readFileSync(join(__dirname, 'dashboard.html'), 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // Proxy: POST /proxy  body: { url, method, headers, body }
  if (req.method === 'POST' && req.url === '/proxy') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const { url, method, headers, body: reqBody } = JSON.parse(body);

    try {
      console.log(`  → ${method || 'GET'} ${url}`);
      const cfRes = await fetch(url, {
        method: method || 'GET',
        headers: headers || {},
        body: reqBody ? (typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody)) : undefined,
      });

      const contentType = cfRes.headers.get('content-type') || '';
      const data = await cfRes.arrayBuffer();
      const preview = Buffer.from(data).toString('utf-8').slice(0, 200);
      console.log(`  ← ${cfRes.status} ${preview}`);

      res.writeHead(cfRes.status, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
      });
      res.end(Buffer.from(data));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n  Dashboard → http://localhost:${PORT}\n`);
});
