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
  andar (também na área do joystick); toque no monstro para selecionar alvo; **9 atalhos numerados** num teclado 3×3
  no canto inferior direito (1 2 3 / 4 5 6 / 7 8 9 de cima para baixo, a mesma ordem das teclas do computador), com o
  botão de seleção de jogador logo acima. **Não há botão de ataque**: qualquer magia de ataque mira o mais próximo e
  começa o ataque básico, mesmo sem mana. Botão de ação contextual. Na mochila, toque duplo equipa/usa.
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
- **Teclado/mouse:** WASD/setas (8 direções), clique para andar/selecionar, Tab/Espaço alvo, 1–9 atalhos,
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

- **Banco nas lojas**: o ouro depositado no banco também paga compras. A loja mostra o ouro da mochila e o do banco; a compra gasta o da mochila primeiro e completa com o do banco (o aviso da compra diz quanto saiu do banco).

## Morte, recomeço e novos recursos
- **Recomeçar depois da morte**: o herói renasce com o ouro do banco e refaz a vida — saca, repõe as poções, caça e compra equipamento aos poucos. Antes de comprar tudo de novo ele **avalia o saco de morte**: se dá conta das criaturas ao redor (com o que tem agora, magias incluídas), volta e recupera o loot (reavalia a cada 20 s, até 3 tentativas).
- **Caveira vermelha**: quem morre assim perde também o equipamento; a primeira compra é uma **arma** (a melhor que o banco paga), depois poções e, com o tempo, o resto. Sem arma o herói **ataca com magias** (as magias que pedem arco ou arma valem mesmo sem arma nas mãos, e a régua de ameaça conta o dano dos feitiços).
- **Poções acabando**: com 2 poções de vida e dinheiro (bolsa + loot + banco) ele avisa, corre à vila, vende o loot, compra e volta à caça — em vez de ficar entre as criaturas até morrer. Sem dinheiro, só luta o que é bem folgado e foge cedo. Fugir sem rota livre vira luta. "Cercado" só faz fugir quando a luta não é folgada; depois de fugir ele evita a área e as criaturas por alguns minutos.
- **Menos tempo na vila**: chegar vivo com poções de sobra não obriga mais a passada pelo templo; Sorcerer e Druid sacam o ouro do estoque de mana de uma vez (uma ida em vez de uma a cada 3 min).
- **Sem flechas no loot**: goblins e bandidos não dropam mais flechas (as antigas continuam vendáveis).
- **Criar poção**: *Criar Poção de Mana* (Sorcerer, nível 18) e *Criar Poção de Vida* (Druid, nível 22) transformam mana em uma poção forte na mochila. Custo = 4× o que a poção recupera (560 de mana → Poção de Mana Forte de 140; 640 → Poção de Vida Forte de 160). Sem espaço na mochila a magia não gasta mana. Heróis usam quando o estoque está baixo e sobra mana.
- **Mini mapa por toque**: arraste o mapa (dedo ou mouse) para olhar em volta; um toque sem arrasto continua levando o personagem até o ponto.
- **Modo de ataque "Lurar"** (grupo → Alvo): o Knight (e, sem Knight, o Paladin) puxa as criaturas paradas da tela — quantas a régua aprova para o grupo todo — e volta para o meio do grupo, onde Paladin, Sorcerer e Druid atacam de longe. Só puxa com o time saudável e depois de terminar a leva anterior. Se o tanque é o jogador, os heróis atacam o que vier.
- **Seguir não trava a luta**: quem segue o líder (herói ou jogador) larga o caminho de seguir ao lutar; o jogador só volta a seguir depois de 6 s sem combate.
- **Caça na medida do grupo**: a escolha da caça dá nota ao XP pela régua e **penaliza o que sobra com folga** (nada de 4 personagens nível 40+ em slime ou lobo); com colegas por perto a margem sobe e o líder se arrisca em criaturas mais fortes.
- **Knight com estoque**: sem bastante poção o Knight exige mais folga, não lura e não puxa criaturas dos colegas.
- **Na PZ os personagens se atravessam** (templo, lojas, portas); fora dela continuam ocupando um tile cada.
- **Líder na cidade**: cada herói do grupo aproveita para vender o loot, guardar o ouro e comprar poções/itens.
- **Cura automática** (Ajustes): uma caixa liga as opções, cada uma com a própria barra de percentual — *Usar Poção de Cura*, *Usar Poção de Mana*, *Usar Magia de Cura* e, no Druida, *Curar grupo* (Cura Intensa quando você **ou um aliado** a até 12 tiles cai abaixo da barra). Configurações antigas são convertidas.
- **Grupo mais dinâmico**: em grupo os heróis se curam e bebem poção mais cedo, recuam para trás dos colegas em vez de apanhar até o fim, e Druid/Paladin lançam a magia de área no meio do bolo de criaturas.
- **Saco de morte protegido**: heróis não pegam o saco de morte de outro personagem nem itens jogados no chão, e o saco de morte não é dividido com o grupo (antes, em grupo, parte do seu loot ia para os heróis).

