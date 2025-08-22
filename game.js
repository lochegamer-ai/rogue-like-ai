/* SALVE COMO `game.js` na mesma pasta do index.html */
/* ==========================================================
   FIXES:
   - setupPerkOverlay(): eventos protegidos com checagem de null.
   - Atalho H: só acessa classList se #helpOverlay existir.
   - drawPickup(): corrigido typo na moeda.
   - init(): chamada a setupStartUI() para botão Começar.
   ========================================================== */

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function aabb(ax,ay,aw,ah,bx,by,bw,bh){ return ax<bx+bw && ax+aw>bx && ay<by+bh && ay+ah>by; }
function get(cssVar){return getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();}

/* ---------- Áudio ---------- */
const Sfx={ctx:null,enabled:false,
  init(){ if(this.ctx)return; try{ this.ctx=new (window.AudioContext||window.webkitAudioContext)(); this.enabled=true; }catch(e){} },
  beep(type='sine',f=440,d=0.08,v=0.2){ if(!this.enabled)return; const t=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();
    o.type=type;o.frequency.value=f;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+0.005);g.gain.exponentialRampToValueAtTime(0.0001,t+d);
    o.connect(g).connect(this.ctx.destination);o.start(t);o.stop(t+d+0.02);},
  shoot(){this.beep('triangle',720,0.05,0.15)}, hit(){this.beep('square',320,0.06,0.18)},
  hurt(){this.beep('sawtooth',140,0.12,0.25)}, coin(){this.beep('square',900,0.06,0.2)},
  heart(){this.beep('sine',560,0.08,0.2)}, door(){this.beep('triangle',500,0.18,0.25)}, perk(){this.beep('sine',680,0.2,0.22)},
  bossShoot(){this.beep('square',260,0.07,0.22)}, bossDie(){this.beep('triangle',160,0.5,0.35)}, dash(){this.beep('square',120,0.05,0.3)},
  shield(){this.beep('triangle',540,0.10,0.25)}
};

