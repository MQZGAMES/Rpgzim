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
    hunt: [
      'Bora caçar {monster}!',
      'Partiu {area}! Hoje volto rico.',
      'Escudo no braço, espada na mão. Vamos!',
    ],
    town: [
      'Mochila pesada... hora de voltar pra vila.',
      'Vou vender esse loot todo.',
      'Chega por agora, vila!',
    ],
    sell: ['Vendido! +{gold} de ouro na bolsa.', 'Negócio fechado. Ilário adora meus despojos.'],
    buy: ['Estoque de poções renovado.', 'Poção nunca é demais.'],
    upgrade: ['Equipamento novo: {item}! Olha que beleza.', 'Agora sim, {item} no corpo!'],
    bank: [
      'Guardando um pouco no banco. Tô juntando pra algo melhor.',
      'Banqueira Clara, cuida bem do meu ouro!',
    ],
    train: ['Dia de treino. A espada não afia sozinha.', 'Vou treinar um pouco com os slimes.'],
    trainDone: ['Treino feito! {skill} tá subindo.', 'Pronto, chega de bater em slime.'],
    retreat: ['Tô quase morto, vou recuar!', 'Opa, opa... hora de correr!'],
    death: [
      'Aff... {monster} me pegou de jeito.',
      'Morri de novo. Ninguém viu isso, ok?',
      'Volto mais forte, {monster}!',
    ],
    levelUp: ['UHUL! Nível {level}! O Boladex tá voando!', 'Nível {level}! Ninguém segura!'],
    skillUp: ['{skill} subiu! Treino dá resultado.', 'Olha o {skill} melhorando!'],
    kill: ['Menos um!', 'Fácil demais.', 'Próximo!'],
    rareLoot: ['Olha só: {item}! Dia de sorte!', 'Caiu {item}! Aê!'],
    idle: [
      'Que dia bonito em Pedraluz.',
      'Alguém aí quer caçar comigo?',
      'Essa fonte é a mais bonita da região.',
      'Será que o Chefe Goblin tá por aí?',
    ],
    greetPlayer: [
      'E aí, {player}! Bora caçar junto?',
      'Fala, {player}! Cuidado com os goblins.',
      'Opa, {player}! Tudo certo por aí?',
    ],
    help: ['Deixa comigo, {player}!', 'Segura que eu ajudo!'],
    status: ['Nível {level}, {area}. Tô com {gold} de ouro e {potions} poções.'],
    explore: ['Nunca cacei {monster}... bora conhecer!', 'Hoje vou testar outro lugar: {monster}.'],
    comment: [
      '{player}, nível {plevel} já? Tá evoluindo rápido!',
      'Bonita essa arma, {player}. {weapon}, né?',
      'Ô {player}, cuidado com os esqueletos das ruínas.',
      'Tô de olho em você, {player}. Brincadeira!',
    ],
    invite: [
      '{player}, bora fazer grupo? A XP é dividida igual!',
      'Ei {player}, caça comigo? Te mandei convite.',
    ],
    inviteAccept: [
      'Fechado, {player}! Bora junto.',
      'Grupo formado! Cola em mim, {player}.',
      'Aceito! Vamos dividir essa XP.',
    ],
    inviteDecline: [
      'Agora não, {player}. Tô focado.',
      'Valeu, {player}, mas prefiro caçar sozinho hoje.',
      'Hoje não, {player}. Quem sabe mais tarde.',
    ],
    partyLeave: ['{player}, você sumiu... vou caçar sozinho. Até mais!', 'Grupo parado não dá XP. Fui!'],
    followLeader: ['Tô logo atrás, {player}!', 'Pode ir na frente que eu cubro.'],
    gift: ['Toma uma poção, {player}! Não morre não.', '{player}, bebe isso aqui, rápido!'],
    pkThreat: [
      'Passa o ouro, {player}!',
      'Nada pessoal, {player}... só negócios.',
      '{player}, esse ouro todo vai ficar comigo.',
    ],
    pkWin: ['GG, {player}. Fica pra próxima.', 'Obrigado pelo ouro, {player}!'],
    pkLose: ['{player}... isso não vai ficar assim.', 'Você me pegou, {player}. Mas eu volto.'],
    pkSpare: [
      'Nem vou perder tempo, {player}: você não tem nada.',
      'Relaxa, {player}, você tá liso demais pra valer a pena.',
    ],
    pkEscaped: ['Correu, {player}? Covarde!', 'Fugiu pra vila, né, {player}...'],
    revenge: ['Você vai pagar, {player}!', 'Achou que eu ia deixar barato, {player}?'],
    flee: ['Opa, {player} tá forte demais. Tô fora!', 'Melhor eu sair daqui...'],
    recover: [
      'Perdi tudo! Vou buscar minhas coisas.',
      'Ainda dá tempo de pegar meu equipamento de volta.',
      'Aquele saco lá é meu!',
    ],
    pkWish: [
      'Liga o PK aí, {player}... quero ver se você aguenta.',
      'Às vezes dá vontade de testar a espada em gente, {player}.',
      'Se o PK estivesse ligado, {player}... hehe.',
    ],
    lowPotions: [
      'Só sobraram {potions} poções! Vou à vila vender o loot e comprar mais.',
      'Poção acabando... passo na vila e já volto pra caça.',
    ],
    potionsWarning: [
      'Ei, líder: só tenho {potions} poções! Fico aqui com você, mas quando der passa na vila.',
      'Atenção: {potions} poções na mochila. Não saio do grupo, mas tá apertado.',
    ],
    lure: ['Vem todo mundo pra cá! Atrás de mim, pessoal!', 'Puxei a tela inteira: agora é com vocês!'],
    helpCall: ['Socorro, grupo! Tô cercado aqui!', 'Ajuda aqui, pessoal! Rápido!'],
    dangerSeen: ['Cuidado: {player} tá por aqui. Esse aí é perigoso!', 'Olho no {player}, galera. Vou sair de perto.'],
    revengeLater: ['Ainda não, {player}... mas a conta fica pra depois.', 'Te achei, {player}. Quando eu tiver mais forte, a gente acerta.'],
    goal: ['Tô juntando ouro pra {item} ({gold} de ouro). Nada de gastar à toa!', 'Meta nova: {item}. Cada moeda conta.'],
    supplyRun: ['No ritmo que tô bebendo, a poção não chega ao fim da caça. Vou repor antes!', 'Vou à vila agora, antes de ficar sem poção aqui no meio.'],
    healAlly: ['Segura, {player}, tô te curando!', 'Cura indo, {player}!'],
    holdPos: ['Posição segurada. Daqui não saio!', 'Fico aqui. Quem chegar, apanha.'],
    orderAttack: ['Entendido! Todo mundo nesse alvo!', 'Foco nele!'],
    marketBuy: ['Deixei minha oferta com o Corretor Tadeu. Uma hora alguém vende!', 'Mercado primeiro, loja depois. Economia é tudo.'],
    bye: [
      'Vou nessa, pessoal. Até mais!',
      'Bateu a fome... vou jantar. Já volto!',
      'Chega por hoje. Falou, galera!',
      'Preciso sair um pouco. Depois eu volto!',
    ],
    back: ['Voltei!', 'Cheguei de novo, galera.', 'Opa, de volta. Perdi alguma coisa?', 'De volta ao trabalho!'],
    afk: ['Afk rapidinho.', 'Já volto, 2 minutos.', 'Vou pegar um café, já volto.', 'Segura aí, volto já.'],
    greetHero: ['Eae, {player}!', 'Salve, {player}!', 'Opa, {player}, bom te ver.', 'Fala, {player}! Caçando o quê hoje?'],
    replyHero: ['Eae, {player}! Tudo certo?', 'Salve! Tô de boa, e você?', 'Opa, {player}! Bora upar!', 'Fala! Hoje tá rendendo.'],
    tradeSell: ['Vendendo {item} por {gold} no mercado!', 'Anunciei {item} a {gold}. Tá barato, hein!', 'Alguém quer {item}? Tá no corretor por {gold}.'],
    tradeBuy: ['Compro {item}! Pago {gold}, oferta no mercado.', 'Alguém tem {item}? Pago {gold}.', 'Procuro {item}. Deixei {gold} no corretor.'],
    lfg: ['Alguém pra caçar {monster} comigo?', 'Procuro grupo pra {monster}!', 'Bora caçar junto? Tô em {area}.'],
    tired: ['Tô ficando cansado... mais uma caçada e paro.', 'Bocejei aqui. Mais um pouquinho só.', 'Já tá tarde, hein... última volta.'],
    congrats: ['gz, {player}!', 'Parabéns, {player}! Nível {level}!', 'Aê, {player}! Up!', 'Boa, {player}! Tá voando.'],
    rip: ['F, {player}...', 'Eita, {player} caiu!', 'Volta logo, {player}!', 'Ih... foi mal, {player}.'],
    warAttack: ['Pega o {player}!', 'É guerra, {player}!', 'Foco no {player}, pessoal!', 'Hoje você cai, {player}!'],
    warRaid: ['Vou atrás do {player}.', 'Bora caçar o {player}, galera!', 'O {player} tá dando sopa. Fui!'],
    warWin: ['Menos um! GG, {player}.', '{player} caiu! Próximo!', 'Essa guerra é nossa!'],
    warBetray: ['Nada pessoal, {player}... é guerra.', 'Desculpa, {player}. Cada um por si!', 'Valeu pela companhia, {player}. Agora o ouro é meu.'],
    warHelp: ['Segura aí, {player}, tô chegando!', 'Aguenta, {player}! Indo te ajudar.', 'Tô indo, {player}!'],
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
    hunt: [
      'Hora de queimar {monster}!',
      '{area} vai ficar bem iluminada.',
      'Mana cheia, cajado pronto. Vamos!',
    ],
    retreat: ['Mana e vida no fim... recuando!', 'Não sou tanque, tô saindo!'],
    death: [
      '{monster} chegou perto demais...',
      'Faltou mana. Sempre falta mana.',
      'Volto com mais poções, {monster}!',
    ],
    levelUp: ['Nível {level}! O poder arcano cresce.', 'Nível {level}! Mais fogo pra todo mundo.'],
    kill: ['Torrado!', 'Fogo resolve.', 'Próximo alvo!'],
    idle: [
      'Será que vendem mana engarrafada em dobro?',
      'Pedraluz é bonita, mas queima bem.',
      'Alguém precisa de uma tocha?',
    ],
    greetPlayer: [
      'Ei, {player}! Fica atrás de mim que eu cuido do fogo.',
      'Fala, {player}! Cuidado, eu explodo as coisas.',
    ],
    status: ['Nível {level}, {area}. {gold} de ouro e {potions} poções de vida.'],
    train: ['Hora de afiar a magia.', 'Um pouco de treino arcano.'],
    pkWish: [
      'Liga o PK aí, {player}... minhas magias querem aquecer.',
      'Se o PK estivesse ligado, {player}... boom.',
    ],
    lowPotions: [
      'Poção quase no fim... vou reabastecer e já retorno.',
      'Só {potions} poções. Hora de ir à vila repor o estoque.',
    ],
    potionsWarning: [
      'Líder, restam {potions} poções. Sigo contigo, mas convém reabastecer logo.',
      'Só {potions} poções comigo. Continuo firme, mas fique de olho.',
    ],
    lure: ['Puxando a criaturada pro nosso lado!', 'Cheguem, cheguem... é só mirar!'],
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
    death: [
      'Até o curandeiro cai... {monster} foi mais forte.',
      'Vou me curar... depois de voltar.',
      'Aprendi a lição, {monster}.',
    ],
    levelUp: ['Nível {level}! A natureza sorri pra mim.', 'Nível {level}! Mais cura pra todo mundo.'],
    kill: ['Que a terra o acolha.', 'Desculpa, amigo.', 'Mais um a menos.'],
    idle: ['Alguém ferido por aí? Eu curo!', 'Que ar bom em Pedraluz.', 'Caçar sozinho é triste, né?'],
    greetPlayer: [
      'Oi, {player}! Posso curar você se precisar.',
      'Olá, {player}! Bora caçar juntos, eu cuido da cura.',
      'Fala, {player}! Fica por perto que eu te cubro.',
    ],
    help: ['Calma, {player}, vou te curar!', 'Segura aí que eu ajudo!'],
    healAlly: ['Calma, {player}, a cura já vai!', 'Respira, {player}, tô te curando.'],
    helpCall: ['Me ajudem! Sem o tanque eu não aguento!', 'Socorro! O curandeiro tá apanhando!'],
    gift: ['Toma uma poção, {player}! Cuida da vida.', '{player}, bebe isso, por favor!'],
    status: ['Nível {level}, {area}. {gold} de ouro e {potions} poções.'],
    pkWish: [
      'Prefiro paz, {player}... mas a natureza tem seus espinhos.',
      'Hoje não, {player}. Cura é melhor que briga.',
    ],
    lowPotions: [
      'Minhas poções estão acabando, vou à vila e volto rapidinho.',
      'Só {potions} poções restantes. Reabastecer é sabedoria.',
    ],
    potionsWarning: [
      'Aviso ao líder: {potions} poções restantes. Não saio do seu lado.',
      'Minhas poções: {potions}. Estou com você, mas a vila nos espera em breve.',
    ],
    lure: ['Atraí todos eles, fiquem atrás de mim!', 'Vou trazer a criaturada, preparem a mira!'],
  },
};

