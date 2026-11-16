# Balanceamento

Parâmetros em `src/data/balance/index.ts`, `src/data/vocations.ts`, `src/data/spells.ts`, `src/data/items.ts` e
`src/data/monsters.ts`. A tabela completa (todos os níveis, equipamento considerado) é gerada com as fórmulas
reais do jogo em [`BALANCE-REPORT.md`](BALANCE-REPORT.md) por `tests/tools/balance-report.test.ts`
(`npm run art:world`).

## Curvas

- **XP total** para o nível L = `45 · (L − 1)^2,15` (nv 2: 45 · nv 5: 885 · nv 10: ≈ 5 070 · nv 20: ≈ 25 300).
- **Skills** (Sword/Axe/Club/Distance/Shielding): tentativas para subir do nível n = `22 · 1,12^(n − 10) · multiplicador`.
  Multiplicador menor = vocação aprende mais rápido (Knight 1 nas armas corpo a corpo, Paladin 1 em Distance).
- **Magic Level**: mana gasta para subir do ML n = `60 · 1,25^n · multiplicador` (magos 1, Paladin 1,4, Knight 3).
- **Morte**: perde 50% de um nível de XP (se o XP do nível atual não cobre, o resto sai do nível anterior e o personagem desce de nível; ex.: 10% no nível N vira 60% do N-1) e treino de skills, que nunca caem abaixo de 10.
- **PvP**: golpes e magias de um personagem em outro (jogador ou NPC humano) causam 50% do dano (`combat.pvpDamageMultiplier`); em criaturas o dano é cheio.
- **Mana natural**: a cada 2 s, só a base da vocação (Sorcerer/Druid 15, Paladin 10, Knight 5), sem bônus de nível, como no Tibia; na PZ não volta. A mana de verdade vem das poções.
- **Varinhas e cajados**: não gastam mana nem treinam Magic Level (o ML sobe gastando mana em magias). Exceção: a Varinha de Treino gasta 3 de mana por disparo para treinar ML.

## Shielding (estilo Tibia)

- Treina com escudo **ou livro de magias** na mão secundária (livros agora têm defesa 5/9/13).
- Cada ataque recebido conta 1 tentativa, de **qualquer elemento** (antes só dano físico contava — por isso não
  evoluía contra slimes, sapos e aranhas, que causam dano de terra).
- No máximo **2 atacantes por janela de 2 s** (cada monstro conta uma vez por janela).
- Só treina se o personagem **atacou nos últimos 5 s** (golpe ou magia ofensiva): ficar parado apanhando não treina.
- Velocidade por vocação (multiplicador de tentativas): **Knight 1,0 · Paladin 1,3 · Sorcerer/Druid 1,8**.
  Do 10 ao 25, com 2 monstros batendo: Knight ≈ 14 min, Paladin ≈ 18 min, magos ≈ 25 min de luta.

## Armas de treino

Espada, Machado, Clava e Lança de Treino (ferreiro) e Varinha de Treino (alquimista), 40 de ouro cada. Ataque 1 e
**dano fixo 1–2 que ignora armadura e nunca erra**: cada golpe conta 1 tentativa para a skill da arma (a varinha
gasta 3 de mana, treinando Magic Level), mas o monstro demora a morrer. A Lança de Treino não usa flechas e
permite escudo, então o Paladin treina Distance e Shielding ao mesmo tempo.

## Fórmulas de combate (resumo)

- Golpe físico: máx = `(ataque · (skill + 10) / 20 + nível / 3) · modificador da vocação`, rolado entre 35% e 100%.
- Varinhas/cajados: dano fixo da arma + `0,5 · ML`, vezes o modificador mágico da vocação.
- Magias de ataque dos magos: `(nível · fator + ML · poder + base) · (1 + dano médio da varinha / 150)` — crescem
  com a varinha, como as magias de golpe/flecha crescem com o ataque da arma (`· (1 + ataque / 20)`).

## Dano por vocação até o nível 100 (out/2026)

Ferramenta: `RPGZIM_TOOLS=1 npx vitest run tests/tools/vocation-dps.test.ts` — melhor arma do nível, skills e ML
pelo tempo de caça (curvas reais de treino) e mana limitada ao que cada vocação gasta por segundo.

Antes, o ML cresce devagar (≈33 no nível 100) e as magias dos magos não dependiam da varinha: o Sorcerer caía de
100% do dano no início para 49% no nível 100 e o Druid para 37%; o Knight ficava em ≈70%. Ajustes: varinha reforça
as magias (acima), Knight corpo a corpo 1,15 → 1,3 e Paladin distância 1,15 → 1,25. Resultado (alvo único, % da
melhor vocação no nível):

