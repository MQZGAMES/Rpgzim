# Relatório de balanceamento (gerado)

Gerado por `tests/tools/balance-report.test.ts` (`npm run art:world`). Usa as fórmulas reais do jogo, o melhor
equipamento disponível para cada vocação no nível e uma progressão típica de skills (skill principal = 10 + 2 por nível;
Magic Level de magos = 1,3 por nível). É uma estimativa para comparar vocações, não uma simulação de caça.

- **DPS auto**: só o ataque automático. **DPS regen**: auto + magias de alvo limitadas pela regeneração de mana.
- **DPS máx.**: auto + todas as magias de alvo em recarga (bebendo poções de mana).
- **Cura/s** e **cura/mana**: melhor magia de cura disponível. **Recebido/s**: dano médio do monstro de referência após armadura, bloqueio e reduções.
- **Matar**: tempo para matar o monstro de referência com DPS máx. **Morrer**: tempo até morrer apanhando dele sem se curar (descontada a regeneração).

| Nv | Vocação | Monstro | Vida | Mana | Arm. | DPS auto | DPS regen | DPS máx. | Cura/s | Cura/mana | Recebido/s | Matar | Morrer |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Knight | Slime do Musgo | 210 | 70 | 8 | 7.2 | 8.3 | 15.3 | 7.8 | 0.78 | 2.5 | 2.6 s | 210 s |
| 1 | Paladin | Slime do Musgo | 175 | 90 | 8 | 7.6 | 9.3 | 20.6 | 10.0 | 1.00 | 2.5 | 1.9 s | 117 s |
| 1 | Sorcerer | Slime do Musgo | 145 | 175 | 5 | 7.0 | 7.7 | 11.3 | 10.8 | 1.07 | 2.5 | 3.5 s | 73 s |
| 1 | Druid | Slime do Musgo | 145 | 175 | 5 | 4.4 | 4.9 | 7.8 | 13.0 | 1.30 | 2.5 | 5.1 s | 73 s |
| 3 | Knight | Javali Espinhento | 240 | 80 | 13 | 10.3 | 11.8 | 21.2 | 7.8 | 0.78 | 0.0 | 2.9 s | 2400 s |
| 3 | Paladin | Javali Espinhento | 195 | 120 | 13 | 8.8 | 9.9 | 32.7 | 12.0 | 1.20 | 0.0 | 1.9 s | 1950 s |
| 3 | Sorcerer | Javali Espinhento | 161 | 235 | 5 | 6.4 | 7.3 | 19.3 | 16.0 | 1.60 | 1.9 | 3.2 s | 114 s |
| 3 | Druid | Javali Espinhento | 161 | 231 | 5 | 5.6 | 6.1 | 23.7 | 20.0 | 2.00 | 1.9 | 2.6 s | 114 s |
| 5 | Knight | Goblin Saqueador | 270 | 90 | 13 | 12.9 | 16.6 | 26.8 | 9.3 | 0.93 | 0.1 | 3.0 s | 2700 s |
| 5 | Paladin | Goblin Saqueador | 215 | 150 | 13 | 15.3 | 17.7 | 59.2 | 14.0 | 1.40 | 0.1 | 1.4 s | 2150 s |
| 5 | Sorcerer | Goblin Saqueador | 177 | 295 | 5 | 6.9 | 8.7 | 23.2 | 19.5 | 1.95 | 2.3 | 3.5 s | 135 s |
| 5 | Druid | Goblin Saqueador | 177 | 287 | 5 | 6.1 | 6.9 | 25.8 | 35.5 | 0.89 | 2.3 | 3.1 s | 135 s |
| 8 | Knight | Lobo Cinzento | 290 | 105 | 17 | 21.6 | 27.0 | 53.5 | 9.5 | 0.95 | 0.1 | 1.9 s | 2900 s |
| 8 | Paladin | Lobo Cinzento | 220 | 195 | 17 | 21.0 | 25.1 | 91.2 | 17.5 | 1.75 | 0.1 | 1.1 s | 2200 s |
| 8 | Sorcerer | Lobo Cinzento | 176 | 405 | 6 | 13.3 | 16.0 | 40.2 | 30.3 | 3.02 | 4.0 | 2.5 s | 58 s |
| 8 | Druid | Lobo Cinzento | 176 | 391 | 6 | 10.4 | 11.5 | 38.6 | 53.5 | 1.34 | 4.0 | 2.6 s | 58 s |
| 10 | Knight | Aranha das Ruínas | 370 | 75 | 23 | 25.2 | 31.6 | 62.5 | 11.0 | 1.10 | 8.2 | 2.0 s | 65 s |
| 10 | Paladin | Aranha das Ruínas | 290 | 185 | 23 | 29.3 | 35.0 | 127.8 | 23.5 | 0.94 | 8.2 | 1.0 s | 47 s |
| 10 | Sorcerer | Aranha das Ruínas | 192 | 545 | 9 | 14.3 | 17.8 | 48.6 | 37.3 | 3.73 | 8.2 | 2.5 s | 29 s |
| 10 | Druid | Aranha das Ruínas | 192 | 527 | 9 | 15.4 | 16.8 | 52.6 | 65.5 | 1.64 | 8.2 | 2.4 s | 29 s |
| 12 | Knight | Esqueleto Guerreiro | 400 | 85 | 26 | 33.2 | 43.7 | 79.3 | 11.3 | 1.13 | 0.1 | 2.0 s | 4000 s |
| 12 | Paladin | Esqueleto Guerreiro | 310 | 215 | 24 | 33.7 | 44.1 | 175.8 | 25.8 | 1.03 | 0.9 | 0.9 s | 3100 s |
| 12 | Sorcerer | Esqueleto Guerreiro | 208 | 605 | 9 | 22.8 | 25.6 | 71.7 | 41.0 | 4.10 | 5.0 | 2.2 s | 59 s |
| 12 | Druid | Esqueleto Guerreiro | 208 | 583 | 9 | 16.2 | 17.5 | 66.0 | 72.0 | 1.80 | 5.0 | 2.4 s | 59 s |
| 15 | Knight | Chefe Goblin | 515 | 100 | 29 | 37.3 | 49.3 | 89.8 | 20.8 | 0.69 | 17.5 | 7.7 s | 35 s |
| 15 | Paladin | Chefe Goblin | 410 | 260 | 26 | 43.6 | 54.3 | 190.2 | 28.3 | 1.13 | 34.5 | 3.6 s | 13 s |
| 15 | Sorcerer | Chefe Goblin | 232 | 775 | 10 | 22.0 | 25.2 | 79.3 | 50.0 | 5.00 | 33.0 | 8.8 s | 7 s |
| 15 | Druid | Chefe Goblin | 232 | 747 | 10 | 18.3 | 20.0 | 84.6 | 87.3 | 2.18 | 33.0 | 8.2 s | 7 s |
| 18 | Knight | Chefe Goblin | 600 | 115 | 34 | 49.8 | 68.7 | 115.9 | 22.8 | 0.76 | 16.5 | 6.0 s | 44 s |
| 18 | Paladin | Chefe Goblin | 440 | 305 | 26 | 49.8 | 64.5 | 217.2 | 32.3 | 1.29 | 34.5 | 3.2 s | 14 s |
| 18 | Sorcerer | Chefe Goblin | 256 | 965 | 11 | 29.7 | 33.1 | 98.8 | 60.5 | 6.05 | 30.6 | 7.0 s | 9 s |
| 18 | Druid | Chefe Goblin | 256 | 931 | 11 | 29.0 | 30.9 | 109.5 | 105.5 | 2.64 | 30.6 | 6.3 s | 9 s |
| 20 | Knight | Chefe Goblin | 630 | 125 | 34 | 54.1 | 82.6 | 194.4 | 24.0 | 0.80 | 16.5 | 3.6 s | 48 s |
| 20 | Paladin | Chefe Goblin | 460 | 335 | 26 | 53.9 | 76.4 | 350.3 | 34.5 | 1.38 | 34.5 | 2.0 s | 15 s |
| 20 | Sorcerer | Chefe Goblin | 272 | 1025 | 11 | 30.5 | 35.1 | 167.7 | 65.8 | 6.58 | 30.3 | 4.1 s | 10 s |
| 20 | Druid | Chefe Goblin | 272 | 987 | 11 | 29.8 | 33.4 | 152.1 | 114.5 | 2.86 | 30.3 | 4.6 s | 10 s |

