// Personagens humanoides (vocações, NPCs e goblin) compostos por camadas de templates ASCII:
// cabeça (por estilo de cabelo) + corpo (túnica ou manto, 3 quadros de caminhada) + acessório de cabeça
// + item na mão. Contorno "sel-out" automático e paletas trocáveis garantem consistência entre todos.
import { PixelCanvas, mix, type Color } from './lib/canvas.ts';
import { P, type Ramp } from './lib/palette.ts';

export const FRAME_W = 24;
export const FRAME_H = 32;
const OX = 4; // deslocamento horizontal do template (16 px) dentro do quadro
const OY = 9; // linha do topo da cabeça dentro do quadro

export type Dir = 'down' | 'up' | 'right';
type Frame = 0 | 1 | 2; // parado, passo A, passo B

const check = (rows: string[], name: string) => {
  rows.forEach((r, i) => {
    if (r.length !== 16) throw new Error(`${name}[${i}] tem ${r.length} colunas: "${r}"`);
  });
  return rows;
};

// ------------------------------------------------------------------ cabeças (12 linhas)
const HEAD: Record<string, Record<Dir, string[]>> = {
  short: {
    down: [
      '.....hhhhhh.....',
      '...hhhhhhhhhh...',
      '..hhhhiiihhhhh..',
      '..hhhiihhhhhhH..',
      '..hhhhhhhhhhhH..',
      '..hhhhhhhhhhhH..',
      '..hhsshhhsshhH..',
      '..hssssssssssh..',
      '..hssessssessh..',
      '..hssessssessh..',
      '..hsrssssssrsh..',
      '....ssssssss....',
    ],
    up: [
      '.....hhhhhh.....',
      '...hhhhhhhhhh...',
      '..hhhhiiihhhhh..',
      '..hhhiihhhhhhH..',
      '..hhhhhhhhhhhH..',
      '..hhhhhhhhhhhH..',
      '..hhhhhhhhhhhH..',
      '..hhhhhhhhhhhH..',
      '..HhhhhhhhhhhH..',
      '..HhhhhhhhhhHH..',
      '...HhhhhhhhhH...',
      '....SssssssS....',
    ],
    right: [
      '.....hhhhhh.....',
      '...hhhhhhhhhh...',
      '..hhhhiiihhhhh..',
      '..hhhiihhhhhhh..',
      '..hhhhhhhhhhhh..',
      '..hhhhhhhhhhhh..',
      '..Hhhhhhhhsshh..',
      '..Hhhhhhssssss..',
      '..Hhhhhhsssess..',
      '..HhhhhSsssess..',
      '..HHhhhsssrsss..',
      '....HHssssss....',
    ],
  },
  long: {
    down: [
      '.....hhhhhh.....',
      '...hhhhhhhhhh...',
      '..hhhhiiihhhhh..',
      '..hhhiihhhhhhH..',
      '..hhhhhhhhhhhH..',
      '..hhhhhhhhhhhH..',
      '..hhsshhhsshhH..',
      '..hssssssssssh..',
      '.hhssessssesshh.',
      '.hhssessssesshH.',
      '.hhsrssssssrshH.',
      '.hhHssssssssHHH.',
    ],
    up: [
      '.....hhhhhh.....',
      '...hhhhhhhhhh...',
      '..hhhhiiihhhhh..',
      '..hhhiihhhhhhH..',
      '..hhhhhhhhhhhH..',
      '..hhhhhhhhhhhH..',
      '..hhhhhhhhhhhH..',
      '..hhhhhhhhhhhH..',
      '.hhhhhhhhhhhhhH.',
      '.hhhhhhhhhhhhHH.',
      '.HhhhhhhhhhhhHH.',
      '.HHhhhhhhhhhHHH.',
    ],
    right: [
      '.....hhhhhh.....',
      '...hhhhhhhhhh...',
      '..hhhhiiihhhhh..',
      '..hhhiihhhhhhh..',
      '..hhhhhhhhhhhh..',
      '..hhhhhhhhhhhh..',
      '..Hhhhhhhhsshh..',
      '.hHhhhhhssssss..',
      '.hHhhhhhsssess..',
      '.hHhhhhSsssess..',
      '.hHHhhhsssrsss..',
      '.HHHHHHssssss...',
    ],
  },
  bald: {
    down: [
      '.....ssssss.....',
      '...sslllsssss...',
      '..ssllssssssSs..',
      '..sllssssssssS..',
      '..sssssssssssS..',
      '..sssssssssssS..',
      '..hhsssssssshh..',
      '..hssssssssssh..',
      '..hssessssessh..',
      '..hssessssessh..',
      '..hhhhhhhhhhhh..',
      '....hhhhhhhh....',
    ],
    up: [
      '.....ssssss.....',
      '...sslllsssss...',
      '..ssllssssssSs..',
      '..sllssssssssS..',
      '..sssssssssssS..',
      '..sssssssssssS..',
      '..hssssssssssh..',
      '..hhssssssssHh..',
      '..hhhhhhhhhhhh..',
      '..HhhhhhhhhhHH..',
      '...HhhhhhhhhH...',
      '....SssssssS....',
    ],
    right: [
      '.....ssssss.....',
      '...sslllsssss...',
      '..ssllssssssss..',
      '..sllsssssssss..',
      '..ssssssssssss..',
      '..ssssssssssss..',
      '..hhsssssssssss.',
      '..hhhsssssssss..',
      '..hhhhSssssess..',
      '..hhhhSssssess..',
      '..HhhhhhhhhhhH..',
      '....Hhhhhhhhh...',
    ],
  },
  skull: {
    down: [
      '.....ssssss.....',
      '...ssllssssss...',
      '..ssllssssssSS..',
      '..slssssssssSS..',
      '..ssssssssssSS..',
      '..ssssssssssSS..',
      '..sseesssseeSS..',
      '..sseesssseeSS..',
      '..sssssSsssssS..',
      '...SsssssssSS...',
      '....s.s.s.s.....',
      '....ssssssss....',
    ],
    up: [
      '.....ssssss.....',
      '...ssllssssss...',
      '..ssllssssssSS..',
      '..slssssssssSS..',
      '..ssssssssssSS..',
      '..ssssssssssSS..',
      '..ssssssssssSS..',
      '..ssssssssssSS..',
      '..SsssssssssSS..',
      '...SsssssssSS...',
      '....SSSSSSSS....',
      '....ssssssss....',
    ],
    right: [
      '.....ssssss.....',
      '...ssllssssss...',
      '..ssllssssssss..',
      '..slssssssssss..',
      '..SSssssssssss..',
      '..SSssssssssss..',
      '..SSsssssseess..',
      '..SSsssssseess..',
      '..SSssssssssSs..',
      '...SSsssssss....',
      '....SSs.s.s.....',
      '....SSssssss....',
    ],
  },
  goblin: {
    down: [
      '................',
      '....hhh.hhh.....',
      '...ssssssssss...',
      '..sllsssssssSS..',
      '.ssssssssssssSS.',
      'sssssssssssssSSS',
      '.SssssssssssssS.',
      '..ssyesssseysS..',
      '..sseesssseesS..',
      '..sssssllsssSS..',
      '...sswwwwwwsS...',
      '....SssssssS....',
    ],
    up: [
      '................',
      '....hhh.hhh.....',
      '...ssssssssss...',
      '..sllsssssssSS..',
      '.ssssssssssssSS.',
      'sssssssssssssSSS',
      '.SssssssssssssS.',
      '..ssssssssssSS..',
      '..ssssssssssSS..',
      '..SsssssssssSS..',
      '...SssssssssS...',
      '....SssssssS....',
    ],
    right: [
      '................',
      '....hhh.hh......',
      '...ssssssssss...',
      '..sllsssssssss..',
      '..sssssssssssss.',
      'ssSSssssssssssss',
      '.SSSsssssssssss.',
      '..SSsssssssyess.',
      '..SSsssssssseess',
      '..SSssssssssssl.',
      '...SSsssssswwww.',
      '....SSsssssss...',
    ],
  },
};