## IA mais esperta, PK revisado e balanceamento das vocações
- **Nada de herói parado apanhando**: um vigia percebe quando ele toma dano por ~2,5 s sem atacar nem andar (alvo do outro lado de um obstáculo, varinha sem mana, rota travada) e troca para quem dá para acertar ou foge. Na fuga, cercado, ele atravessa as criaturas em vez de ficar parado "revidando" (era um travamento sem fim). Mago sem mana não fica "lutando" parado.
- **Legítima defesa sempre**: em grupo (de heróis ou com o jogador) quem é atacado no PK revida ou foge — antes só reagia sozinho. No PK todas as vocações usam as magias de ataque.
- **Caça pelo custo-benefício**: XP por minuto do **grupo** (o dano de todos mata mais rápido, a XP é dividida) × segurança da régua contra o puxão típico (2–3 criaturas sozinho, uma a mais por colega). A régua agora conta a cura que dá para beber no tempo da luta, quem leva o dano (o Knight segura, os de longe pouco) e, em grupo, vale para o membro mais frágil. Sem opção segura, fica com a mais tranquila — nunca mais cai automaticamente no slime. Nível 30 caça criaturas de nível ~18–34; nível 80, de ~55–85.
- **Estratégia de grupo**: o líder não puxa a próxima leva com um colega ferido (<55%) ou mago sem mana (<25%); a ordem de abate começa por quem mais machuca por vida restante.
- **Convite do jogador nunca é recusado** (nem com rixa): o herói sai de qualquer outro grupo.
- **Morte injusta**: conta para **todo personagem que bateu** na vítima no último minuto (em grupo, cada um que participou). O dano das criaturas não tira o crédito: matar alguém junto com monstros é morte injusta.
- **Caveira amarela de vingança**: quem foi morto injustamente vê o assassino com caveira amarela por 15 min e pode atacá-lo e matá-lo **sem caveira nem morte injusta** (só o PZ lock).
- **Loot sem trava**: qualquer um pega qualquer saco a qualquer momento. O saco do **seu próprio corpo** não é dividido com o grupo; o saco de morte de outro personagem é dividido como um loot comum.
- **Poções vendidas pela metade do preço** na Alquimia (o "vender tudo" não leva poções).
- **Botão de seleção de jogador/herói** (acima dos atalhos, no canto inferior direito): cada toque marca o próximo personagem por perto (nome em laranja) e, depois do último, desmarca. Com alguém marcado, as magias de ataque (e o ataque básico) vão nele.
- **Ninguém é empurrado nem puxado para dentro da PZ** (a troca de lugar não acontece na borda da área protegida).
- **Corrida na morte**: morrer encerra a Corrida e os demais efeitos; a aura não fica mais no chão.
- **Balanceamento do dano** (`tests/tools/vocation-dps.test.ts`, detalhes em `docs/BALANCE.md`): as magias dos magos passam a crescer com a varinha (antes o Sorcerer caía para 49% do dano no nível 100 e o Druid para 37%), Knight corpo a corpo 1,15 → 1,3 e Paladin distância 1,15 → 1,25. Agora todas ficam entre ~73% e 100% em qualquer nível, com os magos muito à frente em área.

## Exaustão por grupo, lojas com filtros e mercado, atalhos 3×3
- **Exaustão por grupo**: atacar e curar ao mesmo tempo. Cada grupo tem a sua exaustão, sem uma travar a outra:
  - magias de ataque: 2 s entre duas quaisquer (mesmo que outra já esteja pronta);
  - magias de cura: 2 s entre duas (o Segundo Fôlego também passou para 2 s de recarga);
  - poções: 2 s;
  - magias de suporte (Corrida, escudos, criação de poção): a exaustão curta de antes, só entre elas.
- **Lojas dos NPCs**:
  - Filtros por categoria (Todos, Espadas, Capacetes, Poções de vida, Diversos...), só com as que a loja tem.
  - Botão *Posso usar*: mostra só o que a sua vocação e o seu nível já usam.
  - Na compra, o que você pode usar vem primeiro, depois do menor nível para o maior; cada item mostra o nível mínimo.
  - **Comprar no mercado**: se alguém anunciou o item no mercado mais barato que a loja, a linha mostra "mercado X".
    No item escolhido aparece o botão para comprar de lá sem sair da loja; só os anúncios abaixo do preço da loja
    entram. Se o mercado for mais caro, o botão não aparece.
- **Personagens online**: nome longo encolhe com "…" e o nível fica sempre visível.
- **Morte injusta em grupo** (como no Tibia): todo personagem que bateu na vítima no último minuto leva a morte (antes
  eram só 2: o último golpe e o maior dano, e em grupo os heróis costumavam ficar com os dois). Golpe bloqueado também
  conta como participação.
