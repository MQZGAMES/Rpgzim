// Heróis: personagens-jogadores com as mesmas regras do jogador (skills, nível, lojas, banco, morte).
// Podem ser escolhidos na tela inicial; quando ninguém os controla, vivem sozinhos no mundo.
import type { HeroDef } from '../domain/entities/definitions';

const boladex: HeroDef = {
  id: 'boladex',
  slotId: 'boladex',
  name: 'Boladex',
  title: 'Knight aventureiro',
  vocation: 'knight',
  // corajoso e falador, gosta de ouro, treina quando sobra tempo
  temperament: { bravery: 0.75, greed: 0.6, discipline: 0.55, sociability: 0.7, caution: 0.45 },
  lines: {
    hunt: ['Bora caçar {monster}!', 'Partiu {area}! Hoje volto rico.', 'Escudo no braço, espada na mão. Vamos!'],
    town: ['Mochila pesada... hora de voltar pra vila.', 'Vou vender esse loot todo.', 'Chega por agora, vila!'],
    sell: ['Vendido! +{gold} de ouro na bolsa.', 'Negócio fechado. Ilário adora meus despojos.'],
    buy: ['Estoque de poções renovado.', 'Poção nunca é demais.'],
    upgrade: ['Equipamento novo: {item}! Olha que beleza.', 'Agora sim, {item} no corpo!'],
    bank: ['Guardando um pouco no banco. Tô juntando pra algo melhor.', 'Banqueira Clara, cuida bem do meu ouro!'],
    train: ['Dia de treino. A espada não afia sozinha.', 'Vou treinar um pouco com os slimes.'],
    trainDone: ['Treino feito! {skill} tá subindo.', 'Pronto, chega de bater em slime.'],
    retreat: ['Tô quase morto, vou recuar!', 'Opa, opa... hora de correr!'],
    death: ['Aff... {monster} me pegou de jeito.', 'Morri de novo. Ninguém viu isso, ok?', 'Volto mais forte, {monster}!'],
    levelUp: ['UHUL! Nível {level}! O Boladex tá voando!', 'Nível {level}! Ninguém segura!'],
    skillUp: ['{skill} subiu! Treino dá resultado.', 'Olha o {skill} melhorando!'],
    kill: ['Menos um!', 'Fácil demais.', 'Próximo!'],
    rareLoot: ['Olha só: {item}! Dia de sorte!', 'Caiu {item}! Aê!'],
    idle: ['Que dia bonito em Pedraluz.', 'Alguém aí quer caçar comigo?', 'Essa fonte é a mais bonita da região.', 'Será que o Chefe Goblin tá por aí?'],
    greetPlayer: ['E aí, {player}! Bora caçar junto?', 'Fala, {player}! Cuidado com os goblins.', 'Opa, {player}! Tudo certo por aí?'],
    help: ['Deixa comigo, {player}!', 'Segura que eu ajudo!'],
    status: ['Nível {level}, {area}. Tô com {gold} de ouro e {potions} poções.'],
  },
};

export const HEROES: Readonly<Record<string, HeroDef>> = { [boladex.id]: boladex };
