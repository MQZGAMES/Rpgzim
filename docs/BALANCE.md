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
- **Morte**: perde 50% da XP do nível atual (nunca o nível) e treino de skills, que nunca caem abaixo de 10.

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

- **Explosão Ígnea** (Sorcerer) raio 2 → 3 e **Rajada Glacial** (Druid) raio 1 → 2: +1 tile para todos os lados.
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
