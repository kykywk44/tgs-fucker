# Builds stickers/pistol/sketch.svg from the Figma vector export (ref.svg): regroups the
# traced shapes into animation parts, replaces Telegram-forbidden features (mask, gradient
# strokes, inherited fills), adds the barrel, the one-frame light flash, the ejection port that opens
# on recoil (port_open, port_case) and the shell casings.
# Shot effects (flash, smoke) are not drawn here: motion.json copies them from gun_refs/.
# Usage: python3 stickers/pistol/build_sketch.py stickers/pistol/figma-ref.svg stickers/pistol/sketch.svg
import re, sys
ref, out = sys.argv[1], sys.argv[2]
# highlights, light from the top left, drawn the way Telegram stickers do: open lines of even width with
# round caps, a solid light tint of the part, often a line and a dot.
# 'b' (default) — lines lying on the outline's inner edge, reading as a light stretch of the outline;
# 'a' — lines inside the outline, with a gap; 'fixed' — the sketch's own highlights kept in place (crescents)
MODE = sys.argv[3] if len(sys.argv) > 3 else 'b'
assert MODE in ('fixed', 'a', 'b'), MODE
s = open(ref).read()

def el(id_):
    m = re.search(r'<(path|rect)\b[^>]*\bid="%s"[^>]*/>' % re.escape(id_), s)
    assert m, id_
    return m.group(0)
def attr(e, a):
    m = re.search(r'\b%s="([^"]*)"' % a, e); return m.group(1) if m else None
def unnamed(e):  # drop Figma ids so only parts carry names
    return re.sub(r'\s+id="[^"]*"', '', e)
def grads(ids):
    out = []
    for i in ids:
        m = re.search(r'<(linearGradient|radialGradient) id="%s".*?</\1>' % i, s, re.S); out.append(m.group(0))
    return '\n'.join(out)

# Paths inside the two "Rectangle …" groups (no ids of their own)
def group_paths(gid):
    m = re.search(r'<g id="%s">(.*?)</g>' % re.escape(gid), s, re.S); return m.group(1).strip()

# ---------- path flattening + clipping for the grip texture ----------
def tokens(d):
    for m in re.finditer(r'([MLCHVZ])([^MLCHVZ]*)', d):
        yield m.group(1), [float(x) for x in re.findall(r'-?[\d.]+(?:e-?\d+)?', m.group(2))]
def flatten(d, steps=8):
    poly, cur, start = [], (0, 0), (0, 0)
    for c, a in tokens(d):
        if c == 'M': cur = start = (a[0], a[1]); poly.append(cur)
        elif c == 'L':
            for i in range(0, len(a), 2): cur = (a[i], a[i+1]); poly.append(cur)
        elif c == 'H': cur = (a[0], cur[1]); poly.append(cur)
        elif c == 'V': cur = (cur[0], a[0]); poly.append(cur)
        elif c == 'C':
            for i in range(0, len(a), 6):
                p0, p1, p2, p3 = cur, (a[i], a[i+1]), (a[i+2], a[i+3]), (a[i+4], a[i+5])
                for k in range(1, steps + 1):
                    t = k / steps; u = 1 - t
                    poly.append((u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0],
                                 u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1]))
                cur = p3
        elif c == 'Z': cur = start
    return poly
def inside(poly, x, y):
    c = False
    for i in range(len(poly)):
        (x1, y1), (x2, y2) = poly[i], poly[i-1]
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1): c = not c
    return c
def clip(poly, a, b):
    ts = [0.0, 1.0]
    for i in range(len(poly)):
        p, q = poly[i], poly[i-1]
        dx, dy, ex, ey = b[0]-a[0], b[1]-a[1], q[0]-p[0], q[1]-p[1]
        den = dx*ey - dy*ex
        if abs(den) < 1e-9: continue
        t = ((p[0]-a[0])*ey - (p[1]-a[1])*ex) / den
        u = ((p[0]-a[0])*dy - (p[1]-a[1])*dx) / den
        if 0 < t < 1 and 0 <= u <= 1: ts.append(t)
    ts.sort(); segs = []
    for t0, t1 in zip(ts, ts[1:]):
        if t1 - t0 < 1e-6: continue
        tm = (t0 + t1) / 2
        if inside(poly, a[0] + (b[0]-a[0])*tm, a[1] + (b[1]-a[1])*tm):
            segs.append(((a[0]+(b[0]-a[0])*t0, a[1]+(b[1]-a[1])*t0), (a[0]+(b[0]-a[0])*t1, a[1]+(b[1]-a[1])*t1)))
    return segs