/* ---------- BGM (música de fundo) ---------- */
/* Regras dos navegadores:
   - Só tocam áudio após alguma interação do usuário (clique/tecla).
   - Então chamamos Bgm.unlock() na primeira interação para “desbloquear”.
*/
const Bgm = {
  tracks: {},
  current: null,
  ready: false,
  muted: false,
  baseVolume: 0.55,   // volume padrão (0..1)

  init() {
    if (this.ready) return;
    const mk = (src) => {
      const a = new Audio(src);
      a.loop = true;
      a.preload = 'auto';
      a.volume = 0;         // começamos com 0 e fazemos fade-in
      a.muted  = this.muted;
      return a;
    };
    // this.tracks.menu  = mk('assets/audio/bgm/menu.mp3');
    // this.tracks.stage = mk('assets/audio/bgm/stage.mp3');
    // this.tracks.boss  = mk('assets/audio/bgm/boss.mp3');
    this.ready = true;
  },

  // Tenta tocar rapidamente e parar para “desbloquear” autoplay
  unlock() {
    this.init();
    const tryPlay = async (a)=>{ try{ await a.play(); a.pause(); a.currentTime = 0; }catch(_){} };
    Object.values(this.tracks).forEach(tryPlay);
  },

  setMuted(m) {
    this.muted = m;
    this.init();
    for (const a of Object.values(this.tracks)) a.muted = m;
  },

  ensure(name, src = `assets/audio/bgm/${name}.mp3`) {
    this.init();
    if (this.tracks[name]) return;
    const a = new Audio(src);
    a.loop = true;
    a.preload = 'auto';
    a.volume = 0;           // fade-in depois
    a.muted  = this.muted;
    this.tracks[name] = a;
  },

  async play(name, { fade = 0.35 } = {}) {
    this.init();
    this.ensure(name);
    const next = this.tracks[name];
    if (!next) return;
    if (this.current === next) return;

    // fade-out da atual
    if (this.current) this._fadeOut(this.current, fade);

    // fade-in da próxima
    try { await next.play(); } catch(_) { /* se ainda bloqueado, será tocado após unlock() */ }
    this._fadeIn(next, fade);
    this.current = next;
  },

  stop({ fade = 0.2 } = {}) {
    if (!this.current) return;
    this._fadeOut(this.current, fade, true);
    this.current = null;
  },

  _fadeIn(a, dur) {
    const target = this.baseVolume;
    const t0 = performance.now();
    const step = () => {
      const t = (performance.now() - t0) / (dur * 1000);
      if (t >= 1) { a.volume = target; return; }
      a.volume = target * t;
      requestAnimationFrame(step);
    };
    a.volume = 0;
    a.muted = this.muted;
    requestAnimationFrame(step);
  },

  _fadeOut(a, dur, stopAtEnd=false) {
    const start = a.volume;
    const t0 = performance.now();
    const step = () => {
      const t = (performance.now() - t0) / (dur * 1000);
      if (t >= 1) {
        a.volume = 0;
        if (stopAtEnd) { a.pause(); a.currentTime = 0; }
        return;
      }
      a.volume = start * (1 - t);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
};


/* ---------- BIOMAS ---------- */
const BIOMES = [
  { id:'crypt',  name:'Cripta',     colors:{ floor:'#121826', wall:'#2d3a53', enemy:'#ff5a7d', accent:'#7cf5ff', door:'#9ef0ff' }, mul:{hp:1.00, spd:1.00} },
  { id:'frost',  name:'Gélido',     colors:{ floor:'#0e1824', wall:'#27517a', enemy:'#64d2ff', accent:'#a4e8ff', door:'#b3ecff' }, mul:{hp:1.10, spd:0.98} },
  { id:'forest', name:'Bosque',     colors:{ floor:'#162012', wall:'#2f4020', enemy:'#ffd84d', accent:'#a8ff7c', door:'#e6c84d' }, mul:{hp:1.05, spd:1.05} },
  { id:'swamp',  name:'Pântano',    colors:{ floor:'#0f1d17', wall:'#24533b', enemy:'#8bff64', accent:'#7cffb1', door:'#b0ffcf' }, mul:{hp:0.95, spd:1.08} },
  { id:'tech',   name:'Neon-Tecno', colors:{ floor:'#0b0b12', wall:'#30304a', enemy:'#ff5aee', accent:'#7cf5ff', door:'#9ef0ff' }, mul:{hp:1.15, spd:1.12} }
];
function setVar(k,v){ document.documentElement.style.setProperty(k,v); }
function currentBiome(){ return BIOMES[Game.biomeIndex]||BIOMES[0]; }
function applyBiome(){
  const c=currentBiome().colors;
  setVar('--floor', c.floor); setVar('--wall', c.wall); setVar('--enemy', c.enemy); setVar('--accent', c.accent); setVar('--door', c.door);
}

// música por bioma: qual track tocar na fase/boss
const BIOME_MUSIC = {
  crypt:  { stage: 'stage_crypt',  boss: 'boss_crypt'  },
  frost:  { stage: 'stage_frost',  boss: 'boss_frost'  },
  swamp:  { stage: 'stage_swamp',  boss: 'boss_swamp'  },
  tech:   { stage: 'stage_tech',   boss: 'boss_tech'   },
  forest: { stage: 'stage_forest', boss: 'boss_forest' }
};

/* ---------- Estado ---------- */
const Game={
  w:800,h:600,ctx:null,keys:{},paused:false,over:false,time:0, rngSeed:1337,
  state:'menu',
  mouse:{ x:0, y:0, down:false, inside:false }, // ← NOVO
  level:1, hardMode:false, muted:false,
  biomeIndex:0,
  room:{x:40,y:40,w:720,h:520,walls:[], target:8, spawned:0, cleared:false, door:null, topWall:null, isBoss:false},
  difficulty:{ hpMul:1, spdMul:1, spawnEvery:1.9 },
  player:{
    x:400,y:300,w:26,h:26,speed:220,vx:0,vy:0,color:get('--player'),
    hp:6, hpMax:6, inv:0, hurtFlash:0, score:0,
    dmg:1, fireRate:0.18, tearSize:8, rangeLife:0.9, multishot:1, pierce:0, perks:[],
    spreadAngle:0, triShot:false, wallBounce:0, chain:0, shotSpeedMul:1,
    shield:0, shieldMax:0, shieldRegenTime:12, shieldRegenTimer:0,
    vampChance:0, vampOnKill:0,
    frozenTime: 0 
  },
  enemies:[], spawnTimer:0, maxEnemies:9,
  tears:[], fireCD:0, pickups:[],
  particles:[],
  choosingPerk:false, offered:[],
  boss:null, bossBullets:[]
};
function rand(){ Game.rngSeed = (Game.rngSeed*1664525 + 1013904223) >>> 0; return Game.rngSeed/0xffffffff; }

const SKINS = [
  { id:'classic', name:'Clássica', color:'#ffd34d' },
  { id:'jade',    name:'Jade',     color:'#6ef7b0' },
  { id:'violet',  name:'Violeta',  color:'#c79aff' },
  { id:'crimson', name:'Carmesim', color:'#ff6b6b' },
  { id:'sky',     name:'Céu',      color:'#7cd9ff' },
  { id:'honey',   name:'Honey',    color:'#ffcb4c' } 
];


/* ---------- Bosses ---------- */
const BOSS_TYPES = [
  {
    id: 'slime',
    name: 'SLIME-REI',
    color: get('--boss1'),
    size: [80, 80],
    hpMul: 1.0,
    speed: 90,
    bulletColor: '#f2c7d0',

    init(b) {
      b.fire1 = 0;
      b.fireAim = 0;
      b.fireRing = 1.6;
    },

    update(b, dt) {
      // Disparos em cruz
      b.fire1 -= dt;
      if (b.fire1 <= 0) {
        shootBoss(b, 1, 0);
        shootBoss(b, -1, 0);
        shootBoss(b, 0, 1);
        shootBoss(b, 0, -1);
        b.fire1 = b.phase2 ? 0.75 : 1.2;
      }

      // Disparo mirando no player
      b.fireAim -= dt;
      if (b.fireAim <= 0) {
        shootBossAim(b);
        b.fireAim = b.phase2 ? 0.6 : 1.1;
      }

      // Ataque em anel + invocação de inimigos na fase 2
      if (b.phase2) {
        b.fireRing -= dt;
        if (b.fireRing <= 0) {
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            shootBoss(b, Math.cos(a), Math.sin(a), 200);
          }
          b.fireRing = 1.2;

          if (!b.summoned) {
            b.summoned = true;
            for (let i = 0; i < 2; i++) {
              spawnEnemy(true);
            }
          }
        }
      }
    },

    draw(b, ctx) {
      ctx.save();
      ctx.shadowColor = '#ffc2ce';
      ctx.shadowBlur = 18;
      ctx.fillStyle = this.color;
      roundRect(ctx, b.x, b.y, b.w, b.h, 12);
      ctx.fill();
      ctx.restore();

      // Olhos do boss
      ctx.fillStyle = "#140b18";
      ctx.fillRect(b.x + 24, b.y + 28, 8, 8);
      ctx.fillRect(b.x + b.w - 32, b.y + 28, 8, 8);
    }
  },
  {
    id: 'garg',
    name: 'GÁRGULA',
    color: get('--boss2'),
    size: [64, 64],
    hpMul: 0.8,
    speed: 80,
    bulletColor: '#cbb8ff',

    init(b) {
      // já existia
      b.dashCD = 2.0;
      b.dashing = 0;
      b.aimCD = 0.8;

      // 🔷 NOVO: golfo de gelo (AOE) e estalactites
      b.aoeCD = 3.0;            // 1º AOE rápido; depois usa recarga mais longa
      b.stalWaveCD = 5.0;       // a cada 2s dispara uma "onda" de estalactites
      b.stalQueue = 0;          // quantas ainda faltam cair na sequência desta onda
      b.stalQueueDelay = 0;     // espaçamento entre as quedas sequenciais
    },

    update(b, dt) {
      // ---------- Investida (mesmo que antes)
      b.dashCD -= dt;
      if (b.dashCD <= 0 && b.dashing <= 0) {
        b.dashing = 0.35;
        b.dashCD = b.phase2 ? 1.0 : 1.4;

        const p = Game.player;
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        const px = p.x + p.w / 2, py = p.y + p.h / 2;
        let dx = px - cx, dy = py - cy, m = Math.hypot(dx, dy) || 1;
        b.vx = (dx / m) * 420;
        b.vy = (dy / m) * 420;

        Sfx.dash?.();
      }

      if (b.dashing > 0) {
        b.dashing -= dt;
        if (b.dashing <= 0) b.vx = b.vy = 0;
      }

      // ---------- Disparo em leque (mesmo que antes)
      b.aimCD -= dt;
      if (b.aimCD <= 0) {
        const p = Game.player;
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        const px = p.x + p.w / 2, py = p.y + p.h / 2;
        let dx = px - cx, dy = py - cy, m = Math.hypot(dx, dy) || 1;
        dx /= m; dy /= m;

        const spread = 0.45;
        for (let i = -2; i <= 2; i++) {
          const a = Math.atan2(dy, dx) + i * spread / 4;
          shootBoss(b, Math.cos(a), Math.sin(a), 220);
        }

        b.aimCD = b.phase2 ? 0.7 : 1.0;
      }

      // ---------- 🔷 NOVO 1: AOE de gelo que congela o player por 0.5s
      b.aoeCD -= dt;
      if (b.aoeCD <= 0) {
        const p = Game.player;
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        const px = p.x + p.w / 2, py = p.y + p.h / 2;
        const dist = Math.hypot(px - cx, py - cy);
        const R = 130; // raio do AOE

        // se o player estiver dentro do raio no momento do disparo → congela
        if (dist <= R) {
          p.frozenTime = Math.max(p.frozenTime || 0, 0.5);
        }

        // efeito visual simples
        spawnBurst(cx, cy, 24, '#a4e8ff');
        if (Sfx.enabled) Sfx.bossShoot();

        // recarga seguinte (fase2 um pouco mais frequente)
        b.aoeCD = b.phase2 ? 3.0 : 4.2;
      }

      // ---------- 🔷 NOVO 2: Estalactites
      // a cada 2s inicia uma onda de 10–15 quedas:
      // 1–3 caem em paralelo de imediato; o restante cai sequencialmente (0.18s)
      b.stalWaveCD -= dt;
      if (b.stalWaveCD <= 0) {
        const total = 10 + Math.floor(rand() * 6);      // 10..15
        const parallel = 1 + Math.floor(rand() * 3);    // 1..3
        for (let i = 0; i < parallel; i++) scheduleStalactite();
        b.stalQueue = total - parallel;
        b.stalQueueDelay = 0.18;
        b.stalWaveCD = 2.0; // próxima onda em 2s
      }

      if (b.stalQueue > 0) {
        b.stalQueueDelay -= dt;
        if (b.stalQueueDelay <= 0) {
          scheduleStalactite();
          b.stalQueue--;
          b.stalQueueDelay = 0.18;
        }
      }

      // helper local: agenda uma queda com sombra de 0.5s
      function scheduleStalactite() {
        const r = Game.room, B = 28, pad = 10;
        const innerX = r.x + B + pad, innerW = r.w - 2 * (B + pad);
        const tx = innerX + rand() * (innerW);      // alvo X
        const ty = r.y + r.h - 32;                  // "chão" (mesmo offset dos pickups)
        Game.bossBullets.push({
          type: 'stalTele',     // telegraph (sombra)
          telegraph: 0.5,       // 0.5s antes de cair
          teleX: tx,
          teleY: ty,
          color: '#a4e8ff'
        });
      }
    },

    draw(b, ctx) {
      ctx.save();
      const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
      g.addColorStop(0, '#dcd2ff');
      g.addColorStop(1, this.color);
      ctx.fillStyle = g;
      roundRect(ctx, b.x, b.y, b.w, b.h, 10);
      ctx.fill();
      ctx.restore();

      // Olhos e detalhe brilhante
      ctx.fillStyle = "#0a0620";
      ctx.fillRect(b.x + 18, b.y + 20, 6, 6);
      ctx.fillRect(b.x + b.w - 24, b.y + 20, 6, 6);

      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(b.x + 10, b.y + 6, b.w - 20, 6);
    }
  },

  {
    id: 'queenBee',
    name: 'ABELHA-RAINHA',
    color: '#ffd84d',          // amarelo mel (pode trocar por get('--boss1/2/3') se quiser)
    size: [72, 72],
    hpMul: 1.8,
    speed: 90,
    bulletColor: '#ffcc4d',

    init(b) {
      b.summonCD = 2.5;       // intervalo fixo de invocação (em segundos)
      b.jitter = 0.25;        // leve zigue-zague no movimento
    },

    update(b, dt) {
      // movimento "zumbido": segue o player com um pouco de ruído
      const p  = Game.player;
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const px = p.x + p.w / 2, py = p.y + p.h / 2;
      let dx = px - cx, dy = py - cy, m = Math.hypot(dx, dy) || 1;
      dx = (dx / m) + (Math.random() - 0.5) * b.jitter;
      dy = (dy / m) + (Math.random() - 0.5) * b.jitter;
      m = Math.hypot(dx, dy) || 1;
      b.vx = (dx / m) * b.speed;
      b.vy = (dy / m) * b.speed;

      // invoca 5 minions a cada 1.5s (sem mudar a dificuldade do jogo)
      b.summonCD -= dt;
      if (b.summonCD <= 0) {
        const livres = Math.max(0, Game.maxEnemies - Game.enemies.length);
        const qtd = Math.min(5, livres);      // respeita o teto de inimigos
        for (let i = 0; i < qtd; i++) {
          spawnEnemy(true, this.color);                    // usa seu spawner "de boss"
        }
        if (qtd > 0 && Sfx.enabled) Sfx.bossShoot(); // um "bzz" sonoro emprestado
        b.summonCD = 1.5;                      // reinicia o timer
      }
    },

    draw(b, ctx) {
      // corpo
      ctx.save();
      ctx.fillStyle = this.color;
      roundRect(ctx, b.x, b.y, b.w, b.h, 10);
      ctx.fill();

      // listras pretas
      ctx.fillStyle = '#262626';
      const stripeH = 10;
      for (let y = b.y + 8; y < b.y + b.h - 8; y += stripeH * 2) {
        ctx.fillRect(b.x + 6, y, b.w - 12, stripeH);
      }

      // asas translúcidas
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#e0f7ff';
      roundRect(ctx, b.x - 10, b.y + 8, 22, 14, 7);
      roundRect(ctx, b.x + b.w - 12, b.y + 8, 22, 14, 7);
      ctx.globalAlpha = 1;

      // olhos
      ctx.fillStyle = '#140b18';
      ctx.fillRect(b.x + 20, b.y + 20, 8, 8);
      ctx.fillRect(b.x + b.w - 28, b.y + 20, 8, 8);

      ctx.restore();
    }
  },
  {
    id: 'obs',
    name: 'OBSIDIANO',
    color: get('--boss3'),
    size: [96, 96],
    hpMul: 1.5,
    speed: 70,
    bulletColor: '#cfd6de',

    init(b) {
      b.mineCD = 1.3;
    },

    update(b, dt) {
      // Solta minas
      b.mineCD -= dt;
      if (b.mineCD <= 0) {
        const a = Math.random() * Math.PI * 2;
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        const sp = 140;
        const s = Game.bossBullets;
        const size = 10;

        s.push({
          x: b.x + b.w / 2 - size / 2 + dx * 18,
          y: b.y + b.h / 2 - size / 2 + dy * 18,
          w: size,
          h: size,
          vx: dx * sp,
          vy: dy * sp,
          life: 1.2,
          color: this.bulletColor,
          mine: true,
          explodeAt: 0
        });

        b.mineCD = b.phase2 ? 0.9 : 1.3;
        Sfx.bossShoot();
      }

      // Explosão das minas
      for (const m of Game.bossBullets) {
        if (!m.mine) continue;

        m.life -= dt;
        if (m.life <= 0 && !m.exploded) {
          m.exploded = true;
          m.vx = m.vy = 0;
          m.life = 0.6;
          m.explodeAt = 0.6;

          for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            Game.bossBullets.push({
              x: m.x,
              y: m.y,
              w: 8,
              h: 8,
              vx: Math.cos(ang) * 240,
              vy: Math.sin(ang) * 240,
              life: 1.3,
              color: this.bulletColor
            });
          }
        }
      }
    },

    draw(b, ctx) {
      ctx.fillStyle = this.color;
      roundRect(ctx, b.x, b.y, b.w, b.h, 8);
      ctx.fill();

      // Textura rochosa
      ctx.strokeStyle = '#2b3138';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x + 12, b.y + 18);
      ctx.lineTo(b.x + 34, b.y + 36);
      ctx.lineTo(b.x + 20, b.y + 52);

      ctx.moveTo(b.x + b.w - 14, b.y + 22);
      ctx.lineTo(b.x + b.w - 30, b.y + 42);
      ctx.lineTo(b.x + b.w - 22, b.y + 60);
      ctx.stroke();

      // Olhos
      ctx.fillStyle = "#090c10";
      ctx.fillRect(b.x + 30, b.y + 24, 8, 8);
      ctx.fillRect(b.x + b.w - 38, b.y + 24, 8, 8);
    }
  }
];