// ------------------------------------------------------------------ corpos (10 linhas: 12..21)
type BodyKind = 'tunic' | 'robe';
const BODY: Record<BodyKind, Record<Dir, [string[], string[], string[]]>> = {
  tunic: {
    down: [
      [
        '...ccccaacccc...',
        '..kccckkkccCCC..',
        '..kccckkkccCCC..',
        '..kccckkkccCCC..',
        '..kcaaaaaaaACC..',
        '..sscckkkccCSS..',
        '....cckkkccC....',
        '....ppp..ppP....',
        '....bbb..bbB....',
        '...bbbB..bbbB...',
      ],
      [
        '...ccccaacccc...',
        '..kccckkkccCCC..',
        '..kccckkkccCCC..',
        '..kccckkkccCCC..',
        '..kcaaaaaaaACC..',
        '..sscckkkccCSS..',
        '....cckkkccC....',
        '....ppp..ppP....',
        '....bbb..bbB....',
        '...bbbB.........',
      ],
      [
        '...ccccaacccc...',
        '..kccckkkccCCC..',
        '..kccckkkccCCC..',
        '..kccckkkccCCC..',
        '..kcaaaaaaaACC..',
        '..sscckkkccCSS..',
        '....cckkkccC....',
        '....ppp..ppP....',
        '....bbB..bbB....',
        '.........bbbB...',
      ],
    ],
    up: [
      [
        '...cccccccccc...',
        '..kccccccccCCC..',
        '..kccccccccCCC..',
        '..kccccccccCCC..',
        '..kcaaaaaaaACC..',
        '..ssccccccccSS..',
        '....cccccccC....',
        '....ppp..ppP....',
        '....bbb..bbB....',
        '...bbbB..bbbB...',
      ],
      [
        '...cccccccccc...',
        '..kccccccccCCC..',
        '..kccccccccCCC..',
        '..kccccccccCCC..',
        '..kcaaaaaaaACC..',
        '..ssccccccccSS..',
        '....cccccccC....',
        '....ppp..ppP....',
        '....bbb..bbB....',
        '.........bbbB...',
      ],
      [
        '...cccccccccc...',
        '..kccccccccCCC..',
        '..kccccccccCCC..',
        '..kccccccccCCC..',
        '..kcaaaaaaaACC..',
        '..ssccccccccSS..',
        '....cccccccC....',
        '....ppp..ppP....',
        '....bbB..bbB....',
        '...bbbB.........',
      ],
    ],
    right: [
      [
        '....ckkcccCC....',
        '....kkcCccCC....',
        '....kccCccCC....',
        '....kccCccCC....',
        '....aaaCaaAA....',
        '....kccsscCC....',
        '.....ccccCC.....',
        '.....ppppP......',
        '.....bbbbB......',
        '.....bbbbbB.....',
      ],
      [
        '....ckkcccCC....',
        '....kkcCccCC....',
        '....kccCccCC....',
        '....kcCccCCC....',
        '....aaCaaaAA....',
        '....kssccccC....',
        '.....ccccCC.....',
        '....pPP..ppP....',
        '...bbB....bbB...',
        '...bB......bbB..',
      ],
      [
        '....ckkcccCC....',
        '....kkcCccCC....',
        '....kccCccCC....',
        '....kccCcCCC....',
        '....aaaaCaAA....',
        '....kcccsscC....',
        '.....ccccCC.....',
        '.....pPpPp......',
        '....bbBbbB......',
        '....bBBbbbB.....',
      ],
    ],
  },
  robe: {
    down: [
      [
        '...ccccaacccc...',
        '..kccckaakcCCC..',
        '..kccckaakcCCC..',
        '..kccckaakcCCC..',
        '..kcaaaaaaaACC..',
        '..ssccckakcCSS..',
        '...kcccakkcCC...',
        '...kcccakkcCC...',
        '..kaaaaaaaaaaA..',
        '....bbB..bbB....',
      ],
      [
        '...ccccaacccc...',
        '..kccckaakcCCC..',
        '..kccckaakcCCC..',
        '..kccckaakcCCC..',
        '..kcaaaaaaaACC..',
        '..ssccckakcCSS..',
        '..kcccakkcCC....',
        '..kcccakkcCCC...',
        '.kaaaaaaaaaaA...',
        '...bbB..........',
      ],
      [
        '...ccccaacccc...',
        '..kccckaakcCCC..',
        '..kccckaakcCCC..',
        '..kccckaakcCCC..',
        '..kcaaaaaaaACC..',
        '..ssccckakcCSS..',
        '....kcccakkcCC..',
        '...kcccakkcCCC..',
        '...kaaaaaaaaaaA.',
        '..........bbB...',
      ],
    ],
    up: [
      [
        '...cccccccccc...',
        '..kccccccccCCC..',
        '..kccccccccCCC..',
        '..kccccccccCCC..',
        '..kcaaaaaaaACC..',
        '..ssccccccccSS..',
        '...kcccccccCC...',
        '...kcccccccCC...',
        '..kaaaaaaaaaaA..',
        '....bbB..bbB....',
      ],
      [
        '...cccccccccc...',
        '..kccccccccCCC..',
        '..kccccccccCCC..',
        '..kccccccccCCC..',
        '..kcaaaaaaaACC..',
        '..ssccccccccSS..',
        '....kcccccccCC..',
        '...kcccccccCCC..',
        '...kaaaaaaaaaaA.',
        '..........bbB...',
      ],
      [
        '...cccccccccc...',
        '..kccccccccCCC..',
        '..kccccccccCCC..',
        '..kccccccccCCC..',
        '..kcaaaaaaaACC..',
        '..ssccccccccSS..',
        '..kcccccccCC....',
        '..kcccccccCCC...',
        '.kaaaaaaaaaaA...',
        '...bbB..........',
      ],
    ],
    right: [
      [
        '....ckkcccCC....',
        '....kkcCccCC....',
        '....kccCccCC....',
        '....kccCccCC....',
        '....aaaCaaAA....',
        '....kccsscCC....',
        '....kcccccCCC...',
        '...kccccccCCC...',
        '...kaaaaaaaaA...',
        '.....bbB.bbB....',
      ],
      [
        '....ckkcccCC....',
        '....kkcCccCC....',
        '....kccCccCC....',
        '....kcCccCCC....',
        '....aaCaaaAA....',
        '....kssccccC....',
        '...kcccccCCC....',
        '..kccccccCCCC...',
        '..kaaaaaaaaaA...',
        '..bbB......bbB..',
      ],
      [
        '....ckkcccCC....',
        '....kkcCccCC....',
        '....kccCccCC....',
        '....kccCcCCC....',
        '....aaaaCaAA....',
        '....kcccsscC....',
        '....kcccccCCC...',
        '....kccccccCCC..',
        '....kaaaaaaaaA..',
        '......bbBbB.....',
      ],
    ],
  },
};