- **Painel do grupo**: cada membro tem *Ir até* (você vai andando até ele, onde estiver; o painel fecha) além de *Chamar*.
- **Configurar atalhos**: os 9 espaços sempre num teclado 3×3 (1 2 3 / 4 5 6 / 7 8 9), fixo no topo enquanto as
  opções rolam. Antes, no computador, eram 9 em linha e os últimos ficavam cortados. Cada magia, poção ou item mostra
  em que atalho já está, e as magias liberadas vêm primeiro.

## Cercado, magias mais espertas, criar personagem no jogo e filtros
- **Cercado (trap)**: sem nenhuma casa livre em volta e com 2+ criaturas encostadas, o herói abre caminho. Ele mata
  primeiro a criatura do cerco que cai mais rápido (a mais fraca; no empate, a que mais machuca), com a magia de área
  que pega o cerco todo ou a melhor magia de alvo único. Aberta a brecha, dá um passo para a casa com menos criaturas em
  volta e volta à lógica normal (caçar, fugir, manter distância).
  - O **Knight** gosta do cerco (o Giro de Aço acerta todos) e só abre caminho quando está morrendo (vida abaixo de
    45%), com 5 poções ou menos, ou perdendo a luta. Cheio de vida e poções, "cercado" também não o faz fugir.
- **Magias de alvo único mais espertas**:
  - não gastam mana em quem o golpe básico já derruba (a não ser que esteja fugindo);
  - quando alguma magia mata o alvo, sai a mais barata que mata (nada de grau III num resto de vida);
  - senão, com mana sobrando (60%+), a de mais dano; com mana curta, a de mais dano por ponto de mana. A resistência
    da criatura ao elemento entra na conta, e os graus II/III entram sozinhos.
- **Criar personagem de dentro do jogo**: em *Personagens online*, *+ Criar personagem* pede o nome e a vocação. Ele
  nasce no templo, nível 1 com o kit da vocação, e já sai jogando com a IA. Aparece na lista, pode ser deslogado e
  depois escolhido na tela inicial. Nomes repetidos são recusados, e o limite é de 10 personagens.
- **Tela inicial**: busca pelo nome (sem diferenciar acento) e filtro por vocação; a lista vem sempre do maior nível
  para o menor.

## Temporada 2: recomeço, XP pela metade e heróis com jeito de gente
- **Todo mundo recomeça do nível 1** (`src/domain/rules/season.ts`): os seus personagens e os heróis voltam com o
  equipamento básico da vocação, 40 de ouro e **50 Poções de Vida e 50 Poções de Mana** pequenas. Skills, Magic Level,
  depósito e ouro do banco zeram; ficam o nome, a vocação e as configurações de cada personagem (curas automáticas e
  grupo). Cada save guarda a temporada: um save antigo recomeça ao ser aberto, inclusive o que chega pela sincronização
  do GitHub. O mercado também começa vazio. A tela inicial avisa uma vez (*Nova temporada!*).
- **Experiência pela metade**: toda criatura dá 50% da XP de antes (`BALANCE.creatures.xpRate = 0.5`).
- **Heróis que parecem gente jogando** (`src/game/ai/heroHuman.ts`). Cada herói tem um perfil fixo, tirado do
  temperamento:
  - **Reação humana**: fora de aperto ele leva de 0,23 a 0,63 s para beber a poção (abaixo de 30% de vida ou em
    perigo, bebe na hora). Depois de matar, dá uma olhada no loot antes de puxar a próxima criatura, a não ser que algo
    o ataque. Também não aproveita toda brecha para magia (86% a 98% delas).
  - **Jeito de escrever**: Boladex é animado ("!!", "haha"), Maguim é casual (vc, pq, tb, vlw, pra, sem acento, "kkk"),
    Mano Cura é educado e Distanciado é seco (sem exclamação). Personagens criados ganham um jeito pelo id.
  - **Sessões e pausas**: joga de 45 a 115 min, avisa que está cansado, se despede, sai do grupo, vai ao templo e
    desloga. Volta sozinho depois de 6 a 24 min ("voltei"). Em *Personagens online*, quem está fora aparece em *Numa
    pausa (voltam sozinhos)*, com os minutos que faltam; dá para deslogá-lo por lá. **Quem está no seu grupo nunca sai
    para a pausa.**
  - **AFK de vez em quando**: às vezes, depois da vila, fica de 1 a 3,5 min parado na área protegida (4% a 12% das
    visitas). Depois de morrer, fica 30 a 90 s (3 vezes em 10). Na lista ele aparece como *ausente (AFK)* e volta na
    hora se for atacado.
  - **Conversa de MMO**:
    - cumprimenta quem encontra na vila, e o outro responde depois de "digitar" (1,5 a 4 s);
    - dá "gz" nos níveis redondos (e a partir do 15), inclusive os seus;
    - manda "F" quando alguém cai por perto;
    - comenta o que anunciou ou comprou no mercado e às vezes chama gente para caçar;
    - olha para os lados quando está parado e dá pequenas pausas entre uma compra e outra.
  - **Menos falatório**: as frases de caça, vila, venda, compra, banco, skill e abate têm intervalos de 4 a 8 min, e o
    nível novo só é comemorado nos redondos (ou às vezes). Fica em ~1,5 fala por minuto por herói.
  - Tudo isso vale só no jogo (`lifelike`). Testes e ferramentas usam a IA determinística de sempre.