// /* Para manter o exemplo autocontido, reuso o visual do boss 1 */
// BOSS_TYPES.push({
//   id:'slime',name:'SLIME-REI',color:get('--boss1'),size:[80,80],hpMul:1.0,speed:90,bulletColor:'#f2c7d0',
//   init(b){b.fire1=0;b.fireAim=0;},update(b,dt){ b.fire1-=dt; if(b.fire1<=0){ shootBoss(b,1,0);shootBoss(b,-1,0);shootBoss(b,0,1);shootBoss(b,0,-1); b.fire1=1.1;} b.fireAim-=dt; if(b.fireAim<=0){ shootBossAim(b); b.fireAim=1.0; } },
//   draw(b,ctx){ ctx.save(); ctx.shadowColor='#ffc2ce'; ctx.shadowBlur=18; ctx.fillStyle=this.color; roundRect(ctx,b.x,b.y,b.w,b.h,12); ctx.fill(); ctx.restore();
//                ctx.fillStyle="#140b18"; ctx.fillRect(b.x+24,b.y+28,8,8); ctx.fillRect(b.x+b.w-32,b.y+28,8,8);}
// });
/* ---------- Construção da sala ---------- */
function buildRoom(level){
  const r=Game.room, B=28;
  Game.enemies.length=0; Game.tears.length=0; Game.pickups.length=0; Game.particles.length=0; Game.boss=null; Game.bossBullets.length=0;
  r.walls=[]; r.topWall={x:r.x,y:r.y,w:r.w,h:B}; r.walls.push(r.topWall);
  r.walls.push({x:r.x,y:r.y+r.h-B,w:r.w,h:B}); r.walls.push({x:r.x,y:r.y,w:B,h:r.h}); r.walls.push({x:r.x+r.w-B,y:r.y,w:B,h:r.h});

  // escolhe bioma pelo andar
  const idx = Math.floor((level-1)/5) % BIOMES.length;
  if(Game.biomeIndex !== idx){ Game.biomeIndex = idx; applyBiome(); }

  r.isBoss = (level % 5 === 0);
  if(!r.isBoss){
    const patterns=[()=>{r.walls.push({x:r.x+220,y:r.y+210,w:120,h:24},{x:r.x+420,y:r.y+320,w:24,h:120});},
                    ()=>{r.walls.push({x:r.x+160,y:r.y+140,w:24,h:200},{x:r.x+520,y:r.y+260,w:24,h:200});},
                    ()=>{r.walls.push({x:r.x+300,y:r.y+200,w:140,h:24},{x:r.x+300,y:r.y+360,w:140,h:24});},
                    ()=>{r.walls.push({x:r.x+280,y:r.y+160,w:24,h:240},{x:r.x+440,y:r.y+160,w:24,h:240});}];
    patterns[(level-1)%patterns.length]();
    r.target=6+Math.floor(level*2); r.spawned=0; r.cleared=false; r.door=null;

    const diffMul = Game.hardMode ? 1.25 : 1.0;
    const bm = currentBiome().mul;
    Game.difficulty.hpMul=diffMul*bm.hp*(1+(level-1)*0.15);
    Game.difficulty.spdMul=diffMul*bm.spd*(1+(level-1)*0.08);
    Game.difficulty.spawnEvery=clamp(1.9-(level-1)*0.1,0.8,1.9);
    Game.spawnTimer=0.5; Game.maxEnemies=clamp(8+Math.floor(level/2),8,14);
  }else{
    r.target=0; r.spawned=0; r.cleared=false; r.door=null; Game.spawnTimer=9999; spawnBoss(level);
  }

  // posição do jogador
  const px = Game.w/2 - Game.player.w/2;
  const pyCenter = Game.h/2 - Game.player.h/2;
  const pyBoss = Game.room.y + Game.room.h * 0.70 - Game.player.h/2;
  Game.player.x = px;
  Game.player.y = r.isBoss ? pyBoss : pyCenter;
  Game.player.vx = Game.player.vy = 0;


    // 🔊 música por bioma
  const biomeId = currentBiome().id;
  const pack = BIOME_MUSIC[biomeId] || {};
  const track = r.isBoss ? (pack.boss || 'boss') : (pack.stage || 'stage');

  // só tenta tocar se o áudio já foi “desbloqueado” por alguma interação
  if (Bgm.ready) Bgm.play(track);
}

function bossIndexForLevel(level) {
  const bossRound = Math.floor((level - 1) / 5); // 5→0, 10→1, 15→2 ...
  return bossRound % BOSS_TYPES.length;          // cicla dentro do array
}

function spawnBoss(level){
  const idx = bossIndexForLevel(level);
  const T   = BOSS_TYPES[idx] || BOSS_TYPES[0];  // fallback seguro
  const r   = Game.room;

  const w = T.size[0], h = T.size[1];
  const hpBase = Math.round((50 + level * 6) * T.hpMul * (Game.hardMode ? 1.15 : 1));

  Game.boss = {
    type: T,
    x: r.x + r.w/2 - w/2,
    y: r.y + r.h/2 - h/2,
    w, h,
    hp: hpBase, hpMax: hpBase,
    speed: T.speed * (Game.hardMode ? 1.1 : 1),
    vx: 0, vy: 0,
    phase2: false,
    summoned: false
  };

  if (T.init) T.init(Game.boss);

  // opcional: log pra você ver qual entrou
  console.log(`Boss ${idx+1}/${BOSS_TYPES.length}: ${T.name} (level ${level})`);
}

function openDoorGap(){
  const r=Game.room, B=r.topWall.h, d=r.door, pad=6;
  const idx=r.walls.indexOf(r.topWall); if(idx>=0) r.walls.splice(idx,1);
  const left={x:r.x,y:r.y,w:Math.max(0,(d.x-pad)-r.x),h:B}, rx=d.x+d.w+pad, right={x:rx,y:r.y,w:Math.max(0,(r.x+r.w)-rx),h:B};
  if(left.w>0) r.walls.push(left); if(right.w>0) r.walls.push(right);
}

 // SKINS
function getSavedSkinId(){ return localStorage.getItem('skinId') || 'classic'; }

function applySkinById(id){
  const s = SKINS.find(k=>k.id===id) || SKINS[0];
  Game.player.skinId = s.id;
  Game.player.color  = s.color;       // draw() já usa p.color → sem quebrar nada
}

function applySavedSkin(){ applySkinById(getSavedSkinId()); }


/* ---------- Perks / Ajuda ---------- */
const PERK_ICONS={dmg:'⚔️',firer:'🔥',spd:'🏃',size:'🟦',range:'📏',hp:'💖',multi:'🔱',pierce:'🎯',
  shield1:'🛡️',shieldRegen:'✨',tri:'🔺',bounce:'↔️',chain:'🧲',speedtear:'🚀',vamp:'🧪'};
const RARINFO={comum:{nome:'Comum', cor:'var(--rar-comum)'}, raro:{nome:'Raro', cor:'var(--rar-raro)'},
               lend:{nome:'Lendário', cor:'var(--rar-lend)'}, mit:{nome:'Mítico', cor:'var(--rar-mit)'}};
const RAR={comum:{k:'comum',w:60}, raro:{k:'raro',w:28}, lend:{k:'lend',w:10}, mit:{k:'mit',w:2}};
const PERKS=[
  {id:'dmg',title:'+Dano',desc:'+1 de dano por lágrima.',rar:'comum',apply:()=>{Game.player.dmg+=1;}},
  {id:'firer',title:'Fogo Rápido',desc:'+20% cadência (CD -20%).',rar:'lend',apply:()=>{Game.player.fireRate=clamp(Game.player.fireRate*0.8,0.05,10);}},
  {id:'spd',title:'Velocidade',desc:'+15% velocidade.',rar:'comum',apply:()=>{Game.player.speed=Math.round(Game.player.speed*1.15);}},
  {id:'size',title:'Lágrima Maior',desc:'+40% tamanho.',rar:'comum',apply:()=>{Game.player.tearSize=Math.round(Game.player.tearSize*1.4);}},
  {id:'range',title:'Alcance',desc:'+25% duração do projétil.',rar:'comum',apply:()=>{Game.player.rangeLife*=1.25;}},
  {id:'hp',title:'Coração Extra',desc:'+1 coração (máx + cura).',rar:'raro',apply:()=>{Game.player.hpMax+=2; Game.player.hp=clamp(Game.player.hp+2,0,Game.player.hpMax);}},
  {id:'multi',title:'Tiro Duplo',desc:'+1 tiro paralelo (até 3).',rar:'raro',apply:()=>{Game.player.multishot=Math.min(Game.player.multishot+1,3);  Game.player.spreadAngle=Math.max(Game.player.spreadAngle,18);}},
  {id:'pierce',title:'Perfuração+',desc:'+1 perfuração.',rar:'raro',apply:()=>{Game.player.pierce+=1;}},
  {id:'shield1',title:'Escudo',desc:'+1 escudo que absorve dano.',rar:'raro',apply:()=>{Game.player.shieldMax++; Game.player.shield++; Sfx.shield();}},
  {id:'shieldRegen',title:'Escudo Regenerativo',desc:'+1 escudo e regenera a cada 12s.',rar:'lend',apply:()=>{Game.player.shieldMax++; Game.player.shield++; Game.player.shieldRegenTime=12;}},
  {id:'tri',title:'Trishot',desc:'3 disparos em leque.',rar:'mit',apply:()=>{Game.player.triShot=true; Game.player.spreadAngle=Math.max(Game.player.spreadAngle,18);}},
  {id:'bounce',title:'Ricochete',desc:'Lágrimas quicam 2x em paredes.',rar:'lend',apply:()=>{Game.player.wallBounce=Math.max(Game.player.wallBounce,2);}},
  {id:'chain',title:'Elétrico',desc:'Encadeia entre inimigos (2 alvos).',rar:'lend',apply:()=>{Game.player.chain=Math.max(Game.player.chain,2);}},
  {id:'speedtear',title:'Tiro Veloz',desc:'+30% velocidade do projétil.',rar:'raro',apply:()=>{Game.player.shotSpeedMul*=1.3;}},
  {id:'vpierce',title:'Perfuração ++',desc:'+2 perfurações.',rar:'lend',apply:()=>{Game.player.pierce+=2;}},
  {id:'vamp',title:'Vampirismo',desc:'12% cura ½ por acerto + ½ por kill.',rar:'mit',apply:()=>{Game.player.vampChance=Math.max(Game.player.vampChance,0.12); Game.player.vampOnKill=Math.max(Game.player.vampOnKill,1);} }
];

/* === AJUSTE CRÍTICO: overlay de ajuda com checagens seguras === */
function showHelp(){
  const grid=document.getElementById('helpGrid'); if(!grid) return;
  grid.innerHTML='';
  PERKS.forEach(p=>{
    const el=document.createElement('div'); const r=RARINFO[p.rar];
    el.style.border='1px solid #304269'; el.style.borderRadius='12px'; el.style.padding='10px';
    el.innerHTML = `<div style="font-weight:700">${PERK_ICONS[p.id]||'✨'} ${p.title}
      <span class="pill" style="background:${get(r.cor)}33;border:1px solid ${get(r.cor)};color:${get(r.cor)}">${r.nome}</span></div>
      <div style="opacity:.9;font-size:14px;margin-top:6px">${p.desc}</div>`;
    grid.appendChild(el);
  });
  const ov=document.getElementById('helpOverlay'); if(!ov) return;
  ov.classList.add('show'); ov.setAttribute('aria-hidden','false');
}
function hideHelp(){
  const ov=document.getElementById('helpOverlay'); if(!ov) return;
  ov.classList.remove('show'); ov.setAttribute('aria-hidden','true');
}

