(() => {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;

  function setSpot(x, y) {
    root.style.setProperty("--mx", `${x}px`);
    root.style.setProperty("--my", `${y}px`);
    const nx = (x / window.innerWidth) * 2 - 1;
    const ny = (y / window.innerHeight) * 2 - 1;
    root.style.setProperty("--parx", `${(nx * 12).toFixed(2)}px`);
    root.style.setProperty("--pary", `${(ny * 10).toFixed(2)}px`);
  }

  setSpot(window.innerWidth * 0.62, window.innerHeight * 0.22);
  if (reduce) return;

  let raf = 0;
  let pending = null;
  window.addEventListener(
    "pointermove",
    (e) => {
      pending = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!pending) return;
        setSpot(pending.clientX, pending.clientY);
      });
    },
    { passive: true }
  );
})();