## "Ir até" e materiais agrupados no loot
- **Ir até** (lista de *Personagens online*): você vai andando até o personagem, onde ele estiver no mapa — a rota é
  refeita quando ele muda de lugar — e para a 2 tiles dele. Não ataca nada no caminho. No topo da tela aparece
  *Indo até Fulano · N tiles* com o botão *Parar*; andar por conta própria, tocar no chão ou viajar pelo mini mapa
  também cancela. No celular os botões da lista ficam numa segunda linha (o nome e a atividade continuam legíveis).
- **Materiais agrupados no loot**: com vários sacos ao redor, o mesmo material (e qualquer item agrupável) aparece numa
  pilha só na janela de loot e é pego de todos os sacos de uma vez, entrando numa pilha só na mochila. Equipamentos
  continuam um por um.

## Mercado de Pedraluz (corretor ao lado da banqueira)
Refeito do zero, inspirado no **Market do Tibia** (todas as ofertas à vista, categorias, filtro por vocação, atributos
do item) e no **Grand Exchange do RuneScape** (preço de referência, botões de ±%, ofertas que fecham sozinhas e entregas a
retirar) — e pensado primeiro para o celular.
- **NPC próprio**: o **Corretor Tadeu**, na mesa ao lado da Banqueira Clara (Banco de Pedraluz). O depósito do banco não
  tem mais aba de mercado.
- **Só equipamentos e poções.** Materiais de criaturas, comida e outros itens diversos são vendidos só nas lojas.
- **Jornada em 4 toques**: *Comprar / Vender / Minhas ofertas* → **categoria** (Espadas, Machados, Maças, Arcos e
  lanças, Varinhas, Cajados, Escudos, Livros, Capacetes, Armaduras, Calças, Botas, Anéis, Amuletos, Poções de vida e
  de mana — cada uma mostra quanto está à venda, ou quanto você tem) → **lista** com filtro por vocação (Todas, a sua
  ou uma específica) e ordem por **nível** ou **preço** (crescente/decrescente; comprando, *Só à venda*) → **item**.
  Também dá para procurar pelo nome.
- **Na lista, ao lado de cada item**: nível para usar, atributos (Atq, Def/Arm, Vida, Mana, ML…), se é **▲ melhor** ou
  **▼ pior** que o que você usa (com +/− de ataque e defesa), *requer nv X* ou *não usa*, e o preço do modo: comprando, o
  **menor anúncio** (e quantos há); vendendo, a **maior oferta de compra** e o **último negócio**.
- **No item**: o guia de preços (menor venda, maior compra, último negócio, média recente, quanto a loja vende e paga)
  e **todas as ofertas** dos dois lados (preço, quantidade, quem e há quanto tempo).
  - **Comprar**: *Comprar agora* paga o menor preço; escolha a quantidade (várias unidades do mesmo preço de uma vez;
    tocar numa oferta à venda escolhe outro preço). Ou deixe uma **oferta de compra** dizendo quanto você paga — o ouro
    fica reservado até alguém vender (ou você cancelar).
  - **Vender**: *Vender agora* para quem já quer comprar (a maior oferta), ou **anuncie**: *Último negócio*, *Abaixo do
    menor* anúncio, *Referência* ou o seu preço.
  - Tudo com botões: preços sugeridos pela **oferta e procura** (último negócio + média recente; sem negócios, o meio
    do livro; sem nada, entre o que a loja paga e o que ela cobra), passos de **−10% −1 +1 +10%** e quantidade com
    **− + Máx**. O preço também pode ser digitado.
  - Oferta que alcança o outro lado **fecha na hora pelo preço de quem já esperava** (anunciar a 8 quando alguém
    oferece 12 vende a 12; ofertar 20 quando há anúncio a 8 compra a 8); o que sobra fica no livro. **Sem limite** de
    ofertas.
- **Minhas ofertas**: vendas e compras abertas, com o melhor preço do outro lado ao lado de cada uma e *Cancelar* (a
  venda devolve o item para a mochila; a compra devolve o ouro reservado ao banco).