function setupPerkOverlay(){
  const ov=document.getElementById('perkOverlay');
  if(ov){
    ov.addEventListener('click',(e)=>{const c=e.target.closest('.card'); if(c) choosePerk(parseInt(c.dataset.idx,10));});
  }
  // Atalho H protegido
  addEventListener('keydown',(e)=>{ if(e.key.toLowerCase()==='h'){ const s=document.getElementById('helpOverlay').classList.contains('show'); s?hideHelp():showHelp(); }});

  const helpEl=document.getElementById('helpOverlay');
  if(helpEl) helpEl.addEventListener('click',hideHelp);
}

function setupMouse(canvas){
  // converte coordenada da tela -> coordenada lógica do jogo (800x600)
  const toGameCoords = (e)=>{
    const rect = canvas.getBoundingClientRect();
    const scaleX = Game.w / rect.width;
    const scaleY = Game.h / rect.height;
    Game.mouse.x = (e.clientX - rect.left) * scaleX;
    Game.mouse.y = (e.clientY - rect.top)  * scaleY;
  };

  canvas.style.cursor = 'crosshair';        // opcional
  canvas.addEventListener('pointermove', (e)=>{ toGameCoords(e); Game.mouse.inside = true; });
  canvas.addEventListener('pointerleave', ()=>{ Game.mouse.inside = false; Game.mouse.down = false; });

  canvas.addEventListener('pointerdown', (e)=>{
    if (e.button === 0) {                   // botão esquerdo
      toGameCoords(e);
      Game.mouse.down = true;
      // se você usa Bgm.unlock() na 1ª interação, pode chamar aqui também
      // Bgm.unlock?.();
    }
  });

  addEventListener('pointerup', (e)=>{ if (e.button === 0) Game.mouse.down = false; });
  canvas.addEventListener('contextmenu', (e)=> e.preventDefault()); // sem menu do botão direito
}


// Empurra o INIMIGO para fora do PLAYER quando há overlap AABB
function separateEnemyFromPlayer(e, p) {
  // caixas
  const ex1 = e.x, ey1 = e.y, ex2 = e.x + e.w, ey2 = e.y + e.h;
  const px1 = p.x, py1 = p.y, px2 = p.x + p.w, py2 = p.y + p.h;

  // áreas de sobreposição
  const overlapX = Math.min(ex2, px2) - Math.max(ex1, px1);
  const overlapY = Math.min(ey2, py2) - Math.max(ey1, py1);
  if (overlapX <= 0 || overlapY <= 0) return false; // sem colisão

  // direção "para longe" do player
  const ecx = e.x + e.w/2, ecy = e.y + e.h/2;
  const pcx = p.x + p.w/2, pcy = p.y + p.h/2;
  const dirX = (ecx < pcx) ? -1 : 1; // se inimigo está à esquerda do player, empurra para a esquerda
  const dirY = (ecy < pcy) ? -1 : 1; // se acima, empurra para cima
  const pad  = 3; // folga para não “colar” de novo

  let moved = false;

  // 1) tenta resolver no eixo de MENOR penetração
  if (overlapX < overlapY) {
    const push = dirX * (overlapX + pad);
    const nx = e.x + push;
    if (!rectCollidesWalls(nx, e.y, e.w, e.h)) {
      e.x = nx; moved = true;
      e.vx += dirX * 60; // impulso anti-grude
    }
  } else {
    const push = dirY * (overlapY + pad);
    const ny = e.y + push;
    if (!rectCollidesWalls(e.x, ny, e.w, e.h)) {
      e.y = ny; moved = true;
      e.vy += dirY * 60;
    }
  }

  // 2) se falhou (parede bloqueando), tenta o outro eixo
  if (!moved) {
    const pushX = dirX * (overlapX + pad);
    const nx = e.x + pushX;
    if (!rectCollidesWalls(nx, e.y, e.w, e.h)) {
      e.x = nx; moved = true; e.vx += dirX * 60;
    }

    if (!moved) {
      const pushY = dirY * (overlapY + pad);
      const ny = e.y + pushY;
      if (!rectCollidesWalls(e.x, ny, e.w, e.h)) {
        e.y = ny; moved = true; e.vy += dirY * 60;
      }
    }
  }

  // 3) ainda encurralado? divide um micro-empurrão entre os dois
  if (!moved) {
    const k = 0.5; // metade para cada
    const pushX = dirX * Math.min(overlapX + pad, 6) * k;
    const pushY = dirY * Math.min(overlapY + pad, 6) * k;

    // tenta mover inimigo e player um tiquinho, evitando paredes
    const eNX = e.x + pushX, eNY = e.y + pushY;
    const pNX = p.x - pushX, pNY = p.y - pushY;

    const eOk = !rectCollidesWalls(eNX, e.y, e.w, e.h) && !rectCollidesWalls(e.x, eNY, e.w, e.h);
    const pOk = !rectCollidesWalls(pNX, p.y, p.w, p.h) && !rectCollidesWalls(p.x, pNY, p.w, p.h);

    if (eOk) { e.x = eNX; e.y = eNY; moved = true; }
    if (pOk) { p.x = pNX; p.y = pNY; moved = true; }
  }

  return moved;
}




/* ---------- Perk overlay restante ---------- */
function rarityColor(r){ return get(r==='comum'?'--rar-comum': r==='raro'?'--rar-raro': r==='lend'?'--rar-lend':'--rar-mit'); }
function showPerkOverlay(opts){
  const ov=document.getElementById('perkOverlay'), list=document.getElementById('perkCards'); if(!ov||!list) return;
  list.innerHTML='';
  opts.forEach((pk,i)=>{ const div=document.createElement('div'); div.className='card'; div.dataset.idx=i; div.style.borderColor=rarityColor(pk.rar);
    const icon=PERK_ICONS[pk.id]||'✨', tag=({comum:'Comum',raro:'Raro',lend:'Lendário',mit:'Mítico'})[pk.rar];
    div.innerHTML=`<h3 class="title-card" style="color:${rarityColor(pk.rar)}">${icon} ${pk.title}</h3><p class="desc">${pk.desc}</p><p class="tag">[${i+1}] • ${tag}</p>`; list.appendChild(div); });
  ov.classList.add('show'); ov.setAttribute('aria-hidden','false');
}
function hidePerkOverlay(){ const ov=document.getElementById('perkOverlay'); if(!ov) return; ov.classList.remove('show'); ov.setAttribute('aria-hidden','true'); }
function offerPerks(){ if(Game.choosingPerk) return; Game.choosingPerk=true; const picks = weightedPickUnique(PERKS,3); Game.offered=picks; showPerkOverlay(picks); }
function choosePerk(i){ const ch=Game.offered[i]; if(!ch) return; ch.apply(); Game.player.perks.push(ch.id); hidePerkOverlay(); Game.choosingPerk=false; Game.level++; buildRoom(Game.level); Sfx.perk(); }
function weightedPickUnique(pool,k){
  const W={comum:60,raro:28,lend:10,mit:2}; const sel=[], used=new Set();
  for(let i=0;i<k;i++){ let total=0; for(const p of pool){ if(!used.has(p.id)) total+=W[p.rar]; }
    let r=Math.random()*total, choice=null; for(const p of pool){ if(used.has(p.id)) continue; r-=W[p.rar]; if(r<=0){ choice=p; break; } }
    if(!choice){ const avail=pool.filter(p=>!used.has(p.id)); choice=avail[Math.floor(Math.random()*avail.length)]; }
    used.add(choice.id); sel.push(choice);
  }
  return sel;
}

/* ---------- Entradas ---------- */
const KeysDown=['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d','i','j','k','l','p','h','r'];
function getMoveVec(){ const k=Game.keys; let x=0,y=0; if(k['arrowleft']||k['a'])x-=1; if(k['arrowright']||k['d'])x+=1; if(k['arrowup']||k['w'])y-=1; if(k['arrowdown']||k['s'])y+=1; if(x||y){const m=Math.hypot(x,y); x/=m; y/=m;} return {x,y}; }
//function getFireVec(){ const k=Game.keys; let x=0,y=0; if(k['j'])x-=1; if(k['l'])x+=1; if(k['i'])y-=1; if(k['k'])y+=1; if(x||y){const m=Math.hypot(x,y); x/=m; y/=m;} return {x,y}; }
function getFireVec(){
  // 1) teclado (I J K L) — prioridade se estiver pressionado
  const right = Game.keys['l'] ? 1 : 0;
  const left  = Game.keys['j'] ? 1 : 0;
  const down  = Game.keys['k'] ? 1 : 0;
  const up    = Game.keys['i'] ? 1 : 0;

  let x = right - left;
  let y = down - up;
  if (x !== 0 || y !== 0) {
    const m = Math.hypot(x,y) || 1;
    return { x: x/m, y: y/m };             // usa o direcional
  }

  // 2) mouse — mira do centro do player até o cursor
  if (Game.state === 'play' && Game.mouse.inside && Game.mouse.down) {
    const p = Game.player;
    const cx = p.x + p.w/2, cy = p.y + p.h/2;
    let dx = Game.mouse.x - cx;
    let dy = Game.mouse.y - cy;
    const m = Math.hypot(dx,dy) || 1;
    return { x: dx/m, y: dy/m };           // usa o mouse enquanto botão esquerdo estiver pressionado
  }

  // sem input
  return { x: 0, y: 0 };
}



/* ---------- Colisão / util ---------- */
function collideWithWalls(rect, axis){
  for(const w of Game.room.walls){
    if(!aabb(rect.x,rect.y,rect.w,rect.h, w.x,w.y,w.w,w.h)) continue;
    if(axis==='x'){ const fromLeft=(rect.x+rect.w/2)<(w.x+w.w/2); rect.x=fromLeft? w.x-rect.w : w.x+w.w; rect.vx=0; }
    else{ const fromTop=(rect.y+rect.h/2)<(w.y+w.h/2); rect.y=fromTop? w.y-rect.h : w.y+w.h; rect.vy=0; }
  }
  const r=Game.room; if(axis==='x') rect.x=clamp(rect.x,r.x+2,r.x+r.w-rect.w-2); if(axis==='y') rect.y=clamp(rect.y,r.y+2,r.y+r.h-rect.h-2);
}
function hitWalls(rct){ for(const w of Game.room.walls){ if(aabb(rct.x,rct.y,rct.w,rct.h,w.x,w.y,w.w,w.h)) return true; } const r=Game.room; return (rct.x < r.x || rct.y < r.y ||
        rct.x + rct.w > r.x + r.w ||
        rct.y + rct.h > r.y + r.h); }
function rectCollidesWalls(x,y,w,h){ for(const b of Game.room.walls){ if(aabb(x,y,w,h,b.x,b.y,b.w,b.h)) return true; } return false; }
function spawnDust(x,y,life,color,alpha=0.4){ Game.particles.push({x,y,vx:(Math.random()-0.5)*30,vy:(-10-Math.random()*20),life,size:2,color,drag:0.95,g:20,alpha}); }
function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