// ------------------------------------------------------------------ acessórios de cabeça (linhas relativas à cabeça; negativas = acima)
interface Overlay {
  top: number; // linha da cabeça onde começa (pode ser negativa)
  rows: string[];
}
const HEADGEAR: Record<string, Record<Dir, Overlay>> = {
  wizardHat: {
    down: {
      top: -8,
      rows: [
        '..........yY....',
        '.........yyY....',
        '........uyyY....',
        '.......uyyyY....',
        '......uuyyyYY...',
        '......uyyyyYY...',
        '.....uyyyyyYY...',
        '.....uyyyyyyYY..',
        '....gggGgggGgg..',
        '..yyyyyyyyyyyyY.',
        '.yyyyyyyyyyyyyYY',
        '..YYYYYYYYYYYY..',
      ],
    },
    up: {
      top: -8,
      rows: [
        '..........yY....',
        '.........yyY....',
        '........yyyY....',
        '.......yyyyY....',
        '......yyyyyYY...',
        '......yyyyyYY...',
        '.....yyyyyyYY...',
        '.....yyyyyyyYY..',
        '....gggGgggGgg..',
        '..yyyyyyyyyyyyY.',
        '.yyyyyyyyyyyyyYY',
        '..YYYYYYYYYYYY..',
      ],
    },
    right: {
      top: -8,
      rows: [
        '....Yy..........',
        '....Yyy.........',
        '....Yyyu........',
        '....Yyyyu.......',
        '...YYyyyuu......',
        '...YYyyyyu......',
        '...YYyyyyyu.....',
        '..YYyyyyyyyu....',
        '..ggGgggGggg....',
        '.Yyyyyyyyyyyyyy.',
        'YYyyyyyyyyyyyyyy',
        '..YYYYYYYYYYYY..',
      ],
    },
  },
  hood: {
    down: {
      top: -1,
      rows: [
        '.....yyyyyy.....',
        '...yyyuuuyyyy...',
        '..yyyuuyyyyyYY..',
        '..yyuyyyyyyyYY..',
        '..yyyyyyyyyyYY..',
        '..yyyyyyyyyyYY..',
        '..yyYgggYyyyYY..',
        '..yy........YY..',
        '..yy........YY..',
        '..Yy........YY..',
        '..YY........YY..',
        '..YY........YY..',
        '...YY......YY...',
      ],
    },
    up: {
      top: -1,
      rows: [
        '.....yyyyyy.....',
        '...yyyuuuyyyy...',
        '..yyyuuyyyyyYY..',
        '..yyuyyyyyyyYY..',
        '..yyyyyyyyyyYY..',
        '..yyyyyyyyyyYY..',
        '..yyyyyyyyyyYY..',
        '..yyyyyyyyyyYY..',
        '..yyyyyyyyyyYY..',
        '..YyyyyyyyyyYY..',
        '..YYyyyyyyyYYY..',
        '...YYyyyyyYYY...',
        '....YYYYYYYY....',
      ],
    },
    right: {
      top: -1,
      rows: [
        '.....yyyyyy.....',
        '...yyyuuuyyyy...',
        '..yyyuuyyyyyyy..',
        '..yyuyyyyyyyyy..',
        '..yyyyyyyyyyyy..',
        '..yyyyyyyyyyyy..',
        '..YyyyyyyyYggy..',
        '..YYyyyyy.......',
        '..YYyyyyy.......',
        '..YYyyyy........',
        '..YYYyyy........',
        '..YYYYyy........',
        '...YYYY.........',
      ],
    },
  },
  helmet: {
    down: {
      top: -4,
      rows: [
        '......rrr.......',
        '.....rrRRr......',
        '......rrRR......',
        '.......rR.......',
        '.....mmmmmm.....',
        '...mmmnnnmmmm...',
        '..mmmnnmmmmmMM..',
        '..mmnnmmmmmmMM..',
        '..mmmmmmmmmmMM..',
        '..MggggggggggM..',
        '..mm...nm...MM..',
        '..mm...Mm...MM..',
        '..Mm........MM..',
        '..MM........MM..',
      ],
    },
    up: {
      top: -4,
      rows: [
        '.......rrr......',
        '......rRRrr.....',
        '......RRrr......',
        '.......Rr.......',
        '.....mmmmmm.....',
        '...mmmnnnmmmm...',
        '..mmmnnmmmmmMM..',
        '..mmnnmmmmmmMM..',
        '..mmmmmmmmmmMM..',
        '..MggggggggggM..',
        '..mmmmmmmmmmMM..',
        '..mmmmmmmmmmMM..',
        '..MmmmmmmmmmMM..',
        '..MMMmmmmmmMMM..',
      ],
    },
    right: {
      top: -4,
      rows: [
        '.....rrr........',
        '....rrRRrr......',
        '...rRR.rRR......',
        '......rR........',
        '.....mmmmmm.....',
        '...mmmnnnmmmm...',
        '..Mmmnnmmmmmmm..',
        '..MmnnmmmmmmmmM.',
        '..Mmmmmmmmmmmmm.',
        '..Mgggggggggggg.',
        '..MMmmmmmm......',
        '..MMmmmmmm......',
        '..MMmmmmm.......',
        '..MMMmmm........',
      ],
    },
  },
  featherCap: {
    down: {
      top: -3,
      rows: [
        '............ww..',
        '...........wwW..',
        '..........wwW...',
        '.....yyyyyywW...',
        '...yyyyuuyyyyy..',
        '..yyyuuyyyyyyYY.',
        '..yyuyyyyyyyyYY.',
        '..YgggggggggggY.',
      ],
    },
    up: {
      top: -3,
      rows: [
        '..ww............',
        '..Www...........',
        '...Www..........',
        '...WwYyyyyy.....',
        '..yyyyyuuyyyy...',
        '.YYyyyyyyyyyyy..',
        '.YYyyyyyyyyyyy..',
        '.YgggggggggggY..',
      ],
    },
    right: {
      top: -3,
      rows: [
        '..ww............',
        '..Www...........',
        '...Www..........',
        '...WwYyyyyy.....',
        '..yyyyyuuyyyy...',
        '..yyyyyyyyyyyyy.',
        '..yyyyyyyyyyyyyy',
        '..Ygggggggggggg.',
      ],
    },
  },
  bandana: {
    down: { top: 3, rows: ['..yyyyyyyyyyYY..', '..yuuyyyyyyyYY..', '..YYYYYYYYYYYY..'] },
    up: { top: 3, rows: ['..yyyyyyyyyyYY..', '..yyyyyyyyyyYY..', '..YYYYYYYYYYYY.Y', '.............YY.'] },
    right: { top: 3, rows: ['..yyyyyyyyyyyy..', '.YYuuyyyyyyyyy..', 'YY.YYYYYYYYYYY..'] },
  },
  strawHat: {
    down: {
      top: -2,
      rows: ['.....yyyyyy.....', '....yuuyyyyY....', '....yyyyyyyY....', '....gggggggG....', '.yyyyyyyyyyyyyY.', 'yyyyyyyyyyyyyyYY', '.YYYYYYYYYYYYYY.'],
    },
    up: {
      top: -2,
      rows: ['.....yyyyyy.....', '....yuuyyyyY....', '....yyyyyyyY....', '....gggggggG....', '.yyyyyyyyyyyyyY.', 'yyyyyyyyyyyyyyYY', '.YYYYYYYYYYYYYY.'],
    },
    right: {
      top: -2,
      rows: ['.....yyyyyy.....', '....yuuyyyyY....', '....yyyyyyyY....', '....Ggggggggg...', '.yyyyyyyyyyyyyyy', 'yyyyyyyyyyyyyyyy', '.YYYYYYYYYYYYYY.'],
    },
  },
  beard: {
    down: { top: 9, rows: ['..hh........hh..', '..hhhhh..hhhhh..', '...hhhhhhhhhh...', '....hhhhhhhh....', '.....hhhhhh.....', '......hhhh......'] },
    up: { top: 9, rows: ['................'] },
    right: { top: 9, rows: ['..........hhh...', '.........hhhhh..', '........hhhhh...', '........hhhh....', '.........hh.....'] },
  },
  mitre: {
    down: {
      top: -5,
      rows: ['.......gg.......', '......yggy......', '.....yyggyY.....', '.....yyggyY.....', '....yyyggyyY....', '....ggggggggG...', '....yyyggyyY....'],
    },
    up: {
      top: -5,
      rows: ['.......gg.......', '......yggy......', '.....yyggyY.....', '.....yyggyY.....', '....yyyggyyY....', '....ggggggggG...', '....yyyyyyyY....'],
    },
    right: {
      top: -5,
      rows: ['.......gg.......', '......yggy......', '.....yyggyy.....', '.....yyggyy.....', '....yyyggyyy....', '....gggggggggg..', '....yyyggyyy....'],
    },
  },
};

