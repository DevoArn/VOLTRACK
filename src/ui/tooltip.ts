/**
 * Delayed hover tooltips.
 *
 * Any element can get a tooltip either via `setTip(el, textOrFn)` or a plain
 * `title` attribute (migrated automatically so the native tooltip never shows).
 * The first line renders as a heading; following lines as body text.
 * Function sources are evaluated at show time, so they can display live state.
 */

type TipSource = string | (() => string);

const providers = new WeakMap<Element, TipSource>();

export function setTip(el: Element, src: TipSource): void {
  providers.set(el, src);
  el.removeAttribute('title');
}

function findTarget(node: EventTarget | null): Element | null {
  let n = node instanceof Element ? node : null;
  while (n && n !== document.body) {
    if (providers.has(n)) return n;
    const t = n.getAttribute('title');
    if (t) {
      setTip(n, t);
      return n;
    }
    n = n.parentElement;
  }
  return null;
}

export function installTooltips(delay = 1000): void {
  const tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.setAttribute('role', 'tooltip');
  document.body.append(tip);

  let target: Element | null = null;
  let timer = 0;
  let visible = false;
  let pressed = false;

  const hide = () => {
    window.clearTimeout(timer);
    timer = 0;
    if (visible) {
      tip.classList.remove('show');
      visible = false;
    }
  };

  const arm = () => {
    window.clearTimeout(timer);
    timer = target && !pressed ? window.setTimeout(show, delay) : 0;
  };

  const show = () => {
    timer = 0;
    if (!target || !target.isConnected || pressed) return;
    const src = providers.get(target);
    const text = (typeof src === 'function' ? src() : src)?.trim();
    if (!text) return;

    const [head, ...rest] = text.split('\n');
    tip.replaceChildren();
    const h = document.createElement('div');
    h.className = 'tip-head';
    h.textContent = head;
    tip.append(h);
    for (const line of rest) {
      const d = document.createElement('div');
      d.className = line.startsWith('►') || line.startsWith('◄') ? 'tip-line tip-link' : 'tip-line';
      d.textContent = line;
      tip.append(d);
    }

    // Position below the element (or above if there is no room), clamped to the viewport.
    tip.style.left = '0px';
    tip.style.top = '0px';
    tip.classList.add('show');
    visible = true;
    const r = target.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const gap = 10;
    let x = r.left + r.width / 2 - tw / 2;
    let y = r.bottom + gap;
    let above = false;
    if (y + th > window.innerHeight - 8) {
      y = r.top - th - gap;
      above = true;
    }
    x = Math.max(8, Math.min(window.innerWidth - tw - 8, x));
    y = Math.max(8, y);
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
    tip.classList.toggle('above', above);
  };

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const t = findTarget(e.target);
    if (t === target) return;
    hide();
    target = t;
    arm();
  });
  // Resting again after a scroll/keypress re-arms the delay on the same element.
  document.addEventListener('pointermove', () => {
    if (!visible && !timer) arm();
  });
  document.addEventListener('pointerout', (e) => {
    if (!e.relatedTarget || !(e.relatedTarget instanceof Node)) {
      hide();
      target = null;
    }
  });
  document.addEventListener(
    'pointerdown',
    () => {
      pressed = true;
      hide();
    },
    true,
  );
  document.addEventListener(
    'pointerup',
    () => {
      pressed = false;
      arm();
    },
    true,
  );
  for (const ev of ['wheel', 'keydown', 'scroll', 'blur'] as const) {
    window.addEventListener(ev, hide, { capture: true, passive: true });
  }
}