| Nível | Knight | Paladin | Sorcerer | Druid |
|---|---|---|---|---|
| 8 | 74% | 73% | 100% | 95% |
| 25 | 77% | 75% | 100% | 93% |
| 50 | 83% | 82% | 100% | 92% |
| 80 | 93% | 100% | 98% | 88% |
| 100 | 91% | 100% | 86% | 73% |

Em área (4 criaturas) os magos ficam bem à frente (Druid ≈ 490 e Sorcerer ≈ 430 no nível 100 contra ≈ 350 do Knight).
- Armadura reduz só dano físico (entre 50% e 100% do valor, por golpe). Escudo dá chance de bloqueio que cresce
  com Shielding e com a defesa do escudo (máx. 45%).

## Comparação das vocações (após os ajustes)

Melhor equipamento disponível no nível e skills típicas. **DPS máx.** = ataque automático + magias de alvo em
recarga (bebendo poções de mana). **Recebido/s** = dano médio do monstro de referência após armadura/bloqueio.

| Nv | Vocação | Vida | Armadura | DPS máx. | Cura/s | Recebido/s |
|---|---|---|---|---|---|---|
| 1 | Knight | 210 | 8 | 15,7 | 9,0 | 2,3 |
| 1 | Paladin | 175 | 8 | 13,8 | 11,3 | 2,3 |
| 1 | Sorcerer | 145 | 5 | 15,9 | 10,0 | 2,3 |
| 1 | Druid | 145 | 5 | 10,2 | 14,8 | 2,3 |
| 10 | Knight | 370 | 23 | 51,7 | 12,8 | 8,4 |
| 10 | Paladin | 290 | 23 | 60,4 | 19,0 | 8,4 |
| 10 | Sorcerer | 192 | 9 | 68,4 | 26,0 | 8,4 |
| 10 | Druid | 192 | 9 | 51,0 | 37,8 | 8,4 |
| 20 | Knight | 630 | 34 | 105,6 | 17,0 | 0,0 |
| 20 | Paladin | 460 | 26 | 114,1 | 27,0 | 2,9 |
| 20 | Sorcerer | 272 | 11 | 117,9 | 43,0 | 9,3 |
| 20 | Druid | 272 | 11 | 95,4 | 62,5 | 9,3 |

Papéis resultantes:
- **Knight**: o mais resistente (mais vida, armadura, bloqueio e −12% de dano físico); cura própria fraca, depende de poções.
- **Paladin**: dano à distância alto e constante, vida e armadura intermediárias.
- **Sorcerer**: maior dano mágico, pouca vida; precisa manter distância e se curar.
- **Druid**: ≈ 80% do dano do Sorcerer com ≈ 45% mais cura por segundo e por mana.

## Problemas encontrados e ajustes feitos

1. **Druid fraco no início**: o primeiro monstro (Slime) resistia a terra (×0,4), o único elemento do Druid no
   nível 1, deixando o DPS do Druid em ⅓ das outras vocações. Slime agora ×0,8 terra / ×1,2 gelo; Aranha ×0,75
   terra (+ fraca a gelo); Esqueleto ×0,8 terra / ×0,9 gelo.
2. **Druid abaixo das outras vocações em todos os níveis**: modificador mágico 1,0 → 1,05 e *Rajada Glacial*
   mais forte (fator de poder 2,0 → 2,4, base 14 → 16).
3. **Paladin com o maior dano máximo com folga**: *Flecha Sagrada* (0,8 → 0,65) e *Chuva de Flechas* (0,7 → 0,6).
4. **Knight com dano de magia baixo**: *Golpe Brutal* mais forte (0,9 → 1,05, base 6 → 8).
5. **Magos frágeis demais**: vida por nível 6 → 8.
6. **Varinhas avançadas gastavam mais mana do que os magos regeneravam** (o ataque básico parava sem poções):
   custo 5/7 → 4/5 de mana por disparo.

## Escada de criaturas

Configurável em `BALANCE.creatures` (`src/data/balance`) e gerada em `src/data/monsters.ts`. São 6 patamares de
3 espécies; **cada patamar tem o dobro de vida e de ataque do anterior** (`tierRatio: 2`), e dentro do patamar as
espécies sobem ×1 / ×1,25 / ×1,55. XP ×3 e ouro ×2,2 por patamar. Dobrar a cada espécie (2^17 entre a primeira e a
última) tornaria o jogo impossível, por isso o dobro é por patamar.

| Patamar | Nível | Espécies | Área |
|---|---|---|---|
| 1 | 1 | Slime, Sapo, Javali | Clareira, pântano, mata |
| 2 | 6 | Goblin, Lobo, Aranha | Acampamento, colinas, bosque |
| 3 | 12 | Esqueleto, Bandido, Urso | Ruínas, Floresta dos Bandidos |
| 4 | 20 | Orc, Escorpião, Chefe Goblin (elite) | Fortaleza Orc, Cânion |
| 5 | 30 | Xamã Orc, Lobo do Gelo, Cavaleiro Sombrio | Fortaleza, Bosque Gélido, Cidadela |
| 6 | 40 | Troll, Lich, Dragão Jovem (elite) | Covil do Dragão |