// ------------------------------------------------------------------ itens nas mãos (sobrepostos no quadro 24x32, coordenadas do quadro)
interface HeldDraw {
  (c: PixelCanvas, dir: Dir, frame: Frame, ramps: Ramps): void;
}

const bob = (frame: Frame) => (frame === 0 ? 0 : 0);

const held: Record<string, HeldDraw> = {
  staffOrb: (c, dir, frame, r) => {
    const x = dir === 'down' ? OX + 1 : dir === 'up' ? OX + 14 : OX + 10;
    const top = OY + 4 + bob(frame);
    for (let y = top + 3; y <= OY + 22; y++) c.set(x, y, y % 3 === 0 ? P.wood[2]! : P.wood[3]!);
    // orbe brilhante
    c.ellipse(x + 0.5, top + 1.5, 2, 2, r.accent[3]!);
    c.set(x, top, r.accent[4]!);
    c.set(x - 1, top + 1, r.accent[4]!);
    c.set(x + 1, top + 2, r.accent[2]!);
    c.set(x - 1, top - 1, P.white);
    c.hline(x - 1, x + 1, top + 3, P.gold[3]!);
  },
  staffLeaf: (c, dir, frame, _r) => {
    const x = dir === 'down' ? OX + 1 : dir === 'up' ? OX + 14 : OX + 10;
    const top = OY + 2 + bob(frame);
    for (let y = top + 2; y <= OY + 22; y++) c.set(x + (y < top + 5 ? (y % 2 ? 0 : -1) : 0), y, y % 4 === 0 ? P.wood[2]! : P.wood[3]!);
    c.set(x - 1, top + 1, P.wood[3]!);
    c.set(x + 1, top + 1, P.wood[3]!);
    c.set(x - 2, top, P.green[4]!);
    c.set(x - 2, top + 1, P.green[3]!);
    c.set(x + 2, top, P.green[3]!);
    c.set(x + 2, top - 1, P.green[4]!);
    c.set(x, top, P.pink[3]!);
    c.set(x, top - 1, P.gold[4]!);
    c.set(x + 1, top + 3, P.green[3]!);
  },
  swordShield: (c, dir, frame, r) => {
    if (dir === 'down') {
      // espada para cima ao lado esquerdo da tela (mão direita do personagem)
      const x = OX + 1;
      for (let y = OY + 8; y <= OY + 16; y++) c.set(x, y, y === OY + 8 ? P.steel[5]! : P.steel[4]!);
      for (let y = OY + 9; y <= OY + 16; y++) c.set(x + 1, y, P.steel[2]!);
      c.hline(x - 1, x + 2, OY + 17, P.gold[2]!);
      c.set(x, OY + 18, P.leather[2]!);
      c.set(x, OY + 19, P.gold[3]!);
      // escudo no braço esquerdo (lado direito da tela)
      shield(c, OX + 11, OY + 13, r);
    } else if (dir === 'up') {
      const x = OX + 14;
      for (let y = OY + 8; y <= OY + 16; y++) c.set(x, y, P.steel[4]!);
      for (let y = OY + 9; y <= OY + 16; y++) c.set(x - 1, y, P.steel[2]!);
      c.hline(x - 2, x + 1, OY + 17, P.gold[2]!);
      c.set(x, OY + 18, P.leather[2]!);
      // costas do escudo
      c.rect(OX, OY + 13, 4, 6, P.wood[2]!);
      c.vline(OX, OY + 13, OY + 18, P.wood[1]!);
      c.hline(OX, OY + 3, OY + 15, P.iron[2]!);
    } else {
      // perfil: escudo atrás (lado das costas) e espada à frente
      c.rect(OX + 2, OY + 13, 3, 6, r.accent[2]!);
      c.vline(OX + 2, OY + 13, OY + 18, r.accent[1]!);
      const hx = OX + 10;
      const hy = OY + 17;
      for (let i = 1; i <= 7; i++) c.set(hx + Math.floor(i * 0.6), hy - i, i === 7 ? P.steel[5]! : P.steel[4]!);
      for (let i = 1; i <= 6; i++) c.set(hx + 1 + Math.floor(i * 0.6), hy - i, P.steel[2]!);
      c.hline(hx - 1, hx + 2, hy, P.gold[2]!);
      c.set(hx, hy + 1, P.leather[2]!);
    }
  },
  bow: (c, dir, _frame, _r) => {
    const drawBow = (x: number, y0: number, facing: 1 | -1) => {
      for (let i = 0; i < 12; i++) {
        const curve = i < 2 || i > 9 ? 0 : i < 4 || i > 7 ? 1 : 2;
        c.set(x + curve * facing, y0 + i, i % 5 === 0 ? P.wood[2]! : P.wood[3]!);
      }
      c.vline(x, y0 + 1, y0 + 10, P.cloth[4]!);
      c.set(x, y0, P.wood[1]!);
      c.set(x, y0 + 11, P.wood[1]!);
    };
    if (dir === 'down') drawBow(OX + 14, OY + 10, 1);
    else if (dir === 'up') {
      drawBow(OX + 1, OY + 10, -1);
      // aljava nas costas
      c.rect(OX + 9, OY + 10, 3, 7, P.leather[2]!);
      c.vline(OX + 9, OY + 10, OY + 16, P.leather[3]!);
      c.set(OX + 9, OY + 9, P.white);
      c.set(OX + 10, OY + 8, P.red[3]!);
      c.set(OX + 11, OY + 9, P.white);
    } else {
      drawBow(OX + 11, OY + 10, 1);
      c.rect(OX + 3, OY + 12, 2, 6, P.leather[2]!);
      c.set(OX + 3, OY + 11, P.white);
      c.set(OX + 4, OY + 10, P.red[3]!);
    }
  },
  spear: (c, dir, _frame, _r) => {
    const x = dir === 'down' ? OX + 1 : dir === 'up' ? OX + 14 : OX + 10;
    for (let y = OY + 4; y <= OY + 22; y++) c.set(x, y, y % 4 === 0 ? P.wood[2]! : P.wood[3]!);
    c.set(x, OY + 1, P.steel[5]!);
    c.set(x, OY + 2, P.steel[4]!);
    c.set(x - 1, OY + 3, P.steel[3]!);
    c.set(x, OY + 3, P.steel[4]!);
    c.set(x + 1, OY + 3, P.steel[2]!);
    c.set(x, OY + 5, P.red[3]!);
  },
  hammer: (c, dir, _frame, _r) => {
    const x = dir === 'down' ? OX + 1 : dir === 'up' ? OX + 14 : OX + 10;
    for (let y = OY + 14; y <= OY + 20; y++) c.set(x, y, P.wood[3]!);
    c.rect(x - 1, OY + 12, 3, 3, P.iron[2]!);
    c.hline(x - 1, x + 1, OY + 12, P.iron[3]!);
  },
  book: (c, dir, _frame, r) => {
    if (dir === 'up') return;
    const x = dir === 'down' ? OX + 11 : OX + 9;
    c.rect(x, OY + 15, 4, 4, r.accent[2]!);
    c.vline(x, OY + 15, OY + 18, r.accent[1]!);
    c.hline(x + 1, x + 3, OY + 16, P.white);
    c.set(x + 3, OY + 17, P.gold[3]!);
  },
};

