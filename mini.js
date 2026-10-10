// Minimal Express-compatible micro-framework (zero dependencies).
// Implements only what SpendWise uses: Router, app.use, json(), cors(), static().
// To use real Express instead: `npm i express cors` and replace `require('./lib/mini')` with
// `const express = require('express'); const cors = require('cors');` (API-compatible for this subset).
const http = require('http');
const fs = require('fs');
const path = require('path');

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

function compile(p) {
  const keys = [];
  const src = p.split('/').filter(Boolean).map(seg => {
    if (seg[0] === ':') { keys.push(seg.slice(1)); return '/([^/]+)'; }
    return '/' + seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return { re: new RegExp('^' + src + '/?$'), keys };
}

function makeStack() {
  const layers = [];
  function handle(req, res, done) {
    let i = 0;
    const baseUrl = req.url;
    function next(err) {
      req.url = baseUrl;
      const layer = layers[i++];
      if (!layer) return done(err);
      const pathname = req.url.split('?')[0];
      let fn = null, restore = null;
      if (layer.method) {                             // route
        if (layer.method !== req.method) return next(err);
        const m = layer.pattern.re.exec(pathname);
        if (!m) return next(err);
        req.params = Object.assign({}, req.params, ...layer.pattern.keys.map((k, n) => ({ [k]: decodeURIComponent(m[n + 1]) })));
      } else {                                        // use(prefix, ...)
        const pre = layer.prefix;
        if (pre && !(pathname === pre || pathname.startsWith(pre + '/'))) return next(err);
        if (pre) req.url = req.url.slice(pre.length) || '/';
      }
      fn = layer.fn;
      const isErrHandler = fn.length === 4;
      if (err && !isErrHandler) return next(err);
      if (!err && isErrHandler) return next();
      try { err ? fn(err, req, res, next) : fn(req, res, next); } catch (e) { next(e); }
    }
    next();
  }
  return { layers, handle };
}

function Router() {
  const stack = makeStack();
  const router = (req, res, next) => stack.handle(req, res, next);
  METHODS.forEach(m => {
    router[m] = (p, ...fns) => { fns.forEach(fn => stack.layers.push({ method: m.toUpperCase(), pattern: compile(p), fn })); return router; };
  });
  router.use = (...args) => {
    const prefix = typeof args[0] === 'string' ? args.shift().replace(/\/$/, '') : '';
    args.forEach(fn => stack.layers.push({ method: null, prefix, fn }));
    return router;
  };
  return router;
}

function enhance(req, res) {
  res.status = c => { res.statusCode = c; return res; };
  res.set = (k, v) => { res.setHeader(k, v); return res; };
  res.json = o => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o, (k, v) => v instanceof Set ? [...v] : v)); return res; };
  res.send = s => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(s); return res; };
  req.params = {}; req.body = {};
}

function app() {
  const root = Router();
  const server = http.createServer((req, res) => {
    enhance(req, res);
    root(req, res, err => {
      if (err) { res.statusCode = 500; return res.end('Server error'); }
      res.statusCode = 404; res.end('Not found');
    });
  });
  const a = (req, res, next) => root(req, res, next);
  a.use = (...args) => { root.use(...args); return a; };
  a.get = (...args) => { root.get(...args); return a; };
  a.listen = (port, cb) => server.listen(port, cb);
  return a;
}

const json = () => (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  let data = '';
  req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
  req.on('end', () => {
    if (!data.trim()) return next();
    try { req.body = JSON.parse(data); next(); }
    catch (e) { const err = new Error('Invalid JSON'); err.type = 'entity.parse.failed'; next(err); }
  });
};

const cors = () => (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  next();
};

const serveStatic = dir => (req, res, next) => {
  if (!['GET', 'HEAD'].includes(req.method)) return next();
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(dir, rel));
  if (!file.startsWith(dir)) return next();
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return next();
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
};

module.exports = { app, Router, json, cors, static: serveStatic };
