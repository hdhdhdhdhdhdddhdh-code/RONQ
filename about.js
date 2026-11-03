/* =====================================================
   about.js — تمرير ناعم، ظهور تدريجي، عدادات، ومزامنة الألوان
   يعمل بشكل مستقل ولا يحتاج لتعديل ronq.js
   ===================================================== */
(function () {
  const root    = document.documentElement;
  const reduce  = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const about   = document.getElementById('about');
  const bg      = document.querySelector('.shamelll');
  const overlay = document.getElementById('orderOverlay');
  const toTop   = document.getElementById('toTop');
  const footer  = document.getElementById('footer');
 
  if (!about) return;
  root.classList.add('js');
 
 
  /* ---------- 1) ألوان القسم = ألوان خلفية المنتج المعروض ---------- */
 
  function syncColors() {
    const cs = getComputedStyle(bg);
    // عند الخلفيات الفاتحة يوفّر ronq.js لوناً مميِّزاً (--acc-*) لأن الأبيض لا يصلح للنصوص هنا
    const glow = cs.getPropertyValue('--acc-glow').trim() || cs.getPropertyValue('--glow').trim();
    const base = cs.getPropertyValue('--acc-base').trim() || cs.getPropertyValue('--base').trim();
    // القسم وزر الأعلى والفوتر كلها تأخذ لون خلفية المنتج المعروض
    [about, toTop, footer].forEach(el => {
      if (!el) return;
      if (glow) el.style.setProperty('--ab-glow', glow);
      if (base) el.style.setProperty('--ab-base', base);
    });
  }
  syncColors();
  new MutationObserver(syncColors).observe(bg, { attributes: true, attributeFilter: ['style'] });
 
 
  /* ---------- 2) تمرير ناعم بحركة متباطئة عند الأطراف ---------- */
 
  let raf = 0;
 
  function scrollToY(y) {
    cancelAnimationFrame(raf);
    const start = window.scrollY;
    const dist  = y - start;
 
    if (reduce || Math.abs(dist) < 2) { window.scrollTo(0, y); return; }
 
    const dur  = Math.min(1400, Math.max(750, Math.abs(dist) * 0.7));
    const t0   = performance.now();
    const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
 
    // إذا لمس المستخدم الشاشة أو حرّك العجلة نوقف الحركة فوراً
    const stop = () => cancelAnimationFrame(raf);
    ['wheel', 'touchstart', 'keydown'].forEach(ev =>
      window.addEventListener(ev, stop, { once: true, passive: true })
    );
 
    const step = now => {
      const p = Math.min((now - t0) / dur, 1);
      window.scrollTo(0, start + dist * ease(p));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
 
  function goTo(target) {
    // إن كانت طبقة الطلب مفتوحة نغلقها أولاً
    if (overlay && overlay.classList.contains('open')) {
      const close = overlay.querySelector('.order-close');
      if (close) close.click();
    }
    const y = target === 'about'
      ? about.getBoundingClientRect().top + window.scrollY
      : 0;
    scrollToY(y);
  }
 
  document.querySelectorAll('a[data-scroll]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      goTo(a.dataset.scroll);
    });
  });
 
 
  /* ---------- 3) زر العودة للأعلى ---------- */
 
  if (toTop) {
    const onScroll = () => toTop.classList.toggle('show', window.scrollY > 500);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    toTop.addEventListener('click', () => scrollToY(0));
  }
 
 
  /* ---------- 4) عدادات متحركة ---------- */
 
  const fmt = n => n.toLocaleString('en-US');
 
  function runCounter(el) {
    if (el.dataset.done) return;
    el.dataset.done = '1';
    const target = Number(el.dataset.count) || 0;
    if (reduce) { el.textContent = fmt(target); return; }
 
    const dur = 1800, t0 = performance.now();
    const step = now => {
      const p = Math.min((now - t0) / dur, 1);
      el.textContent = fmt(Math.floor(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = fmt(target);
    };
    requestAnimationFrame(step);
  }
 
 
  /* ---------- 5) ظهور العناصر تدريجياً عند الوصول إليها ---------- */
 
  const reveal = el => {
    el.classList.add('in');
    el.querySelectorAll('[data-count]').forEach(runCounter);
  };
 
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(en => {
        if (en.isIntersecting) { reveal(en.target); obs.unobserve(en.target); }
      });
    }, { threshold: 0.15 });
    document.querySelectorAll('.rv').forEach(el => io.observe(el));
  } else {
    document.querySelectorAll('.rv').forEach(reveal);
  }
})();