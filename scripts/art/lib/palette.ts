// Paleta mestra do Rpgzim (ver docs/ART_BIBLE.md).
// Cada rampa vai do tom mais escuro (índice 0) ao mais claro. As sombras puxam para o azul/violeta
// e as luzes para o amarelo (hue shifting), mantendo coerência entre cenário, personagens e efeitos.
import { rgb, type Color } from './canvas.ts';

const ramp = (...hex: string[]): Color[] => hex.map((h) => rgb(h));

export const P = {
  outline: rgb('#1d1626'),
  outlineSoft: rgb('#2e2238'),
  black: rgb('#120d18'),
  white: rgb('#fbf8ef'),
  shadow: rgb('#120d18', 80),
  shadowStrong: rgb('#120d18', 120),

  grass: ramp('#1b3530', '#244f37', '#33703c', '#4e9440', '#78b746', '#b4dc63', '#e2f39a'),
  forest: ramp('#16262a', '#1d3a33', '#285236', '#376d3a', '#4e8a3f'),
  dirt: ramp('#3e2526', '#633d30', '#8a5b3a', '#b07e4c', '#d2a76c', '#ebcd96'),
  sand: ramp('#8a6a48', '#b8955f', '#dcc084', '#f1dca9'),
  stone: ramp('#25232f', '#3d3d4f', '#5a5e72', '#7f8699', '#a9b0bf', '#d4d9e2'),
  water: ramp('#142244', '#1b3a72', '#245ea2', '#337fc4', '#5aa8dd', '#9dd8f2', '#e2f7fd'),
  wood: ramp('#2a1719', '#462820', '#6b3e28', '#915a33', '#b77b43', '#d9a463'),
  woodLight: ramp('#6b4a30', '#94693f', '#bd9055', '#ddb877'),
  plaster: ramp('#5f4f4c', '#8f7c70', '#bba68e', '#ddcdb0', '#f3ead4'),
  marble: ramp('#4c4860', '#76728f', '#a29eba', '#cbc8dc', '#ecebf4', '#ffffff'),
  gold: ramp('#4a2e14', '#7c5418', '#b48222', '#e0b03a', '#f8dc6c', '#fff6be'),
  roofRed: ramp('#33121f', '#5a1a2a', '#862837', '#b23f3e', '#d66349', '#ec8f65'),
  roofBlue: ramp('#171a3c', '#232f63', '#30488f', '#4466b4', '#638dd0', '#94b8e6'),
  roofGreen: ramp('#142a2c', '#1d443d', '#296150', '#3a8068', '#5aa384'),
  roofSlate: ramp('#1f2130', '#33374d', '#4a5068', '#666e88', '#8a93ab'),

  skin: ramp('#5b2f2e', '#9a5946', '#cf8869', '#f0b28e', '#ffd8bc'),
  skinTan: ramp('#3f2220', '#6e3c2d', '#9c6043', '#c3875f', '#e2ae84'),
  skinDark: ramp('#2a1618', '#4a2a24', '#6d4232', '#8f5d44', '#b07a5a'),
  goblin: ramp('#1d2a18', '#33502a', '#4f7a34', '#78a43e', '#a8cc5e'),

  hairBrown: ramp('#2a1716', '#4b2b22', '#73432c', '#9c6338'),
  hairBlack: ramp('#151219', '#25202d', '#3a3345', '#56506a'),
  hairBlond: ramp('#6a4420', '#a8762f', '#d9a944', '#f3d677'),
  hairRed: ramp('#3d1414', '#6e2318', '#a63c1f', '#d4612c'),
  hairWhite: ramp('#6e6a7a', '#a3a0b2', '#d2d0dc', '#f4f3f8'),

  red: ramp('#33101b', '#5f1a28', '#962834', '#cc4239', '#ea7454'),
  purple: ramp('#1e1236', '#33205c', '#4f3393', '#7550c2', '#a17fe4', '#d2bdf8'),
  blue: ramp('#111d38', '#1b3263', '#2a4f95', '#3e74c0', '#69a0e0'),
  teal: ramp('#0f2a30', '#18454a', '#22686a', '#33908a', '#5cbba8'),
  green: ramp('#132a1c', '#1f4628', '#2e6a32', '#45903c', '#71b84d'),
  leather: ramp('#2c1913', '#4b2c1d', '#6f4429', '#946036', '#ba8550'),
  cloth: ramp('#3b3346', '#5f5668', '#8a8193', '#b6aebd', '#e2dce6'),
  steel: ramp('#22252f', '#3d4352', '#5f6879', '#8892a5', '#b8c2d3', '#e6ecf5'),
  iron: ramp('#2a2a30', '#45444c', '#65636b', '#8b8890'),
  bone: ramp('#5a5040', '#958a70', '#c8bd9c', '#ece4c8'),
  pink: ramp('#5a1f3a', '#93325a', '#c95182', '#ec86ae'),

  fire: ramp('#4a1410', '#9a2a14', '#dc5422', '#f6953a', '#ffd36a', '#fff7d6'),
  ice: ramp('#13305a', '#2c66a8', '#5fa8e4', '#a6dcfa', '#e8fbff'),
  arcane: ramp('#200d4a', '#4a20a0', '#8448e6', '#c08cff', '#f0e0ff'),
  holy: ramp('#5a3a0c', '#b4841e', '#eec84a', '#fff09a', '#ffffff'),
  nature: ramp('#142e12', '#2e5c18', '#5c9626', '#9ccc42', '#dcf486'),
  heal: ramp('#124a30', '#25875a', '#4fd08a', '#a6f8c4', '#f0fff4'),
  blood: ramp('#3a0a12', '#7a1420', '#b8222c', '#e04a44'),
} as const;

export type Ramp = readonly Color[];