/* ---------- Loop ---------- */
let last=0;
function loop(now){
  const dt = Math.min(1/30, (now - last) / 1000);
  last = now;

  if (Game.state === 'play' && !Game.paused && !Game.choosingPerk) {
    update(dt);
    draw();
    Game.time += dt;
  } else if (Game.state === 'play') {
    // Pausado ou escolhendo perk → só redesenha a tela
    draw();
  } else {
    drawMenu();
  }
  requestAnimationFrame(loop);
}

/* ---------- Update ---------- */
function update(dt){
  if (Game.paused) return;  // ⛔ trava tudo no pause
  if (Game.over)   return;
  const p=Game.player, r=Game.room;

  // 🔷 NOVO: decaimento do congelamento
  if (Game.player.frozenTime > 0) {
    Game.player.frozenTime = Math.max(0, Game.player.frozenTime - dt);
  }

  const isFrozen = Game.player.frozenTime > 0;

  const mv = isFrozen ? {x:0, y:0} : getMoveVec();
  p.vx = mv.x * p.speed; p.vy = mv.y * p.speed;
  p.x+=p.vx*dt; collideWithWalls(p,'x'); p.y+=p.vy*dt; collideWithWalls(p,'y');
  if(p.inv>0) p.inv=Math.max(0,p.inv-dt); if(p.hurtFlash>0) p.hurtFlash=Math.max(0,p.hurtFlash-dt);

  if(p.shield < p.shieldMax){ p.shieldRegenTimer+=dt; if(p.shieldRegenTimer>=p.shieldRegenTime){ p.shield++; p.shieldRegenTimer=0; Sfx.shield(); spawnBurst(p.x+p.w/2,p.y-6,10,get('--accent')); } }

  Game.fireCD -= dt;
  const aim = isFrozen ? {x:0, y:0} : getFireVec();
  if((aim.x||aim.y) && Game.fireCD<=0){
    console.debug('fire', aim, 'cd', Game.fireCD);
    shoot(aim.x,aim.y);
    Game.fireCD=p.fireRate;
    if(Sfx.enabled) Sfx.shoot();
  }

  // projéteis do player
  for(let i=Game.tears.length-1;i>=0;i--){
    const t=Game.tears[i], stepX=t.vx*dt, stepY=t.vy*dt;
    t.age += dt;
    
    t.x += stepX;
    if (hitWalls(t)) {
      if (t.age <= 0.02) {           // 20 ms iniciais: só desfaz, não mata
        t.x -= stepX;
      } else if (t.bounces > 0) {
        t.x -= stepX; t.vx *= -1; t.bounces--;
      } else { Game.tears.splice(i,1); continue; }
    }

    t.y += stepY;
    if (hitWalls(t)) {
      if (t.age <= 0.02) {
        t.y -= stepY;
      } else if (t.bounces > 0) {
        t.y -= stepY; t.vy *= -1; t.bounces--;
      } else { Game.tears.splice(i,1); continue; }
    }
    t.life -= dt;
    if (t.life <= 0) { Game.tears.splice(i,1); continue; }

    let hit=false;
    for(let j=Game.enemies.length-1;j>=0;j--){
      const e=Game.enemies[j]; if(!aabb(t.x,t.y,t.w,t.h,e.x,e.y,e.w,e.h)) continue;

      e.hp-=t.dmg; if(Sfx.enabled) Sfx.hit(); spawnBurst(e.x+e.w/2,e.y+e.h/2,8,'#62ff9e');
      if(Game.player.vampChance>0 && Math.random()<Game.player.vampChance) heal(1);
      hit=true; if(e.hp<=0){ killEnemy(j,e,true); }
      if(t.chain>0){ const nxt=findNearestEnemyExcept(e,t.x+t.w/2,t.y+t.h/2,180); if(nxt){ const dx=nxt.x+nxt.w/2-(t.x+t.w/2), dy=nxt.y+nxt.h/2-(t.y+t.h/2), m=Math.hypot(dx,dy)||1; t.vx=(dx/m)*t.speed; t.vy=(dy/m)*t.speed; t.chain--; if(t.pierce>0)t.pierce--; } else { if(t.pierce>0)t.pierce--; else Game.tears.splice(i,1); } }
      else { if(t.pierce>0)t.pierce--; else Game.tears.splice(i,1); }
      break;
    }
    if(Game.boss && !hit){
      const b=Game.boss; if(aabb(t.x,t.y,t.w,t.h,b.x,b.y,b.w,b.h)){
        b.hp-=t.dmg; if(Sfx.enabled) Sfx.hit(); spawnBurst(t.x+t.w/2,t.y+t.h/2,6,'#ccecff');
        if(Game.player.vampChance>0 && Math.random()<Game.player.vampChance) heal(1);
        if(t.chain>0){ const nxt=findNearestEnemyExcept(b,t.x+t.w/2,t.y+t.h/2,220); if(nxt){ const dx=nxt.x+nxt.w/2-(t.x+t.w/2), dy=nxt.y+nxt.h/2-(t.y+t.h/2), m=Math.hypot(dx,dy)||1; t.vx=(dx/m)*t.speed; t.vy=(dy/m)*t.speed; t.chain--; } else { if(t.pierce>0)t.pierce--; else Game.tears.splice(i,1); } }
        else { if(t.pierce>0)t.pierce--; else Game.tears.splice(i,1); }
        if(b.hp<=0) bossDefeated();
      }
    }
  }

  if(!r.isBoss){ Game.spawnTimer-=dt; if(!r.cleared && r.spawned<r.target && Game.spawnTimer<=0 && Game.enemies.length<Game.maxEnemies){ spawnEnemy(); r.spawned++; Game.spawnTimer=Game.difficulty.spawnEvery; } }
  else {
    updateBoss(dt);

    // 🔷 SEMPRE impedir sobreposição com o boss (mesmo com invulnerabilidade)
    if (Game.boss && aabb(p.x,p.y,p.w,p.h, Game.boss.x,Game.boss.y,Game.boss.w,Game.boss.h)) {
      // podemos reusar o mesmo helper dos inimigos:
      separateEnemyFromPlayer(Game.boss, Game.player);
      // (sem alterar dano: só separa. Se quiser dano por contato do boss, a gente adiciona depois.)
    }
  }
  for (const e of Game.enemies) {
  updateEnemy(e, dt);

  if (aabb(p.x, p.y, p.w, p.h, e.x, e.y, e.w, e.h)) {
    // 1) SEMPRE separa (impede sobreposição)
    separateEnemyFromPlayer(e, Game.player);

    // 2) Dano só se não estiver invulnerável
    if (Game.player.inv <= 0) {
      damagePlayerFrom(e);
    }
  }
}
  for(let i=Game.bossBullets.length-1;i>=0;i--){
    const b=Game.bossBullets[i]; 

    if (b.type === 'stalTele') {
      b.telegraph -= dt;
      if (b.telegraph <= 0) {
        const sizeW = 14, sizeH = 26;
        const startY = Game.room.y - 40;         // começa um pouco acima do topo
        const endY   = b.teleY - sizeH;          // chão (ajustado pelo tamanho)
        Game.bossBullets[i] = {
          type: 'stal',
          // posição atual
          x: b.teleX - sizeW/2,
          y: startY,
          w: sizeW,
          h: sizeH,
          // queda com easing
          cx: b.teleX,            // centro X alvo
          startY,
          endY,
          fallT: 0,               // 0..1
          fallDur: 0.72 + Math.random()*0.22, // 0.72..0.94s
          wobbleAmp: 1.6,         // balancinho sutil
          rot: (Math.random()-0.5)*0.25,   // rotação inicial leve
          spin: (Math.random()-0.5)*0.55,  // vai desacelerando
          color: '#cfd6de'
        };
      }
      continue; // não cai no fluxo padrão
    }
    
    // 2) ESTALACTITE EM QUEDA COM EASING
    if (b.type === 'stal') {
      // easeInQuad (começa devagar, acelera): e = t*t
      b.fallT += dt / b.fallDur;
      const t = Math.min(1, b.fallT);
      const e = t * t;

      // posição
      b.y = b.startY + (b.endY - b.startY) * e;
      b.x = b.cx - b.w/2 + Math.sin(t * 12) * b.wobbleAmp;

      // rotação desacelerando conforme chega no chão
      b.rot += b.spin * dt * (1 - t);

      // colisão com o player
      const p = Game.player;
      if (aabb(p.x, p.y, p.w, p.h, b.x, b.y, b.w, b.h) && p.inv <= 0) {
        Game.bossBullets.splice(i, 1);
        damagePlayerFrom({ x: b.x, y: b.y, w: b.w, h: b.h });
        spawnBurst(b.x + b.w/2, b.y + b.h/2, 14, '#d4ecff');
        continue;
      }

      // fim da queda → impacto e remove
      if (t >= 1) {
        spawnBurst(b.x + b.w/2, b.endY + b.h/2, 18, '#d4ecff');
        if (Sfx.enabled) Sfx.bossShoot();
        Game.bossBullets.splice(i, 1);
      }
      continue; // não usa o fluxo padrão
    }

    b.x+=b.vx*dt; b.y+=b.vy*dt; if(!b.mine) b.life-=dt;
    if(hitWalls(b)||b.life<=0){ Game.bossBullets.splice(i,1); continue; }
    if(aabb(p.x,p.y,p.w,p.h,b.x,b.y,b.w,b.h) && p.inv<=0){ Game.bossBullets.splice(i,1); damagePlayerFrom({x:b.x,y:b.y,w:b.w,h:b.h}); }
  }

  for(let i=Game.pickups.length-1;i>=0;i--){
    const it=Game.pickups[i]; it.vy=clamp((it.vy||0)+300*dt,-300,300);
    it.y+=it.vy*dt; if(it.y+it.h > r.y+r.h-30){ it.y=r.y+r.h-30-it.h; it.vy=0; }
    if(aabb(p.x,p.y,p.w,p.h,it.x,it.y,it.w,it.h)){ collect(it.type); Game.pickups.splice(i,1); }
  }

  if(!r.isBoss){
    if(!r.cleared && r.spawned>=r.target && Game.enemies.length===0){
      r.cleared=true; r.door={x:Game.w/2-22,y:r.y+10,w:44,h:22,glow:0}; openDoorGap(); if(Sfx.enabled) Sfx.door();
      dropRoomClearRewards(false);
    }
  }
  if(r.cleared && r.door){
    r.door.glow=(r.door.glow+dt*2)%1;
    if(Math.random()<0.08) spawnDust(r.door.x+r.door.w/2, r.door.y+r.door.h+2, 0.3, get('--door'), 0.8);
    if(aabb(p.x,p.y,p.w,p.h, r.door.x,r.door.y,r.door.w,r.door.h)) offerPerks();
  }

  for(let i=Game.particles.length-1;i>=0;i--){
    const a=Game.particles[i]; a.life-=dt; if(a.life<=0){ Game.particles.splice(i,1); continue; }
    a.x+=a.vx*dt; a.y+=a.vy*dt; a.vx*=a.drag; a.vy=a.vy*a.drag + a.g*dt;
  }

  if(p.hp<=0) Game.over=true;
}