function shield(c: PixelCanvas, x: number, y: number, r: Ramps) {
  const rows = ['mmmmm', 'maaam', 'magam', 'maaam', 'maaaM', '.mamM', '..M..'];
  c.ascii(rows, { m: P.steel[3]!, M: P.steel[1]!, a: r.accent[2]!, g: P.gold[4]! }, x, y);
  c.set(x + 1, y + 1, r.accent[3]!);
}

// ------------------------------------------------------------------ paletas
interface Ramps {
  skin: Ramp;
  hair: Ramp;
  cloth: Ramp;
  accent: Ramp;
  pants: Ramp;
  boots: Ramp;
  gear: Ramp; // acessório de cabeça
  gearAccent: Ramp;
  metal: Ramp;
  plume: Ramp;
}

export interface CharacterSpec {
  id: string;
  head: keyof typeof HEAD;
  body: BodyKind;
  gear?: keyof typeof HEADGEAR;
  extraGear?: keyof typeof HEADGEAR;
  held?: keyof typeof held;
  armor?: boolean; // túnica metálica (cavaleiro, guarda)
  ramps: Partial<Ramps> & { skin: Ramp; hair: Ramp; cloth: Ramp };
}

function legendFor(r: Ramps, armor: boolean): Record<string, Color> {
  const cloth = armor ? r.metal : r.cloth;
  return {
    h: r.hair[2]!,
    H: r.hair[1]!,
    i: r.hair[3]!,
    s: r.skin[3]!,
    S: r.skin[2]!,
    l: r.skin[4]!,
    e: P.outline,
    y: r.gear[2]!,
    Y: r.gear[1]!,
    u: r.gear[3]!,
    g: r.gearAccent[3]!,
    G: r.gearAccent[1]!,
    r: armor ? r.plume[2]! : mix(r.skin[3]!, P.red[3]!, 0.35),
    R: r.plume[1]!,
    c: cloth[2]!,
    C: cloth[1]!,
    k: cloth[3]!,
    a: r.accent[3]!,
    A: r.accent[1]!,
    p: r.pants[2]!,
    P: r.pants[1]!,
    b: r.boots[2]!,
    B: r.boots[1]!,
    m: r.metal[3]!,
    M: r.metal[1]!,
    n: r.metal[4]!,
    w: P.white,
    W: P.cloth[2]!,
  };
}