- **Distância de perseguição** (`leashMultiplier: 3`): 3× maior que antes; ao passar dela, a criatura volta por
  teleporte com a vida cheia (evita "puxar e curar").
- **Paladin colado no alvo** (`pointBlankHitMultiplier`/`pointBlankDamageMultiplier` = 0,5): arco/lança a 1 tile
  acerta metade das vezes e causa metade do dano; o ideal é ficar a 2+ tiles.
- **Cura Intensa** (Druid, antiga Bênção da Seiva): cura em si e nos membros do grupo a até 12 tiles; 80 de mana, exaustão de 2 s, sem regeneração.
- **Magias de alvo** (inclusive o Golpe Brutal do Knight): sem alvo, miram o inimigo mais próximo (até 7 tiles) e
  ficam na fila por 4 s, saindo assim que o alvo entra no alcance.

## Ritmo (velocidade)

Jogo pensado para o celular: jogador a ~3 tiles/s (Knight 2,9 · Sorcerer/Druid 3,0 · Paladin 3,1), botas
+0,35/+0,55. Criaturas usam `speedScale: 0.7` sobre a velocidade da espécie (a mais rápida, o Lobo de Gelo,
fica em 2,8): todas são um pouco mais lentas que o jogador, como no Tibia, e dá para recuar e se posicionar.

## Áreas e controle de grupo

- **Magias de área (revisão atual)**: recarga 2 s menor, +1 sqm de raio e o dobro de mana —
  **Explosão Ígnea** raio 4 · 6 s · 90 de mana; **Rajada Glacial** raio 2 · 2 s · 50; **Chuva de Flechas** raio 2 · 4 s · 60;
  **Redemoinho de Aço** raio 2 · 2 s (já no mínimo) · 60. Mais fortes por conjuração, bem mais caras por ponto de mana:
  a IA só usa quando compensa contra a magia de alvo único e quando não acorda criaturas paradas em volta.
- **Magias novas**: *Golpe Paralisante* (Knight, nível 6, 30 de mana, 6 s, corpo a corpo com lentidão de 3 s) e
  *Disparo Divino* (Paladin, nível 6, 45 de mana, 6 s, o tiro mais forte em alvo único).
- **Grito de Guerra** (Knight) tem `attract`: as criaturas atingidas passam a perseguir o conjurador por 4 s
  (`TAUNT_MS`), sem trocar de alvo pelo "mais próximo" nesse período. O **Redemoinho de Aço** só causa dano.
- Criaturas reavaliam o alvo todo quadro: trocam para quem estiver estritamente mais perto (empate mantém o atual).

## Magias de utilidade

| Magia | Vocação | Mana | Recarga | Efeito |
|---|---|---|---|---|
| Corrida | todas | 40 | 18 s | +1,4 tiles/s por 8 s; remove lentidão |
| Escudo de Mana | Sorcerer, Druid | 70 | 30 s | 5 min: dano tira da mana primeiro |
| Grito de Guerra | Knight | 25 | 2 s | raio 5, dano leve, atrai (isca 4 s) |
| Flecha Atordoante | Paladin | 25 | 5 s | dano à distância + lentidão 60% por 3,5 s; 1 flecha |

Flechas: pedra +1 e metal +2 de ataque por disparo (somam ao ataque da arma e das magias que gastam flecha).

## Pendências conhecidas

- Os equipamentos vão até o nível 18; os patamares 4–6 pedem novos equipamentos (próximo passo).
- Monstros que causam dano de terra (aranha, sapo) ignoram armadura, o que é proposital (contra-ataque aos tanques).
- Valores de skill/ML por nível são estimativas; uma telemetria de sessões reais refinaria a tabela.

## IA do Boladex: régua de ameaça

`src/game/ai/heroThreat.ts` calcula a margem de uma luta (vida efetiva com poções ÷ dano esperado, matando a criatura mais fraca primeiro). Segura ≥ 1,6 · arriscada 1,0–1,6 · perdida < 1,0.
- Escolhe a caça só entre áreas em que aguenta 3 da presa e os vizinhos; só puxa criatura nova se a margem do grupo todo for segura e a vida ≥ 75%.
- Bebe poção quando um golpe tira metade da vida ou restam < 3,5 s; foge (Corrida) com margem < 1, 4+ atacantes ou sem poções e vida < 55%.
- Estoque de poções: 4 vidas cheias (mín. 600), com poções fortes se vida ≥ 180; poção antes de equipamento.
- Após morrer ou fugir: passa na vila (cura, banco, poções); evita por 25 min a espécie que o matou.
- Medido em 90 min × 5 seeds: 0 mortes (antes 6), XP total ≈ −7%.

