// Hand-authored pixel art for the 8 ORIGINAL Voice Monsters creatures. Each is a 16-wide char grid
// (front view); the back view is derived (silhouette — eyes/face removed). All original designs
// (archetype homages), NOT Pokémon sprites. The decoder in monster-sprite.ts maps each char to a
// Game-Boy palette slot, tinted by the creature's element type, so a fire drake reads red, an
// electric mouse yellow, etc. Real PNGs at /assets/monsters/<id>_<view>.png still override these.
//
// Char legend:
//   '.' transparent   'X' outline (darkest ink)
//   '#' body (mid type-tint)   'o' body highlight (light type-tint)
//   'e' eye   'w' white/paper highlight (teeth, shine, belly)   '*' accent (type detail)

export type ArtGrid = string[];

/** Front-view grids, keyed by roster monster id. 16 columns each (padded in the decoder). */
export const MONSTER_ART: Record<string, ArtGrid> = {
  // Electric mouse: round body, tall ears, cheeks, little bolt tail.
  sparkmouse: [
    '...X......X.....',
    '..X#X....X#X....',
    '..X#X....X#X....',
    '..X##X..X##X....',
    '...X##XXXX##X...',
    '..X##########X..',
    '.X##e######e##X.',
    '.X############X.',
    '.X##ww####ww##X.',
    '.X############X.',
    '..X########X#X..',
    '...X######X#*X..',
    '...X##X#X#X**...',
    '...XX...XX*X....',
    '................',
    '................',
  ],
  // Fire drakeling: snout, small horns, wings folded, blazing tail.
  embertail: [
    '....X......X....',
    '...X#X....X#X...',
    '...X##XXXX##X...',
    '..X##########X..',
    '.X###e####e###X.',
    'X####wwwwww####X',
    'X##############X',
    '.X####wwww####X.',
    '..X##########X..',
    '..X####oo####X..',
    '...X########X**.',
    '...X##X##X##X**.',
    '...XX.X..X.X**..',
    '..........X*....',
    '................',
    '................',
  ],
  // Water turtle: broad domed shell, stubby legs, small head poking out.
  shellback: [
    '................',
    '.......XXXX.....',
    '....XXX####XX...',
    '..XX##oooooo##X.',
    '.X##oo######oo#X',
    'X##o##XX##XX##o#X',
    'X#o##e####e##o##X',
    'X#o##########o##X',
    '.X#oo######oo##X.',
    '..X##oooooo##X..',
    '...XX######XX...',
    '..X#X..XX..X#X..',
    '..XX....X...XX..',
    '................',
    '................',
    '................',
  ],
  // Grass sprout: bulb body, two big leaves up top, tiny roots.
  thornling: [
    '.....*....*.....',
    '....X*X..X*X....',
    '...X*oo*XX*oo*..',
    '...X*ooooooo*X..',
    '....XX*oo*XX....',
    '.....X####X.....',
    '...X########X...',
    '..X##e####e##X..',
    '..X##########X..',
    '..X##wwwwww##X..',
    '..X##########X..',
    '...X########X...',
    '....X##XX##X....',
    '....XX....XX....',
    '................',
    '................',
  ],
  // Rock brute: blocky boulder body, heavy fists, craggy edges.
  pebblefist: [
    '................',
    '...XXXXXXXXX....',
    '..X#########X...',
    '.X###ooooo###X..',
    'X##oo#####oo##X.',
    'X#o##e###e##o#X.',
    'X#o#########o#X.',
    'X#o##wwwww##o#XXX',
    'X##ooooooooo##X#X',
    '.X#########X#X#X.',
    'XXX#######XXXXX..',
    'X#X#######X#X....',
    'X#XX#####XX#X....',
    'XXX X###X XXX....',
    '....XX.XX.......',
    '................',
  ],
  // Sky hunter: outstretched wings, beak, slim body, tail.
  gustwing: [
    '.......XX.......',
    '......X##X......',
    '..X...X##X...X..',
    '.X#X.X#oo#X.X#X.',
    'X#o#XX#oo#XX#o#X',
    'X#oo#X#ee#X#oo#X',
    '.X#o#X#**#X#o#X.',
    '..XX#X####X#XX..',
    '....X#oooo#X....',
    '.....X####X.....',
    '.....X#oo#X.....',
    '......X##X......',
    '......X##X......',
    '.....XX..XX.....',
    '................',
    '................',
  ],
  // Ground pup: four-legged, floppy ears, snout, digging claws.
  mudpup: [
    '................',
    '..XX........XX..',
    '.X#oX......X#oX.',
    '.X#o#XXXXXX#o#X.',
    '..X#oo####oo#X..',
    '..X#e######e#X..',
    '..X##oowwoo##X..',
    '.X############X.',
    'X##############X',
    'X##oo######oo##X',
    '.X############X.',
    '..X##X#XX#X##X..',
    '..XX#X.XX.X#XX..',
    '...XX......XX...',
    '................',
    '................',
  ],
  // Bulky ox: shaggy quadruped, big head, curved tusks, sturdy legs.
  tuskox: [
    '................',
    '..X##X....X##X..',
    '.X#oo#XXXX#oo#X.',
    'X##oo######oo##X',
    'w#X##e####e##X#w',   // tusks flank the head (w = ivory)
    'w#X########X#X#w',
    '.X##wwwwww##X##..',
    '.X############X.',
    'X##############X',
    'X#oo########oo#X',
    'X##############X',
    'X##############X',
    '.X##X#XX#X##X#X.',
    '.XX#X.XX.X#XX...',
    '..XX......XX....',
    '................',
  ],
};
