# Writes stickers/pistol/motion.json (the baseline: 5 shots, slow slide, steam at the end) and the
# comparison variants stickers/pistol/variants/*.json (shallow overrides of motion.json).
# Times are planned in frames at 60 fps, written in seconds.
# The camera of the `camera` variant comes from stickers/pistol/camera.json — edit it and rerun.
# Principles behind the numbers: docs/weapon-animation.md.
# Usage: python3 stickers/pistol/variants/make.py
import copy, json, os
HERE = os.path.dirname(os.path.abspath(__file__))
base = json.load(open(os.path.join(HERE, '..', 'motion.json')))
s = lambda fr: round(fr / 60, 4)
ss = lambda frs: [s(x) for x in frs]

rig = copy.deepcopy(base['rig'])
rig['back_shell_*'] = {'hidden': True}
rig['gun'].pop('focal', None)
FOCAL = 700  # the baseline camera: ≈54° field of view

MUZZLE = [486, 140]; PORT = [250, 121]  # in gun coordinates

PORT_TOP = [252, 128]  # gun coordinates: the top of the ejection port, where a shell leaves

def shells(shots, delay=2, back=()):
    """Shells thrown from the ejection port, each on its own arc; the shots listed in `back`
    (indices) throw theirs behind the gun (back_shell_*, drawn under it), the rest fly in front."""
    def arcs(idx):
        pick = lambda vals: [vals[k % len(vals)] for k in idx]
        return {'vx': pick([-170, -110, -240, -80, -200, -140, -260, -120, -190]),
                'vy': pick([-560, -660, -500, -720, -540, -620, -470, -690, -760]),
                'spin': pick([-900, 650, -1400, 400, -1100, 900, -600, 1200, -1600])}
    front = [k for k in range(len(shots)) if k not in back]
    out = [{'part': 'shell_*', 'preset': 'eject', 'each': True, 'launch': {'part': 'gun', 'point': PORT_TOP},
            **arcs(front), 'gravity': 2400, 'len': 0.8, 'at': ss([shots[k] + delay for k in front])}]
    if back:
        # behind the gun: thrown back and lower, so they drop out of sight behind the frame
        out.append({'part': 'back_shell_*', 'preset': 'eject', 'each': True, 'launch': {'part': 'gun', 'point': PORT_TOP},
                    'vx': [-120, -60][:len(back)], 'vy': [-420, -380][:len(back)], 'spin': [700, -800][:len(back)],
                    'gravity': 2400, 'len': 0.8, 'at': ss([shots[k] + delay for k in back])})
    return out

def gun_tracks(shots, recoil, turns, anticipation_at, slide=(0.0167, 0, 0.05), back=()):
    # slide: attack, hold, release (s) of the blowback; it must not be longer than the shortest gap between shots
    n = len(shots)
    hero = [k == n - 1 for k in range(n)]
    t = list(turns)
    t.append({'part': 'gun', 'preset': 'kick', 'r': 4, 'sx': 97, 'attack': 0.12, 'release': 0.04,
              'attackEase': 'inOut', 'releaseEase': 'in', 'at': s(anticipation_at)})
    t.append({'part': 'gun', 'preset': 'kick', **recoil,
              'attack': 0.0167, 'hold': [0.067 if h else 0.0167 for h in hero],
              'release': [0.4 if h else 0.17 for h in hero], 'releaseEase': 'backOut', 'at': ss(shots)})
    t.append({'part': 'gun', 'preset': 'kick', 'sx': [88 if h else 93 for h in hero], 'sy': [108 if h else 105 for h in hero],
              'attack': 0.0167, 'release': 0.067, 'at': ss(shots)})
    t += [
        {'part': 'trigger', 'preset': 'kick', 'r': 16, 'attack': 0.025, 'release': 0.04, 'at': ss([f - 2 for f in shots])},
        {'part': 'slide', 'preset': 'kick', 'x': -44, 'attack': slide[0], 'hold': slide[1], 'release': slide[2], 'releaseEase': 'backOut', 'at': ss(shots)},
        # the whole-gun light frame is an impact frame: first and hero shot only, else it strobes
        {'part': 'gun_light', 'preset': 'kick', 'show': 100, 'attack': 0.0167, 'release': 0.0167, 'at': ss([shots[0], shots[-1]])},
        # the port shows open (with the case in it) while the slide is back
        {'part': 'port_open', 'preset': 'kick', 'show': 100, 'attack': 0.0167, 'hold': max(0.033, slide[0] + slide[1] + slide[2] * 0.4 - 0.0167), 'release': 0.0167, 'at': ss(shots)},
        {'part': 'port_case', 'preset': 'kick', 'show': 100, 'attack': 0.0167, 'hold': max(0.0167, slide[0] + slide[1] - 0.0167), 'release': 0.0167, 'at': ss(shots)},
        *shells(shots, delay=2 if slide[0] + slide[1] < 0.04 else round((slide[0] + slide[1]) * 60), back=back),
    ]
    return t