### Heróis por vocação (90 min, sem jogador)
Maguim ≈ nível 25–27 · Mano Cura ≈ 17–20 · Distanciado ≈ 12–14 (as flechas pesam no ouro) · Boladex ≈ 18–19. Mortes: 0–1 por 90 min.

## Expansão (níveis 24–100)
- Faixas de criatura: 0–3 dobram vida e ataque (como antes); da 4ª em diante vida ×1,2, ataque ×1,17, XP ×1,22 e ouro ×1,3 por faixa. Passos dentro da faixa: ×1,0 / 1,1 / 1,22. Dano elemental ×0,62 nas faixas ≥ 4 (a armadura não o reduz).
- Equipamentos: ataque ×1,15, armadura ×1,12, vida/mana de bônus ×1,2 e preço ×1,8 por faixa (11 faixas, nível 24 a 100). Mantos e peças de mago também dão vida.
- Magos: `damage.magic` do Sorcerer 0,85 e do Druid 0,8 (antes 1,15 e 1,05) — os heróis magos chegavam ao nível 80 em 4 h contra 45 do Knight.
- Medido em 4 h por herói (seeds 11 e 12): Boladex 45–47, Maguim 33–57, Mano Cura 32–33, Distanciado 24–28; 0 a 1 morte por herói.

### Revisão: arcos sem munição, Corrida renovável, uma cidade
- Arcos: sem flechas (+1/+2 de ataque que elas davam foram embutidos: arcos antigos +3). O Paladino só equipa arcos.
- Corrida: recarga 18 s → 8 s (= duração).
- IA: fuga só com margem < ~0,75 e vida < 65% (antes 1,0 e 80%); "trem" de 3+ criaturas ao redor também. Em 4 h por herói: retiradas 4–6% do tempo (antes 8–11%), 0–1 morte por herói; níveis finais (seeds 11/12) Boladex 42–47, Maguim 50–58, Mano Cura 36–39, Distanciado 41–47.

## Magic Level por vocação, cura e mana dos magos

- **Curva de Magic Level própria** (`magicGrowth` em `src/data/vocations.ts`): mana exigida por nível =
  `60 × crescimento^ML × multiplicador`. Sorcerer e Druid 1,18; Paladin 1,3; Knight 1,4 (antes todos 1,25, o que deixava o
  Knight só ~5 níveis atrás dos magos). Medido em 3 h de jogo: magos ML ~35, Paladin ~18, Knight ~14.
- **Cura pelo Magic Level**: *Respiro Vital* = (0,3·nível + 3,2·ML + 20) × modificador de cura (Sorcerer 1,05, Druid 1,3,
  Paladin 0,85, Knight 0,75); *Cura Intensa* (Druid) = 0,5·nível + 4,4·ML + 30. No nível 50: mago com ML 40 cura ~165,
  Knight com ML 12 ~55.
- **Mana que acompanha o nível** (`manaPerLevel`): as magias de ataque de Sorcerer e Druid custam
  `mana base + nível × fator` (Faísca/Espinho +0,25; Lança de Chamas +0,45; Rajada Glacial +0,35; Explosão Ígnea +0,65;
  Cura Intensa +0,3 — o dobro disso estrangulava o Druid: nível 31 em vez de 52 em 3 h). O dano delas cresce com o nível e o ML; o custo agora também, e a poção de mana volta a contar.

## Poções por tamanho, graus II/III e economia (nov/2026)
- **Poções**: Pequena (nv 1) 75 vida / 60 mana; Média (12) 180/150; Grande (28) 380/300; Espiritual (50) 650/500;
  Divina (75) 1100/900 — todas com 2 s de exaustão (antes da última rodada eram 2/4/4/6/6 s). Preço por ponto: vida 0,53 → 0,51; mana ~0,75–0,80 (estável). Antes as
  maiores custavam mais por ponto (mana divina 1,22 de ouro por ponto contra 0,75 da pequena).
- **Criação**: 2,4× (divina) a 3,4× (pequena) a mana devolvida; liberada 6 níveis depois do nível da poção.
- **Graus II/III**: efeito ×1,4 / ×1,85, mana ×1,6 / ×2,3 (o I rende mais por ponto de mana); níveis 20/45 (alvo único
  e cura 25/50) e 30/60 (área). Ajustes de vocação junto: Sorcerer magia 0,85 → 0,82; Paladin distância 1,25 → 1,32 e
  redução física 5% → 8%.
