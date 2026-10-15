# Rpgzim — Crônicas de Pedraluz

RPG 2D top-down de fantasia medieval, **mobile-first**, para navegador. Mecânicas inspiradas em Tibia
(alvo + ataque automático, skills que evoluem pelo uso, Magic Level, vocações, loot) e apresentação
inspirada nos RPGs de GBA — com **pixel art 100% própria, gerada por código** (nenhum asset de terceiros).

**Jogar:** https://mqzgames.github.io/Rpgzim/

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
- **Toque:** joystick invisível na metade esquerda (aparece só ao pressionar e arrastar); toque no chão para
  andar (também na área do joystick); toque no monstro (ou botão *Atacar*) para selecionar alvo; magias em
  arco ao redor do botão; poções; botão de ação contextual. Na mochila, toque duplo equipa/usa.
- **Teclado/mouse:** WASD/setas (8 direções), clique para andar/selecionar, Tab/Espaço alvo, 1–4 magias,
  5/Q vida, 6/R mana, E interagir, I mochila, C personagem, K grimório, Esc menu.

## O que existe
- Mundo contínuo (104×118 tiles): Templo da Aurora → Vila de Pedraluz → Bosque Selvagem → Pântano Sombrio,
  Colinas dos Lobos e Ruínas Antigas, com autotile, água animada, iluminação aditiva e **casas exploráveis no
  mesmo mapa** (telhado some ao entrar; o interior aparece em frente a portas e janelas).
- 4 vocações (Sorcerer, Druid, Paladin, Knight), **13 magias**, 84 itens com equipamentos até o nível 18,
  8 monstros com IA (idle/wandering/chasing/attacking/returning/dead) e um chefe raro, loot, ouro, 3 lojas,
  **Banco de Pedraluz** (depósito de 40 espaços e ouro guardado, seguros na morte), NPC tutorial.
- XP e níveis, skills (Sword/Axe/Club/Distance/Shielding) e Magic Level com curvas exponenciais.
  Shielding no estilo Tibia (até 2 atacantes por janela, só treina lutando) e **armas de treino** (ataque 1,
  dano fixo 1–2) para treinar a skill desejada sem matar o monstro rápido.
- Lojas: na venda, o que você tem aparece primeiro; botão **Vender tudo** (só a mochila, nunca o equipado).
- Inventário, 9 slots de equipamento, ataque/defesa visíveis em cada item (verde ▲ quando é melhor que o
  equipado), comparação de atributos, poções (o atalho escolhe a poção certa para a vida/mana que falta), munição.
- Save local versionado (IndexedDB → localStorage → memória) com validação e migração.
- Áudio procedural (WebAudio): efeitos e música por região, respeitando autoplay/mute.

## Boladex — personagem com vida própria
**Boladex** é um Knight que existe desde o primeiro acesso e aparece na tela inicial como personagem jogável.
Quando você joga com outro personagem, ele vive sozinho no mesmo mundo, **com as mesmas regras do jogador**:
skills que sobem pelo uso, XP e níveis, dano recebido, morte (com as mesmas penalidades) e renascimento no templo,
lojas (vende o loot, compra poções e equipamentos melhores e os equipa), banco (guarda o excedente e saca para um
upgrade), treino com Espada de Treino nos slimes e ajuda ao jogador quando um monstro o ataca por perto.
- **Temperamento** (`src/data/heroes.ts`): coragem (onde caça e quando recua), ganância (quanto loot/ouro junta),
  disciplina (treino), sociabilidade (passeios e conversa) e prudência (poções). O humor muda com vitórias, níveis e mortes.
- **Fala**: balões acima da cabeça e mensagens no registro quando está perto; toque nele para saber o que está fazendo.
- **Como funciona**: a IA (`src/game/ai/heroBrain.ts`) só usa os mesmos comandos do jogador; os sistemas de
  combate, magias, mochila, lojas e banco rodam no contexto do herói (`asActor`), e os monstros escolhem o alvo entre
  todos os personagens. O progresso dele é salvo no próprio slot (e sincronizado com o GitHub, se conectado).
- Custo: ~2–5 s de CPU a cada 30–90 min de jogo simulado (`tests/tools/hero-life.test.ts` imprime o "diário" dele).

## Conta GitHub (sincronizar saves entre aparelhos)
Opcional, na tela inicial: **Entrar com GitHub**. Cada jogador usa a **própria conta**: os saves ficam em
`saves/<id>.json` num repositório **privado** dele (padrão `rpgzim-saves`), acessado direto do navegador pela API
do GitHub com um **token fine-grained** restrito a esse repositório (*Contents: Read and write*).
- Local primeiro: o jogo sempre grava no navegador; a nuvem recebe no máx. 1 envio por personagem por minuto
  (cada envio é um commit; pulado se nada mudou) e sempre ao sair/fechar a aba ou trocar de app. Preparar um save
  custa ~0,5 ms e o envio é assíncrono: não trava o jogo. Sem internet, continua local e reenvia depois.
- Ao listar/carregar, fica a versão mais nova (nuvem ou navegador); em conflito entre aparelhos vence a última gravação.
- O token fica só no `localStorage` do jogador e só vai para `api.github.com`; o jogo recusa repositório público.
- Por que não um repositório único do jogo com token embutido: o site é estático, então o token ficaria público
  (qualquer um poderia apagar/alterar todas as contas e o GitHub revoga tokens expostos). Um modelo central exigiria
  um pequeno servidor (ex.: função serverless) guardando o token.

## Arquitetura (resumo)
`src/domain` regras puras (dano, XP, skills, economia…) · `src/data` dados configuráveis ·
`src/game` simulação independente de engine (movimento em grade com tempo explícito, A*, combate, IA)
+ adaptadores Phaser (`scenes`, `rendering`, `camera`, `input`) · `src/integration/game-ui-bridge`
sessão + stores observáveis · `src/ui` React. ESLint impede Phaser/React nas camadas de domínio/simulação.
A simulação recebe comandos e emite eventos tipados — base para um futuro servidor autoritativo
(hoje o cliente controla o estado; saves locais não são à prova de adulteração).

## Resultados de testes (registrados nesta máquina)
- Vitest: **129 testes passando** (regras, dados, mundo, persistência, banco, sincronização GitHub, herói com vida própria, simulação integrada).
- Playwright: **7 fluxos passando** (desktop: principal/loja/casa/banco+loot/Boladex; mobile: joystick, HUD na tela,
  magia por toque, toque duplo para equipar, toque na área do joystick para andar).
- Desempenho medido (Chrome headless, Intel Iris Xe): **60 FPS** (p95 ≈ 16,9 ms) em templo, praça e combate,
  celular 390×844@3x e desktop 1440×900. Em renderização por software (SwiftShader) ~15–19 FPS.

## Balanceamento
Resumo e decisões em [`docs/BALANCE.md`](docs/BALANCE.md); tabela gerada com as fórmulas reais em
[`docs/BALANCE-REPORT.md`](docs/BALANCE-REPORT.md) (`npm run art:world` regenera).

## Limitações conhecidas / próximos passos
- Faltam monstros para os níveis 12+ (os equipamentos já vão até o 18) — ver `docs/BALANCE.md`.
- Documentação detalhada (bíblia de arte, inventário de assets) ainda resumida aqui; prévias em `docs/art/`.
- Sem multiplayer (fora do escopo do MVP). Sem itens no chão além do loot de monstros.

Assets: toda a arte é gerada por `scripts/art/` (licença do próprio projeto). Fontes: Nunito (interface) e
Pixelify Sans (logotipo), ambas SIL Open Font License, via @fontsource.