INSET = 4.5
def seg_dist(pt, a, b):
    dx, dy = b[0]-a[0], b[1]-a[1]
    t = 0 if dx == dy == 0 else max(0, min(1, ((pt[0]-a[0])*dx + (pt[1]-a[1])*dy) / (dx*dx + dy*dy)))
    return ((pt[0]-a[0]-t*dx)**2 + (pt[1]-a[1]-t*dy)**2) ** .5
panel_d = attr(el('Vector_8'), 'd')
panel = flatten(panel_d)
tex = []
for c, a in tokens(attr(el('Vector_9'), 'd')):
    if c == 'M': cur = (a[0], a[1])
    elif c == 'L':
        nxt = (a[0], a[1])
        for p, q in clip(panel, cur, nxt):
            L = ((q[0]-p[0])**2 + (q[1]-p[1])**2) ** .5
            ux, uy = (q[0]-p[0]) / L, (q[1]-p[1]) / L
            on_edge = lambda pt: min(seg_dist(pt, panel[i], panel[i-1]) for i in range(len(panel))) < 0.5
            if on_edge(p): p = (p[0] + ux*INSET, p[1] + uy*INSET); L -= INSET
            if on_edge(q): q = (q[0] - ux*INSET, q[1] - uy*INSET); L -= INSET
            if L > 2: tex.append((p, q))
        cur = nxt
# merge collinear consecutive pieces
f = lambda v: f'{v:.1f}'.rstrip('0').rstrip('.')
tex_d = ' '.join(f'M{f(p[0])} {f(p[1])}L{f(q[0])} {f(q[1])}' for p, q in tex)

def fill_none(e):
    return e if 'fill=' in e else e.replace('<path', '<path fill="none"', 1)

import math
MX, MY = 480, 140
def ray(angle, length, width):
    a = math.radians(angle); ux, uy = math.cos(a), math.sin(a); nx, ny = -uy, ux
    pts = [(MX + nx*width/2, MY + ny*width/2), (MX + ux*length*0.45 + nx*width*0.55, MY + uy*length*0.45 + ny*width*0.55),
           (MX + ux*length, MY + uy*length), (MX + ux*length*0.45 - nx*width*0.55, MY + uy*length*0.45 - ny*width*0.55),
           (MX - nx*width/2, MY - ny*width/2)]
    return 'M' + 'L'.join(f'{f(x)} {f(y)}' for x, y in pts) + 'Z'
rays_d = ' '.join(ray(a, l, w) for a, l, w in [(0, 92, 26), (-32, 62, 18), (32, 62, 18), (-64, 40, 14), (64, 40, 14)])
inner_d = ' '.join(ray(a, l, w) for a, l, w in [(0, 60, 14), (-32, 38, 9), (32, 38, 9)])
def spark(angle, r0, r1):
    a = math.radians(angle)
    return f'M{f(MX + math.cos(a)*r0)} {f(MY + math.sin(a)*r0)}L{f(MX + math.cos(a)*r1)} {f(MY + math.sin(a)*r1)}'
sparks_d = ' '.join(spark(a, 70, 92) for a in (-48, -16, 16, 48))
def circle(cx, cy, r):
    k = r * 0.5523
    return (f'M{f(cx-r)} {f(cy)}C{f(cx-r)} {f(cy-k)} {f(cx-k)} {f(cy-r)} {f(cx)} {f(cy-r)}C{f(cx+k)} {f(cy-r)} {f(cx+r)} {f(cy-k)} {f(cx+r)} {f(cy)}'
            f'C{f(cx+r)} {f(cy+k)} {f(cx+k)} {f(cy+r)} {f(cx)} {f(cy+r)}C{f(cx-k)} {f(cy+r)} {f(cx-r)} {f(cy+k)} {f(cx-r)} {f(cy)}Z')

# Frame top under the slide, cut down to the slide's bottom edge in front (x > 300): when the slide recoils the
# barrel shows above the rail instead of a tan block. Hidden under the slide at rest.
RAIL_OUTER = ('L288.035 122.498L415.965 122.467L446.821 122.257C447.208 122.255 447.593 122.287 447.978 122.332C450.262 122.597 453.681 122.509 455.875 122.508L462.488 122.496C466.361 122.489 469.504 125.629 469.501 129.502L469.475 158.662',
              'L288.035 122.498L300 122.49L300 170L469.475 170')