const distanciado: HeroDef = {
  id: 'distanciado',
  slotId: 'distanciado',
  name: 'Distanciado',
  title: 'Paladin caçador',
  vocation: 'paladin',
  // frio e disciplinado: mantém distância e só luta quando está no controle
  temperament: { bravery: 0.5, greed: 0.5, discipline: 0.75, sociability: 0.5, caution: 0.65 },
  lines: {
    ...shared,
    hunt: ['Mirando em {monster}.', '{area}: bom campo de tiro.', 'Arco encordado, bora caçar.'],
    retreat: ['Muito perto! Reposicionando.', 'Sem espaço pra mirar, saindo daqui!'],
    death: [
      '{monster} furou minha guarda...',
      'Errei a distância. Raro, mas acontece.',
      'Da próxima, mais longe, {monster}.',
    ],
    levelUp: ['Nível {level}! A mira melhora.', 'Nível {level}! Alvo travado.'],
    kill: ['Na mosca!', 'Um tiro, um acerto.', 'Próximo.'],
    idle: [
      'Preciso de um arco melhor em breve.',
      'Silêncio bom em Pedraluz.',
      'Quem quiser caçar, eu cubro de longe.',
    ],
    greetPlayer: [
      'E aí, {player}! Fico atrás e dou cobertura.',
      'Fala, {player}. Se um bicho chegar perto, eu abato.',
    ],
    status: ['Nível {level}, {area}. {gold} de ouro, {potions} poções.'],
    pkWish: [
      'Liga o PK, {player}... minha mira anda afiada.',
      'Se o PK estivesse ligado, {player}... só um tiro.',
    ],
    lowPotions: [
      'Poções no fim. Vou vender o loot, repor e voltar à mira.',
      'Só {potions} poções. Hora de reabastecer.',
    ],
    potionsWarning: [
      'Líder, {potions} poções sobrando. Sigo na mira, mas logo preciso repor.',
      'Só {potions} poções. Não largo o grupo; avisa quando formos à vila.',
    ],
    lure: ['Puxando todos para a nossa linha de tiro!', 'Atenção: lá vêm eles, mirem!'],
  },
};