- **Medição** (`tests/tools/hero-life.test.ts`, 3 h, heróis sozinhos, nível / mortes):

  | Herói | Publicado (2 sementes) | Novo (2–4 sementes) |
  |---|---|---|
  | Boladex (Knight) | 48 / 1 | 51 / 1,5 |
  | Maguim (Sorcerer) | 54,5 / 1,5 | 62,5 / 0 |
  | Mano Cura (Druid) | 48 / 1 | 57 / 1,5 |
  | Distanciado (Paladin) | 40,5 / 4,5 | 41 / 5,25 |

  Patrimônio no fim (bolsa + banco): os magos passaram de ~6–35 mil para ~17–41 mil (pagavam caro demais pela mana);
  o Knight fica entre 2,5 e 12 mil. O Paladin continua o mais lento e o que mais morre (morre fugindo depois de cercado
  — já acontecia antes); testada a regra "cercado e com poções, luta", ela piorou e foi descartada.
- **Viagem**: a escolha da caça divide o XP/min por 1 + distância/250 (era /600): com as Terras do Sul o mapa ficou
  mais fundo e um nível 2 chegou a descer até o Brejo e morrer fugindo sem poção.

## Exaustão única das poções, mercado novo e ajustes do sul (nov/2026)
- Todas as poções com 2 s de exaustão. Medido isoladamente, isso não mudou o resultado de forma consistente; o que
  derrubava magos e Paladin eram criaturas novas do sul e uma espiral de "desarmado":
  - **Hiena Risonha** 3,6 → 3,1 de velocidade e faro 8 → 6; **Lobo da Tempestade** 4 → 3,5 e faro 9 → 7 (fugir delas
    era impossível); **Aranha das Cavernas** 3 → 2,6 (cega) e bandos menores no Ninho e na Savana.
  - Herói que perde a arma numa morte agora volta à vila para comprar outra assim que tiver ouro, e a arma é a primeira
    compra (antes do estoque de poções). O Druid chegava a passar 2 h desarmado (nível 20 em 3 h).
- Medição final (3 h, nível / mortes, média das sementes): Boladex 57 / 0,5 · Maguim 58 / 1,5 · Mano Cura 58,5 / 0,5 ·
  Distanciado 39 / 4,75 (4 sementes).

## Mercado de Pedraluz (nov/2026)
- **Preço de referência** (o que a tela sugere): metade do último negócio + metade da média dos últimos 8 (pesada pela
  quantidade); sem negócios, o meio entre o menor anúncio e a maior oferta; sem ofertas, entre o que a loja paga e o
  que ela cobra (equipamento: o maior entre 60% do valor e o que a loja paga; poção: 85% do preço da loja).
- **Sugestões**: anunciar um abaixo do menor anúncio (sem ficar abaixo da maior oferta); ofertar um acima da maior
  oferta (sem chegar no menor anúncio). Passos de −10%, −1, +1 e +10%.
- **Heróis**: anunciam só o equipamento que rende 40%+ acima do que a loja paga (valor ≥ 150), até 4 anúncios cada;
  baixam ~15% a cada 10 min sem venda (nunca abaixo da loja) e, no piso, retiram depois de 20 min e vendem na loja.
  Ofertas de compra só pela meta de equipamento (até 2), a ~80% do preço da loja e com no máximo 60% do ouro livre;
  quando juntam o preço da loja (contando o ouro reservado), cancelam e compram lá. Só passam no corretor quando há o
  que fazer lá; o banco (no mesmo prédio) acerta a bolsa de uma vez, deixando o ouro de completar poções e upgrade.
- **Medição** (`tests/tools/market-life.test.ts`, os quatro heróis juntos por 2 h, 3 sementes, nível médio):

  | Herói | Versão anterior | Mercado novo |
  |---|---|---|
  | Boladex | 39,7 | 39,7 |
  | Maguim | 40 | 37,3 |
  | Mano Cura | 35,3 | 34 |
  | Distanciado | 24,7 | 23,7 |

  Com 10 a 16 anúncios abertos, 1 a 7 negócios fechados e ofertas de compra pelas metas. Sozinhos por 3 h
  (`hero-life`, 2 sementes): Boladex 57,5, Maguim 52,5, Mano Cura 56, Distanciado 46,5.
- Primeira versão (descartada): o mercado no começo de toda visita e o depósito no fim faziam a visita estourar o tempo
  (até 32% do tempo na vila, sem guardar ouro) e o loot parado em anúncio sem comprador deixava os heróis sem dinheiro
  (nível médio 20% a 38% menor em 2 h).


## Temporada 2: XP pela metade e jeito de gente (nov/2026)
- **XP**: `BALANCE.creatures.xpRate = 0.5` multiplica a experiência de toda criatura (mínimo 1). As curvas de nível não
  mudaram. Recomeço (`SEASON = 2`): saves antigos voltam ao nível 1 com o kit básico + 50 Poções de Vida e 50 de Mana
  pequenas (≈ 4.250 de ouro pelo preço da loja). Mercado, depósito e banco zeram.