RAIL_INNER = ('L469.505 133.502C469.508 129.629 466.366 126.49 462.493 126.496L455.878 126.508C453.684 126.509 450.265 126.598 447.981 126.332C447.596 126.287 447.211 126.255 446.824 126.257L415.968 126.467L152.725 126.497',
              'L469.505 170L300 170L300 126.497L152.725 126.497')
def rail(text):
    for old, new in (RAIL_OUTER, RAIL_INNER):
        if old in text: text = text.replace(old, new)
    return text
s = s.replace(el('Subtract'), rail(el('Subtract'))).replace(el('Subtract_2'), rail(el('Subtract_2')))


# ---------- highlights: tapered crescents along an edge ----------
# Telegram stickers draw a highlight as a crescent hugging the contour inside the outline: widest in
# the middle, sharp at both ends, never an even stroke. One light from the top left: rim lights on
# the lit edges, core shadows on the opposite ones, a couple of small crisp speculars.
HL_DEFS = []

def resample(pts, n):
    d = [0.0]
    for a, b in zip(pts, pts[1:]): d.append(d[-1] + ((b[0]-a[0])**2 + (b[1]-a[1])**2) ** .5)
    out = []
    for k in range(n):
        t = d[-1] * k / (n - 1)
        j = max(i for i in range(len(d)) if d[i] <= t + 1e-9)
        j = min(j, len(pts) - 2)
        u = 0 if d[j+1] == d[j] else (t - d[j]) / (d[j+1] - d[j])
        out.append((pts[j][0] + (pts[j+1][0]-pts[j][0])*u, pts[j][1] + (pts[j+1][1]-pts[j][1])*u))
    return out

def catmull(pts):
    # open Catmull-Rom through pts as cubic segments: 'C' commands after an initial point
    segs = []
    for i in range(len(pts) - 1):
        p0 = pts[i-1] if i > 0 else pts[i]; p1, p2 = pts[i], pts[i+1]; p3 = pts[i+2] if i + 2 < len(pts) else pts[i+1]
        c1 = (p1[0] + (p2[0]-p0[0])/6, p1[1] + (p2[1]-p0[1])/6); c2 = (p2[0] - (p3[0]-p1[0])/6, p2[1] - (p3[1]-p1[1])/6)
        segs.append(f'C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}')
    return ''.join(segs)

def crescent(edge, width, toward, n=None, bias=0.5, taper=None):
    """edge: polyline [(x, y)…] (or path d); width: max px; toward: a point on the side to grow into;
    bias: where along the edge the crescent is widest (0..1); taper: instead of a crescent, a band of
    constant width that only fades in/out over this share of its length at each end."""
    pts = flatten(edge) if isinstance(edge, str) else edge
    n = n or (7 if width <= 5 else 11 if taper else 9)  # small speculars need fewer points (file size)
    pts = resample(pts, n)
    inner = []
    for k, (x, y) in enumerate(pts):
        a, b = pts[max(k-1, 0)], pts[min(k+1, n-1)]
        tx, ty = b[0]-a[0], b[1]-a[1]; L = (tx*tx + ty*ty) ** .5 or 1
        nx, ny = -ty/L, tx/L
        if (toward[0]-x)*nx + (toward[1]-y)*ny < 0: nx, ny = -nx, -ny
        u = k / (n - 1)
        if taper:
            ramp = lambda x: 0 if x <= 0 else 1 if x >= taper else (x / taper) ** 2 * (3 - 2 * x / taper)
            w = width * ramp(u) * ramp(1 - u)
        else:
            shape = math.sin(math.pi * (u ** (math.log(0.5) / math.log(bias)) if 0 < u < 1 else u)) if 0 < u < 1 else 0
            w = width * shape ** 0.8
        inner.append((x + nx*w, y + ny*w))
    return f'M{f(pts[0][0])} {f(pts[0][1])}' + catmull(pts) + catmull(inner[::-1]) + 'Z'