/** Falas neutras (sem o nome de nenhum herói) para personagens criados pelo jogador que jogam sozinhos. */
const neutral: Partial<Record<keyof HeroDef['lines'], readonly string[]>> = {
  levelUp: ['Nível {level}! Subindo!', 'Mais um nível: {level}!'],
  idle: ['Dia tranquilo em Pedraluz.', 'Alguém aí quer caçar junto?', 'Hora de planejar a próxima caça.'],
  greetPlayer: ['Oi, {player}! Bora caçar?', 'Fala, {player}! Tudo certo por aí?'],
  sell: ['Vendido! +{gold} de ouro na bolsa.', 'Negócio fechado.'],
  bank: ['Guardando um pouco no banco.', 'Ouro no banco, cabeça tranquila.'],
  status: ['Nível {level}, {area}. {gold} de ouro e {potions} poções.'],
};


type Lines = Partial<Record<keyof HeroDef['lines'], readonly string[]>>;
const BASE_BY_VOCATION: Record<HeroDef['vocation'], HeroDef> = {
  knight: boladex,
  sorcerer: maguim,
  druid: manoCura,
  paladin: distanciado,
};

/** Mais um personagem da casa: as falas do herói da mesma vocação (sem as que citam o nome dele) e as próprias. */
function member(
  id: string,
  name: string,
  title: string,
  vocation: HeroDef['vocation'],
  temperament: HeroDef['temperament'],
  own: Lines,
): HeroDef {
  const lines = { ...BASE_BY_VOCATION[vocation].lines, ...neutral, ...own } as HeroDef['lines'];
  return { id, slotId: id, name, title, vocation, temperament, lines };
}