def meteor_flash(shots):
    n = len(shots)
    return {'source': 'meteor', 'comp': 'comp_2', 'at': ss(shots), 'anchor': {'part': 'gun', 'point': MUZZLE},
            'origin': [76, 77], 'skip': 3, 'speed': 1.8,
            'scale': [130 if k == n - 1 else [90, 80, 100, 75, 95, 85][k % 6] for k in range(n)],
            'rotate': [[0, 12, -8, 15, -14, 6][k % 6] for k in range(n)],
            'stretch': [170, 90], 'aim': True, 'follow': True, 'len': 0.08}

# --- five-steam: 5 shots — two on the first turn as in the baseline, three on the second — and a
# seamless turn: the first turn's release and the second turn's attack run together (same start,
# length and ease), so the gun swings from one side to the other without stopping square-on.
# One wisp of steam (CoffeeSticker's ribbon, stickers/pistol/fx/steam.json) rises from the top of
# the muzzle once the gun has fired its last shot.
FIVE = [30, 54, 96, 107, 118]
SWAP = 1.05  # seconds: the gun leaves the first side and swings straight to the second
five_turns = [
    {'part': 'gun', 'preset': 'kick', 'yaw': -24, 'pitch': -6, 'attack': 0.3, 'hold': SWAP - 0.35, 'release': 0.45,
     'attackEase': 'inOut', 'releaseEase': 'inOut', 'at': 0.05},
    {'part': 'gun', 'preset': 'kick', 'yaw': 20, 'pitch': -8, 'attack': 0.45, 'hold': 0.6, 'release': 0.4,
     'attackEase': 'inOut', 'releaseEase': 'inOut', 'at': SWAP},
    {'part': 'gun', 'preset': 'kick', 'r': 5, 'attack': 0.2, 'release': 0.5, 'attackEase': 'inOut', 'releaseEase': 'inOut', 'at': 2.25},
]
five_recoil = {'r': [-18, -17, -16, -14, -21], 'x': [-14, -14, -13, -11, -17], 'y': [-5, -5, -4, -3, -7]}
TIP = [482, 124]
five = {'duration': 3, 'sources': {'meteor': 'gun_refs/MeteorSticker.tgs', 'steam': 'stickers/pistol/fx/steam.json'},
        'rig': {**rig, 'gun': {**rig['gun'], 'focal': FOCAL}},
        'tracks': gun_tracks(FIVE, five_recoil, five_turns, 18, back=(1, 3)),
        'effects': [meteor_flash(FIVE), {
            'source': 'steam', 'comp': 'coffee_one_rise', 'at': s(FIVE[-1] + 8),
            'anchor': {'part': 'gun', 'point': TIP}, 'follow': True, 'origin': [256, 420], 'scale': 56}]}

# --- five-slide: five-steam with the slide's work readable: back in 3 frames, held open 3 frames
# (the case shows in the port), forward in 5 with an overshoot — 11 frames, the shortest gap.
five_slide = {**five, 'tracks': gun_tracks(FIVE, five_recoil, five_turns, 18, slide=(0.05, 0.05, 0.083), back=(1, 3))}

# --- camera: the baseline seen through another camera (stickers/pistol/camera.json):
#   fov  — the camera's angle of view in degrees (baseline ≈54): wider → the camera stands closer,
#          near parts grow and far parts shrink more during the turns (wide-angle distortion);
#   turn — how far the gun turns towards / away from the camera (1 = baseline, 1.4 = 40 % more),
#          which shows more of its sides and makes the perspective stronger.
# The canvas spans 512 / 0.72 ≈ 711 gun units, so focal = 355.5 / tan(fov / 2).
import math
cam = json.load(open(os.path.join(HERE, '..', 'camera.json')))
focal = round(355.5 / math.tan(math.radians(cam['fov']) / 2))
turned = [{**t, **({'yaw': round(t['yaw'] * cam['turn'], 2), 'pitch': round(t['pitch'] * cam['turn'], 2)} if 'yaw' in t else {})} for t in five_turns]
camera = {'rig': {**five_slide['rig'], 'gun': {**five_slide['rig']['gun'], 'focal': focal}},
          'tracks': gun_tracks(FIVE, five_recoil, turned, 18, slide=(0.05, 0.05, 0.083), back=(1, 3))}

with open(os.path.join(HERE, '..', 'motion.json'), 'w') as fh:
    json.dump(five_slide, fh, ensure_ascii=False, indent=1)
    fh.write('\n')
print('motion.json (baseline)')
for name, spec in (('camera', camera),):
    with open(os.path.join(HERE, name + '.json'), 'w') as fh:
        json.dump(spec, fh, ensure_ascii=False, indent=1)
        fh.write('\n')
    print(name, f'(fov {cam["fov"]}°, focal {focal}, turn ×{cam["turn"]})')
