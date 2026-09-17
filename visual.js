(() => {
  /* Calm motion: spotlight disabled so the UI stays readable */
  const root = document.documentElement;
  root.style.setProperty("--mx", "50vw");
  root.style.setProperty("--my", "18vh");
  root.style.setProperty("--parx", "0px");
  root.style.setProperty("--pary", "0px");
  root.style.setProperty("--tilt-x", "0deg");
  root.style.setProperty("--tilt-y", "0deg");
})();