// ------------------------------------------------------------------ os outros 20 da casa (5 de cada vocação)
const CREW: HeroDef[] = [
  // Knights
  member('ferrolho', 'Ferrolho', 'Knight teimoso', 'knight', { bravery: 0.85, greed: 0.4, discipline: 0.6, sociability: 0.5, caution: 0.35 }, {
    hunt: ['Ferrolho trancou a porta: ninguém passa! Bora em {monster}.', '{area}, aí vou eu.'],
    levelUp: ['Nível {level}! Mais duro que porta de cofre.', 'Nível {level}. Ninguém me abre.'],
    death: ['{monster} arrombou o Ferrolho... vergonha.', 'Até cadeado quebra, {monster}.'],
  }),
  member('brutamontes', 'Brutamontes', 'Knight de força bruta', 'knight', { bravery: 0.9, greed: 0.55, discipline: 0.35, sociability: 0.65, caution: 0.25 }, {
    hunt: ['ESMAGAR {monster}!', 'Brutamontes com fome de {area}!'],
    levelUp: ['NÍVEL {level}! MAIS FORTE!', 'Nível {level}. Músculo novo.'],
    death: ['{monster} bateu mais forte... impossível!', 'Brutamontes caiu. Brutamontes volta.'],
    greetPlayer: ['E aí, {player}! Quer ver eu levantar um javali?', 'Fala, {player}! Bora bater em coisa?'],
  }),
  member('escudao', 'Escudão', 'Knight protetor', 'knight', { bravery: 0.7, greed: 0.35, discipline: 0.75, sociability: 0.8, caution: 0.55 }, {
    hunt: ['Escudo erguido. {monster}, vem que eu seguro.', 'Partiu {area}, alguém quer cobertura?'],
    levelUp: ['Nível {level}! Escudo mais firme.', 'Nível {level}: mais gente cabe atrás de mim.'],
    greetPlayer: ['{player}, se apertar, fica atrás de mim!', 'Oi, {player}! Precisa de um tanque?'],
  }),
  member('marretinha', 'Marretinha', 'Knight baixinho e bravo', 'knight', { bravery: 0.8, greed: 0.65, discipline: 0.45, sociability: 0.6, caution: 0.4 }, {
    hunt: ['Pequeno, mas a marreta é grande! {monster}, segura!', '{area}: hora da marretada.'],
    levelUp: ['Nível {level}! Cresci... no nível.', 'Nível {level}! Marreta afiada.'],
    death: ['{monster} me pegou de surpresa... eu tava abaixado!', 'Marretinha amassado.'],
  }),
  member('dona_bigorna', 'Dona Bigorna', 'Knight veterana', 'knight', { bravery: 0.65, greed: 0.45, discipline: 0.85, sociability: 0.55, caution: 0.6 }, {
    hunt: ['Na minha época, {monster} era mais difícil. Vamos.', '{area}, como nos velhos tempos.'],
    levelUp: ['Nível {level}. Experiência não se compra.', 'Nível {level}, crianças. Aprendam.'],
    greetPlayer: ['Olá, {player}. Já comeu hoje? Caçar com fome não presta.', 'Bom te ver, {player}.'],
  }),
  // Paladins
  member('mira_certa', 'Mira Certa', 'Paladin preciso', 'paladin', { bravery: 0.55, greed: 0.5, discipline: 0.85, sociability: 0.45, caution: 0.6 }, {
    hunt: ['Alvo: {monster}. Distância: perfeita.', '{area}. Vento a favor.'],
    levelUp: ['Nível {level}. Nem pisquei.', 'Nível {level}! Na mosca.'],
    death: ['{monster} estava fora da mira... raro.', 'Errei uma. Só uma.'],
  }),
  member('flechinha', 'Flechinha', 'Paladin animado', 'paladin', { bravery: 0.65, greed: 0.45, discipline: 0.45, sociability: 0.85, caution: 0.45 }, {
    hunt: ['Flechinha na área! Bora, {monster}!', '{area} tá cheio de alvo, que delícia!'],
    levelUp: ['NÍVEL {level}!!! Alguém viu? Alguém viu?', 'Nível {level}! Tô voando igual flecha!'],
    greetPlayer: ['Oiê, {player}! Quer ver minha mira?', '{player}! Bora caçar juntinho?'],
  }),
  member('olho_de_lince', 'Olho de Lince', 'Paladin observador', 'paladin', { bravery: 0.45, greed: 0.55, discipline: 0.7, sociability: 0.35, caution: 0.75 }, {
    hunt: ['Vi {monster} lá longe. Ninguém escapa do Lince.', '{area}. Eu vejo tudo daqui.'],
    levelUp: ['Nível {level}. Enxergo ainda mais longe.', 'Nível {level}.'],
    dangerSeen: ['Vi {player} de longe. Perigoso. Saindo.', '{player} na área... olho aberto, galera.'],
  }),
  member('arqueira_juju', 'Arqueira Juju', 'Paladin aventureira', 'paladin', { bravery: 0.7, greed: 0.6, discipline: 0.55, sociability: 0.7, caution: 0.45 }, {
    hunt: ['Juju partiu pra {area}! Quem vem?', '{monster}, prepara que lá vem flecha!'],
    levelUp: ['Nível {level}! Juju tá on!', 'Nível {level}, e o arco ainda nem esquentou.'],
    death: ['Ai, {monster}... essa doeu.', 'Juju caiu, mas Juju volta!'],
  }),
  member('ze_besta', 'Zé Besta', 'Paladin piadista', 'paladin', { bravery: 0.6, greed: 0.65, discipline: 0.4, sociability: 0.8, caution: 0.5 }, {
    hunt: ['Zé Besta e sua besta contra {monster}. Sacou? Besta!', 'Vou pra {area}, se eu voltar conto a piada.'],
    levelUp: ['Nível {level}! Nada mal pra um besta.', 'Nível {level}! Errei uma flecha e acertei a promoção.'],
    death: ['{monster} me pegou... que besteira.', 'Morri de rir. E de {monster}.'],
  }),
  // Sorcerers
  member('faisquinha', 'Faísquinha', 'Sorcerer iniciante', 'sorcerer', { bravery: 0.55, greed: 0.5, discipline: 0.5, sociability: 0.75, caution: 0.55 }, {
    hunt: ['Faísca na mão, {monster} na mira!', '{area}, vou dar um choquinho.'],
    levelUp: ['Nível {level}! Já sou faísca média.', 'Nível {level}! Tá ficando quente!'],
  }),
  member('pavio_curto', 'Pavio Curto', 'Sorcerer esquentado', 'sorcerer', { bravery: 0.85, greed: 0.6, discipline: 0.3, sociability: 0.45, caution: 0.3 }, {
    hunt: ['{monster} me olhou torto. VAI QUEIMAR.', 'Tô de mau humor. {area}, se prepara.'],
    levelUp: ['Nível {level}. E daí? Quero o próximo.', 'Nível {level}! Agora sim explode mais.'],
    death: ['{monster}... você vai ver quando eu voltar!', 'Isso não vai ficar assim!'],
  }),
  member('chamuscado', 'Chamuscado', 'Sorcerer desastrado', 'sorcerer', { bravery: 0.6, greed: 0.5, discipline: 0.4, sociability: 0.65, caution: 0.5 }, {
    hunt: ['Dessa vez não queimo a sobrancelha. {monster}, lá vou eu.', '{area}... alguém tem um balde?'],
    levelUp: ['Nível {level}! Só um pouco chamuscado.', 'Nível {level}! Cheirinho de cabelo queimado.'],
    death: ['Acho que a explosão foi pra trás...', '{monster} e eu, ambos tostados.'],
  }),
  member('tia_labareda', 'Tia Labareda', 'Sorcerer experiente', 'sorcerer', { bravery: 0.6, greed: 0.45, discipline: 0.8, sociability: 0.6, caution: 0.65 }, {
    hunt: ['Vamos, {monster}. A tia tem compromisso às seis.', '{area}: fogo baixo, cozimento lento.'],
    levelUp: ['Nível {level}, meu bem. Sem pressa.', 'Nível {level}. A receita é paciência.'],
    greetPlayer: ['Oi, {player}, querido! Comeu direito?', '{player}! Cuidado com o fogo, viu?'],
  }),
  member('trovaozinho', 'Trovãozinho', 'Sorcerer barulhento', 'sorcerer', { bravery: 0.75, greed: 0.55, discipline: 0.45, sociability: 0.7, caution: 0.4 }, {
    hunt: ['BRUUUM! {monster}, ouviu esse trovão?', '{area} vai ficar elétrica!'],
    levelUp: ['NÍVEL {level}! KABUM!', 'Nível {level}! Mais volts!'],
  }),
  // Druids
  member('folhagem', 'Folhagem', 'Druid tranquilo', 'druid', { bravery: 0.45, greed: 0.35, discipline: 0.6, sociability: 0.75, caution: 0.7 }, {
    hunt: ['A natureza chama: {area}.', '{monster} faz parte do ciclo... e vai voltar ao ciclo.'],
    levelUp: ['Nível {level}. Cresço devagar, como árvore.', 'Nível {level}. Raízes mais fundas.'],
  }),
  member('dona_salvia', 'Dona Sálvia', 'Druid curandeira', 'druid', { bravery: 0.4, greed: 0.3, discipline: 0.75, sociability: 0.85, caution: 0.75 }, {
    hunt: ['Vou colher umas ervas em {area}. E bater em {monster}.', 'Chá depois da caça, combinado?'],
    levelUp: ['Nível {level}! Minhas ervas agradecem.', 'Nível {level}. A cura fica mais forte.'],
    greetPlayer: ['{player}, você tá pálido. Quer uma cura?', 'Oi, {player}! Se machucar, me chama.'],
  }),
  member('raizinha', 'Raizinha', 'Druid curiosa', 'druid', { bravery: 0.55, greed: 0.5, discipline: 0.45, sociability: 0.7, caution: 0.55 }, {
    hunt: ['O que será que tem em {area}? Vou ver!', '{monster}! Que bicho interessante. Vou acertar ele.'],
    levelUp: ['Nível {level}! Brotei mais um pouco.', 'Nível {level}! Que legal!'],
  }),
  member('curandeiro_tonho', 'Curandeiro Tonho', 'Druid do interior', 'druid', { bravery: 0.6, greed: 0.45, discipline: 0.55, sociability: 0.8, caution: 0.6 }, {
    hunt: ['Ô {monster}, vem cá que o Tonho te benze.', 'Bora pra {area}, sô.'],
    levelUp: ['Nível {level}, uai! Que beleza.', 'Nível {level}. Coisa boa demais da conta.'],
    greetPlayer: ['Ô {player}, chega mais, sô!', 'Bão, {player}? Precisa de reza?'],
  }),
  member('brisa_mansa', 'Brisa Mansa', 'Druid do gelo', 'druid', { bravery: 0.5, greed: 0.4, discipline: 0.7, sociability: 0.5, caution: 0.65 }, {
    hunt: ['Um ventinho gelado em {area}...', '{monster}, sente esse frio?'],
    levelUp: ['Nível {level}. Calma como a brisa.', 'Nível {level}. O inverno chegou.'],
  }),
];

