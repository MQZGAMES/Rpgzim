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
  andar (também na área do joystick); toque no monstro (ou botão *Atacar*) para selecionar alvo; **8 atalhos** num quadrado 3×3 com o botão de ataque no canto
  em grade ao redor do botão de ataque; botão de ação contextual. Na mochila, toque duplo equipa/usa.
  Andar por conta própria pausa a perseguição do alvo (tocar/escolher o alvo de novo retoma).
- **Entrada do mapa unificada** (`src/ui/controls/MapInput.tsx`): uma camada única trata toque e mouse (andar,
  selecionar, joystick, cursor), medindo a posição do canvas a cada toque. O input do Phaser usava uma posição em
  cache que ficava velha no celular (barra de endereço, área segura, app instalado) e deslocava os toques — perto
  do topo eles caíam "fora do jogo". Tocar num telhado/árvore/água guarda um destino alcançável (não trava se
  alguém cruzar o caminho).
- **Botões respondem ao toque na hora** (`src/ui/common/useTap.ts`): agem no `pointerup` em vez de esperar o `click`,
  que o navegador descarta quando dois toques acontecem em menos de ~300 ms (tocar no mapa e logo num botão do menu
  não fazia nada); o click "fantasma" que viria depois é cancelado, e o fundo de um painel nunca o fecha com o mesmo
  toque que o abriu.
- **Mini mapa** (botão de mapa ou tecla M): imagem do mundo gerada dos próprios tiles (`npm run art:world`), você,
  o grupo e o destino; toque num lugar para ir até lá (caminho pelo mapa todo, contornando árvores, muros, água e,
  quando dá, monstros). *Mundo inteiro* / *Aproximar*.
- **Personagens online** (botão de pessoas ou tecla O): quem está no mundo, onde e fazendo o quê; **+ Grupo** chama
  para o grupo na hora e a pessoa vem andando até você (aparece no mini mapa).
- **Segurar o atalho repete** a magia/item/poção a cada recarga (sem ficar clicando); soltar encerra na hora e cancela
  a magia que estava na fila. No celular, o toque **nos vãos entre os atalhos aciona a grade** (nunca anda pelo mapa) e
  o **joystick fica por cima de todo o HUD**.
- **Atalhos personalizáveis** (*Menu → Configurar atalhos*, botão *Atalhos* no Grimório, ou tocar num atalho
  vazio): cada posição numerada (a mesma da tela) recebe uma magia, uma **poção automática** (vida/mana, usa a
  menor que cobre o que falta) ou um item usável da mochila. Saves antigos são convertidos sozinhos.
- **Teclado/mouse:** WASD/setas (8 direções), clique para andar/selecionar, Tab/Espaço alvo, 1–8 atalhos,
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
- Lojas: o mercador compra o loot (inclusive as flechas antigas). Na venda, o que
  você tem aparece primeiro; botão **Vender tudo** (só a mochila, nunca o equipado nem o
  **travado**: na mochila/equipamento, *Travar venda* põe um cadeado no item). Janela responsiva (lista com rolagem
  própria e barra de ações sempre visível, em retrato, paisagem e desktop).
- **Área protegida** só dentro de casas, lojas e templo; as ruas da vila são livres para lutar (e ninguém atravessa ninguém: se travar, trocam de lugar).
- Inventário, 9 slots de equipamento, ataque/defesa visíveis em cada item (verde ▲ quando é melhor que o
  equipado), comparação de atributos, poções (o atalho escolhe a poção certa para a vida/mana que falta) e sem flechas (o arco só depende do ataque).
- Save local versionado (IndexedDB → localStorage → memória) com validação e migração.
- Áudio procedural (WebAudio): efeitos e música por região, respeitando autoplay/mute.

