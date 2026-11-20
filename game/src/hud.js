// The DOM HUD: health and armour, ammo, money, timer, team score, bomb status,
// killfeed, minimap, buy menu, banners and the start/pause/end overlay. It never
// touches the simulation; main.js pushes numbers in and reads callbacks out.
const COPY = {
  start: {
    title: 'EMBERLINE',
    copy: 'Yard 7, dusk. Three lanes, two bomb sites. Plant the ember charge at A or B, or wipe out ASH. First to 3 rounds takes the yard. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'EMBERLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  round: {
    title: 'Round over',
    copy: '',
    action: 'Next round',
  },
  end: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const healthNum = $('health-num');
  const healthBar = $('health-fill');
  const armourNum = $('armour-num');
  const armourBar = $('armour-fill');
  const money = $('money');
  const timer = $('timer');
  const roundLabel = $('round-label');
  const scoreEmber = $('score-ember');
  const scoreAsh = $('score-ash');
  const bombStatus = $('bomb-status');
  const killfeed = $('killfeed');
  const hitmarker = $('hitmarker');
  const damageFlash = $('damage-flash');
  const flashOverlay = $('flash-overlay');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const crosshair = $('crosshair');
  const plantBar = $('plant-bar');
  const plantFill = $('plant-fill');
  const plantLabel = $('plant-label');
  const buyMenu = $('buy-menu');
  const minimap = $('minimap');
  const mapCtx = minimap.getContext('2d');

  let hitTimer = 0;
  let bannerTimer = 0;
  let last = {};
  let buyHandler = null;

  function setText(el, value, key) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  return {
    setAmmo(mag, reserve, name) {
      setText(ammoMag, String(mag), 'mag');
      setText(ammoReserve, `/ ${reserve === 999 ? '∞' : reserve}`, 'reserve');
      setText(weaponName, name, 'weapon');
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setHealth(hp, armour) {
      setText(healthNum, String(Math.ceil(hp)), 'hp');
      setText(armourNum, String(armour), 'armour');
      healthBar.style.width = `${Math.max(0, hp)}%`;
      armourBar.style.width = `${Math.min(100, armour)}%`;
      $('health').classList.toggle('low', hp <= 30);
    },
    setMoney(value) {
      setText(money, `$${value}`, 'money');
    },
    setTimer(seconds, phase) {
      const shown = Math.max(0, Math.ceil(seconds));
      const mm = Math.floor(shown / 60);
      const ss = String(shown % 60).padStart(2, '0');
      setText(timer, `${mm}:${ss}`, 'timer');
      setText(roundLabel, phase === 'buy' ? 'BUY PHASE' : phase === 'planted' ? 'CHARGE LIVE' : 'ROUND', 'phase');
      timer.classList.toggle('urgent', shown <= 10 && phase !== 'buy');
    },
    setScore(ember, ash, round) {
      setText(scoreEmber, String(ember), 'se');
      setText(scoreAsh, String(ash), 'sa');
      setText($('round-num'), `ROUND ${round}`, 'round');
      setText($('buy-round'), String(round), 'buyround');
    },
    setBombStatus(text, kind) {
      setText(bombStatus, text, 'bomb');
      bombStatus.className = kind ? `bomb-${kind}` : '';
    },
    setPlantProgress(frac, label) {
      plantBar.hidden = false;
      plantFill.style.width = `${Math.round(frac * 100)}%`;
      setText(plantLabel, label, 'plant');
    },
    hidePlantProgress() {
      plantBar.hidden = true;
    },
    killfeed(text, kind) {
      const line = document.createElement('div');
      line.className = `feed-${kind || 'info'}`;
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      damageFlash.classList.add('on');
      setTimeout(() => damageFlash.classList.remove('on'), 180);
    },
    flashWhite(ms = 1200) {
      flashOverlay.classList.add('on');
      setTimeout(() => flashOverlay.classList.remove('on'), ms);
    },
    banner(main, sub, holdMs = 2600) {
      bannerTitle.textContent = main;
      bannerSub.textContent = sub || '';
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.hidden = true; }, holdMs);
    },
    hideBanner() {
      banner.hidden = true;
      clearTimeout(bannerTimer);
    },
    setCrosshairGap(px) {
      crosshair.style.setProperty('--gap', `${px}px`);
    },
    showOverlay(mode, data) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = data && data.copy ? data.copy : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    showBuy(show) {
      buyMenu.hidden = !show;
    },
    setBuyState(moneyValue, owned, flashCount) {
      for (const button of buyMenu.querySelectorAll('button[data-buy]')) {
        const id = button.dataset.buy;
        const price = Number(button.dataset.price || 0);
        const isOwned = id === 'flash' ? flashCount > 0 : Boolean(owned[id]);
        const afford = moneyValue >= price;
        button.disabled = isOwned || !afford;
        button.querySelector('.buy-state').textContent = isOwned ? 'OWNED' : afford ? `$${price}` : `$${price} — NO CASH`;
      }
    },
    onBuy(handler) {
      buyHandler = handler;
      buyMenu.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-buy]');
        if (!button || button.disabled) return;
        buyHandler(button.dataset.buy);
      });
    },
    drawMinimap(playerPos, playerYaw, bots, bombPos) {
      const ctx = mapCtx;
      const W = minimap.width;
      const H = minimap.height;
      const sx = (x) => ((x + 18) / 36) * W;
      const sz = (z) => ((z + 14) / 28) * H;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(20,16,10,0.85)';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#4a3823';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, W - 2, H - 2);
      // Sites.
      ctx.fillStyle = 'rgba(47,212,196,0.25)';
      ctx.fillRect(sx(-16.1), sz(-13.1), sx(-10.7) - sx(-16.1), sz(-7.7) - sz(-13.1));
      ctx.fillRect(sx(10.7), sz(-13.1), sx(16.1) - sx(10.7), sz(-7.7) - sz(-13.1));
      ctx.fillStyle = '#2fd4c4';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('A', sx(-13.4) - 3, sz(-10.4) + 4);
      ctx.fillText('B', sx(13.4) - 3, sz(-10.4) + 4);
      // Bots.
      for (const bot of bots) {
        if (!bot.alive) continue;
        ctx.fillStyle = bot.team === 'ember' ? '#ff7a1a' : '#c6452f';
        ctx.beginPath();
        ctx.arc(sx(bot.pos.x), sz(bot.pos.z), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Bomb.
      if (bombPos) {
        ctx.fillStyle = '#2fd4c4';
        ctx.beginPath();
        ctx.arc(sx(bombPos.x), sz(bombPos.z), 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Player arrow.
      ctx.save();
      ctx.translate(sx(playerPos.x), sz(playerPos.z));
      ctx.rotate(Math.atan2(-Math.sin(playerYaw), -Math.cos(playerYaw)) + Math.PI / 2);
      ctx.fillStyle = '#f2ead9';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4.5, 5);
      ctx.lineTo(-4.5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
  };
}
