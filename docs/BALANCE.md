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

## Pendências conhecidas

- **Faltam monstros para os níveis 12+**: o mais forte (Chefe Goblin) bate até 34; com o equipamento de nível
  15+ o Knight praticamente não recebe dano físico. Próximo passo: uma área de nível alto (ex.: caverna/masmorra)
  com monstros de 60–120 de dano, dano elemental e um chefe.
- Monstros que causam dano de terra (aranha, sapo) ignoram armadura, o que é proposital (contra-ataque aos tanques).
- Valores de skill/ML por nível são estimativas; uma telemetria de sessões reais refinaria a tabela.
