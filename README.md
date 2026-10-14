# Rpgzim — Crônicas de Pedraluz

RPG 2D top-down de fantasia medieval, **mobile-first**, para navegador. Mecânicas inspiradas em Tibia
(alvo + ataque automático, skills que evoluem pelo uso, Magic Level, vocações, loot) e apresentação
inspirada nos RPGs de GBA — com **pixel art 100% própria, gerada por código** (nenhum asset de terceiros).

Stack: Phaser 3.90 · React 19 · TypeScript 5.9 (strict) · Vite 7 · Tailwind 4 · Vitest 4 · Playwright.

## Rodar
```bash
npm install
npm run dev          # http://localhost:5190
npm run build        # build de produção em dist/
npm run preview      # serve o build (porta 4190)
npm run art          # regenera toda a pixel art (determinístico)
npm test             # unitários + integração (Vitest)
npm run test:e2e     # fluxos no navegador (Playwright, usa o Chrome instalado)
```

## Controles
- **Toque:** joystick dinâmico na metade esquerda; toque no chão para andar; toque no monstro (ou botão
  *Atacar*) para selecionar alvo; magias em arco ao redor do botão; poções; botão de ação contextual.
- **Teclado/mouse:** WASD/setas (8 direções), clique para andar/selecionar, Tab/Espaço alvo, 1–4 magias,
  5/Q vida, 6/R mana, E interagir, I mochila, C personagem, K grimório, Esc menu.

## O que existe
- Mundo contínuo (104×76 tiles): Templo da Aurora → Vila de Pedraluz → Bosque Selvagem, com autotile,
  água animada, iluminação aditiva e **casas exploráveis no mesmo mapa** (telhado some ao entrar).
- 4 vocações (Sorcerer, Druid, Paladin, Knight), **13 magias**, 40 itens, 3 monstros com IA
  (idle/wandering/chasing/attacking/returning/dead), loot, ouro, 3 lojas, NPC tutorial.
- XP e níveis, skills (Sword/Axe/Club/Distance/Shielding) e Magic Level com curvas exponenciais.
- Inventário, 9 slots de equipamento, comparação de atributos, poções, munição.
- Save local versionado (IndexedDB → localStorage → memória) com validação e migração.
- Áudio procedural (WebAudio): efeitos e música por região, respeitando autoplay/mute.

## Arquitetura (resumo)
`src/domain` regras puras (dano, XP, skills, economia…) · `src/data` dados configuráveis ·
`src/game` simulação independente de engine (movimento em grade com tempo explícito, A*, combate, IA)
+ adaptadores Phaser (`scenes`, `rendering`, `camera`, `input`) · `src/integration/game-ui-bridge`
sessão + stores observáveis · `src/ui` React. ESLint impede Phaser/React nas camadas de domínio/simulação.
A simulação recebe comandos e emite eventos tipados — base para um futuro servidor autoritativo
(hoje o cliente controla o estado; saves locais não são à prova de adulteração).

## Resultados de testes (registrados nesta máquina)
- Vitest: **87 testes passando** (regras, dados, mundo, persistência, simulação integrada).
- Playwright: **4 fluxos passando** (desktop: principal/loja/casa; mobile: joystick, HUD na tela, magia por toque).
- Desempenho medido (Chrome headless, Intel Iris Xe): **60 FPS** (p95 ≈ 16,9 ms) em templo, praça e combate,
  celular 390×844@3x e desktop 1440×900. Em renderização por software (SwiftShader) ~15–19 FPS.

## Limitações conhecidas / próximos passos
- Documentação detalhada (bíblia de arte, balanceamento, inventário de assets) ainda resumida aqui;
  prévias da arte em `docs/art/`.
- Sem multiplayer (fora do escopo do MVP). Sem itens no chão além do loot de monstros.
- Ajustes finos de balanceamento e mais conteúdo (monstros/áreas) são as próximas prioridades.

Assets: toda a arte é gerada por `scripts/art/` (licença do próprio projeto). Fonte de interface:
Pixelify Sans (SIL Open Font License, via @fontsource).