export const HEROES: Readonly<Record<string, HeroDef>> = {
  [boladex.id]: boladex,
  [maguim.id]: maguim,
  [manoCura.id]: manoCura,
  [distanciado.id]: distanciado,
  ...Object.fromEntries(CREW.map((h) => [h.id, h])),
};

/**
 * Personagem criado pelo jogador jogando sozinho (logado pela lista de online): mesma IA dos heróis, com as falas do
 * herói da mesma vocação (trocando as que citam o nome dele) e um temperamento próprio, fixo para cada personagem.
 */
export function customHeroDef(c: { id: string; name: string; vocation: HeroDef['vocation'] }): HeroDef {
  const base = Object.values(HEROES).find((h) => h.vocation === c.vocation) ?? boladex;
  // temperamento estável derivado do id (cada personagem tem o seu jeito, sempre o mesmo)
  let seed = [...c.id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const next = () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return 0.3 + ((seed >>> 8) % 1000) / 1000 * 0.5;
  };
  return {
    id: c.id,
    slotId: c.id,
    name: c.name,
    title: base.title,
    vocation: c.vocation,
    temperament: { bravery: next(), greed: next(), discipline: next(), sociability: next(), caution: next() },
    lines: { ...base.lines, ...neutral } as HeroDef['lines'],
  };
}