function outlineColor(n: Color): Color {
  return mix(n, P.outline, 0.78);
}

function composeFrame(spec: CharacterSpec, dir: Dir, frame: Frame): PixelCanvas {
  const r: Ramps = {
    accent: P.gold,
    pants: P.leather,
    boots: P.leather,
    gear: spec.ramps.cloth,
    gearAccent: P.gold,
    metal: P.steel,
    plume: P.red,
    ...spec.ramps,
  } as Ramps;
  const legend = legendFor(r, !!spec.armor);
  const c = new PixelCanvas(FRAME_W, FRAME_H);
  const headRows = check(HEAD[spec.head]![dir], `head.${spec.head}.${dir}`);
  const bodyRows = check(BODY[spec.body][dir][frame], `body.${spec.body}.${dir}.${frame}`);
  // bob vertical sutil: quadros de passo descem 1 px a parte superior
  const bobY = frame === 0 ? 0 : 1;
  // itens atrás do corpo (vista de costas: arma do lado da mão fica parcialmente atrás)
  const heldFn = spec.held ? held[spec.held] : undefined;
  if (heldFn && dir === 'up') heldFn(c, dir, frame, r);
  c.ascii(bodyRows.slice(7), legend, OX, OY + 12 + 7);
  c.ascii(bodyRows.slice(0, 7), legend, OX, OY + 12 + bobY);
  c.ascii(headRows, legend, OX, OY + bobY);
  for (const g of [spec.gear, spec.extraGear]) {
    if (!g) continue;
    const ov = HEADGEAR[g]![dir];
    check(ov.rows, `gear.${g}.${dir}`);
    c.ascii(ov.rows, legend, OX, OY + ov.top + bobY);
  }
  if (heldFn && dir !== 'up') heldFn(c, dir, frame, r);
  c.outline(outlineColor);
  return c;
}