## Expansão: níveis 24 a 100
- **Uma cidade só**: Pedraluz continua sendo a única cidade. Todo o equipamento do nível 24 ao 100 e as poções espirituais/divinas são vendidos lá (peças de luta na Ferraria, de mago na Alquimia) e os troféus das criaturas são comprados pelo valor cheio.
- **Zonas de caça por distância**: o mapa (300×128) segue a leste das Terras Altas com oito zonas, cada uma mais difícil que a anterior quanto mais longe de Pedraluz — Charneca das Presas, Montanha Branca, Dunas Rubras, Lago Congelado, Pântano Corrompido, Vulcão Adormecido, Portal Infernal e Abismo Primordial. Dentro de cada zona a espécie mais fraca fica na borda oeste (perto da cidade) e a mais forte na borda leste.
- **Equipamentos**: 11 faixas de material (Obsidiana a Primórdio) × 19 peças, geradas por fórmula em `src/data/items.gear.ts`.
- **Criaturas**: 16 espécies novas (nível 44 a 100) com troféu próprio. As faixas tardias crescem mais devagar que as primeiras. `tests/tools/calibrate.test.ts` imprime a margem de luta de cada vocação contra cada espécie.
- **Arcos sem munição**: não há mais flechas; o dano do Paladino vem do ataque do arco (e das magias). As flechas antigas viraram loot vendável.
- **Corrida**: a recarga é igual à duração (8 s), então dá para renovar sem pausa.
- **Ajudas automáticas** (menu): pegar o loot ao alcance e beber poção no limiar escolhido.
- **Mini mapa**: heróis, NPCs e o seu saco de loot/morte.
- **Grupos entre heróis**: se juntam e se desfazem sozinhos; o convite do jogador sempre vence. XP de grupo: +25% por vocação diferente.
- **Heróis mais corajosos e preparados**: a coragem é aprendida (sobe a cada vitória, cai ao fugir ou morrer) e só fogem quando a régua diz que perdem mesmo bebendo as poções e a vida já caiu. O estoque de poções segue o consumo real dos últimos 12 minutos e cresce quando o grupo caça num lugar mais difícil.

## Grupo, perseguição e itens no chão
- **Grupo segue o líder**: quem está num grupo não escolhe vítimas de PK sozinho; ataca os monstros **e os personagens** que o líder ataca (se o PK estiver ligado) e solta o alvo quando o líder solta.
- **Ataque entre membros** (painel do grupo, só o líder muda): **Bloqueado**, **Treino** ou **Duelo**. No *treino* cada um usa a arma que tem (sem trocas); nenhum golpe (básico, magia ou área) leva um colega abaixo de 50% de vida e o ataque espera ele se curar acima disso. No *duelo* vale até morrer. Nos dois: sem caveira, sem PZ lock e sem perder a mochila.
- **Velocidade por nível**: cada nível soma +0,0125 tiles/s (teto +1,0), então o nível 60 anda ~0,5 tiles/s mais que o 18 — dá para fugir com Corrida, mas não de graça.
- **Corrida**: +0,7 de velocidade por **30 s** e exaustão de **2 s**. Os heróis que seguem o grupo ou perseguem um alvo mantêm a Corrida ativa e a renovam antes de acabar.
- **Seguir colado**: os seguidores andam pela **trilha do líder** (os tiles que ele pisou) a cada passo da simulação — a distância média medida é ~1 tile, mesmo com o líder de Corrida. A perseguição de alvo guarda a rota e dá o próximo passo assim que o anterior termina. O seguidor ganha um fôlego proporcional à velocidade do líder (até +40%, +60% longe). Código em `src/game/movement/follow.ts`.
- **Jogar no chão**: na mochila, *Jogar no chão* deixa o item embaixo do personagem como um saco de loot; jogar mais itens no mesmo tile soma no mesmo saco. O que você mesmo jogou não é dividido com o grupo nem recolhido pelo pegar-tudo automático.

