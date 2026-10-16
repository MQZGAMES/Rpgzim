# Rpgzim — Crônicas de Pedraluz

RPG 2D top-down de fantasia medieval, **mobile-first**, para navegador. Mecânicas inspiradas em Tibia
(alvo + ataque automático, skills que evoluem pelo uso, Magic Level, vocações, loot) e apresentação
inspirada nos RPGs de GBA — com **pixel art 100% própria, gerada por código** (nenhum asset de terceiros).

**Jogar:** https://mqzgames.github.io/Rpgzim/

**Instalar como app:** no iPhone/iPad, abra no Safari → Compartilhar → *Adicionar à Tela de Início* (a tela inicial do
jogo mostra o passo a passo). No Android/Chrome/Edge aparece o botão *Instalar o app*. Instalado, abre em tela cheia
e funciona sem internet (service worker com todos os arquivos do jogo; o cache é renovado a cada publicação).

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
  andar (também na área do joystick); toque no monstro (ou botão *Atacar*) para selecionar alvo; **6 atalhos**
  em grade ao redor do botão de ataque; botão de ação contextual. Na mochila, toque duplo equipa/usa.
  Andar por conta própria pausa a perseguição do alvo (tocar/escolher o alvo de novo retoma).
- **Entrada do mapa unificada** (`src/ui/controls/MapInput.tsx`): uma camada única trata toque e mouse (andar,
  selecionar, joystick, cursor), medindo a posição do canvas a cada toque. O input do Phaser usava uma posição em
  cache que ficava velha no celular (barra de endereço, área segura, app instalado) e deslocava os toques — perto
  do topo eles caíam "fora do jogo". Tocar num telhado/árvore/água guarda um destino alcançável (não trava se
  alguém cruzar o caminho).
- **Mini mapa** (botão de mapa ou tecla M): imagem do mundo gerada dos próprios tiles (`npm run art:world`), você,
  o grupo e o destino; toque num lugar para ir até lá (caminho pelo mapa todo, contornando árvores, muros, água e,
  quando dá, monstros). *Mundo inteiro* / *Aproximar*.
- **Personagens online** (botão de pessoas ou tecla O): quem está no mundo, onde e fazendo o quê; **+ Grupo** chama
  para o grupo na hora e a pessoa vem andando até você (aparece no mini mapa).
- **Atalhos personalizáveis** (*Menu → Configurar atalhos*, botão *Atalhos* no Grimório, ou tocar num atalho
  vazio): cada posição numerada (a mesma da tela) recebe uma magia, uma **poção automática** (vida/mana, usa a
  menor que cobre o que falta) ou um item usável da mochila. Saves antigos são convertidos sozinhos.
- **Teclado/mouse:** WASD/setas (8 direções), clique para andar/selecionar, Tab/Espaço alvo, 1–6 atalhos,
  Q vida, R mana, E interagir, I mochila, C personagem, K grimório, M mini mapa, O online, P grupo, Esc menu.
- **HUD enxuto:** vida/mana compactas à esquerda; à direita, grade de 4 colunas (mochila, personagem, grimório,
  menu / mini mapa, online, modo de ataque, PK / grupo). O alvo aparece só no mapa (anel e barra vermelha), sem caixa extra.
- **Ritmo de celular:** ~3 tiles/s andando (referência: Pokémon 3,75; Tibia 1,5–2,5) e criaturas a 70% da
  velocidade anterior, um pouco mais lentas que o jogador (dá para se posicionar e fugir).

## O que existe
- Mundo contínuo (170×118 tiles): Templo da Aurora → Vila de Pedraluz → Bosque Selvagem → Pântano Sombrio,
  Colinas dos Lobos e Ruínas Antigas e, a leste, as **Terras Altas** (Floresta dos Bandidos, Cânion dos Escorpiões,
  Fortaleza Orc, Bosque Gélido, Cidadela Sombria e Covil do Dragão), com autotile, água animada, iluminação aditiva e **casas exploráveis no
  mesmo mapa** (telhado some ao entrar; o interior aparece em frente a portas e janelas).
- 4 vocações (Sorcerer, Druid, Paladin, Knight), **13 magias**, 99 itens com equipamentos até o nível 18,
  **18 criaturas em 6 patamares** (cada patamar tem o dobro de vida e ataque do anterior; ver `docs/BALANCE.md`),
  com IA que contorna obstáculos (A*) e, ao se afastar demais do ponto de nascimento (3× a distância antiga),
  volta por teleporte com a vida cheia; loot, ouro, 3 lojas,
  **Banco de Pedraluz** (depósito de 40 espaços e ouro guardado, seguros na morte), NPC tutorial.
- XP e níveis, skills (Sword/Axe/Club/Distance/Shielding) e Magic Level com curvas exponenciais.
  Shielding no estilo Tibia (até 2 atacantes por janela, só treina lutando) e **armas de treino** (ataque 1,
  dano fixo 1–2) para treinar a skill desejada sem matar o monstro rápido.
