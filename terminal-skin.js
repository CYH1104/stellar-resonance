(() => {
  const opening = document.getElementById('opening');
  if (!opening || opening.querySelector('.terminal-migration')) return;
  const flock = document.createElement('div');
  flock.className = 'terminal-migration';
  flock.setAttribute('aria-hidden', 'true');
  const bird = (n) => `<svg class="terminal-bird" style="--bird:${n}" viewBox="0 0 120 100"><g fill="currentColor"><path d="M53 57C48 44 35 34 23 28L9 21L15 30L7 27L17 37L12 36L24 45L20 46C30 52 37 57 49 61Z"/><path class="near-wing" d="M52 61C43 50 40 34 43 20L49 4L51 17L55 7L55 24L59 16L58 34L62 28C63 41 63 51 58 61Z"/><path d="M30 59C41 54 49 55 59 58L76 54C80 47 86 46 90 50L100 53L89 56C84 63 76 65 66 66L50 66L30 72L35 65L23 63Z"/></g></svg>`;
  flock.innerHTML = '<span class="terminal-dots">· ▪ · ▪</span>' + [1,2,3,4,5].map(bird).join('') + '<span class="terminal-dots">▪ · ▪ ·</span>';
  const poem = document.createElement('div');
  poem.className = 'terminal-poem';
  poem.innerHTML = '<span>✦</span>循着群星，向故事深处飞去。<br><small>LET THE STORY UNFOLD</small>';
  opening.insertBefore(flock, document.getElementById('academySubtitle'));
  opening.insertBefore(poem, document.getElementById('academySubtitle'));
})();
