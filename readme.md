# Rogue-Isaac (HTML/Canvas)

Joguinho top‑down feito com **HTML + CSS + JavaScript (Canvas 2D)**, sem dependências. Foco em aprendizado prático.

> Abra `index.html` no navegador e jogue. Tudo roda localmente.

---

## 🎮 Como jogar
- **Mover:** `W A S D` ou **setas`
- **Atirar (direcional):** `I J K L`
- **Mira com mouse:** mova o cursor • **Disparo:** botão **esquerdo**
- **Pausar:** `P`  •  **Reiniciar:** `R`
- **Ajuda / Perks:** `H` (pergaminho)
- **Menu:** `Enter` ou `Espaço` na tela inicial

> Alguns navegadores só liberam áudio após a **primeira interação** (clique/tecla).

---

## ✨ Principais recursos
- **Loop clássico:** `init()`, `update(dt)`, `draw()`, `requestAnimationFrame`.
- **Canvas 2D:** formas, sombras, partículas, HUD, barras custom.
- **Colisão AABB** e separação física (inimigos/chefes não invadem o player).
- **Mira combinada:** `IJKL` **e** mouse.
- **Música por bioma** com **fade** e modo **solo** (nunca sobrepõe).
- **Loja de skins** com **moedas persistentes** (`localStorage`).
- **Skins com FX:** rastro **Neon** e partículas **Shiny** (configuráveis por skin).
- **Biomas especiais:** Cripta escura com vinheta; Gélido com escudo e congelamento por contato.
- **IA de navegação:** flow‑field em grid com **diagonais seguras**, **string‑pulling** (waypoint mais distante visível) e **desvio de paredes** (steering).
- **Escalonamento de dificuldade:** +30% HP de inimigos por fase; chefes com +120% HP a cada encontro.

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
> Nomes das faixas podem variar — veja `BIOME_MUSIC` em `game.js`.

---

## 🔊 Música (BGM)
- `Bgm.unlock()` após a primeira interação para liberar áudio.
- `Bgm.play(name)` faz **fade-out** da faixa atual e **fade-in** da nova; `_stopAllExcept(next)` garante **solo**.
- Mapeamento por bioma (`BIOME_MUSIC`): `{ crypt, frost, swamp, tech, forest } → { stage, boss }`.

---

## 🛍 Loja de Skins & Moedas
- **Carteira:** `coins` em `localStorage` (mostrada no menu e no HUD).
- **Coleta:** `collect('coin')` soma **imediatamente** (à prova de F5/morte).
- **Loja:** botão **Skins** no menu abre modal com cards; skins podem **custar** moedas.
- **Persistência:** skins compradas e **skin ativa** (`skinId`) ficam salvas.

### Skins com efeitos (FX)
- **Neon (Rastro):** brilho (`glow`) + rastro gradiente suave sob o player.
- **Shiny (Partículas):** pontos luminosos cintilando ao redor (render aditivo).
> Outros visuais continuam sólidos; os FX só rodam se a skin definida tiver `fx`.

---

## ❄️ Bioma Gélido (Frost)
- **Inimigos com escudo:** ganham `shield/shieldMax` **azul**. Dano consome escudo **antes** da vida.
- **Duas barras:** **azul** (escudo, em cima) + **vermelha** (vida, embaixo) nos inimigos.
- **Contato congela:** encostar em inimigo aplica `frozenTime ≈ 0.5s` no player.

---

## ☠️ Cripta escura (Crypt)
- **Vinheta** focada no player (círculo de luz reduzido, bordas escuras).
- A vinheta fica **ativa**:
  - em **salas normais**: até `room.cleared` (quando a **porta** aparece);
  - em **sala de chefe**: enquanto o **boss tiver HP**.
- **Barra do boss overlay:** `drawBossHPOverlay` desenha **por cima** da vinheta (a barra interna do `drawBoss` foi desativada).

---

## 🧠 IA de Inimigos
- **Flow‑field** em grid (células ~24px), com **diagonais seguras** (sem cortar quina).
- **String‑pulling** leve: mira no **waypoint mais distante ainda visível**.
- **LOS direta:** se o inimigo enxerga o player, persegue em linha reta.
- **Steering anti‑parede:** desvio suave quando próximo a paredes/quinas.
- **Fallbacks**: seed do BFS procura célula caminhável mais próxima do player; sample sempre retorna algo válido para não “parar”.

### Parâmetros úteis (em `Nav`)
- `cell`: tamanho do grid (padrão 24). Menor = mais preciso; maior = mais leve.
- `margin`: “raio” de segurança contra paredes (padrão 12–14).
- `recalcEvery`: recálculo do campo (padrão ~0.15–0.22s).

---

## 📈 Escalonamento por fase/chefe
- **Inimigos:** `Game.difficulty.hpMul = 1.30^(level-1) × biome.mul.hp` ⇒ **+30% por fase** (multiplicativo).
- **Chefes:** `hpBase × (2.20)^(bossIndex-1)` ⇒ **+120% por chefe** (multiplicativo). Boss index ≈ `floor((level-1)/5)+1`.

> A velocidade pode ser ajustada via `Game.difficulty.spdMul` (opcional).

---

## 🧪 QA Checklist
- [ ] Loja abre só no **menu**; compra/uso de skins atualiza e **persiste**.
- [ ] Coleta de moedas persiste imediatamente (valor visível no HUD e após F5).
- [ ] Skins **Neon** e **Shiny** aplicam FX apenas quando selecionadas.
- [ ] **Gélido:** inimigos têm **escudo azul** cheio no spawn; congelam no contato.
- [ ] **Cripta:** vinheta ativa até **porta** surgir (ou boss morrer). Barra do boss **sempre visível** (overlay único).
- [ ] IA: inimigos contornam paredes, não empacam em quinas, perseguem suavemente.
- [ ] Escalonamento: inimigos mais **tanque** a cada fase; chefes bem mais robustos por encontro.

---

## 🗺️ (Opcional) Tilemap
O gameplay atual é independente de tiles. Há demos e um gerador de **template 32×32** por bioma (6×6 ou 8×8). Dá para plugar a camada de tiles depois sem quebrar nada.

---

## 🚀 Rodando localmente
```bash
# Python
python -m http.server 5500
# Node
npx serve .
# Depois acesse
http://localhost:5500
```

---

## 📘 CHANGELOG (últimas atualizações)
- **Loja de skins** com moedas persistentes; botão no menu, modal com cards e preços.
- **Carteira** visível no menu e **contador de moedas no HUD**.
- **Coleta de moedas** persistida imediatamente (à prova de F5/morte).
- **Skins FX:**
  - **Neon (Rastro):** brilho + rastro gradiente.
  - **Shiny (Partículas):** brilho + partículas cintilantes ao redor.
- **Cripta escura:** vinheta condicional (sala normal até porta; boss até morrer) + **barra de boss overlay** por cima da vinheta.
- **Gélido:** inimigos com **escudo azul** e **congelamento por contato**.
- **IA aprimorada:** flow‑field com **8 direções**, **string‑pulling** e **desvio de paredes**; fallbacks para evitar “parar”.
- **Escalonamento:** inimigos +30% HP/fase; chefes +120% HP por encontro.

---

## 🤝 Contribuindo
PRs e issues são bem‑vindos! Sugestões de bosses, perks, balance e UX também.

## 📜 Licença
**MIT** — use, credite e compartilhe melhorias.