def hl(edge, width, toward, color, opacity=1.0, fade=None, bias=0.5, taper=None):
    """A crescent path element; fade=(x1, y1, x2, y2): opacity goes from `opacity` to 0 along that line."""
    d = crescent(edge, width, toward, bias=bias, taper=taper)
    if not fade:
        return f'<path d="{d}" fill="{color}"' + (f' fill-opacity="{opacity}"' if opacity < 1 else '') + '/>'
    gid = f'hl{len(HL_DEFS)}'
    HL_DEFS.append(f'<linearGradient id="{gid}" x1="{fade[0]}" y1="{fade[1]}" x2="{fade[2]}" y2="{fade[3]}" gradientUnits="userSpaceOnUse">'
                   f'<stop stop-color="{color}" stop-opacity="{opacity}"/><stop offset="1" stop-color="{color}" stop-opacity="0"/></linearGradient>')
    return f'<path d="{d}" fill="url(#{gid})"/>'

def offset(pts, d, toward):
    # the polyline moved by d along its normal, to the side of `toward`
    out = []
    for k, (x, y) in enumerate(pts):
        a, b = pts[max(k-1, 0)], pts[min(k+1, len(pts)-1)]
        tx, ty = b[0]-a[0], b[1]-a[1]; L = (tx*tx + ty*ty) ** .5 or 1
        nx, ny = -ty/L, tx/L
        if (toward[0]-x)*nx + (toward[1]-y)*ny < 0: nx, ny = -nx, -ny
        out.append((x + nx*d, y + ny*d))
    return out

def edge_run(d, start, end, via, trim=0.06):
    # the stretch of a closed outline from the point nearest `start` to the one nearest `end`, going the
    # way that passes `via`; `trim` shortens both ends (a share of the stretch)
    poly = flatten(d)
    if poly[0] == poly[-1]: poly = poly[:-1]
    near = lambda q: min(range(len(poly)), key=lambda i: (poly[i][0]-q[0])**2 + (poly[i][1]-q[1])**2)
    i0, i1, iv = near(start), near(end), near(via)
    n = len(poly)
    fwd = [poly[(i0 + k) % n] for k in range((i1 - i0) % n + 1)]
    back = [poly[(i0 - k) % n] for k in range((i0 - i1) % n + 1)]
    run = fwd if poly[iv] in fwd else back
    run = resample(run, 24)
    cut = max(1, round(len(run) * trim))
    return run[cut:-cut]

def line(pts, width, color, opacity=1.0):
    # an open highlight line: even width, round caps and joins
    d = f'M{f(pts[0][0])} {f(pts[0][1])}' + (catmull(pts) if len(pts) > 2 else f'L{f(pts[1][0])} {f(pts[1][1])}')
    return (f'<path d="{d}" stroke="{color}" stroke-width="{f(width)}" stroke-linecap="round" stroke-linejoin="round" fill="none"'
            + (f' stroke-opacity="{opacity}"' if opacity < 1 else '') + '/>')

def dot(p, width, color):
    return line([p, (p[0] + 0.01, p[1])], width, color)

GUARD_BOTTOM = 'M218.209 265.773C223.171 266.873 235.044 266.511 240.822 266.506L270.857 266.504C274.579 266.504 277.631 263.587 278.068 259.891'

frame_body = unnamed(el('Subtract'))
inner = unnamed(fill_none(el('Subtract_2'))).replace('stroke="url(#paint6_radial_0_4)"', 'stroke="#6F5C3D"')
guard_hl = unnamed(fill_none(el('Subtract_3')))
guard_edge = unnamed(fill_none(el('Subtract_4')))
strap = group_paths('Rectangle 2085654781_3')
lower = unnamed(el('Rectangle 2085654782'))
guard_top = group_paths('Rectangle 2085654778')
lines = '\n      '.join(unnamed(fill_none(el(f'Line {n}'))) for n in range(80, 87))


if MODE == 'fixed':
    # the sketch's highlights in their places, redrawn as crescents
    hl_guard = hl(GUARD_BOTTOM, 9, (250, 290), '#FAEBC6', 1.0, fade=(286, 0, 210, 0), bias=0.6)
    hl_slide = '\n      '.join([
        hl([(70, 114.5), (204, 114.5)], 9, (130, 140), '#B9BEC8', 0.9, fade=(70, 0, 214, 0), bias=0.4),
        hl([(298, 114.5), (400, 114.5)], 9, (350, 140), '#B9BEC8', 0.85, fade=(298, 0, 410, 0), bias=0.4),
        hl([(414, 114.5), (464, 114.5)], 9, (440, 140), '#B9BEC8', 0.85, fade=(414, 0, 472, 0), bias=0.45),
        hl([(432, 117.5), (458, 117.5)], 5, (446, 130), '#FFFFFF', 1.0, bias=0.6),
    ])
    slide_edge = unnamed(fill_none(el('Subtract_6')))
    hl_frame = hl_trigger = hl_barrel = ''