/* ---------- Recompensas ---------- */
function dropRoomClearRewards(isBoss){
  for(let i=0;i<(isBoss?6:3);i++) Game.pickups.push({type:'coin',x:400-24+i*12,y:300-10,w:12,h:12,vy:-200});
  const n = rollHearts(isBoss);
  for(let i=0;i<n;i++) Game.pickups.push({type:'heart',x:400-8 + i*18, y:300-28, w:16, h:14, vy:-220});
}
function rollHearts(isBoss){
  let table = isBoss ? [[0,0.55],[1,0.30],[2,0.12],[3,0.03]] : [[0,0.50],[1,0.35],[2,0.12],[3,0.03]];
  if(Game.player.hp <= 2){ table = table.map(([q,p])=> q===0?[0,p-0.10]: q===1?[1,p+0.10]:[q,p]); }
  let r=Math.random(), acc=0; for(const [q,p] of table){ acc+=p; if(r<=acc) return q; } return 0;
}

/* ---------- Inimigos ---------- */
function spawnEnemy(isFromBoss=false){
  const r=Game.room, B=28, pad=8, eW=22, eH=22;
  const inner={x:r.x+B+pad,y:r.y+B+pad,w:r.w-2*(B+pad),h:r.h-2*(B+pad)};
  const sides=['top','bottom','left','right']; let tries=40;
  while(tries--){
    const side=sides[Math.floor(rand()*sides.length)]; let x=inner.x,y=inner.y;
    if(side==='top'){y=inner.y; x=inner.x+rand()*(inner.w-eW);}
    if(side==='bottom'){y=inner.y+inner.h-eH; x=inner.x+rand()*(inner.w-eW);}
    if(side==='left'){x=inner.x; y=inner.y+rand()*(inner.h-eH);}
    if(side==='right'){x=inner.x+inner.w-eW; y=inner.y+rand()*(inner.h-eH);}
    const px=Game.player.x+Game.player.w/2, py=Game.player.y+Game.player.h/2, cx=x+eW/2, cy=y+eH/2;
    const farEnough=Math.hypot(cx-px,cy-py)>(isFromBoss?40:80);
    if(!rectCollidesWalls(x,y,eW,eH) && farEnough){
      const bm=currentBiome();
      const e={x,y,w:eW,h:eH,color:bm.colors.enemy,
               speed:(110+rand()*50)*Game.difficulty.spdMul,vx:0,vy:0,jitter:(rand()*0.6+0.7),hp:Math.ceil(2*Game.difficulty.hpMul)};
      Game.enemies.push(e); return;
    }
  }
  const x=r.x+B+pad+inner.w/2-eW/2, y=r.y+B+pad+inner.h/2-eH/2;
  Game.enemies.push({x,y,w:eW,h:eH,color:currentBiome().colors.enemy,speed:(110+rand()*50)*Game.difficulty.spdMul,vx:0,vy:0,jitter:(rand()*0.6+0.7),hp:Math.ceil(2*Game.difficulty.hpMul)});
}

function spawnEnemy(isFromBoss = false, bossColor = null) {
  const r = Game.room, B = 28, pad = 8, eW = 22, eH = 22;
  const inner = { x: r.x+B+pad, y: r.y+B+pad, w: r.w-2*(B+pad), h: r.h-2*(B+pad) };
  const sides = ['top','bottom','left','right'];
  let tries = 40;

  while (tries--) {
    const side = sides[Math.floor(rand()*sides.length)];
    let x = inner.x, y = inner.y;

    if (side==='top')    { y=inner.y;              x=inner.x+rand()*(inner.w-eW); }
    if (side==='bottom') { y=inner.y+inner.h-eH;   x=inner.x+rand()*(inner.w-eW); }
    if (side==='left')   { x=inner.x;              y=inner.y+rand()*(inner.h-eH); }
    if (side==='right')  { x=inner.x+inner.w-eW;   y=inner.y+rand()*(inner.h-eH); }

    const px = Game.player.x+Game.player.w/2, py = Game.player.y+Game.player.h/2;
    const cx = x+eW/2, cy = y+eH/2;
    const farEnough = Math.hypot(cx-px,cy-py) > (isFromBoss?40:80);

    if (!rectCollidesWalls(x,y,eW,eH) && farEnough) {
      const bm = currentBiome();
      const e = {
        x,y,w:eW,h:eH,
        color: bossColor || bm.colors.enemy,   // <<< usa cor do boss se vier dele
        speed: (110+rand()*50)*Game.difficulty.spdMul,
        vx:0,vy:0,
        jitter: (rand()*0.6+0.7),
        hp: Math.ceil(2*Game.difficulty.hpMul)
      };
      Game.enemies.push(e);
      return;
    }
  }

  // fallback se não achou lugar
  const x = r.x+B+pad+inner.w/2-eW/2, y = r.y+B+pad+inner.h/2-eH/2;
  Game.enemies.push({
    x,y,w:eW,h:eH,
    color: bossColor || currentBiome().colors.enemy,
    speed:(110+rand()*50)*Game.difficulty.spdMul,
    vx:0,vy:0,
    jitter:(rand()*0.6+0.7),
    hp:Math.ceil(2*Game.difficulty.hpMul)
  });
}

function updateEnemy(e, dt){
  // 1) calcula direção/velocidade
  const p = Game.player;
  const cx = e.x + e.w/2, cy = e.y + e.h/2;
  const px = p.x + p.w/2, py = p.y + p.h/2;
  let dx = px - cx, dy = py - cy, m = Math.hypot(dx,dy)||1;
  dx/=m; dy/=m;

  e.vx = dx * e.speed;
  e.vy = dy * e.speed;
  // (… seu jitter/IA extra …)

  // ⬇️ COLE AQUI (anti-encosto preventivo, antes de mover)
  {
    const dxP = (p.x + p.w/2) - (e.x + e.w/2);
    const dyP = (p.y + p.h/2) - (e.y + e.h/2);
    const dist = Math.hypot(dxP, dyP);
    const minDist = (p.w + e.w)/2 - 2; // raio “sem encostar”
    if (dist < minDist && dist > 0.001) {
      const repel = (minDist - dist) * 6;
      e.vx -= (dxP / dist) * repel;
      e.vy -= (dyP / dist) * repel;
    }
  }

  // 2) mover e colidir
  const stepX = e.vx * dt;
  e.x += stepX;
  if (rectCollidesWalls(e.x, e.y, e.w, e.h)) { e.x -= stepX; e.vx = 0; }

  const stepY = e.vy * dt;
  e.y += stepY;
  if (rectCollidesWalls(e.x, e.y, e.w, e.h)) { e.y -= stepY; e.vy = 0; }
}

function killEnemy(idx,e,killedByPlayer=false){
  Game.enemies.splice(idx,1); spawnBurst(e.x+e.w/2,e.y+e.h/2,20,e.color);
  if(Math.random()<0.60) Game.pickups.push({type:'coin',x:e.x+4,y:e.y+4,w:12,h:12,vy:-180});
  Game.player.score+=5;
  if(killedByPlayer && Game.player.vampOnKill>0) heal(Game.player.vampOnKill);
}

/* ---------- Boss ciclo ---------- */
function updateBoss(dt){
  const b=Game.boss,p=Game.player; if(!b) return;
  if(!b.phase2 && b.hp<=b.hpMax*0.5){ b.phase2=true; b.speed*=1.15; spawnBurst(b.x+b.w/2,b.y+b.h/2,30,b.type.color); }
  if(!b.dashing || b.dashing<=0){ let dx=(p.x+p.w/2)-(b.x+b.w/2), dy=(p.y+p.h/2)-(b.y+b.h/2), m=Math.hypot(dx,dy)||1; b.vx=(dx/m)*b.speed; b.vy=(dy/m)*b.speed; }
  b.x+=b.vx*dt; collideWithWalls(b,'x'); b.y+=b.vy*dt; collideWithWalls(b,'y');
  if(b.type.update) b.type.update(b,dt);
}
function bossDefeated(){
  if(!Game.boss) return; const b=Game.boss; spawnBurst(b.x+b.w/2,b.y+b.h/2,50,b.type.color); if(Sfx.enabled) Sfx.bossDie();
  Game.boss=null; Game.bossBullets.length=0;
  const r=Game.room; r.cleared=true; r.door={x:Game.w/2-22,y:r.y+10,w:44,h:22,glow:0}; openDoorGap(); if(Sfx.enabled) Sfx.door();
  dropRoomClearRewards(true);
}
function shootBoss(b,dx,dy,speed=180){ const s=Game.bossBullets,size=8,col=b.type.bulletColor||'#f2c7d0'; const x=b.x+b.w/2-size/2+dx*18, y=b.y+b.h/2-size/2+dy*18; s.push({x,y,w:size,h:size,vx:dx*speed,vy:dy*speed,life:3,color:col}); if(Sfx.enabled) Sfx.bossShoot(); }
function shootBossAim(b){ const p=Game.player,ex=b.x+b.w/2,ey=b.y+b.h/2,px=p.x+p.w/2,py=p.y+p.h/2; let vx=px-ex,vy=py-ey,m=Math.hypot(vx,vy)||1; vx/=m;vy/=m; shootBoss(b,vx,vy,240); }