- **Perfil humano** (`src/game/ai/heroHuman.ts`): reação = 230 + (1 − cautela)·260 + sorteio fixo·140 ms; magias fora de
  aperto = 86% + disciplina·12%; sessão = 45 + disc·30 a 80 + disc·35 min; pausa = 6 a 14 + (1 − disc)·10 min; AFK
  depois da vila = 4% + sociabilidade·8% (1 a 3,5 min). Nos heróis da casa: Boladex 394 ms / sessão 62–99 min,
  Maguim 415 / 60–98, Mano Cura 405 / 63–101, Distanciado 436 / 68–106.
- **Medição sozinho** (`hero-life`, 3 h, 2 sementes, nível / mortes): Boladex 35,5 / 1 · Maguim 40,5 / 0,5 ·
  Mano Cura 43,5 / 0 · Distanciado 28 / 0,5 (antes 57,5 / 0 · 52,5 / 1 · 56 / 1 · 46,5 / 5). A queda acompanha a XP
  pela metade (~70% do nível) e as mortes caíram.
- **Medição "de verdade"** (`human-life`, os quatro juntos com `lifelike`, 3 h, sementes 11 e 23): cada um faz uma
  pausa entre 63 e 101 min e volta; 3,6 de 4 online em média; da despedida ao deslogar, 4 a 49 s; AFK somado de 1 a
  13 min em 3 h; ~250–280 falas por herói (≈ 1,5 por minuto). Níveis no fim: 26 a 36.

## Cercado e golpe de misericórdia (nov/2026)
- **Cercado**: sem casa livre em volta e 2+ criaturas encostadas. Quem não é Knight abre caminho pela criatura que cai
  mais rápido (vida ÷ dano dele contra ela; empate, a que mais machuca) e, aberta a brecha, dá um passo para a casa com
  menos criaturas encostadas. O Knight só sai com vida < 45%, 5 poções ou menos, ou vida < 70% com margem < 1; fora
  disso "cercado" também não o faz fugir.
- **Golpe de misericórdia** antes da sequência de magias de cada vocação (a sequência continua a mesma): não gasta
  magia se o golpe básico já derruba o alvo; se alguma magia (com os graus II/III e a resistência da criatura) derruba,
  sai a mais barata, sem deixar a mana abaixo da reserva da vocação.
- Descartado: trocar a sequência inteira por "mais dano por mana / mais dano com mana sobrando". O Paladino gastava a
  mana da Luz Restauradora e da Corrida: nível médio caiu de 27,8 para 23,8 e as mortes subiram de 3 para 3,5–5,3
  (4 sementes).
- **Medição** (`hero-life`, 3 h sozinho, nível / mortes):

  | Herói | Antes | Agora |
  |---|---|---|
  | Boladex (11, 23) | 37 / 2 · 34 / 0 | 38 / 1 · 39 / 0 |
  | Maguim (11, 23) | 45 / 0 · 36 / 1 | 43 / 0 · 47 / 0 |
  | Mano Cura (11, 23) | 44 / 0 · 43 / 0 | 42 / 0 · 43 / 0 |
  | Distanciado (11, 23, 31, 47) | 26 / 3 · 25 / 4 · 29 / 3 · 31 / 2 | 33 / 1 · 33 / 1 · 27 / 2 · 26 / 4 |

## Exaustão por grupo (nov/2026)
- Ataque 2 s (era 1 s, compartilhado com tudo), cura 2 s e poção 2 s, cada um independente; suporte 1 s entre si.
  Segundo Fôlego: recarga 6 s → 2 s.
- **Medição** (`hero-life`, 3 h sozinho, sementes 11 e 23, nível / mortes): Boladex 37 / 1 · 35 / 1 (antes 38 / 1 ·
  39 / 0); Maguim 41 / 0 · 39 / 0 (43 / 0 · 47 / 0); Mano Cura 43 / 0 · 33 / 1 (42 / 0 · 43 / 0); Distanciado
  31 / 3 · 30 / 1 (33 / 1 · 33 / 1). Uma magia de ataque a cada 2 s tira um pouco do ritmo de todos (mais dos magos);
  curar sem esperar o ataque compensa parte nas mortes.

## Loot em grupo, tipos de mundo, criação de poções, Paladin e IA (nov/2026)
- **Loot em grupo**: criatura morta pelo grupo divide o ouro igualmente entre quem estava perto (o resto da divisão vai
  para quem tem a vez) e os itens vão inteiros para um membro por vez (rodízio), não importa quem abra o saco. Saco de
  morte de jogador/NPC humano e itens jogados no chão: quem pegar primeiro leva tudo.