## Equipamento considerado

| Nv | Vocação | Itens |
|---|---|---|
| 1 | Knight | Machadinha, Elmo de Ferro, Amuleto Arcano, Armadura de Couro, Calças de Couro, Anel do Vigor, Botas de Couro, Escudo de Madeira |
| 1 | Paladin | Arco de Caça, Elmo de Ferro, Amuleto Arcano, Armadura de Couro, Calças de Couro, Anel do Vigor, Botas de Couro |
| 1 | Sorcerer | Varinha de Brasa, Chapéu de Mago, Amuleto Arcano, Manto do Aprendiz, Calças de Couro, Anel do Vigor, Botas de Couro, Grimório do Aprendiz |
| 1 | Druid | Cajado do Broto, Chapéu de Mago, Amuleto Arcano, Manto do Aprendiz, Calças de Couro, Anel do Vigor, Botas de Couro, Grimório do Aprendiz |
| 3 | Knight | Maça de Ferro, Elmo de Ferro, Amuleto Arcano, Cota de Malha, Calças de Malha, Anel do Vigor, Botas de Couro, Escudo de Madeira |
| 3 | Paladin | Arco de Caça, Elmo de Ferro, Amuleto Arcano, Cota de Malha, Calças de Malha, Anel do Vigor, Botas de Couro |
| 3 | Sorcerer | Varinha de Brasa, Chapéu de Mago, Amuleto Arcano, Manto do Aprendiz, Calças de Couro, Anel do Vigor, Botas de Couro, Grimório do Aprendiz |
| 3 | Druid | Cajado do Broto, Chapéu de Mago, Amuleto Arcano, Manto do Aprendiz, Calças de Couro, Anel do Vigor, Botas de Couro, Grimório do Aprendiz |
| 5 | Knight | Espada de Ferro, Elmo de Ferro, Amuleto Arcano, Cota de Malha, Calças de Malha, Anel do Vigor, Botas Ligeiras, Escudo de Ferro |
| 5 | Paladin | Arco Composto, Elmo de Ferro, Amuleto Arcano, Cota de Malha, Calças de Malha, Anel do Vigor, Botas Ligeiras |
| 5 | Sorcerer | Varinha de Brasa, Chapéu de Mago, Amuleto Arcano, Manto do Aprendiz, Calças de Couro, Anel do Vigor, Botas Ligeiras, Grimório do Aprendiz |
| 5 | Druid | Cajado do Broto, Chapéu de Mago, Amuleto Arcano, Manto do Aprendiz, Calças de Couro, Anel do Vigor, Botas Ligeiras, Grimório do Aprendiz |
| 8 | Knight | Espada de Aço, Elmo de Aço, Amuleto Arcano, Cota de Escamas, Calças de Malha, Anel da Força, Botas Ligeiras, Escudo de Aço |
| 8 | Paladin | Arco Composto, Elmo de Aço, Amuleto Arcano, Cota de Escamas, Calças de Malha, Anel da Força, Botas Ligeiras |
| 8 | Sorcerer | Varinha da Tempestade, Chapéu de Mago, Amuleto Arcano, Manto do Aprendiz, Calças de Seda, Anel da Sabedoria, Botas Ligeiras, Grimório do Aprendiz |
| 8 | Druid | Cajado Gélido, Chapéu de Mago, Amuleto Arcano, Manto do Aprendiz, Calças de Seda, Anel da Sabedoria, Botas Ligeiras, Grimório do Aprendiz |
| 10 | Knight | Martelo de Guerra, Elmo de Aço, Amuleto Guardião, Cota de Escamas, Calças de Placas, Anel da Força, Botas de Aço, Escudo de Aço |
| 10 | Paladin | Arco Élfico, Elmo de Aço, Amuleto Guardião, Cota de Escamas, Calças de Placas, Anel da Força, Botas de Aço |
| 10 | Sorcerer | Varinha da Tempestade, Capuz do Feiticeiro, Amuleto Arcano, Manto Místico, Calças de Seda, Anel da Sabedoria, Botas Ligeiras, Tomo do Adepto |
| 10 | Druid | Cajado Gélido, Capuz do Feiticeiro, Amuleto Arcano, Manto Místico, Calças de Seda, Anel da Sabedoria, Botas Ligeiras, Tomo do Adepto |
| 12 | Knight | Espada Rúnica, Elmo de Aço, Amuleto Guardião, Armadura de Placas, Calças de Placas, Anel da Força, Botas de Aço, Escudo de Aço |
| 12 | Paladin | Arco Élfico, Elmo de Aço, Amuleto Guardião, Gibão do Patrulheiro, Calças de Placas, Anel da Força, Botas de Aço |
| 12 | Sorcerer | Varinha do Inferno, Capuz do Feiticeiro, Amuleto Arcano, Manto Místico, Calças de Seda, Anel da Sabedoria, Botas Ligeiras, Tomo do Adepto |
| 12 | Druid | Cajado de Espinheiro, Capuz do Feiticeiro, Amuleto Arcano, Manto Místico, Calças de Seda, Anel da Sabedoria, Botas Ligeiras, Tomo do Adepto |
| 15 | Knight | Estrela da Manhã, Elmo Real, Amuleto Guardião, Armadura de Placas, Calças de Placas, Anel da Vida, Botas de Aço, Escudo Torre |
| 15 | Paladin | Arco Real, Elmo Real, Amuleto Guardião, Gibão do Patrulheiro, Calças de Placas, Anel da Vida, Botas de Aço |
| 15 | Sorcerer | Varinha do Inferno, Capuz do Feiticeiro, Amuleto do Arquimago, Manto Místico, Calças de Seda, Anel da Sabedoria, Botas do Vento, Tomo do Adepto |
| 15 | Druid | Cajado de Espinheiro, Capuz do Feiticeiro, Amuleto do Arquimago, Manto Místico, Calças de Seda, Anel da Sabedoria, Botas do Vento, Tomo do Adepto |
| 18 | Knight | Lâmina do Dragão, Elmo Real, Amuleto Guardião, Armadura Real, Calças Reais, Anel da Vida, Botas de Aço, Escudo Torre |
| 18 | Paladin | Arco Real, Elmo Real, Amuleto Guardião, Gibão do Patrulheiro, Calças de Placas, Anel da Vida, Botas de Aço |
| 18 | Sorcerer | Varinha do Vazio, Capuz do Feiticeiro, Amuleto do Arquimago, Manto do Arquimago, Calças de Seda, Anel da Sabedoria, Botas do Vento, Códice do Arquimago |
| 18 | Druid | Cajado da Geleira, Capuz do Feiticeiro, Amuleto do Arquimago, Manto do Arquimago, Calças de Seda, Anel da Sabedoria, Botas do Vento, Códice do Arquimago |
| 20 | Knight | Lâmina do Dragão, Elmo Real, Amuleto Guardião, Armadura Real, Calças Reais, Anel da Vida, Botas de Aço, Escudo Torre |
| 20 | Paladin | Arco Real, Elmo Real, Amuleto Guardião, Gibão do Patrulheiro, Calças de Placas, Anel da Vida, Botas de Aço |
| 20 | Sorcerer | Varinha do Vazio, Capuz do Feiticeiro, Amuleto do Arquimago, Manto do Arquimago, Calças de Seda, Anel da Sabedoria, Botas do Vento, Códice do Arquimago |
| 20 | Druid | Cajado da Geleira, Capuz do Feiticeiro, Amuleto do Arquimago, Manto do Arquimago, Calças de Seda, Anel da Sabedoria, Botas do Vento, Códice do Arquimago |
