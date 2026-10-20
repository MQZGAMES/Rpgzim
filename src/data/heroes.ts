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
    explore: ['Nunca cacei {monster}... bora conhecer!', 'Hoje vou testar outro lugar: {monster}.'],
    comment: ['{player}, nível {plevel} já? Tá evoluindo rápido!', 'Bonita essa arma, {player}. {weapon}, né?', 'Ô {player}, cuidado com os esqueletos das ruínas.', 'Tô de olho em você, {player}. Brincadeira!'],
    invite: ['{player}, bora fazer grupo? A XP é dividida igual!', 'Ei {player}, caça comigo? Te mandei convite.'],
    inviteAccept: ['Fechado, {player}! Bora junto.', 'Grupo formado! Cola em mim, {player}.', 'Aceito! Vamos dividir essa XP.'],
    inviteDecline: ['Agora não, {player}. Tô focado.', 'Valeu, {player}, mas prefiro caçar sozinho hoje.', 'Hoje não, {player}. Quem sabe mais tarde.'],
    partyLeave: ['{player}, você sumiu... vou caçar sozinho. Até mais!', 'Grupo parado não dá XP. Fui!'],
    followLeader: ['Tô logo atrás, {player}!', 'Pode ir na frente que eu cubro.'],
    gift: ['Toma uma poção, {player}! Não morre não.', '{player}, bebe isso aqui, rápido!'],
    pkThreat: ['Passa o ouro, {player}!', 'Nada pessoal, {player}... só negócios.', '{player}, esse ouro todo vai ficar comigo.'],
    pkWin: ['GG, {player}. Fica pra próxima.', 'Obrigado pelo ouro, {player}!'],
    pkLose: ['{player}... isso não vai ficar assim.', 'Você me pegou, {player}. Mas eu volto.'],
    pkSpare: ['Nem vou perder tempo, {player}: você não tem nada.', 'Relaxa, {player}, você tá liso demais pra valer a pena.'],
    pkEscaped: ['Correu, {player}? Covarde!', 'Fugiu pra vila, né, {player}...'],
    revenge: ['Você vai pagar, {player}!', 'Achou que eu ia deixar barato, {player}?'],
    flee: ['Opa, {player} tá forte demais. Tô fora!', 'Melhor eu sair daqui...'],
    recover: ['Perdi tudo! Vou buscar minhas coisas.', 'Ainda dá tempo de pegar meu equipamento de volta.', 'Aquele saco lá é meu!'],
    pkWish: ['Liga o PK aí, {player}... quero ver se você aguenta.', 'Às vezes dá vontade de testar a espada em gente, {player}.', 'Se o PK estivesse ligado, {player}... hehe.'],
  },
};

// Os outros três compartilham as falas neutras do Boladex (venda, banco, grupo, PK...) e trocam as que têm a cara de cada um.
const shared = boladex.lines;

const maguim: HeroDef = {
  id: 'maguim',
  slotId: 'maguim',
  name: 'Maguim',
  title: 'Sorcerer explosivo',
  vocation: 'sorcerer',
  // arrojado com a mana, ganancioso e meio solitário: gosta de caçar de longe e ver tudo explodir
  temperament: { bravery: 0.6, greed: 0.7, discipline: 0.5, sociability: 0.45, caution: 0.5 },
  lines: {
    ...shared,
    hunt: ['Hora de queimar {monster}!', '{area} vai ficar bem iluminada.', 'Mana cheia, cajado pronto. Vamos!'],
    retreat: ['Mana e vida no fim... recuando!', 'Não sou tanque, tô saindo!'],
    death: ['{monster} chegou perto demais...', 'Faltou mana. Sempre falta mana.', 'Volto com mais poções, {monster}!'],
    levelUp: ['Nível {level}! O poder arcano cresce.', 'Nível {level}! Mais fogo pra todo mundo.'],
    kill: ['Torrado!', 'Fogo resolve.', 'Próximo alvo!'],
    idle: ['Será que vendem mana engarrafada em dobro?', 'Pedraluz é bonita, mas queima bem.', 'Alguém precisa de uma tocha?'],
    greetPlayer: ['Ei, {player}! Fica atrás de mim que eu cuido do fogo.', 'Fala, {player}! Cuidado, eu explodo as coisas.'],
    status: ['Nível {level}, {area}. {gold} de ouro e {potions} poções de vida.'],
    train: ['Hora de afiar a magia.', 'Um pouco de treino arcano.'],
    pkWish: ['Liga o PK aí, {player}... minhas magias querem aquecer.', 'Se o PK estivesse ligado, {player}... boom.'],
  },
};