- Lojas: o mercador também compra **flechas** (o Knight do Boladex vende as que caem dos goblins). Na venda, o que
  você tem aparece primeiro; botão **Vender tudo** (só a mochila, nunca o equipado, a munição da arma equipada nem o
  **travado**: na mochila/equipamento, *Travar venda* põe um cadeado no item). Janela responsiva (lista com rolagem
  própria e barra de ações sempre visível, em retrato, paisagem e desktop).
- **Área protegida** só dentro de casas, lojas e templo; as ruas da vila são livres (mas lá os personagens se atravessam).
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

## Grupo, PK e modo de ataque
- **Modo de ataque** e **PK**: botões quadrados ao lado do menu (mesmo visual), com o estado escrito embaixo.
  *Seguir* persegue o alvo; *Parado* ataca só o que estiver ao alcance (salvo no personagem).
- **Toque num personagem** (ex.: Boladex; o toque vale no corpo e no nome dele): menu discreto com nome, vida e
  ícones — convidar (ele responde na hora), controles do grupo e atacar (só quando permitido); tocar no chão
  fecha o menu e anda. **Toque duplo** no personagem ataca direto (com PK ligado
  ou treino liberado no grupo).
- **Grupo**: quando o convite é aceito, abre o **painel do grupo** (botão *grupo* no HUD, com o nº de membros, ou tecla P): passar a liderança (coroa), remover membro, **formação** (livre / todos seguem o líder / fila
  pisando nos passos do líder), **alvo** (o mesmo do líder / cada um o mais próximo), **treino entre membros**
  (podem se atacar sem caveira e sem perder ouro), sair e desfazer o grupo. Só o líder muda as regras. Com o
  Boladex de líder, você (sem alvo) anda junto dele. A **XP é dividida igualmente** entre os membros vivos a até 20 tiles.
- **PK** (caveira): ligado, personagens podem se atacar fora das áreas protegidas (membros do grupo só no treino).
  Quem ataca alguém sem caveira fica com caveira (5 min; 15 min se matar). Quem morre no PK deixa parte do ouro
  e às vezes um item da mochila no chão.
- **Boladex no PK**: revida quando atacado (ou foge se estiver perdendo), busca vingança de quem o matou e, por
  oportunidade, pesa ouro carregado, força relativa, vida do alvo, caveira, relação e temperamento. Sem nada a
  ganhar e sem motivo, não ataca (e às vezes comenta isso).
- **Vila rápida**: cada visita tem limite (75 s no total, 30 s por parada) e, depois dela, só volta antes de
  3 min com a mochila cheia; sem poção e ferido pede a bênção do sacerdote (grátis) em vez de esperar a vida voltar;
  sem poções escolhe uma caça mais tranquila; compra estoques maiores e só guarda no banco o excedente.
- **Atitudes raras**: às vezes diz que quer PK (com o PK desligado). Ataque ou PK só por decisão própria **fora do
  grupo**: em grupo nunca ataca nem desafia ninguém (no treino liberado, só revida se você atacar).
- **Caça mais, perde menos tempo**: só volta à vila quando a viagem compensa (mochila cheia, loot que vale, poções acabando com ouro para um bom estoque, upgrade ao alcance), visita só as lojas onde tem o que fazer (na ordem mais curta), troca de ponto quando os monstros acabam e, preso, dá um passo para o lado e replaneja. Na vila os personagens se atravessam (ninguém trava porta). Em simulação de 40 min: ~83% do tempo caçando.
- **Mais esperto**: aprende quais caças rendem mais XP por minuto, evita onde morreu há pouco, explora áreas novas,
  escolhe atividades com um pouco de acaso (improvisa), comenta o que vê, convida você para o grupo, aceita ou recusa
  convites conforme a relação, acompanha você quando você é o líder e te dá poção quando você está mal.
- Nomes e barras de vida ficam sempre visíveis (na mesma fonte da interface, nítida em qualquer zoom).

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
- Vitest: **160 testes passando** (regras, dados, mundo, persistência, banco, sincronização GitHub, herói com vida própria, grupo/PK/modo de ataque, trava de venda, escada de criaturas, vocações, controles do grupo, atalhos, ritmo, clique x perseguição, destino alcançável, viagem pelo mini mapa, chamar para o grupo, simulação integrada).
- Playwright: **9 fluxos passando** (desktop: principal/loja/casa/banco+loot/Boladex/HUD social; mobile: joystick, HUD na tela,
  magia por toque, toque duplo para equipar, toque na área do joystick para andar). O teste do HUD social cobre o
  painel do grupo (formação e treino); um teste mobile toca no mapa em cima e embaixo, no Boladex pela posição real
  na tela, viaja pelo mini mapa e chama o Boladex pela lista de online.
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
