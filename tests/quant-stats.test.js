const assert=require('assert');
const Q=require('../js/quant-stats.js');
let n=0;const ok=s=>{console.log('ok  ',s);n++};
{
  const p=Q.parseCSV('Time,Close,Volume\n2026-01-01,100,20\n2026-01-02,102,25');
  assert.deepStrictEqual(p.headers,['Time','Close','Volume']);assert.strictEqual(p.rows.length,2);assert.strictEqual(p.rows[1][1],'102');ok('CSV comma/header/basic rows');
}
{
  const p=Q.parseCSV('Time;Close;Note\n2026-01-01;1.234,56;"text; with separator"\n2026-01-02;1.235,56;ok');
  assert.strictEqual(p.delimiter,';');assert.strictEqual(Q.parseNumber(p.rows[0][1],p.delimiter),1234.56);assert.strictEqual(p.rows[0][2],'text; with separator');ok('CSV semicolon, decimal comma, quoted delimiter');
}
{
  const s=Q.stats([1,2,3,4]);assert.strictEqual(s.n,4);assert.strictEqual(s.mean,2.5);assert.strictEqual(s.median,2.5);assert.ok(Math.abs(s.variance-5/3)<1e-12);assert.strictEqual(s.min,1);assert.strictEqual(s.max,4);ok('descriptive statistics and sample variance');
}
{
  const r=Q.returns([100,110,99]);assert.ok(Math.abs(r[0].simple-.1)<1e-12);assert.ok(Math.abs(r[0].log-Math.log(1.1))<1e-12);assert.ok(Math.abs(r[1].simple+.1)<1e-12);ok('simple and logarithmic returns');
}
{
  assert.ok(Math.abs(Q.correlation([1,2,3],[2,4,6])-1)<1e-12);assert.ok(Math.abs(Q.correlation([1,2,3],[6,4,2])+1)<1e-12);assert.ok(Number.isNaN(Q.correlation([1,1],[3,4])));ok('Pearson correlation and constant-column guard');
}
{
  const h=Q.histogram([0,1,2,3],2);assert.strictEqual(h.length,2);assert.deepStrictEqual(h.map(x=>x.count),[2,2]);ok('histogram bin counts and bounds');
}
{
  const r=Q.rolling([1,2,3,4],3);assert.strictEqual(r[0],null);assert.strictEqual(r[2].mean,2);assert.strictEqual(r[3].mean,3);ok('rolling mean/std window');
}
console.log(`\n${n} nhóm kiểm thử Quant Stats đạt`);