- **Pegar tudo / loot automático**: primeiro o ouro, depois as pilhas de maior valor de venda (de todos os sacos ao
  alcance); com a mochila cheia, fica no chão o que vale menos.
- **Tipo de mundo** (Configurações): Sem PvP · PvP (caveiras, PZ lock, morte injusta) · PvP Enforced (todos se atacam
  sem caveira nem morte injusta; fica o PZ lock de combate; as perdas da morte continuam).
- **Criação de poções**: custo de mana por ponto 2,4 / 2,25 / 2,1 / 1,9 / 1,7 (era 3,4 / 3,2 / 3 / 2,7 / 2,4). Para não
  virar fábrica de ouro, as lojas pagam 35% do preço pelas poções (era 50%).
- **Paladin**: estoca mana pelo consumo real e não volta à vila só por mana (o arco ataca sem ela); arco/lança colado no
  alvo 0,75 de acerto e de dano (era 0,5). Em 3 h sozinho (sementes 11/23): nível 38 / 34 (antes 25 / 25), 0 mortes;
  tempo na vila 27% → 13%.
- **Recuperação depois de perder tudo**: a escolha de equipamento não favorece mais o item mais barato do jogo quando
  há ouro (piso de 15% do orçamento no "ganho por moeda"); sem arma, não gasta em poções o ouro da arma de outra loja;
  recomeçando sem armadura, o mago guarda menos ouro para mana. `tests/tools/hero-recovery.test.ts` (nível 35, 8 mil
  no banco, 30 min): os quatro com 6–7 peças e +2 a +5 níveis, 0 mortes.
- **Coragem e foco em subir**: em grupo exige menos margem (−0,15 por colega, até 3) e considera caças mais altas; criatura
  mais de 8 níveis abaixo dele perde valor (−7% por nível, até −80%). Veteranos nível 45: caçam sobretudo níveis 36–52
  (antes 23–31), 0 mortes. Do nível 1 em 3 h (sementes 11/23): Boladex 34/32, Maguim 28/28, Mano Cura 42/41,
  Distanciado 36/37. O Sorcerer continua o mais pobre (gasta tudo em mana) — pendente.
- **Guerra**: foge mais tarde (cada um por si 0,55; guilda com aliado perto 0,6; antes 0,7), finaliza inimigo com < 35%
  de vida, persegue até 18 tiles. Guildas: o time foca o mesmo alvo, o Druid inimigo cai primeiro, ninguém entra sozinho
  sem folga grande e socorre aliados a até 55 tiles. Medido (8 heróis, 30 min): tempo atacando 17–27% → 21–41%, recuo
  10–19% → 7–16%, mortes 1–2 → 2–3. Com o dano entre personagens pela metade, as poções curam quase tudo o que um
  atacante tira: as mortes dependem de vários no mesmo alvo.

## Magias de área na caça (nov/2026)
- Com 2+ criaturas na briga, a magia de área vem antes do golpe de misericórdia de alvo único, e as de área mirada
  (Rajada Glacial, Chuva de Fogo, Chuva de Flechas) vão no ponto que acerta mais criaturas, sozinho ou em grupo. Em
  recarga, sai a de alvo único (rodízio natural pela ordem de prioridade).
- Com mais de 40% de mana compara dano por conjuração (o limite é a exaustão de 2 s); abaixo, dano por ponto de mana
  (antes o corte era 70%, e o mago quase nunca passava dele).
- Criaturas paradas no raio só impedem a área se forem mais de 2 (em grupo) ou mais de 1 (sozinho, vida > 60%).
- Medido (`tests/tools/hero-spells.test.ts`, nível 30, 20 min, em grupo): magias de área Maguim 18 → 47, Mano Cura
  38 → 60, Distanciado 5 → 30. Do nível 1 em 3 h sozinho: sem mudança relevante (nível e mortes iguais).

## Recalibragem de mana e cura do Druid (nov/2026)
- Com a mana natural fixa por vocação, as magias de ataque e a Cura Intensa ficaram mais baratas (`MANA_RETUNE` em
  `src/data/spells.ts`, herdado pelos graus II/III): Sorcerer/Druid custo base −30% e acréscimo por nível −50%;
  Paladin e Knight −20%. Ex.: Explosão Ígnea 90 → 63, Rajada Glacial 50 → 35, Chuva de Flechas 60 → 48, Cura Intensa
  80 → 56. Cura leve, buffs e criação de poções não mudaram.
- Druid em grupo: cura com 70% de vida (80% com 2+ criaturas batendo, ou 2+ colegas abaixo de 85%); antes 60%. A cura
  vem antes da rotina de "jeito de gente" e ele guarda 30% de mana para curar (antes 15%).