## Os quatro heróis com vida própria
Além do **Boladex** (Knight), existem **Maguim** (Sorcerer), **Mano Cura** (Druid) e **Distanciado** (Paladin). Todos
vivem sozinhos no mundo, aparecem na tela inicial como personagens jogáveis e podem ser convidados para grupos.
A lógica por vocação está em `src/game/ai/heroRoles.ts` (perfil) e `heroBrain.ts`:
- **Maguim**: Faísca/Lança/Explosão Ígnea conforme a situação, Escudo de Mana quando cercado, fica a ~3 tiles de quem bate corpo a corpo (recua se a criatura for mais lenta), estoca poções de mana (2,5× a mana máxima) e prioriza varinhas.
- **Mano Cura**: Espinhos/Rajada Glacial (lentidão), Bênção da Seiva em si e no grupo, Escudo de Mana, estoque de mana e cajados; o mais cuidadoso e sociável.
- **Distanciado**: Foco do Caçador, Flecha Atordoante em quem se aproxima, Chuva de Flechas em grupos; só usa arcos (o ataque do arco é o dano dele).
- Todos usam a régua de ameaça do Boladex (fuga antecipada, poções, escolha de área), com margem um pouco menor para quem luta de longe.
- Cada um nasce num ponto próprio do templo, para não bloquear quem entra no jogo.

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
  (podem se atacar sem caveira e sem perder ouro), sair e desfazer o grupo. Qualquer membro pode ser o líder (a coroa
  escolhe, inclusive você de volta) e você ajusta as regras mesmo sem liderar. **Seguir fluido**: quem segue refaz
  a rota enquanto anda (sem parar e recomeçar), acelera até 35% quando fica para trás, para a até 2 tiles do líder, e
  quem trava no outro troca de lugar após 5 s. Com o Boladex de líder, você (sem alvo e sem caminho
  escolhido) anda junto dele. A **XP é dividida igualmente** entre os membros vivos a até 20 tiles.
- **PK estilo Tibia** (botão de caveira liga o ataque entre personagens, fora de áreas protegidas; membros do grupo só no treino):
  - atacar quem **não tem caveira** = **caveira branca** e **PZ lock** de 2 min (não entra em lojas, templo, casas);
  - quem **revida** contra o agressor não ganha caveira; já um **terceiro** que ataca uma caveira branca sem ter sido
    atacado por ela fica com **caveira amarela**; atacar caveira vermelha é justo;
  - **matar** = PZ lock de 5 min, para quem deu o **maior dano** e também o **último golpe** (nos últimos 60 s). Se uma
    criatura causou mais dano ou deu o golpe final, a morte é da criatura e ninguém pega morte injusta. Matar quem não
    tinha caveira é **morte injusta** (aviso na tela); a 3ª em 24 h dá **caveira vermelha** por **24 h**. Matar caveira
    branca, amarela ou vermelha não conta como injusta;
  - **branca e amarela duram exatamente o PZ lock** (2 min; 5 min se matar) e só somem quando ele acaba; com menos de 30 s
    restantes, **qualquer combate** (com personagem, NPC ou criatura) renova para 30 s: é preciso ficar 30 s sem atacar
    nem ser atacado. A vermelha não renova;
  - **o tempo é o do relógio**: caveira, PZ lock e mortes injustas contam em tempo real, mesmo com o jogo pausado ou
    fechado (salvou com caveira branca e voltou depois de 5 min: sumiu; a vermelha só some depois de 24 h);
  - a caveira aparece **abaixo da barra de vida, à direita** (junto do escudo do grupo; o nome fica centralizado) e no HUD com o tempo; a vermelha, o PZ lock
    e as mortes injustas valem entre sessões (tempo real).
- **Morte**: **toda a mochila e o dinheiro da bolsa** caem num saco no chão (qualquer um pode pegar; só some quando alguém
  pegar) e cada equipado tem **10%** de chance de cair (caveira vermelha perde **todos**). O **Amuleto da Perda**
  (10.000, em todas as lojas) protege tudo e se desfaz. Morrendo, o PZ lock some; caveira branca/amarela também (renasce
  sem caveira); a vermelha continua contando as 24 h. O Boladex volta ao local da morte para recuperar seu saco.
- **Grupo visível** (estilo Tibia): escudo à direita do nome — **amarelo com estrela = líder**, **azul = membro**.
- **Arcos**: sem munição; o dano vem do ataque do arco. Flechas de saves antigos viram loot vendável.
- **Magias novas**: *Corrida* (todas: velocidade por 8 s, recarga de 8 s, desfaz lentidão), *Escudo de Mana* (Sorcerer/Druid: por 5 min o
  dano sai da mana; ícone no HUD e contorno azul discreto no personagem; o dano que sai da mana aparece em azul), *Grito de Guerra* (Knight: atrai criaturas em 5 tiles, recarga de 2 s; o *Redemoinho de Aço* só causa dano) e
  *Flecha Atordoante* (Paladin: dano + lentidão). Lentidão de gelo (Rajada Glacial, Flecha Atordoante) vale também para
  jogadores e heróis. *Redemoinho de Aço* e *Flecha Sagrada* com 2 s de exaustão.
