import http from 'node:http';

const tenantTarget = process.env.E2E_TENANT_ORIGIN ?? 'http://127.0.0.1:8000';
const webTarget = process.env.E2E_WEB_ORIGIN ?? 'http://127.0.0.1:3001';
const port = Number(process.env.E2E_PROXY_PORT ?? 4173);

const tenantPrefixes = ['/api/', '/internal/', '/health', '/ws/', '/static/img/'];

function isTenantPath(pathname) {
    return tenantPrefixes.some(prefix => pathname.startsWith(prefix));
}

function forward(req, res, target) {
    const url = new URL(req.url ?? '/', target);
    const headers = {
        ...req.headers,
        'x-forwarded-host': req.headers.host,
        'x-forwarded-proto': 'http',
    };
    const proxyReq = http.request(
        {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: req.method,
            headers,
        },
        proxyRes => {
            res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
            proxyRes.pipe(res);
        },
    );
    proxyReq.on('error', () => {
        if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
        res.end('proxy upstream unavailable');
    });
    req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    forward(req, res, isTenantPath(pathname) ? tenantTarget : webTarget);
});

server.listen(port, '0.0.0.0', () => {
    console.log(`e2e proxy listening on ${port}: tenant -> ${tenantTarget}, web -> ${webTarget}`);
});