- **Entregas**: o que você compra na hora vai para a **mochila** (sem espaço, para o depósito); o ouro das vendas vai
  para o **banco**. O que chega por uma oferta de compra vai para o depósito; quem estava fora do jogo recebe ao logar,
  e quem estava com o depósito cheio retira no corretor (*Retirar*).
- **Os heróis preferem o mercado**: a visita à vila começa no corretor e, no mesmo prédio, no banco (a bolsa fica com o
  que as lojas vão pedir; o resto é guardado), e só então as lojas. No mercado eles:
  1. recebem e equipam o que chegou por oferta;
  2. baixam ~15% o preço do que não vende em 20 min (nunca abaixo do que a loja paga) e retiram o que ficou 1 h no piso;
  3. vendem o equipamento do loot para quem já paga mais que a loja, ou anunciam (até 8 anúncios por herói);
  4. compram poções do nível deles pelo menor preço (nunca acima da loja) e anunciam as pequenas que sobraram;
  5. compram upgrades à venda que cabem no orçamento (a meta de equipamento primeiro; a arma nunca espera);
  6. o que precisam para evoluir e não acharam: deixam a **oferta de quanto pagam** (abaixo da loja) e seguem com o que
     têm — ou com algo mais fraco da loja — até a oferta fechar; quando juntam o preço da loja, cancelam e compram lá.
  Os materiais das criaturas continuam indo para as lojas.
- **Histórico e persistência**: os últimos negócios de cada item ficam guardados (o último preço e a média viram a
  referência). O mercado fica salvo no aparelho; o formato antigo é convertido (o que o mercado novo não negocia volta
  ao dono).

## Poções por tamanho, magias I/II/III, Terras do Sul e guardas da vila
- **Poções por tamanho e nível mínimo** (as pequenas servem para todos):

  | Poção | Nível | Vida / mana | Recarga | Preço |
  |---|---|---|---|---|
  | Pequena | 1 | 75 / 60 | 2 s | 40 / 45 |
  | Média | 12 | 180 / 150 | 2 s | 100 / 120 |
  | Grande | 28 | 380 / 300 | 2 s | 200 / 240 |
  | Espiritual | 50 | 650 / 500 | 2 s | 340 / 400 |
  | Divina | 75 | 1100 / 900 | 2 s | 560 / 720 |

  Todas as poções têm a mesma exaustão de 2 s.

  Sem o nível a poção não é bebida; o atalho automático, a cura automática e a IA só contam (e usam) as que o
  personagem já pode beber. Os ícones crescem com o tamanho (frasco, garrafa, garrafão com detalhes dourados).
- **Magias de criação de cada poção**: o Druid cria as 5 de vida e o Sorcerer as 5 de mana (6 níveis depois do nível
  da poção), por 2,4× a 3,4× a mana que ela devolve. A IA cria a maior que ela já bebe sem ficar com menos de metade da
  mana.
- **Magias de grau II e III** (mesmo nome com I/II/III): cada vocação ganha II (nível 20/30) e III (nível 45/60) da
  magia de alvo único e da de área, e todos ganham o *Respiro Vital II/III* (níveis 25 e 50). Cada grau bate +40% /
  +85% e gasta +60% / +130% de mana — o I continua rendendo mais por ponto de mana. A IA usa o maior grau com a mana
  acima de 45% e o I com a mana curta (a cura, sempre o maior grau).
- **Magia de ataque = ataque básico**: o botão de ataque saiu; qualquer magia de ataque (inclusive as de área em
  volta) mira o inimigo mais próximo e começa o ataque básico, mesmo que a magia não saia (sem mana ou em recarga).
- **Terras do Sul** (o mapa cresceu de 128 para 160 tiles de altura; nenhuma cidade nova): 6 áreas de caça com 12
  criaturas inéditas e não humanas — Brejo das Sanguessugas (slime do brejo e sapo-boi, nível 6–12), Ninho das Aranhas
  (aranha das cavernas e viúva-negra, 12–20), Savana Rachada (hiena e javali couraçado, 20–28), Desfiladeiro das Serpes
  (urso das cavernas e serpe verde, 28–44), Estepe dos Basiliscos (basilisco e lobo da tempestade, 68–76) e Cratera
  Cristalina (escorpião de cristal e slime de magma, 84–92). Cada uma deixa um troféu próprio (vendido na Alquimia e na
  Banca), a poção do nível e, raramente, equipamento. Trilhas descem do pântano, das ruínas, do covil e das Terras
  Distantes até a estrada do sul. A IA pesa mais a viagem ao escolher a caça (longe da vila, sem poção, fugir mata).
- **Guardas da vila**: criatura que entra nas ruas (lurada ou perseguindo alguém) é abatida pela guarda — lanças a
  cada 0,7 s, 3 acertos derrubam qualquer uma — sem XP nem loot. Nova guarda no portão sul (Guarda Lia).