- **Segurando uma magia com alvo**: se o alvo morreu, sumiu ou saiu da tela, o próximo é o inimigo mais próximo.
- **Boladex no PK**: revida quando atacado (ou foge se estiver perdendo), busca vingança de quem o matou e, por
  oportunidade, pesa ouro carregado, força relativa, vida do alvo, caveira, relação e temperamento. Sem nada a
  ganhar e sem motivo, não ataca (e às vezes comenta isso).
- **Personagens não se sobrepõem** (nem na cidade): o caminho contorna e, se um insistir contra o outro por 5 s,
  os dois **trocam de lugar**.
- **Loot dividido no grupo**: ao pegar loot do chão com o grupo por perto (mesmo alcance da XP), o ouro e cada item
  são divididos igualmente entre os membros vivos e perto; o resto da divisão (quando é ímpar) fica com quem pegou.
  Quem não cabe na mochila deixa o excedente no saco.
- **Papel em grupo (Knight/Boladex)**: *Redemoinho de Aço* atrai os monstros atingidos para o Knight (isca de 4 s,
  vale para você também); o Boladex puxa criaturas ociosas para o grupo, vira para si quem ataca os colegas, bebe poção
  de mana/vida (também contra atiradores e em emergência), dá poção ao colega morrendo e **pega o loot da tela toda
  enquanto luta** (sobreviver e atacar vêm primeiro; sem ninguém encostado ele busca o saco mais distante).
- **Criaturas** trocam de alvo pelo personagem mais próximo (a isca prende o foco por 4 s); quando o alvo volta ao
  respawn, o ataque do jogador é **cancelado** (o próximo ataque seleciona o mais próximo).
- **Mochila**: layout compacto sem rolagem (equipamento em 4 colunas, mochila em 7, detalhes e ações sempre à vista;
  em celular deitado vira 3 colunas e no desktop, 2), botão **Organizar** (remove os espaços vazios) e diferença de
  atributos em relação ao equipado em cada item (ex.: *+2 atq*, *+6 def*), também na loja.
- **Nomes no mapa** (desktop): jogadores e heróis com fonte maior e posição na grade de pixels da tela (sem tremer ao andar).
- **Vila rápida**: cada visita tem limite (75 s no total, 30 s por parada) e, depois dela, só volta antes de
  3 min com a mochila cheia; sem poção e ferido pede a bênção do sacerdote (grátis) em vez de esperar a vida voltar;
  sem poções escolhe uma caça mais tranquila; compra estoques maiores e só guarda no banco o excedente.
- **Atitudes raras**: às vezes diz que quer PK (com o PK desligado). Ataque ou PK só por decisão própria **fora do
  grupo**: em grupo nunca ataca nem desafia ninguém (no treino liberado, só revida se você atacar).
- **Caça mais, perde menos tempo**: só volta à vila quando a viagem compensa (mochila cheia, loot que vale, poções acabando com ouro para um bom estoque, upgrade ao alcance), visita só as lojas onde tem o que fazer (na ordem mais curta), troca de ponto quando os monstros acabam e, preso, dá um passo para o lado e replaneja. Se alguém trava a porta, trocam de lugar após 5 s. Em simulação de 40 min: ~83% do tempo caçando.
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
- Vitest: **218 testes passando** (regras, dados, mundo, persistência, banco, sincronização GitHub, herói com vida própria, grupo/PK/modo de ataque, trava de venda, escada de criaturas, vocações, controles do grupo, atalhos, ritmo, clique x perseguição, destino alcançável, viagem pelo mini mapa, chamar para o grupo, simulação integrada).
- Playwright: **12 fluxos passando** (desktop: principal/loja/casa/banco+loot/Boladex/HUD social; mobile: joystick, HUD na tela,
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