- Medido em grupo (nível 30, 30 min, sementes 11/23): Curas Intensas do Druid 11/20 → 58/76; tempo com alguém < 70% de
  vida 382/353 s → 217/214 s; < 50% 36/28 s → 27/21 s; 0 mortes. Do nível 1 em 3 h: Boladex 35/32, Maguim 31/30,
  Mano Cura 43/44, Distanciado 37/38 (todos iguais ou um pouco acima), 0 mortes. O Sorcerer ainda bebe 560–690 poções
  de mana em 3 h e termina sem ouro: com a magia mais barata ele lança mais (27 → 32–37 magias/min) em vez de poupar.

## Disciplina de mana e magias sem graus (nov/2026)
- **Sem graus II/III**: cada magia existe uma vez; o efeito cresce só pela fórmula (nível e Magic Level/skill, e a arma).
  Barras salvas com graus (`fire_nova_3`) viram a magia base, sem repetir. As magias de criação fazem uma poção por vez.
- **Disciplina de mana da IA** (`manaEffort` em `heroBrain.ts`):
  - fácil (uma criatura bem abaixo do nível dele): varinha/arco e a magia barata só com mana > 55%; lentidão em quem
    foge (Druid) e flecha atordoante se encostam (Paladin). Poção de mana só abaixo de 10%. O mago não para para
    "descansar a mana" em caça fácil sozinho (a varinha é grátis);
  - normal (2 criaturas ou uma do nível dele): rotação completa; poção abaixo de 25%;
  - pesado (3+, chefe ou vida < 50%): rotação completa com área; poção abaixo de 40%.
- **Medição** (`hero-life`, 3 h do nível 1, sementes 11/23, nível · ouro+banco · poções de mana · mortes):

  | Herói | Antes | Agora |
  |---|---|---|
  | Boladex | 35/32 · 7,1k/2,9k · 62/56 · 0 | 36/33 · 3,6k/3,2k · 62/57 · 0 |
  | Maguim | 31/30 · 0,5k/0,3k · 559/691 · 0 | 39/45 · 11,7k/23,3k · 717/689 · 0 |
  | Mano Cura | 43/44 · 22k/5,7k · 199/173 · 0 | 42/41 · 5,6k/24,7k · 193/208 · 0 |
  | Distanciado | 37/38 · 4,5k/8,4k · 238/239 · 0 | 41/34 · 4k/5,3k · 183/197 · 0 |

  O Sorcerer ainda bebe ~700 poções em 3 h, mas agora caça presas do nível dele (rende muito mais XP e ouro) e
  termina rico. Guerra (30 min, sementes 7/8): mortes por PK 3+3 → 2+4 (cada um por si) e 2+3 → 1+4 (guildas).
- `tests/tools/hero-spells.test.ts` passou a contar a vida só de quem está no grupo do Druid e ao alcance da cura
  (antes contava qualquer herói, mesmo fora do grupo). Com isso, ninguém junto do Druid ficou abaixo de 70% de vida
  nas sementes 11/23, nem antes nem depois.

## Preços (nov/2026)
Ajustes centralizados em `src/data/pricing.ts` (valem para o `value` dos itens e para as lojas):
- **Poção de mana** ~30% mais barata, ~0,56 de ouro por ponto (era ~0,8; a de vida é ~0,5): Pequena 45 → 34,
  Média 120 → 84, Grande 240 → 168, Espiritual 400 → 280, Divina 720 → 504. A maior nunca custa mais por ponto.
- **Equipamento dos níveis 8 a 23** 35% mais barato (o conjunto custava 150–300 abates numa fase em que se sobe de
  nível a cada 30–50).
- **Escada do fim do jogo**: preço ×1,65 por faixa (era ×1,8; `GROW.value` em `items.gear.ts`).
- **Elite** (Dragão Ancião): 0,3% por peça de equipamento (era 0,6%); valor por abate ~69 mil → ~18 mil (vizinhas
  ~14 mil).
- Conjunto de Knight em abates da faixa: nv 8 149 → 112 · nv 15 308 → 211 · nv 24 249 → 242 · nv 40 247 → 220 ·
  nv 64 338 → 279 · nv 80 434 → 356 · nv 96 601 → 473 (o loot de equipamento também ficou mais barato, então o fim
  do jogo ainda sobe).
- Medido (`hero-life`, 3 h do nível 1, sementes 11/23, nível · poções de mana): Boladex 36/33 → 32/37 · 62/57 → 60/59;
  Maguim 39/45 → 41/42 · 717/689 → 468/592; Mano Cura 42/41 → 43/42 · 193/208 → 123/134; Distanciado 41/34 → 42/41 ·
  183/197 → 213/186. Nenhuma morte.
- Teste "cada um por si tem mortes por PK" soma 3 sementes (uma só era frágil a qualquer mudança de economia/IA).
