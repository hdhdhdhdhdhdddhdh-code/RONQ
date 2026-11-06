// دالة Supabase Edge Function باسم: rate
// تجلب سعر الدولار من المصدر من جهة الخادم (فلا يحجبها المتصفح CORS) وتعيده للموقع.
// تُنشر من: Supabase ← Edge Functions ← Deploy a new function ← Via Editor، واسمها rate
// مهم: أطفئ خيار "Verify JWT" لهذه الدالة (هي عامة وتعيد سعراً فقط).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};
const SOURCE = 'https://lirascope.syria-cloud.sy/api/v1/rates/latest?currencies=USD&lang=en';
const OLD_PER_NEW = 100;   // الليرة الجديدة = 100 قديمة

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const r = await fetch(SOURCE, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    const usd = (d.marketRates || []).find((x: { currency: string }) => x.currency === 'USD');
    const sell = Number(usd && usd.sell);
    if (!isFinite(sell) || sell <= 0) throw new Error('قيمة غير صالحة');
    return new Response(
      JSON.stringify({ rate: Math.round(sell * OLD_PER_NEW), sell, buy: Number(usd.buy) || null, source: 'lirascope' }),
      { headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 502, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
});