- **Preço do item**: ao selecionar um item na mochila ou na loja aparece quanto a melhor loja paga e o anúncio mais
  barato no mercado do banco (com o número de anúncios).
- **Todos os personagens criados entram logados** jogando com a IA (vida própria), a menos que você os deslogue em
  *Personagens online*.
- **Câmera nas bordas**: perto da borda do mapa a câmera não trava mais — o personagem fica sempre no centro e as
  criaturas não somem embaixo do HUD e dos atalhos (além da borda aparece a mata fechada).
- **Configurações por personagem**: as ajudas automáticas (cura em X%, poções, loot) e as regras de grupo que você usa
  como líder ficam salvas no próprio personagem (e vão junto na sincronização com o GitHub).
- **Economia** (medida em 3 h de jogo de cada vocação): as poções grandes custavam *mais* ouro por ponto que as
  pequenas e os magos gastavam até ~30 mil de ouro a cada meia hora só em mana. Agora o preço por ponto cai um pouco
  com o tamanho (vida ~0,53 → 0,51; mana ~0,75 → 0,80 estável) e a IA compra a poção do nível dela e vende as pequenas
  que sobram quando o estoque das maiores está em dia.

## Personagens logados com IA, mercado do banco, magos e criaturas mais espertas
- **Logar e deslogar personagens** (lista de *Personagens online*, tecla O): todo personagem salvo pode entrar no jogo
  jogando sozinho — com a mesma IA dos heróis, na vocação e no nível dele — ou sair (o progresso é salvo). Os heróis
  (Boladex, Maguim, Mano Cura, Distanciado) entram logados por padrão; os criados por você ficam em *Fora do jogo* até
  você logá-los. A escolha fica gravada no aparelho. Logados, eles formam grupos, caçam, usam a vila, o mercado e o PK
  como os heróis (personagens criados ganham um temperamento próprio e falas neutras).
- **Mercado do banco**: substituído pelo Mercado de Pedraluz (ver acima).
- **Heróis usam o mercado primeiro**: na vila passam no banco antes das lojas e compram as poções anunciadas pelo
  preço do NPC ou menos e os upgrades que cabem no orçamento; só o que faltar compram no NPC. Também anunciam o
  equipamento do loot que venderiam barato ao NPC (e retiram o que ficar 30 min sem comprador).
- **Decisões rápidas na vila**: visita de no máximo ~45 s (antes 75 s), cada parada ~18 s, menos tempo de praça e, ao
  terminar, direto para a caça.
- **Magos**: cada vocação tem a própria curva de Magic Level — Sorcerer/Druid sobem muito mais rápido (1,18 por nível),
  Paladin 1,3 e Knight 1,4 —, e a cura (*Respiro Vital*, *Cura Intensa*) passou a depender bem mais do Magic Level do
  que do nível: o mago cura várias vezes mais que o Knight. As magias de ataque de Sorcerer e Druid custam mais mana
  conforme o nível (ex.: *Lança de Chamas* 25 no nível 1, 52 no 60), então a poção de mana volta a ser necessária.
- **2 magias inéditas por vocação**, para escolher no painel de atalhos (a barra padrão continua a mesma):
  Sorcerer *Relâmpago* e *Chuva de Brasas*; Druid *Estilhaço de Gelo* (lentidão) e *Pele de Pedra* (−30% de dano);
  Paladin *Luz Restauradora* (cura) e *Fogo Sagrado* (área em volta); Knight *Fúria* (ataque mais rápido) e
  *Segundo Fôlego* (cura pela força). Os heróis usam todas nas situações certas.
- **Poções**: todas as poções existentes estão à venda na Alquimia e na Banca do Ilário, listadas primeiro.
- **Seguir o alvo sem travar**: a rota é refeita assim que o alvo anda 2 casas (antes 3) e a cada 0,4 s; com o passo
  bloqueado, desvia na hora; e quem atira, "no alcance" mas com árvore ou parede no meio, chega mais perto em vez de
  ficar parado.
- **Criaturas cercam e contornam**: cada criatura corpo a corpo escolhe uma casa livre ao redor do alvo (sem repetir a
  de outra) e vai até ela pelo caminho calculado, contornando árvores, lagos e as outras criaturas — antes iam em linha
  reta e faziam fila atrás da primeira.

