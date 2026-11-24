import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

interface ProxyRequest {
  url?: string;
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
}

interface ProxyResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string | Uint8Array): void;
}

function getRuntimeEnv(): Record<string, string | undefined> | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
}

function readRawBody(req: ProxyRequest): Promise<Uint8Array | undefined> {
  return new Promise((resolve, reject) => {
    if (!req.on || req.method === 'GET' || req.method === 'HEAD') {
      resolve(undefined);
      return;
    }
    const chunks: Uint8Array[] = [];
    req.on('data', (chunk: unknown) => {
      if (chunk instanceof Uint8Array) {
        chunks.push(chunk);
      } else if (typeof chunk === 'string') {
        chunks.push(new TextEncoder().encode(chunk));
      }
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }
      const total = chunks.reduce((sum, part) => sum + part.byteLength, 0);
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const part of chunks) {
        merged.set(part, offset);
        offset += part.byteLength;
      }
      resolve(merged);
    });
    req.on('error', (err: unknown) => reject(err));
  });
}

/**
 * Same-origin proxy & probe for Petey Plant's FastAPI backend (/api/v1/*).
 * Prevents browser CORS errors and detects when port 8000 is absent or
 * occupied by an unrelated sandbox service without emitting browser errors.
 */
function peteyBackendProxyPlugin(env: Record<string, string>): Plugin {
  const resolveBackendBase = () => {
    const runtimeEnv = getRuntimeEnv();
    return (
      runtimeEnv?.PETEY_BACKEND_URL ||
      env.PETEY_BACKEND_URL ||
      'http://127.0.0.1:8000'
    ).replace(/\/$/, '');
  };

  const handler: Connect.NextHandleFunction = (rawReq, rawRes, next) => {
    const req = rawReq as unknown as ProxyRequest;
    const res = rawRes as unknown as ProxyResponse;
    const reqUrl = req.url;

    if (!reqUrl) {
      next();
      return;
    }

    // 1. Clean HTTP 200 backend availability probe (zero browser console errors)
    if (reqUrl.startsWith('/api/backend-status')) {
      void (async () => {
        const backendBase = resolveBackendBase();
        try {
          const probe = await fetch(`${backendBase}/api/v1/garden/species`, {
            method: 'GET',
            headers: { 'X-Petey-Garden': 'probe' },
            signal: AbortSignal.timeout(1500),
          });
          if (probe.ok) {
            const data = await probe.json().catch(() => null);
            if (Array.isArray(data)) {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Cache-Control', 'no-store');
              res.end(JSON.stringify({ available: true }));
              return;
            }
          }
        } catch {
          // Backend unreachable
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(
          JSON.stringify({
            available: false,
            reason: 'Petey Plant FastAPI backend is not running on this host.',
          }),
        );
      })();
      return;
    }

    // 2. Same-origin /api/v1/* proxy to FastAPI backend
    if (reqUrl.startsWith('/api/v1/')) {
      void (async () => {
        const backendBase = resolveBackendBase();
        try {
          const body = await readRawBody(req);
          const forwardHeaders = new Headers();
          const ct = req.headers?.['content-type'];
          const gardenHeader = req.headers?.['x-petey-garden'];
          if (typeof ct === 'string') forwardHeaders.set('Content-Type', ct);
          if (typeof gardenHeader === 'string') forwardHeaders.set('X-Petey-Garden', gardenHeader);

          const upstream = await fetch(`${backendBase}${reqUrl}`, {
            method: req.method || 'GET',
            headers: forwardHeaders,
            body: body ? (body as unknown as BodyInit) : undefined,
            signal: AbortSignal.timeout(25000),
          });

          const text = await upstream.text();
          // Guard against non-Petey sandbox sidecars returning 401 Unauthorized on port 8000
          if (upstream.status === 401 && text.includes('Missing Authorization header')) {
            res.statusCode = 503;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                detail: 'Petey Plant backend is not running on this host.',
              }),
            );
            return;
          }

          res.statusCode = upstream.status;
          res.setHeader(
            'Content-Type',
            upstream.headers.get('content-type') || 'application/json',
          );
          res.setHeader('Cache-Control', 'no-store');
          res.end(text);
        } catch {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              detail: 'Petey Plant backend is unreachable right now.',
            }),
          );
        }
      })();
      return;
    }

    next();
  };

  return {
    name: 'petey-backend-proxy',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

/**
 * Dev & preview proxy for Google Maps Platform Weather API.
 * Keeps X-Goog-Maps-Solution-ID attribution and API key handling clean
 * without browser CORS preflight issues.
 */
function googleWeatherProxyPlugin(env: Record<string, string>): Plugin {
  const handler: Connect.NextHandleFunction = (rawReq, rawRes, next) => {
    const req = rawReq as unknown as ProxyRequest;
    const res = rawRes as unknown as ProxyResponse;
    const reqUrl = req.url;
    if (!reqUrl || !reqUrl.startsWith('/api/weather')) {
      next();
      return;
    }

    void (async () => {
      const parsed = new URL(reqUrl, 'http://localhost:3000');
      const lat = Number(parsed.searchParams.get('lat'));
      const lng = Number(parsed.searchParams.get('lng'));
      const units = parsed.searchParams.get('units') === 'IMPERIAL' ? 'IMPERIAL' : 'METRIC';

      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Invalid latitude or longitude.' }));
        return;
      }

      const runtimeEnv = getRuntimeEnv();
      const apiKey =
        runtimeEnv?.GOOGLE_MAPS_API_KEY ||
        runtimeEnv?.VITE_GOOGLE_MAPS_API_KEY ||
        env.GOOGLE_MAPS_API_KEY ||
        env.VITE_GOOGLE_MAPS_API_KEY ||
        '';

      if (!apiKey) {
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Weather API key not configured.' }));
        return;
      }

      try {
        const upstreamUrl = new URL('https://weather.googleapis.com/v1/currentConditions:lookup');
        upstreamUrl.searchParams.set('key', apiKey);
        upstreamUrl.searchParams.set('location.latitude', lat.toFixed(4));
        upstreamUrl.searchParams.set('location.longitude', lng.toFixed(4));
        upstreamUrl.searchParams.set('unitsSystem', units);

        const upstream = await fetch(upstreamUrl.toString(), {
          method: 'GET',
          headers: {
            'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
          },
          signal: AbortSignal.timeout(8000),
        });

        const body = await upstream.text();
        res.statusCode = upstream.status;
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(body);
      } catch {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Unable to reach Google Weather API.' }));
      }
    })();
  };

  return {
    name: 'google-weather-proxy',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

// Petey Plant R3F frontend. FastAPI backend is proxied via /api/v1
// (override target with PETEY_BACKEND_URL or direct VITE_API_URL).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');

  return {
    envDir: '..',
    plugins: [react(), peteyBackendProxyPlugin(env), googleWeatherProxyPlugin(env)],
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: false,
      allowedHosts: true,
    },
    preview: {
      host: '0.0.0.0',
      port: 3000,
    },
  };
});
