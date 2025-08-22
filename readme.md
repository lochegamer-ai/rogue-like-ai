# Rogue-Isaac (HTML/Canvas)

Joguinho top‑down feito com **HTML + CSS + JavaScript (Canvas 2D)**, sem dependências.
Foco em aprendizado prático: loop de jogo simples, colisão AABB, chefes com padrões e trilha sonora por bioma.

> Abra `index.html` no navegador e jogue. Tudo roda localmente.

---

## 🎮 Como jogar

- **Mover:** `W A S D` ou **setas**  
- **Atirar (direcional):** `I J K L`  
- **Mira com mouse:** mova o cursor • **Disparo:** botão **esquerdo**  
- **Pausar:** `P`  
- **Reiniciar:** `R`  
- **Ajuda / Perks:** `H` (pergaminho)  
- **Menu:** `Enter` ou `Espaço` na tela inicial  

> Alguns navegadores só liberam áudio após a **primeira interação** (clique/tecla).

---

## ✨ Recursos

- **Loop clássico:** `init()`, `update(dt)`, `draw()`, `requestAnimationFrame`.
- **Canvas 2D:** retângulos arredondados, sombras, partículas e HUD.
- **Colisão AABB** (player×paredes, projéteis×paredes, projéteis×inimigos, etc.).
- **Mira combinada:** mantém `IJKL` **e** adiciona **mouse + botão esquerdo**.
- **Separação física:** inimigos e chefes **não invadem** o player (anti-overlap + anti‑encosto).
- **Chefes (bosses):**
  - **Gárgula (bioma gelo):** AOE que **congela** por 0.5s + **estalactites** telegrafadas (sombra 0.5s) com queda suavizada.
  - Outros padrões (dashes, leques de projéteis, invocações, etc.).
- **Música por bioma** com **fade** e modo **solo** (nunca tocam 2 faixas juntas).
- **Hot reload amigável:** tudo em arquivos simples, fácil de testar num server estático.

---

## 📂 Estrutura

```
/assets
  /audio
    /bgm
      menu.mp3
      stage_crypt.mp3   boss_crypt.mp3
      stage_frost.mp3   boss_frost.mp3
      stage_swamp.mp3   boss_swamp.mp3
      stage_tech.mp3    boss_tech.mp3
      stage_forest.mp3  boss_forest.mp3
index.html
game.js
styles.css            (opcional; pode estar inline no index.html)
```

> Os nomes das faixas podem variar — veja o mapeamento em `BIOME_MUSIC` no `game.js`.

---

## 🔊 Música (BGM)

- Use `Bgm.unlock()` na **primeira interação** (ex.: clique no overlay inicial) para liberar áudio.  
- `Bgm.play(name)` faz **fade‑out** da faixa atual (pausando no fim) e **fade‑in** da nova.  
- `_stopAllExcept(next)` garante **solo** (evita 2 músicas simultâneas).  
- `Bgm.setMuted(bool)` integra com o toggle de mute do menu.  
- Mapeamento por bioma (exemplo):

```js
const BIOME_MUSIC = {
  crypt:  { stage: 'stage_crypt',  boss: 'boss_crypt'  },
  frost:  { stage: 'stage_frost',  boss: 'boss_frost'  },
  swamp:  { stage: 'stage_swamp',  boss: 'boss_swamp'  },
  tech:   { stage: 'stage_tech',   boss: 'boss_tech'   },
  forest: { stage: 'stage_forest', boss: 'boss_forest' }
};
```

Se aparecer `ERR_FILE_NOT_FOUND`, confira caminho/nomes em `assets/audio/bgm/`.

---

## 🧠 Arquitetura (resumo)

- **Estado global:** `Game.state`, `Game.room` (bounds/portas/parede), `Game.player`, `Game.enemies`, `Game.boss`, `Game.tears`, `Game.bossBullets`, etc.
- **Pausa real:** `update(dt)` retorna cedo quando `Game.paused`; `draw()` continua (overlay “⏸”).
- **Input:**
  - **Movimento:** `getMoveVec()` (teclado).
  - **Tiro:** `getFireVec()` combina **IJKL** e **mouse (botão esquerdo)**.
  - `Game.mouse = {x,y,down,inside}` + `setupMouse(canvas)` converte coordenadas por `getBoundingClientRect`.
- **Anti-overlap:**  
  - **Antes de mover** inimigos/boss: anti‑encosto (reduz aproximação se já estiver colado).  
  - **Depois de mover:** `separateEnemyFromPlayer(e,p)` para **desgrudar** (mesmo com `p.inv > 0`).
- **Boss Gélido (exemplo):**
  - AOE com congelamento (0.5s).  
  - Estalactites com **telegraph** (sombra 0.5s), **easing**, **trail** e partículas de impacto.

---

## 🕹 Controles & Acessibilidade

- **Mover:** `WASD`/setas • **Tiro:** `IJKL` ou mouse + botão esquerdo  
- **Pausa:** `P` • **Reiniciar:** `R` • **Perks:** `H`
- **Acessibilidade:** alto contraste no HUD, mira por teclado/mouse, BGM com “duck” opcional ao pausar.

---

## 🚀 Rodando localmente

Abrir direto funciona, mas um servidor local evita bloqueios de mídia/CORS:

```bash
# Python
python -m http.server 5500

# Node
npx serve .

# Depois acesse
http://localhost:5500
```

---

## 🧪 QA Checklist

- [ ] Pausa (`P`) congela a simulação e exibe overlay.  
- [ ] Reinício (`R`) reseta estado corretamente.  
- [ ] `H` abre/fecha o pergaminho de perks.  
- [ ] IJKL e mouse (botão esquerdo) funcionam em paralelo.  
- [ ] Inimigos e boss **não** invadem o player (há separação).  
- [ ] Gárgula: AOE congela por 0.5s; estalactites telegrafam 0.5s antes.  
- [ ] Trilha por bioma troca com fade e nunca sobrepõe.

---

## 🗺️ (Opcional) Tilemap

O jogo atual não depende de tileset. Há demos e um **gerador de template 32×32** para montar PNGs por bioma (6×6 ou 8×8). Quando quiser, dá para plugar a camada de tiles sem quebrar o gameplay.

---

## 🤝 Contribuindo

PRs e issues são bem-vindos! Sugestões de bosses, perks, balance e UI/UX também.

---

## 📜 Licença

**MIT** — faça bom uso, dê os créditos e compartilhe melhorias.

