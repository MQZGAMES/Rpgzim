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
| 1 | Knight | Slime do Musgo | 210 | 70 | 8 | 6.3 | 7.2 | 15.7 | 9.0 | 0.90 | 2.5 | 2.5 s | 210 s |
| 1 | Paladin | Slime do Musgo | 175 | 90 | 8 | 5.2 | 6.6 | 13.8 | 11.3 | 1.13 | 2.5 | 2.9 s | 117 s |
| 1 | Sorcerer | Slime do Musgo | 145 | 175 | 5 | 9.9 | 10.8 | 15.9 | 10.0 | 1.00 | 2.5 | 2.5 s | 73 s |
| 1 | Druid | Slime do Musgo | 145 | 175 | 5 | 5.8 | 6.4 | 10.2 | 14.8 | 1.48 | 2.5 | 3.9 s | 73 s |
| 3 | Knight | Javali Espinhento | 240 | 80 | 13 | 8.9 | 10.2 | 21.8 | 9.5 | 0.95 | 0.0 | 2.8 s | 2400 s |
| 3 | Paladin | Javali Espinhento | 195 | 120 | 13 | 5.8 | 7.2 | 20.5 | 13.0 | 1.30 | 0.0 | 3.0 s | 1950 s |
| 3 | Sorcerer | Javali Espinhento | 161 | 235 | 5 | 9.0 | 10.2 | 27.1 | 13.5 | 1.35 | 1.9 | 2.3 s | 114 s |
| 3 | Druid | Javali Espinhento | 161 | 231 | 5 | 7.4 | 8.4 | 22.2 | 19.5 | 1.95 | 1.9 | 2.8 s | 114 s |
| 5 | Knight | Goblin Saqueador | 270 | 90 | 13 | 11.2 | 14.5 | 27.5 | 10.8 | 1.07 | 0.1 | 2.9 s | 2700 s |
| 5 | Paladin | Goblin Saqueador | 215 | 150 | 13 | 11.0 | 14.2 | 34.5 | 14.5 | 1.45 | 0.1 | 2.3 s | 2150 s |
| 5 | Sorcerer | Goblin Saqueador | 177 | 295 | 5 | 9.7 | 12.2 | 32.2 | 15.8 | 1.57 | 2.3 | 2.5 s | 135 s |
| 5 | Druid | Goblin Saqueador | 177 | 287 | 5 | 8.0 | 10.0 | 25.0 | 22.8 | 2.27 | 2.3 | 3.2 s | 135 s |
| 8 | Knight | Lobo Cinzento | 290 | 105 | 17 | 18.8 | 26.2 | 43.7 | 11.5 | 1.15 | 0.1 | 2.3 s | 2900 s |
| 8 | Paladin | Lobo Cinzento | 220 | 195 | 17 | 15.3 | 20.3 | 42.9 | 17.5 | 1.75 | 0.1 | 2.3 s | 2200 s |
| 8 | Sorcerer | Lobo Cinzento | 176 | 405 | 6 | 18.7 | 22.4 | 56.3 | 22.0 | 2.20 | 4.0 | 1.8 s | 58 s |
| 8 | Druid | Lobo Cinzento | 176 | 391 | 6 | 13.7 | 16.4 | 39.8 | 31.8 | 3.17 | 4.0 | 2.5 s | 58 s |
| 10 | Knight | Aranha das Ruínas | 370 | 75 | 23 | 21.9 | 30.6 | 50.9 | 12.8 | 1.27 | 8.2 | 2.4 s | 65 s |
| 10 | Paladin | Aranha das Ruínas | 290 | 185 | 23 | 22.1 | 28.9 | 59.8 | 19.0 | 1.90 | 8.2 | 2.1 s | 47 s |
| 10 | Sorcerer | Aranha das Ruínas | 192 | 545 | 9 | 20.1 | 25.0 | 68.4 | 26.0 | 2.60 | 8.2 | 1.8 s | 29 s |
| 10 | Druid | Aranha das Ruínas | 192 | 527 | 9 | 20.2 | 23.5 | 51.0 | 37.8 | 3.77 | 8.2 | 2.4 s | 29 s |
| 12 | Knight | Esqueleto Guerreiro | 400 | 85 | 26 | 29.0 | 43.3 | 64.7 | 13.5 | 1.35 | 0.1 | 2.5 s | 4000 s |
| 12 | Paladin | Esqueleto Guerreiro | 310 | 215 | 24 | 25.4 | 38.2 | 81.7 | 20.5 | 2.05 | 0.9 | 2.0 s | 3100 s |
| 12 | Sorcerer | Esqueleto Guerreiro | 208 | 605 | 9 | 32.0 | 36.4 | 81.1 | 28.3 | 2.83 | 5.0 | 2.0 s | 59 s |
| 12 | Druid | Esqueleto Guerreiro | 208 | 583 | 9 | 21.3 | 24.3 | 53.5 | 41.0 | 4.10 | 5.0 | 3.0 s | 59 s |
| 15 | Knight | Chefe Goblin | 515 | 100 | 29 | 32.3 | 48.5 | 72.9 | 14.8 | 1.48 | 17.5 | 9.5 s | 35 s |
| 15 | Paladin | Chefe Goblin | 410 | 260 | 26 | 33.4 | 46.3 | 90.2 | 22.5 | 2.25 | 35.6 | 7.7 s | 12 s |
| 15 | Sorcerer | Chefe Goblin | 232 | 775 | 10 | 30.9 | 36.0 | 87.9 | 33.8 | 3.38 | 33.0 | 7.9 s | 7 s |
| 15 | Druid | Chefe Goblin | 232 | 747 | 10 | 24.0 | 28.0 | 66.6 | 48.8 | 4.88 | 33.0 | 10.4 s | 7 s |
| 18 | Knight | Chefe Goblin | 600 | 115 | 34 | 43.3 | 69.1 | 94.8 | 15.5 | 1.55 | 16.5 | 7.3 s | 44 s |
| 18 | Paladin | Chefe Goblin | 440 | 305 | 26 | 38.3 | 56.1 | 103.4 | 25.3 | 2.52 | 35.6 | 6.7 s | 13 s |
| 18 | Sorcerer | Chefe Goblin | 256 | 965 | 11 | 41.7 | 47.0 | 110.4 | 40.0 | 4.00 | 30.6 | 6.3 s | 9 s |
| 18 | Druid | Chefe Goblin | 256 | 931 | 11 | 38.1 | 42.3 | 89.7 | 57.8 | 5.78 | 30.6 | 7.7 s | 9 s |
| 20 | Knight | Chefe Goblin | 630 | 125 | 34 | 47.1 | 80.8 | 103.3 | 17.0 | 1.70 | 16.5 | 6.7 s | 48 s |
| 20 | Paladin | Chefe Goblin | 460 | 335 | 26 | 41.6 | 64.1 | 112.3 | 27.0 | 2.70 | 35.6 | 6.2 s | 14 s |
| 20 | Sorcerer | Chefe Goblin | 272 | 1025 | 11 | 42.8 | 51.9 | 117.9 | 43.0 | 4.30 | 30.3 | 5.9 s | 10 s |
| 20 | Druid | Chefe Goblin | 272 | 987 | 11 | 39.0 | 46.4 | 95.4 | 62.5 | 6.25 | 30.3 | 7.3 s | 10 s |

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