const manoCura: HeroDef = {
  id: 'mano_cura',
  slotId: 'mano_cura',
  name: 'Mano Cura',
  title: 'Druid curandeiro',
  vocation: 'druid',
  // cuidadoso e sociável: prefere caçar em grupo e cuidar de quem está ferido
  temperament: { bravery: 0.4, greed: 0.35, discipline: 0.6, sociability: 0.85, caution: 0.75 },
  lines: {
    ...shared,
    hunt: ['Vamos com calma até {monster}.', '{area} hoje parece tranquila.', 'A natureza provê. Bora!'],
    retreat: ['Opa, melhor me curar primeiro!', 'Recuando! Curar os outros é mais fácil que a mim.'],
    death: ['Até o curandeiro cai... {monster} foi mais forte.', 'Vou me curar... depois de voltar.', 'Aprendi a lição, {monster}.'],
    levelUp: ['Nível {level}! A natureza sorri pra mim.', 'Nível {level}! Mais cura pra todo mundo.'],
    kill: ['Que a terra o acolha.', 'Desculpa, amigo.', 'Mais um a menos.'],
    idle: ['Alguém ferido por aí? Eu curo!', 'Que ar bom em Pedraluz.', 'Caçar sozinho é triste, né?'],
    greetPlayer: ['Oi, {player}! Posso curar você se precisar.', 'Olá, {player}! Bora caçar juntos, eu cuido da cura.', 'Fala, {player}! Fica por perto que eu te cubro.'],
    help: ['Calma, {player}, vou te curar!', 'Segura aí que eu ajudo!'],
    gift: ['Toma uma poção, {player}! Cuida da vida.', '{player}, bebe isso, por favor!'],
    status: ['Nível {level}, {area}. {gold} de ouro e {potions} poções.'],
    pkWish: ['Prefiro paz, {player}... mas a natureza tem seus espinhos.', 'Hoje não, {player}. Cura é melhor que briga.'],
  },
};

const distanciado: HeroDef = {
  id: 'distanciado',
  slotId: 'distanciado',
  name: 'Distanciado',
  title: 'Paladin caçador',
  vocation: 'paladin',
  // frio e disciplinado: mantém distância, conta cada flecha e só luta quando está no controle
  temperament: { bravery: 0.5, greed: 0.5, discipline: 0.75, sociability: 0.5, caution: 0.65 },
  lines: {
    ...shared,
    hunt: ['Mirando em {monster}.', '{area}: bom campo de tiro.', 'Flechas contadas, bora caçar.'],
    retreat: ['Muito perto! Reposicionando.', 'Sem espaço pra mirar, saindo daqui!'],
    death: ['{monster} furou minha guarda...', 'Errei a distância. Raro, mas acontece.', 'Da próxima, mais longe, {monster}.'],
    levelUp: ['Nível {level}! A mira melhora.', 'Nível {level}! Alvo travado.'],
    kill: ['Na mosca!', 'Um tiro, um acerto.', 'Próximo.'],
    idle: ['Preciso reabastecer as flechas em breve.', 'Silêncio bom em Pedraluz.', 'Quem quiser caçar, eu cubro de longe.'],
    greetPlayer: ['E aí, {player}! Fico atrás e dou cobertura.', 'Fala, {player}. Se um bicho chegar perto, eu abato.'],
    status: ['Nível {level}, {area}. {gold} de ouro, {potions} poções.'],
    pkWish: ['Liga o PK, {player}... minha mira anda afiada.', 'Se o PK estivesse ligado, {player}... só um tiro.'],
  },
};

export const HEROES: Readonly<Record<string, HeroDef>> = { [boladex.id]: boladex, [maguim.id]: maguim, [manoCura.id]: manoCura, [distanciado.id]: distanciado };
