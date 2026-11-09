'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadStockOptionsHelpers() {
  let source = fs.readFileSync(path.join(__dirname, '..', 'js', 'stock-options.js'), 'utf8');
  source = source.replace(
    "if(changed){s.oiLastUpdate=Date.now();renderAll(s);}",
    "if(changed){s.oiLastUpdate=Date.now();}"
  );
  source = source.replace(
    '  buildViews();\n  window.stockOptionsSetActive=setActive;',
    '  window.__stockOptionsTest={normaliseQuote,mergeLiveQuote,calc};\n  return;\n  buildViews();\n  window.stockOptionsSetActive=setActive;'
  );
  const window = {};
  vm.runInNewContext(source, { window, location: { port: '8787' } }, { filename: 'stock-options.js' });
  return window.__stockOptionsTest;
}

const helpers = loadStockOptionsHelpers();

test('Binance quote fields map last price, OI, Greeks and contract multiplier', () => {
  const q = helpers.normaliseQuote({
    os: 'GLD261110C00369000', t: 'call', sp: '369', m: '100',
    p: '5.70', oi: 248, iv: '0.25855', de: '0.65891', ga: '0.03929',
    th: '-0.80089', ve: '0.13246'
  });
  assert.equal(q.last, 5.7);
  assert.equal(q.multiplier, 100);
  assert.equal(q.openInterest, 248);
  assert.equal(q.side, 'C');
  assert.equal(q.gamma, 0.03929);
});

test('partial option-chain updates using p refresh last price without clearing OI', () => {
  const symbol = 'GLD261110C00369000';
  const initial = helpers.normaliseQuote({ os: symbol, t: 'call', sp: '369', m: '100', l: '5.70', oi: 248, ga: '0.03929' });
  const session = {
    contracts: [{ os: symbol }], contractSymbols: new Set([symbol]),
    quotes: new Map([[symbol, initial]]), price: 370, oiLastUpdate: 0
  };
  helpers.mergeLiveQuote(session, { os: symbol, p: '5.95' });
  const updated = session.quotes.get(symbol);
  assert.equal(updated.last, 5.95);
  assert.equal(updated.openInterest, 248);
  assert.equal(updated.gamma, 0.03929);
});

test('a missing multiplier does not silently default to 100 for exposure', () => {
  const session = {
    price: 100, contracts: [{ os: 'GLD261110P00100000' }],
    quotes: new Map([['GLD261110P00100000', {
      optionSymbol: 'GLD261110P00100000', side: 'P', strike: 100,
      multiplier: null, openInterest: 20, volume: 0,
      gamma: 0.2, delta: -0.4, vega: 0.1, theta: -0.2
    }]])
  };
  const result = helpers.calc(session);
  assert.equal(result.putOI, 20);
  assert.equal(result.oiKnown, 1);
  assert.equal(result.multiplierMissing, 1);
  assert.equal(result.gamma, 0);
  assert.equal(result.delta, 0);
  assert.equal(result.vega, 0);
  assert.equal(result.theta, 0);
});

test('exposure uses the actual multiplier supplied by Binance', () => {
  const session = {
    price: 100, contracts: [{ os: 'QQQ261110C00100000' }],
    quotes: new Map([['QQQ261110C00100000', {
      optionSymbol: 'QQQ261110C00100000', side: 'C', strike: 100,
      multiplier: 50, openInterest: 10, volume: 0,
      gamma: 0.1, delta: 0.5, vega: 0.2, theta: -0.3
    }]])
  };
  const result = helpers.calc(session);
  assert.equal(result.gamma, 0.1 * 10 * 50 * 100 * 100 * 0.01);
  assert.equal(result.delta, 0.5 * 10 * 50 * 100);
  assert.equal(result.vega, 0.2 * 10 * 50);
  assert.equal(result.theta, -0.3 * 10 * 50);
  assert.equal(result.multiplierMissing, 0);
});