## IA tática dos heróis, atalhos 1–9 e magias novas
**Combate em grupo**
- **Foco de alvo**: entre as criaturas que atacam o grupo, cada herói escolhe a que os colegas já atacam e a de menos vida (morre primeiro); atiradores e quem bate num colega frágil sobem na fila (`focusPick` em `src/game/ai/heroTactics.ts`). No alvo "mais próximo" cada um continua pegando a mais perto.
- **Triagem de cura**: o Druid atende quem corre mais risco (vida baixa + criaturas batendo nele) com a Cura Intensa, até 10 tiles; em grupo guarda 15% da mana para curar em vez de gastar em dano. Poção vai para o colega em estado crítico.
- **Formação por papel**: com um Knight no grupo, Paladin e magos ficam na retaguarda — atrás do tanque, longe das criaturas corpo a corpo e sem perder o alvo do alcance.
- **Tanque segura**: em qualquer grupo (inclusive só de heróis) o Knight puxa para si, com o Grito de Guerra, as criaturas que foram para cima dos colegas — atiradores primeiro.
- **Socorro automático**: apanhando de 2+ criaturas (ou de uma com menos de 60% de vida), o herói chama os colegas que estão longe (como o botão "Chamar").

**Combate individual**
- **Kiting**: sozinho, quem luta de longe atira e logo recua um passo de quem vem corpo a corpo (se for mais rápido que a criatura ou ela estiver lenta). Recuar do alvo não conta mais como "o alvo está fugindo".
- **Magia de área com cálculo**: só sai quando compensa — dano por mana (ou por conjuração, com mana sobrando) contra a magia de alvo único, contando só as criaturas já na briga — e nunca quando acordaria criaturas paradas em volta (puxava "trens").
- **Atiradores primeiro**: criatura de longe que bate no herói sobe na ordem de abate.
- **Mana da fuga**: quem luta de longe, com a luta apertando, não gasta a mana da Corrida em ataque.

**Planejamento e economia**
- **Compra pelo consumo real**: o estoque de vida (com 15% de folga) e o de mana dos magos seguem o que ele bebeu nos últimos minutos.
- **Voltar na hora certa**: no ritmo de consumo dos últimos 4 min, se a cura não dura até chegar à vila (+1,5 min), ele volta antes de ficar seco.
- **Meta de equipamento**: escolhe o próximo item que vale juntar dinheiro, guarda mais no banco e não gasta em coisa grande pelo caminho (a arma principal nunca espera). Com o dinheiro, a meta é a primeira compra.
- **Loot por valor**: mochila cheia, larga o que vale menos para pegar um item bem melhor; cada item é vendido na loja da viagem que paga mais.

**Memória e PK**
- **Caças lembradas**: a caça que mais rendeu ganha preferência.
- **Jogadores perigosos**: quem atacou ou matou o herói (ou um colega) fica marcado; com o PK ligado, se ele aparecer e o grupo não for forte o bastante, o herói avisa e sai de perto.
- **Revanche planejada**: contra o jogador ou outro herói, só quando ele (com os colegas por perto) estiver bem mais forte; senão avisa que "a conta fica para depois". O líder do grupo guarda a rixa dos membros.

**Comportamento e comunicação**
- **Personalidade**: Boladex *Agressivo*, Maguim *Ganancioso*, Mano Cura *Cauteloso*, Distanciado *Equilibrado* — muda o risco aceito, a hora de fugir e de beber poção, e quanto loot busca/carrega. Aparece no menu do herói e no painel do grupo.
- **Falas de intenção**: "Socorro, grupo!", "Cuidado: fulano é perigoso", "Tô juntando para {item}", "Vou repor antes de ficar sem poção", "Cura indo!"…
- **Ordens no painel do grupo**: *Atacar meu alvo* (30 s), *Segurar posição* (de novo: soltar) e *Voltar à vila*.
- **Tempo ocioso útil**: mana cheia e nada por perto, ele gasta a sobra em magia de cura/Corrida (treina o nível mágico); sem dinheiro para poções, o Knight prefere treinar a skill.

**Atalhos e magias**
- **Atalhos 1–9 na mesma ordem no celular e no computador**: no toque, teclado 3×3 com os números (1 2 3 / 4 5 6 / 7 8 9) e a coluna do ataque à direita; no computador, teclas 1–9. Barras antigas (6 ou 8 atalhos) ganham a magia que falta no 9.
- **Magias novas**: Knight — *Golpe Paralisante* (nível 6, corpo a corpo, dano e lentidão de 3 s: ninguém foge do Knight); Paladin — *Disparo Divino* (nível 6, o tiro mais forte em alvo único).
- **Magias de área**: recarga 2 s menor, +1 sqm de raio e o dobro de mana — Explosão Ígnea raio 4 / 6 s / 90; Rajada Glacial raio 2 / 2 s / 50; Chuva de Flechas raio 2 / 4 s / 60; Redemoinho de Aço raio 2 / 2 s / 60 (já estava no mínimo de 2 s).

**Medido** (`tests/tools/hero-life`, 4 h, média de 6 sementes; "antes" já com as magias de área novas): Boladex nível 68 / 1,3 mortes; Maguim 61 / 2,8 (antes 67,5 / 1,7); Mano Cura 47,7 / 3,2 (51,3 / 3,2); Distanciado 46 / 5,0 (50,2 / 5,2). Duas ideias testadas e descartadas por aumentarem as mortes: fugir para a porta "menos cheia" em vez da mais próxima e guardar a mana da Corrida durante a luta.