function flipped(c: PixelCanvas): PixelCanvas {
  const out = new PixelCanvas(c.w, c.h);
  out.blit(c, 0, 0, { flipX: true });
  return out;
}

/** Quadro "caído" para a morte: o quadro de frente girado 90° e apoiado no chão. */
function deadFrame(stand: PixelCanvas): PixelCanvas {
  const out = new PixelCanvas(FRAME_W, FRAME_H);
  for (let y = 0; y < FRAME_H; y++)
    for (let x = 0; x < FRAME_W; x++) {
      const col = stand.get(x, y);
      if (!col) continue;
      // rotação de 90° no sentido horário, ancorada na base
      const nx = FRAME_H - 1 - y - 6;
      const ny = x + 8;
      if (nx >= 0 && nx < FRAME_W && ny < FRAME_H) out.set(nx, ny, mix(col, P.black, 0.18));
    }
  return out;
}

/** Folha 3 colunas x 5 linhas: baixo, esquerda, direita, cima (parado, passo A, passo B) + caído. */
export function buildCharacterSheet(spec: CharacterSpec): PixelCanvas[] {
  const frames: PixelCanvas[] = [];
  const order: [Dir, boolean][] = [
    ['down', false],
    ['right', true],
    ['right', false],
    ['up', false],
  ];
  for (const [dir, flip] of order)
    for (const f of [0, 1, 2] as Frame[]) {
      const fr = composeFrame(spec, dir, f);
      frames.push(flip ? flipped(fr) : fr);
    }
  frames.push(deadFrame(frames[0]!));
  return frames;
}

