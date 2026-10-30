/*
 * The Daily Spread: the small engine behind the page.
 * Loads the daily data files in data/, runs the stock search against Alpha Vantage
 * with the visitor's own key, works out the derived numbers and redraws what is on screen.
 */
(function () {
  'use strict';

  var FILES = {
    historic: 'data/historic.json',
    mercats: 'data/mercats.json',
    actius: 'data/actius.json',
    noticies: 'data/noticies.json',
    resum: 'data/resum.json',
    ia_noticies: 'data/ia_noticies.json',
    ia_models: 'data/ia_models.json',
    ia_cursa: 'data/ia_cursa.json',
    leccions: 'data/leccions.json',
    glossari: 'data/glossari.json',
    butxaca: 'data/butxaca.json',
    notes: 'data/notes.json',
    productes: 'data/productes.json',
    cripto_noticies: 'data/cripto_noticies.json'
  };
  var QUERIES = {
    cerca: { fn: 'SYMBOL_SEARCH', args: function (p) { return { keywords: p.q, datatype: 'csv' }; } },
    serie: { fn: 'TIME_SERIES_DAILY', args: function (p) { return { symbol: p.simbol, outputsize: 'compact', datatype: 'csv' }; } },
    perfil: { fn: 'COMPANY_OVERVIEW', args: function (p) { return { symbol: p.simbol }; } }
  };
  var AV = 'https://www.alphavantage.co/query?';
  var KEY_NAME = 'theledger.alphavantage.key';
  var LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
  var DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

  var state = {};
  var loaders = {};
  var calcs = {};
  var draws = {};
  var order = [];
  var dataFns = [];
  var params = { q: 'Apple', simbol: 'AAPL' };
  var version = 0;
  var pending = false;

  function getKey() { try { return (localStorage.getItem(KEY_NAME) || '').trim(); } catch (e) { return ''; } }
  function setKey(k) {
    try { if (k) localStorage.setItem(KEY_NAME, k); else localStorage.removeItem(KEY_NAME); } catch (e) { /* private mode */ }
    Object.keys(QUERIES).forEach(function (id) { delete state[id]; });
    schedule();
  }
  function put(id, s) { s.version = ++version; state[id] = s; return s; }

  function loadFile(id) {
    if (state[id]) return state[id];
    var s = put(id, { status: 'loading', data: [] });
    fetch(FILES[id] + '?v=' + Math.floor(Date.now() / 600000), { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        var rows = Array.isArray(d) ? d : (d && (d.rows || d.data || d.results)) || [];
        put(id, { status: 'ok', data: rows });
        schedule();
      })
      .catch(function (e) { put(id, { status: 'error', data: [], message: String(e && e.message || e) }); schedule(); });
    return s;
  }

  function loadQuery(id) {
    var q = QUERIES[id];
    var args = q.args(params);
    var sig = JSON.stringify(args);
    var cur = state[id];
    if (cur && cur.sig === sig) return cur;
    var key = getKey();
    if (!key) return put(id, { status: 'connect', data: [], message: 'Falta la clau d\'Alpha Vantage', sig: null });
    var keep = cur && cur.status === 'ok';
    var s = put(id, { status: keep ? 'ok' : 'loading', refreshing: keep, data: keep ? cur.data : [], sig: sig });
    var call = function (fn, a) {
      return fetch(AV + new URLSearchParams(Object.assign({ function: fn }, a, { apikey: key }))).then(function (r) { return r.text(); });
    };
    call(q.fn, args)
      .then(function (answer) {
        var L = loaders[id];
        return L ? L.fn({ answer: answer, call: call, args: args, read: {} }) : JSON.parse(answer);
      })
      .then(function (out) {
        if (!state[id] || state[id].sig !== sig) return;
        var rows = Array.isArray(out) ? out : (out && (out.rows || out.data)) || [];
        put(id, { status: 'ok', data: rows, sig: sig });
        schedule();
      })
      .catch(function (e) {
        if (!state[id] || state[id].sig !== sig) return;
        put(id, { status: 'error', data: [], message: String(e && e.message || e), sig: sig });
        schedule();
      });
    return s;
  }

  function calcData(id) {
    var c = calcs[id];
    var ins = c.inputs.map(function (i) { return dash.data(i); });
    for (var i = 0; i < ins.length; i++) {
      if (ins[i].status !== 'ok') return { status: ins[i].status, data: [], message: ins[i].message, refreshing: ins[i].refreshing };
    }
    var k = ins.map(function (s) { return s.version; }).join('|');
    if (c.key !== k) {
      try {
        c.cache = { status: 'ok', data: c.fn.apply(null, ins.map(function (s) { return s.data; })), version: ++version };
      } catch (e) {
        c.cache = { status: 'error', data: [], message: String(e && e.message || e), version: ++version };
        if (window.console) console.error('[The Daily Spread] ' + id, e);
      }
      c.key = k;
    }
    return c.cache;
  }

  function visible(el) { return !el.closest('[hidden]'); }

  function run(name) {
    var fn = draws[name];
    if (!fn) return;
    document.querySelectorAll('[data-draw="' + name + '"]').forEach(function (el) {
      if (!visible(el)) return;
      try { fn(el); } catch (e) { if (window.console) console.error('[The Daily Spread] ' + name, e); }
    });
  }
  function runAll() {
    pending = false;
    dataFns.forEach(function (f) { try { f(); } catch (e) { if (window.console) console.error(e); } });
    order.forEach(run);
  }
  function schedule() {
    if (pending) return;
    pending = true;
    (window.requestAnimationFrame || setTimeout)(runAll);
  }

  var dash = {
    data: function (id) {
      if (calcs[id]) return calcData(id);
      if (FILES[id]) return loadFile(id);
      if (QUERIES[id]) return loadQuery(id);
      return { status: 'missing', data: [] };
    },
    draw: function (name, fn) {
      if (typeof fn === 'function') {
        if (!draws[name]) order.push(name);
        draws[name] = fn;
        if (document.readyState !== 'loading' && started) run(name);
        return;
      }
      run(name);
    },
    onData: function (fn) { dataFns.push(fn); },
    calc: function (id, spec) { calcs[id] = { inputs: spec.inputs || [], fn: spec.fn }; },
    loader: function (id, spec) { loaders[id] = spec; },
    params: function () { return Object.assign({}, params); },
    setParams: function (p) { Object.assign(params, p || {}); schedule(); },
    resetParams: function () { params = { q: 'Apple', simbol: 'AAPL' }; schedule(); },
    setLink: function (name) { try { history.replaceState(null, '', name ? '#' + name : location.pathname); } catch (e) { /* ignore */ } },
    refresh: function () { schedule(); },
    get colors() {
      var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      return dark ? DARK : LIGHT;
    }
  };

  var started = false;
  function start() {
    started = true;
    runAll();
    var t;
    window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(schedule, 120); });
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', schedule);
    }
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) if (list[i].attributeName === 'hidden') { schedule(); return; }
    }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['hidden'] });
  }

  window.dash = dash;
  window.ledgerKey = { get: getKey, set: setKey };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else setTimeout(start, 0);
})();