## Magos com varinha, Rajada na perseguição, recuperar e "Chamar"
- **Sorcerer e Druid só equipam varinha/cajado** (nada de espada, machado, maça, arco ou lança; escudo e livro continuam). Ao carregar o jogo, a arma errada volta para a mochila (ou para o banco, se não couber) e o personagem recebe a varinha/cajado do nível mais próximo do dele (ou equipa uma boa que já tenha na mochila).
- **Druid perseguindo quem foge**: com o alvo se afastando (ou voltando para casa) e ainda sem lentidão, abre com a **Rajada Glacial** para deixá-lo lento e só depois usa as outras magias — contra criaturas e no PK.
- **Pouca vida e poucas poções = recuperar**: abaixo de 40% de vida com 2 poções ou menos (e sem mana para se curar), o herói foge para a área protegida para se recuperar **mesmo em grupo** (antes, os colegas faziam a régua achar que dava e ele ficava até morrer).
- **Botão "Chamar"** no painel do grupo, ao lado de cada personagem: ele larga o que estiver fazendo (caça, loot, vila) e vem até o líder com Corrida (se ele próprio for o líder, vem até você). Ao chegar, volta a seguir o grupo.

## Rodada de ajustes (exaustões, saco de morte, PZ)
- **Cura Intensa** (antiga Bênção da Seiva, Druid): só cura, sem regeneração contínua; alcança o grupo a até **12 tiles** (3× o anterior), custa **80 de mana** e tem exaustão de **2 s**.
- **Exaustões fechadas**: toda magia, cura e poção usa 2, 4, 6 ou 8 s conforme a força. Rajada Glacial 4 s; criar poção 2 s; poções: básica 2 s, forte 4 s, suprema 6 s, espiritual e divina 8 s. Magias de buff longo (Foco do Caçador, Brado de Ferro) ficaram com 4 s de duração para não ficarem sempre ativas.
- ~~Saco de morte reservado~~ (substituído: agora não há trava; o herói continua sem saquear o jogador e os colegas de grupo).
- **PZ**: a vida volta em dobro, mas a **mana não se recupera** (poção ou fora da PZ — lá ela volta em dobro para compensar) e a bênção do sacerdote só cura vida.
- **Corrida**: o efeito visual ficou só na região dos pés.
- **Jogador líder**: os heróis só saem do grupo e vão à vila quando as poções de cura estão no fim.
- **Heróis cercados**: em qualquer atividade (seguindo, na vila, travados fugindo) eles escolhem o atacante mais fraco e lutam com as magias, em vez de beber todas as poções parados; "cercado" e "sem poção" só fazem fugir quando a luta é realmente ruim.
- **Menos vila, mais caça**: bênção do sacerdote só com a vida baixa, banco só com ouro pesando, viagens de loot/upgrade mais espaçadas, estoque de poções maior, mana bebida antes de sair da cidade e mais vontade de caçar em grupo.

## Grupo, perseguição e itens no chão
- **Grupo segue o líder**: quem está num grupo não escolhe vítimas de PK sozinho; ataca os monstros **e os personagens** que o líder ataca (se o PK estiver ligado) e solta o alvo quando o líder solta.
- **PK em grupo com magias**: ajudando o líder (ou sozinhos no PK), os heróis lutam como PK de verdade — defesa quando
  apanham (Escudo de Mana, Pele de Pedra, Rugido de Ferro), reforço de ataque (Fúria, Foco do Caçador), magia que deixa
  lento em quem foge ou está com pouca vida e, no resto, a magia que mais tira vida naquele momento (a de área quando
  pega mais de um inimigo sem acordar criaturas; com pouca mana, a que rende mais dano por mana). Apanhando de um
  personagem, bebem poção e se curam cedo, como contra criaturas.
- **Pilhas de 100**: todo item agrupável (poções incluídas, que antes paravam em 50) junta até 100 por espaço, na
  mochila, no depósito e no chão.
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
- **Mano Cura**: Espinhos/Rajada Glacial (lentidão), Cura Intensa em si e no grupo, Escudo de Mana, estoque de mana e cajados; o mais cuidadoso e sociável.
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
- Vitest: **374 testes passando** (regras, dados, mundo, persistência, banco, sincronização GitHub, herói com vida própria, grupo/PK/modo de ataque, trava de venda, escada de criaturas, vocações, controles do grupo, atalhos, ritmo, clique x perseguição, destino alcançável, viagem pelo mini mapa, chamar para o grupo, simulação integrada, IA com jeito de gente e recomeço da temporada).
- Playwright: **15 fluxos passando** (desktop: principal/loja/casa/banco+loot/Boladex/HUD social; mobile: joystick, HUD na tela,
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