/* ---------- Tiro / Dano ---------- */
function shoot(dx,dy){
  const p = Game.player; if(!dx && !dy) return;

    // direção base
  const baseAngle = Math.atan2(dy, dx);
  const dirx = Math.cos(baseAngle);
  const diry = Math.sin(baseAngle);

  const speed = 420 * p.shotSpeedMul;

  // distância padrão a partir do centro do player
  const size = p.tearSize;
  const spawnBase = Math.max(14, p.w/2 + size/2 + 4);

  const n     = p.triShot ? 3 : p.multishot;
  const spreadRad = (p.spreadAngle || 0) * Math.PI/180;

  for (let i=0;i<n;i++){
    let ang = baseAngle;
    if (n>1){ const t=(i/(n-1))-0.5; ang += t * spreadRad * 2; }
    const vx = Math.cos(ang) * speed;
    const vy = Math.sin(ang) * speed;

    // ponto inicial tentativa
    let sx = p.x + p.w/2 - size/2 + Math.cos(ang) * spawnBase;
    let sy = p.y + p.h/2 - size/2 + Math.sin(ang) * spawnBase;

    // 👇 Ajuste de segurança: se nascer em parede/borda, recua 2px até ficar válido (máx 8 passos)
    const temp = {x:sx, y:sy, w:size, h:size};
    let steps = 8;
    while (hitWalls(temp) && steps--){
      temp.x -= Math.cos(ang) * 2;
      temp.y -= Math.sin(ang) * 2;
    }
    sx = temp.x; sy = temp.y;

    Game.tears.push({
      x:sx, y:sy, w:size, h:size, vx, vy,
      life:p.rangeLife, dmg:p.dmg, color:get('--tear'),
      pierce:p.pierce, bounces:p.wallBounce, chain:p.chain,
      speed, age:0
    });
  }
}
function collect(type){ const p=Game.player; if(type==='coin'){p.score+=1;if(Sfx.enabled)Sfx.coin();} if(type==='heart'){heal(2);} }
function heal(a){ const p=Game.player; p.hp=clamp(p.hp+a,0,p.hpMax); if(Sfx.enabled) Sfx.heart(); }
function damagePlayerFrom(e){
  const p=Game.player;
  if(p.shield>0){ p.shield--; p.inv=0.6; p.hurtFlash=0.15; if(Sfx.enabled) Sfx.shield(); spawnBurst(p.x+p.w/2,p.y+p.h/2,16,get('--accent')); return; }
  p.hp=Math.max(0,p.hp-1); p.inv=1.0; p.hurtFlash=0.25; if(Sfx.enabled) Sfx.hurt(); spawnBurst(p.x+p.w/2,p.y+p.h/2,14,get('--danger'));
  const cx=p.x+p.w/2,cy=p.y+p.h/2,ex=e.x+e.w/2,ey=e.y+e.h/2; let kx=cx-ex,ky=cy-ey,m=Math.hypot(kx,ky); if(m<0.001){kx=1;ky=0;m=1;}
  kx/=m; ky/=m; const knock=180; p.vx=kx*knock; p.vy=ky*knock; p.x+=p.vx*0.05; collideWithWalls(p,'x'); p.y+=p.vy*0.05; collideWithWalls(p,'y');
}

/* ---------- Desenho ---------- */
function draw(){
  const ctx=Game.ctx; ctx.clearRect(0,0,Game.w,Game.h); drawFloor();
  ctx.fillStyle=get('--wall'); for(const w of Game.room.walls) ctx.fillRect(w.x,w.y,w.w,w.h);

  const r=Game.room;
  if(r.cleared && r.door){
    const d=r.door; ctx.save(); ctx.shadowColor=get('--door'); ctx.shadowBlur=20 + Math.sin(Game.time*4)*6; ctx.fillStyle=get('--door'); roundRect(ctx,d.x,d.y,d.w,d.h,4); ctx.fill(); ctx.restore();
    ctx.fillStyle="rgba(255,255,255,0.8)"; ctx.font="12px system-ui"; ctx.fillText("Porta ↑", d.x-6, d.y+d.h+12);
  }

  for(const it of Game.pickups) drawPickup(it);
  for(const e of Game.enemies){
    ctx.fillStyle=e.color; roundRect(ctx,e.x,e.y,e.w,e.h,6); ctx.fill();
    ctx.fillStyle="#140b18"; ctx.fillRect(e.x+6,e.y+8,3,3); ctx.fillRect(e.x+e.w-9,e.y+8,3,3);
    ctx.fillStyle="rgba(0,0,0,0.5)"; ctx.fillRect(e.x,e.y-6,e.w,4);
    ctx.fillStyle="#62ff9e"; ctx.fillRect(e.x,e.y-6,(e.w)*(e.hp/Math.max(1,Math.ceil(2*Game.difficulty.hpMul))),4);
  }
  if(Game.boss) drawBoss(Game.ctx);

  for(const t of Game.tears){ ctx.fillStyle=t.color; roundRect(ctx,t.x,t.y,t.w,t.h,4); ctx.fill(); }
  for (const bb of Game.bossBullets) {
    if (bb.type === 'stalTele') {
      const t = Math.max(0, bb.telegraph) / 0.5; // 1→0
      const alpha = 0.15 + 0.65 * (1 - t);
      const rx = 10 + 6 * Math.sin(Game.time * 8);
      const ry = 6;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#a4e8ff';
      ctx.beginPath();
      ctx.ellipse(bb.teleX, bb.teleY + 6, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  // 🔹 2) DESENHA OS PROJÉTEIS (depois das sombras)
  for (const b of Game.bossBullets) {
    if (b.type === 'stalTele') continue; // já desenhado como sombra

    if (b.type === 'stal') {
      drawStalactite(ctx, b);            // desenho especial
      continue;
    }

    ctx.fillStyle = b.color || '#f2c7d0';
    roundRect(ctx, b.x, b.y, b.w, b.h, b.mine && !b.exploded ? 4 : 3);
    ctx.fill();
  }

  for(const a of Game.particles){ const k=Math.max(0,Math.min(1,a.life)); const al=a.alpha || (0.9*k); ctx.globalAlpha=al; ctx.fillStyle=a.color; ctx.fillRect(a.x-a.size/2,a.y-a.size/2,a.size,a.size); ctx.globalAlpha=1; }

  const p=Game.player; const flashing=(p.inv>0)&&Math.floor(Game.time*20)%2===0;
  if(!flashing){ ctx.save(); if(p.shield>0){ ctx.shadowColor=get('--accent'); ctx.shadowBlur=16+4*Math.sin(Game.time*6); } if(p.hurtFlash>0){ ctx.shadowColor=get('--danger'); ctx.shadowBlur=18; } ctx.fillStyle=p.color; roundRect(ctx,p.x,p.y,p.w,p.h,6); ctx.fill(); ctx.restore(); }

  // 🔷 NOVO: aura azul quando congelado
  if (Game.player.frozenTime > 0) {
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(Game.time * 8);
    ctx.strokeStyle = '#a4e8ff';
    ctx.lineWidth = 3;
    roundRect(ctx, Game.player.x - 2, Game.player.y - 2, Game.player.w + 4, Game.player.h + 4, 8);
    ctx.stroke();
    ctx.restore();
  }

    // 🔷 NOVO: mira do mouse (pontinho)
  if (Game.mouse.inside) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = get('--accent');
    ctx.fillRect(Game.mouse.x - 2, Game.mouse.y - 2, 4, 4);
    ctx.restore();
  }
  
  drawHUD();

  if(Game.paused && !Game.over && !Game.choosingPerk) drawCenterText("⏸ Pausado (P)");
  if(Game.over) drawCenterText("💀 Game Over\nPressione R para reiniciar");
}
function drawMenu(){
  const ctx=Game.ctx;
  ctx.clearRect(0,0,Game.w,Game.h);
  ctx.fillStyle=get('--floor'); ctx.fillRect(0,0,Game.w,Game.h);
  const cell=24; ctx.strokeStyle="rgba(255,255,255,0.04)"; ctx.beginPath();
  for(let x=40;x<=760;x+=cell){ctx.moveTo(x,40);ctx.lineTo(x,560)} for(let y=40;y<=560;y+=cell){ctx.moveTo(40,y);ctx.lineTo(760,y)} ctx.stroke();
  const t=performance.now()/1000; ctx.strokeStyle='rgba(124,245,255,0.35)'; ctx.lineWidth=2+Math.sin(t*2)*1; ctx.strokeRect(42,42,716,516);
  if(Math.random()<0.1) spawnDust(400+(Math.random()-0.5)*300, 300+(Math.random()-0.5)*200, 0.8, '#7cf5ff', 0.25);
  for(let i=Game.particles.length-1;i>=0;i--){ const a=Game.particles[i]; a.life-=0.016; if(a.life<=0){ Game.particles.splice(i,1); continue; } a.x+=a.vx*0.016; a.y+=a.vy*0.016; a.vx*=a.drag; a.vy=a.vy*a.drag + a.g*0.016; const al=a.alpha || (0.9*(a.life)); ctx.globalAlpha=al; ctx.fillStyle=a.color; ctx.fillRect(a.x-a.size/2,a.y-a.size/2,a.size,a.size); ctx.globalAlpha=1; }
}
function drawFloor(){
  const ctx=Game.ctx, r=Game.room; ctx.fillStyle=get('--floor'); ctx.fillRect(0,0,Game.w,Game.h);
  const cell=20; ctx.strokeStyle="rgba(255,255,255,0.04)"; ctx.lineWidth=1; ctx.beginPath();
  for(let x=r.x;x<=r.x+r.w;x+=cell){ctx.moveTo(x,r.y);ctx.lineTo(x,r.y+r.h);} for(let y=r.y;y<=r.y+r.h;y+=cell){ctx.moveTo(r.x,y);ctx.lineTo(r.x+r.w,y);} ctx.stroke();
  ctx.strokeStyle=get('--accent'); ctx.globalAlpha=0.3; ctx.lineWidth=2; ctx.strokeRect(r.x+1,r.y+1,r.w-2,r.h-2); ctx.globalAlpha=1;
}
function drawHUD(){
  const ctx=Game.ctx, p=Game.player;
  ctx.fillStyle=get('--ui'); ctx.font="16px system-ui";
  const lvl=Game.room.isBoss? `${Game.level} (BOSS)` : Game.level;
  ctx.fillText(`andar ${lvl}  •  t=${(Math.round(Game.time*10)/10).toFixed(1)}s  •  pontos=${p.score}  •  HP:${p.hp}/${p.hpMax}`,16,24);
  const hearts=Math.ceil(p.hpMax/2), x0=16,y0=40,s=16,gap=6; for(let i=0;i<hearts;i++) drawHeart(x0+i*(s+gap),y0,s, Math.max(0,Math.min(2,p.hp - i*2)));
  if(p.shieldMax>0){ ctx.fillStyle=get('--accent'); ctx.font="14px system-ui"; ctx.fillText(`🛡️ ${p.shield}/${p.shieldMax}`, 16, 66); }
  const b=currentBiome(); ctx.textAlign='right'; ctx.fillStyle=get('--ui'); ctx.fillText(`bioma: ${b.name}`, Game.w-16, 24); ctx.textAlign='left';
}
function drawPickup(it){ const ctx=Game.ctx;
  if(it.type==='coin'){ ctx.fillStyle=get('--coin'); roundRect(ctx,it.x,it.y,it.w,it.h,3); ctx.fill(); ctx.fillStyle="#7a5b00"; ctx.fillRect(it.x+it.w*0.45, it.y+2, 2, it.h-4); }
  else if(it.type==='heart'){ drawHeart(it.x,it.y,14,2); }
}
function drawHeart(x,y,size,fillUnits){ const ctx=Game.ctx; ctx.save(); ctx.translate(x,y); ctx.scale(size/16,size/16);
  ctx.fillStyle=get('--heart'); ctx.strokeStyle="#33091d"; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(8,14); ctx.bezierCurveTo(12,10,16,8,14,4); ctx.bezierCurveTo(12,1,8,2,8,5); ctx.bezierCurveTo(8,2,4,1,2,4); ctx.bezierCurveTo(0,8,4,10,8,14); ctx.closePath();
  ctx.save(); ctx.clip(); const w=(fillUnits/2)*16; ctx.fillRect(0,0,w,16); ctx.restore(); ctx.stroke(); ctx.restore(); }
function drawCenterText(text){ const ctx=Game.ctx, lines=String(text).split('\n'); ctx.fillStyle="rgba(0,0,0,0.5)"; ctx.fillRect(0,0,Game.w,Game.h);
  ctx.fillStyle=get('--ui'); ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.font="28px system-ui"; lines.forEach((ln,i)=> ctx.fillText(ln, Game.w/2, Game.h/2 + i*34)); ctx.textAlign="left"; ctx.textBaseline="alphabetic"; }
function drawBoss(ctx){
  const b=Game.boss; if(!b) return; b.type.draw(b,ctx);
  const bw=420,bh=12,bx=Game.w/2-bw/2,by=18; ctx.fillStyle="rgba(0,0,0,0.35)"; roundRect(ctx,bx,by,bw,bh,6); ctx.fill();
  ctx.fillStyle=b.type.color; roundRect(ctx,bx,by,bw*(b.hp/b.hpMax),bh,6); ctx.fill();
  ctx.fillStyle=get('--ui'); ctx.font="12px system-ui"; ctx.textAlign="center"; ctx.fillText(b.type.name, Game.w/2, by-2); ctx.textAlign="left";
}
function drawStalactite(ctx, b) {
  ctx.save();
  // centro do objeto
  const cx = b.x + b.w/2;
  const cy = b.y + b.h/2;

  // trail translúcido (intensidade cai com o t)
  const t = Math.min(1, b.fallT || 0);
  const trailLen = 16 * (1 - t);
  ctx.globalAlpha = 0.35 * (1 - t);
  ctx.fillStyle = 'rgba(164,232,255,0.75)';
  roundRect(ctx, cx - b.w*0.25, b.y - trailLen, b.w*0.5, trailLen, 3);
  ctx.globalAlpha = 1;

  // corpo da estalactite (triângulo com gradiente)
  ctx.translate(cx, cy);
  ctx.rotate(b.rot || 0);

  const g = ctx.createLinearGradient(0, -b.h/2, 0, b.h/2);
  g.addColorStop(0, '#eef9ff');
  g.addColorStop(1, b.color || '#cfd6de');
  ctx.fillStyle = g;

  ctx.beginPath();
  ctx.moveTo(0, -b.h/2);          // ponta
  ctx.lineTo(b.w/2,  b.h/2);      // base direita
  ctx.lineTo(-b.w/2, b.h/2);      // base esquerda
  ctx.closePath();
  ctx.fill();

  // brilho na ponta
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-1.5, -b.h/2 - 2, 3, 6);
  ctx.globalAlpha = 1;

  ctx.restore();
}

/* ---------- Partículas / helpers ---------- */
function spawnBurst(x,y,n,color){ for(let i=0;i<n;i++){ const a=Math.random()*Math.PI*2, sp=60+Math.random()*140; Game.particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:0.4+Math.random()*0.3,size:2+Math.random()*2,color,drag:0.92,g:40}); } }
function setupTouch(){ /* opcional */ }
function findNearestEnemyExcept(except,x,y,range){ let best=null,bd=range*range; const cand=[...Game.enemies]; if(Game.boss && except!==Game.boss) cand.push(Game.boss); for(const e of cand){ if(e===except) continue; const cx=e.x+e.w/2,cy=e.y+e.h/2, d=(cx-x)*(cx-x)+(cy-y)*(cy-y); if(d<bd){bd=d; best=e;} } return best; }