// ------------------------------------------------------------------ elenco
export const CHARACTERS: CharacterSpec[] = [
  {
    id: 'sorcerer',
    head: 'short',
    body: 'robe',
    gear: 'wizardHat',
    held: 'staffOrb',
    ramps: { skin: P.skin, hair: P.hairWhite, cloth: P.purple, accent: P.gold, gear: P.purple, gearAccent: P.gold, boots: P.leather },
  },
  {
    id: 'druid',
    head: 'long',
    body: 'robe',
    gear: 'hood',
    held: 'staffLeaf',
    ramps: { skin: P.skinTan, hair: P.hairRed, cloth: P.green, accent: P.leather, gear: P.forest, gearAccent: P.gold, boots: P.leather },
  },
  {
    id: 'paladin',
    head: 'short',
    body: 'tunic',
    gear: 'featherCap',
    held: 'bow',
    ramps: { skin: P.skin, hair: P.hairBlond, cloth: P.blue, accent: P.steel, gear: P.teal, gearAccent: P.gold, pants: P.leather, boots: P.wood },
  },
  {
    id: 'knight',
    head: 'short',
    body: 'tunic',
    gear: 'helmet',
    held: 'swordShield',
    armor: true,
    ramps: { skin: P.skinTan, hair: P.hairBrown, cloth: P.red, accent: P.red, metal: P.steel, plume: P.red, gearAccent: P.gold, pants: P.iron, boots: P.iron },
  },
  {
    id: 'npc_priest',
    head: 'bald',
    body: 'robe',
    gear: 'mitre',
    extraGear: 'beard',
    held: 'book',
    ramps: { skin: P.skin, hair: P.hairWhite, cloth: P.cloth.map((_, i) => P.marble[Math.min(5, i + 1)]!), accent: P.gold, gear: P.marble.slice(1), gearAccent: P.gold, boots: P.gold },
  },
  {
    id: 'npc_smith',
    head: 'short',
    body: 'tunic',
    gear: 'bandana',
    extraGear: 'beard',
    held: 'hammer',
    ramps: { skin: P.skinDark, hair: P.hairBlack, cloth: P.leather, accent: P.iron, gear: P.red, pants: P.iron, boots: P.wood },
  },
  {
    id: 'npc_alchemist',
    head: 'long',
    body: 'robe',
    held: 'book',
    ramps: { skin: P.skin, hair: P.hairWhite, cloth: P.teal, accent: P.gold, boots: P.leather },
  },
  {
    id: 'npc_guard',
    head: 'short',
    body: 'tunic',
    gear: 'helmet',
    held: 'spear',
    armor: true,
    ramps: { skin: P.skin, hair: P.hairBrown, cloth: P.blue, accent: P.blue, metal: P.steel, plume: P.blue, gearAccent: P.gold, pants: P.iron, boots: P.iron },
  },
  {
    id: 'npc_farmer',
    head: 'short',
    body: 'tunic',
    gear: 'strawHat',
    ramps: { skin: P.skinTan, hair: P.hairBrown, cloth: P.green, accent: P.leather, gear: P.sand, gearAccent: P.red, pants: P.blue, boots: P.leather },
  },
  {
    id: 'npc_villager',
    head: 'long',
    body: 'robe',
    ramps: { skin: P.skinDark, hair: P.hairBlack, cloth: P.red, accent: P.gold, boots: P.leather },
  },
  {
    id: 'npc_merchant',
    head: 'short',
    body: 'tunic',
    extraGear: 'beard',
    ramps: { skin: P.skin, hair: P.hairRed, cloth: P.purple, accent: P.gold, pants: P.leather, boots: P.wood },
  },
  {
    id: 'npc_banker',
    head: 'long',
    body: 'tunic',
    held: 'book',
    ramps: { skin: P.skinTan, hair: P.hairBlond, cloth: P.blue, accent: P.gold, pants: P.iron, boots: P.leather },
  },
  {
    id: 'skeleton',
    head: 'skull',
    body: 'tunic',
    held: 'swordShield',
    ramps: { skin: [...P.bone, P.white], hair: P.bone, cloth: P.iron, accent: P.leather, pants: [...P.bone, P.white], boots: P.bone },
  },
  {
    id: 'goblin_chief',
    head: 'goblin',
    body: 'tunic',
    gear: 'bandana',
    held: 'hammer',
    ramps: { skin: P.goblin.map((c) => mix(c, P.black, 0.18)), hair: P.hairBlack, cloth: P.red, accent: P.gold, gear: P.red, pants: P.leather, boots: P.goblin },
  },
  {
    id: 'goblin',
    head: 'goblin',
    body: 'tunic',
    held: 'spear',
    ramps: { skin: P.goblin, hair: P.hairBlack, cloth: P.leather, accent: P.bone, pants: P.leather, boots: P.goblin, gear: P.gold },
  },
];