else:
    # lines along edges of the outline (centre of a 6-unit outline), set in by `inset`: 'a' keeps a gap
    # from the outline, 'b' lets the line overlap the outline's inner half. One width for every line and
    # dot, and the colours, come from style.json next to this script (edit it to tune the highlights).
    import json, os
    style = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'style.json')))['highlights']
    B = MODE == 'b'
    w = float(style['width'])
    inset = 2 + w / 2 if B else 9 + w / 2
    col, shade = style['colors'], style['shadows']
    # slide: an L round the back corner and along the top, a gap at the ejection port, a front line and a dot
    top, rear = 111 + inset, 64 + inset
    slide_lines = [
        line([(rear, 147), (rear, 136), (rear + 1.5, top + 5), (rear + 7, top + 0.5), (rear + 16, top), (198, top)], w, col['slide']),
        line([(304, top), (414, top)], w, col['slide']),
        dot((432, top), w, col['slide']),
        line([(84, 169 - inset), (440, 169 - inset)], w, shade['slide']),
        dot((100, 98 + w / 2), w, col['sights']),
        dot((430, 98 + w / 2), w, col['sights']),
    ]
    grip_back = [(91, 222), (93, 240), (87, 260), (75, 284), (61, 315), (50, 348), (45, 372)]
    grip_front = [(190, 293), (184, 308), (177, 334), (170, 362), (163, 388), (157, 404)]
    back = offset(grip_back, inset, (130, 300))
    hl_frame = '\n    '.join([
        line(back, w, col['frame']),
        dot(offset([(44, 388), (44.2, 396)], inset, (130, 300))[0], w, col['frame']),
        line(offset(grip_front, inset, (130, 350)), w, shade['frame']),
        # the frame's top edge is the slide's bottom outline (y 170, 3 below it): keep the line clear of it
        line([(124, 173 + w / 2 + 1), (204, 173 + w / 2 + 1)], w, col['frame']),
    ])
    # under the trigger: along the guard opening's own edge (its outline, Subtract_4) — down the front
    # wall and along the bottom bar, on the inner half of that outline
    guard_run = edge_run(attr(el('Subtract_4'), 'd'), (287.5, 214), (219, 265.5), (276, 262))
    hl_guard = line(offset(guard_run, inset, (300, 290)), w, col['guard'])
    hl_slide = '\n      '.join(slide_lines)
    slide_edge = ''
    hl_trigger = line([(227.5, 211), (228.5, 222), (232, 230)], w, col['trigger'])
    hl_barrel = dot((473, 125), w, col['barrel'])