/* ---------- Start / Reset ---------- */
function startGame(){
  Game.hardMode = document.getElementById('diffHard').checked;
  Game.muted = document.getElementById('muteToggle').checked;
  if(!Game.muted){ try{ Sfx.init(); Sfx.enabled=true; }catch(e){ Sfx.enabled=false; } } else { Sfx.enabled=false; }

  Object.assign(Game.player,{x:400,y:300,vx:0,vy:0,hp:6,hpMax:6,inv:0,hurtFlash:0,score:0,dmg:1,fireRate:0.18,tearSize:8,rangeLife:0.9,multishot:1,pierce:0,perks:[],
    spreadAngle:0, triShot:false, wallBounce:0, chain:0, shotSpeedMul:1, shield:0, shieldMax:0, shieldRegenTime:12, shieldRegenTimer:0, vampChance:0, vampOnKill:0 });
  Game.level=1; Game.enemies.length=0; Game.tears.length=0; Game.pickups.length=0; Game.particles.length=0; Game.boss=null; Game.bossBullets.length=0;
  Game.time=0; Game.over=false; Game.paused=false; Game.choosingPerk=false;
   
  applySavedSkin(); 
  
  Game.biomeIndex=0; applyBiome();
  buildRoom(Game.level);

  // Sincroniza mute do menu com BGM
  Bgm.setMuted(Game.muted);

  // Escolhe trilha conforme tipo de sala
  // if (Game.room.isBoss) Bgm.play('boss');
  // else Bgm.play('stage');
    
  Game.state='play';
  hideStart();
}
function resetIfOver(){ if(!Game.over) return; Game.state='menu'; showStart(); }

/* ---------- Inicialização ---------- */
(function init(){
  const c=document.getElementById('game'); 

  // centraliza a mira no começo
  Game.mouse.x = Game.w/2;
  Game.mouse.y = Game.h/2;
  // liga os eventos
  setupMouse(c);

  const ctx=c.getContext('2d'); 
  
  Game.ctx=ctx;
  
  const dpr=Math.max(1, Math.min(2, window.devicePixelRatio||1)); c.width=Game.w*dpr; c.height=Game.h*dpr; ctx.setTransform(dpr,0,0,dpr,0,0);

  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();

    const gameKeys = ['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d','i','j','k','l','h','p','r'];
    if (gameKeys.includes(k)) e.preventDefault();

    Game.keys[k] = true;

    // iniciar pelo teclado na tela de menu
    if (Game.state === 'menu' && (k === 'enter' || k === ' ')) {
      e.stopPropagation();
      startGame();
      return;
    }

    // ⏸ pausa
    if (k === 'p') {
      e.stopPropagation();              // <<< evita o segundo toggle no init()
      Game.paused = !Game.paused;
      return;
    }

    // 🔁 reiniciar (sempre)
    if (k === 'r') {
      e.stopPropagation();              // <<< idem
      startGame();
      return;
    }

    // escolha de perk
    if (Game.choosingPerk && ['1','2','3'].includes(k)) {
      e.stopPropagation();
      choosePerk(parseInt(k) - 1);
      return;
    }

    // 📜 ajuda
    if (k === 'h') {
      e.stopPropagation();
      const hov = document.getElementById('helpOverlay');
      if (hov && hov.classList.contains('show')) hideHelp();
      else showHelp();
      return;
    }

    // fechar ajuda com Esc
    if (k === 'escape') {
      e.stopPropagation();
      const hov = document.getElementById('helpOverlay');
      if (hov && hov.classList.contains('show')) hideHelp();
    }
  }, { capture: true });
  
  addEventListener('keyup', (e)=>{
    Game.keys[e.key.toLowerCase()] = false;
  }, {capture:true});

  setupPerkOverlay();         // agora seguro
  setupStartUI();             // 🔧 garantido
  setupShopUI();

  applySavedSkin();

  function fit(){ const mar=20, W=Math.max(320,innerWidth-mar), H=Math.max(240,innerHeight-mar-80), s=Math.min(W/Game.w,H/Game.h); c.style.width=(Game.w*s)+'px'; c.style.height=(Game.h*s)+'px'; }
  addEventListener('resize',fit); fit();

  last=performance.now(); requestAnimationFrame(loop);
})();

/* ---------- UI Start helpers ---------- */
function setupStartUI(){
  const btn=document.getElementById('btnStart'); if(btn) btn.addEventListener('click',startGame);
  const ov=document.getElementById('startOverlay');
  if(ov){

    // 🔊 1ª interação: desbloqueia áudio e toca música de menu
    ov.addEventListener('pointerdown', () => {
      Bgm.unlock();
      Bgm.setMuted( document.getElementById('muteToggle')?.checked || false );
      Bgm.play('menu');
    }, { once:true });

    ov.addEventListener('click',(e)=>{
      const card=e.target.closest('.start-card');
      if(!card){ startGame(); }
    });
  }

  const mute = document.getElementById('muteToggle');
  if (mute) {
    mute.addEventListener('change', ()=>{
      Game.muted = mute.checked;
      Bgm.setMuted(Game.muted);
    });
  }
}
function showStart(){
  const ov = document.getElementById('startOverlay'); if(!ov) return;
  ov.classList.add('show');
  ov.inert = false;                          // pode interagir
  ov.setAttribute('aria-hidden','false');

  if (Bgm.ready) Bgm.play('menu');
}

function hideStart(){
  const ov = document.getElementById('startOverlay'); if(!ov) return;
  // remova foco de qualquer filho (ex.: botão)
  const focused = ov.querySelector(':focus'); if (focused) focused.blur();

  ov.classList.remove('show');
  ov.inert = true;                           // torna não-interativo e tira do foco (evita o warning)
  ov.setAttribute('aria-hidden','true');

  // garanta que o canvas receba as teclas
  const c = document.getElementById('game');
  if (c) c.focus();
}

function setupShopUI(){
  const grid = document.getElementById('shopGrid');
  const ov   = document.getElementById('shopOverlay');
  const btnUse = document.getElementById('btnUseSkin');
  const btnSkins = document.getElementById('btnSkins');
  const btnClose = document.getElementById('btnCloseShop');

  if (!grid || !ov || !btnSkins) return; // não existe no DOM? ignora

  let selected = getSavedSkinId();

  const render = ()=>{
    grid.innerHTML = '';
    for (const s of SKINS){
      const item = document.createElement('button');
      item.className = 'skin-item' + (s.id===selected ? ' selected':'');
      item.setAttribute('data-id', s.id);

      const sw = document.createElement('div');
      sw.className = 'skin-swatch'; sw.style.background = s.color;

      const nm = document.createElement('div');
      nm.className = 'skin-name'; nm.textContent = s.name;

      item.appendChild(sw); item.appendChild(nm);
      item.addEventListener('click', ()=>{
        selected = s.id;
        document.querySelectorAll('.skin-item').forEach(el=>el.classList.remove('selected'));
        item.classList.add('selected');
      });

      grid.appendChild(item);
    }
  };

  const open = ()=>{ selected = getSavedSkinId(); render(); ov.classList.remove('hidden'); ov.setAttribute('aria-hidden','false'); };
  const close= ()=>{ ov.classList.add('hidden'); ov.setAttribute('aria-hidden','true'); };

  btnSkins.addEventListener('click', open);
  btnClose?.addEventListener('click', close);
  ov.addEventListener('click', (e)=>{ if (e.target===ov) close(); });
  addEventListener('keydown', (e)=>{ if (ov.classList.contains('hidden')) return; if (e.key==='Escape') close(); });

  btnUse?.addEventListener('click', ()=>{
    localStorage.setItem('skinId', selected);
    applySkinById(selected); // já atualiza o preview do player no menu, se você desenha
    close();
  });
}