svg = f'''<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
<!-- Pistol, clean parts for animation. Built from the Figma sketch (NV9sLgQZupDiOZ5V8zi6eY, node 634:1869).
     Group ids are part names; nesting is the rig. Telegram-safe: no masks, no gradient strokes. -->
<g id="gun" transform="translate(68.2 89.7) scale(0.72)">
  <g id="trigger">
    {unnamed(el('Vector'))}
    {hl_trigger}
  </g>
  <g id="frame">
    {frame_body}
    {strap}
    {lower}
    {guard_top}
    {inner}
    {guard_edge}
    {hl_guard}
    {hl_frame}
    <g id="grip">
      <path d="{panel_d}" fill="#836D47" opacity="0.8"/>
      <path d="{tex_d}" stroke="#74613F" stroke-width="6" stroke-linecap="round" opacity="0.6"/>
    </g>
  </g>
  <g id="pin">
    {unnamed(el('Vector_6'))}
  </g>
  <g id="barrel">
    <path d="M300 160H466V170H300Z" fill="#24262B" stroke="black" stroke-width="4"/>
    <path d="M300 121H473C475.2 121 477 122.8 477 125V156C477 158.2 475.2 160 473 160H300Z" fill="#3B3E45" stroke="black" stroke-width="6" stroke-linejoin="round"/>
    <path d="M306 129H470" stroke="#6E737D" stroke-width="4" stroke-linecap="round"/>
    {hl_barrel}
  </g>
  <g id="slide">
    {unnamed(el('Vector_2'))}
    {unnamed(el('Vector_3'))}
    {unnamed(el('Vector_4'))}
    {unnamed(el('Vector_5'))}
    <g id="port_open">
      <path d="M216 121H284C287 121 289 123 289 126V146C289 149 287 151 284 151H216C213 151 211 149 211 146V126C211 123 213 121 216 121Z" fill="#7A7F89" stroke="black" stroke-width="5"/><path d="M214 125H286" stroke="#2A2C31" stroke-width="6"/><path d="M218 146H282" stroke="#A9AEB8" stroke-width="3" stroke-linecap="round"/>
    </g>
    <g id="port_case">
      <path d="M236 128H270C272.5 128 274 130 274 132.5V139.5C274 142 272.5 144 270 144H236Z" fill="#E3AE45" stroke="#5A3E12" stroke-width="3"/>
      <path d="M240 132.5H268" stroke="#FFE29A" stroke-width="3" stroke-linecap="round"/>
    </g>
    {unnamed(el('Subtract_5'))}
    <g id="serrations">
      {lines}
    </g>
    {slide_edge}
    <g id="slide_highlight">
      {hl_slide}
    </g>
  </g>
  <g id="muzzle_face"><path d="M477 140H477.01" stroke="#000000" stroke-opacity="0" stroke-width="0.01"/></g>
  <g id="gun_light">
    <path d="{attr(el('Subtract_5'), 'd')}" fill="#FFD23F" stroke="black" stroke-width="6"/>
    <path d="{attr(el('Subtract'), 'd')}" fill="#FFD23F" stroke="black" stroke-width="6"/>
  </g>
</g>
<g id="shell_1"><path d="M236 143H263C265.5 143 267 145 267 147.5V154.5C267 157 265.5 159 263 159H236Z" fill="#E3AE45" stroke="#5A3E12" stroke-width="3"/><path d="M240 147.5H261" stroke="#FFE29A" stroke-width="3" stroke-linecap="round"/><path d="M230 141H237V161H230Z" fill="#B57F25" stroke="#5A3E12" stroke-width="3"/></g>
<g id="shell_2"><path d="M236 143H263C265.5 143 267 145 267 147.5V154.5C267 157 265.5 159 263 159H236Z" fill="#E3AE45" stroke="#5A3E12" stroke-width="3"/><path d="M240 147.5H261" stroke="#FFE29A" stroke-width="3" stroke-linecap="round"/><path d="M230 141H237V161H230Z" fill="#B57F25" stroke="#5A3E12" stroke-width="3"/></g>
<g id="shell_3"><path d="M236 143H263C265.5 143 267 145 267 147.5V154.5C267 157 265.5 159 263 159H236Z" fill="#E3AE45" stroke="#5A3E12" stroke-width="3"/><path d="M240 147.5H261" stroke="#FFE29A" stroke-width="3" stroke-linecap="round"/><path d="M230 141H237V161H230Z" fill="#B57F25" stroke="#5A3E12" stroke-width="3"/></g>
<defs>
{''.join(HL_DEFS)}
{grads(['paint0_linear_0_4','paint1_linear_0_4','paint2_linear_0_4','paint3_linear_0_4','paint4_linear_0_4','paint5_linear_0_4','paint7_linear_0_4','paint8_linear_0_4'])}
</defs>
</svg>
'''
def shift_x(m):
    nums = m.group(2).split(' ')
    return m.group(1) + ' '.join(f(float(n) - 20) if i % 2 == 0 else n for i, n in enumerate(nums))
for gid in ('shell_1', 'shell_2', 'shell_3'):
    a = svg.index(f'<g id="{gid}"'); b = svg.index('</g>', a)
    part = re.sub(r'([MLHC]|(?<=[0-9]) )', lambda m: m.group(0), svg[a:b])
    def fix_d(dm):
        d = dm.group(1); out_ = []
        for cmd, args in re.findall(r'([MLCHVZ])([^MLCHVZ]*)', d):
            vals = args.split()
            if cmd in 'MLC': vals = [f(float(v) - 20) if i % 2 == 0 else v for i, v in enumerate(vals)]
            elif cmd == 'H': vals = [f(float(v) - 20) for v in vals]
            out_.append(cmd + ' '.join(vals))
        return 'd="' + ''.join(out_) + '"'
    svg = svg[:a] + re.sub(r'(?<![a-z])d="([^"]*)"', fix_d, svg[a:b]) + svg[b:]
open(out, 'w').write(svg)
print('texture segments', len(tex), 'bytes', len(svg))
