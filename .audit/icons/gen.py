import subprocess, os
BG='#05050f'; CY='#35f0ff'; MG='#ff3d9a'; GO='#ffd23f'; OR='#ff5a36'; VI='#2a1450'; WH='#e8ecff'
def glow(id_, sd): return f'<filter id="{id_}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="{sd}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
def soft(id_, sd): return f'<filter id="{id_}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="{sd}"/></filter>'
def svg(body, defs=''):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><defs>{defs}</defs><rect width="1024" height="1024" fill="{BG}"/>{body}</svg>'
stars=[(120,140,4),(880,210,5),(200,820,4),(840,760,6),(300,300,3),(760,120,3),(140,560,5),(900,520,4),(640,900,3),(420,110,4)]
def starfield(alpha=0.45, avoid=None):
    out=[]
    for x,y,r in stars: out.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{WH}" opacity="{alpha}"/>')
    return ''.join(out)
def rocket(cx, cy, h, hull=CY, fin=MG, flame=GO, ghost=None, porthole=True, shade=True):
    # rocket drawn in a local box: nose at y=0, hull base at 0.63h, fins to 0.70h, flame to 1.0h; width 0.38h
    w=h*0.38; s=h
    def body(fill_h, fill_f, fill_fl, ox=0, oy=0, op=1, core=False):
        X=lambda u: cx+ox+u*w; Y=lambda v: cy-h/2+oy+v*s
        hullp=f'M{X(0)},{Y(0)} C{X(0.42)},{Y(0.17)} {X(0.5)},{Y(0.32)} {X(0.5)},{Y(0.46)} L{X(0.5)},{Y(0.63)} L{X(-0.5)},{Y(0.63)} L{X(-0.5)},{Y(0.46)} C{X(-0.5)},{Y(0.32)} {X(-0.42)},{Y(0.17)} {X(0)},{Y(0)} Z'
        finl=f'M{X(-0.5)},{Y(0.44)} L{X(-1.05)},{Y(0.72)} L{X(-0.72)},{Y(0.72)} L{X(-0.5)},{Y(0.63)} Z'
        finr=f'M{X(0.5)},{Y(0.44)} L{X(1.05)},{Y(0.72)} L{X(0.72)},{Y(0.72)} L{X(0.5)},{Y(0.63)} Z'
        flame=f'M{X(-0.32)},{Y(0.65)} L{X(0.32)},{Y(0.65)} C{X(0.32)},{Y(0.82)} {X(0.1)},{Y(0.93)} {X(0)},{Y(1.0)} C{X(-0.1)},{Y(0.93)} {X(-0.32)},{Y(0.82)} {X(-0.32)},{Y(0.65)} Z'
        g=f'<g opacity="{op}"><path d="{finl}" fill="{fill_f}"/><path d="{finr}" fill="{fill_f}"/><path d="{flame}" fill="{fill_fl}" filter="url(#gflame)"/>'
        if core: g+=f'<path d="M{X(-0.1)},{Y(0.65)} L{X(0.1)},{Y(0.65)} C{X(0.1)},{Y(0.78)} {X(0.03)},{Y(0.86)} {X(0)},{Y(0.9)} C{X(-0.03)},{Y(0.86)} {X(-0.1)},{Y(0.78)} {X(-0.1)},{Y(0.65)} Z" fill="{WH}" opacity="0.9"/>'
        g+=f'<path d="{hullp}" fill="{fill_h}" filter="url(#ghull)"/>'
        if shade and fill_h==hull: g+=f'<path d="M{X(0)},{Y(0)} C{X(0.42)},{Y(0.17)} {X(0.5)},{Y(0.32)} {X(0.5)},{Y(0.46)} L{X(0.5)},{Y(0.63)} L{X(0.08)},{Y(0.63)} L{X(0.08)},{Y(0.1)} Z" fill="#000" opacity="0.16"/>'
        if porthole and fill_h==hull: g+=f'<circle cx="{X(0)}" cy="{Y(0.3)}" r="{0.11*w}" fill="{BG}" stroke="{WH}" stroke-width="{0.03*w}"/>'
        return g+'</g>'
    out=''
    if ghost: out+=body(ghost, ghost, ghost, ox=-0.045*h, oy=0.045*h, op=0.9)
    out+=body(hull, fin, flame, core=True)
    return out
defs_common=glow('ghull',14)+glow('gflame',22)+glow('gring',18)+glow('gbolt',22)+soft('blur60',60)+soft('blur28',28)
# 1 Ascent
d=defs_common+f'<radialGradient id="neb" cx="0.5" cy="0.62" r="0.6"><stop offset="0" stop-color="{VI}" stop-opacity="0.95"/><stop offset="1" stop-color="{VI}" stop-opacity="0"/></radialGradient>'
b=f'<rect width="1024" height="1024" fill="url(#neb)"/>'+starfield(0.35)+rocket(512,540,760,ghost=MG)
open('1-ascent.svg','w').write(svg(b,d))
# 2 Dive
d=defs_common+f'<radialGradient id="disc" cx="0.5" cy="0.5" r="0.5"><stop offset="0.36" stop-color="{WH}" stop-opacity="0"/><stop offset="0.40" stop-color="{WH}"/><stop offset="0.47" stop-color="{GO}"/><stop offset="0.62" stop-color="{OR}"/><stop offset="0.85" stop-color="{MG}" stop-opacity="0.9"/><stop offset="1" stop-color="{VI}" stop-opacity="0"/></radialGradient><clipPath id="lower"><rect x="0" y="400" width="1024" height="624"/></clipPath>'
disc=f'<ellipse cx="512" cy="410" rx="390" ry="128" transform="rotate(-8 512 410)" fill="url(#disc)"/>'
b=starfield(0.4)+f'<g filter="url(#blur28)" opacity="0.9">{disc}</g>{disc}<circle cx="512" cy="400" r="150" fill="#000"/><g clip-path="url(#lower)">{disc}</g><circle cx="512" cy="400" r="150" fill="none" stroke="{WH}" stroke-width="26" filter="url(#gring)"/>'+rocket(512,770,340,ghost=None,porthole=False)
open('2-dive.svg','w').write(svg(b,d))
# 3 Horizon
d=defs_common+f'<radialGradient id="disc3" cx="0.5" cy="0.5" r="0.5"><stop offset="0.40" stop-color="{WH}" stop-opacity="0"/><stop offset="0.44" stop-color="{WH}"/><stop offset="0.5" stop-color="{GO}"/><stop offset="0.62" stop-color="{OR}"/><stop offset="0.82" stop-color="{MG}" stop-opacity="0.85"/><stop offset="1" stop-color="{VI}" stop-opacity="0"/></radialGradient><radialGradient id="wash" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="{VI}" stop-opacity="0.8"/><stop offset="1" stop-color="{VI}" stop-opacity="0"/></radialGradient><clipPath id="lower3"><rect x="0" y="512" width="1024" height="512"/></clipPath>'
disc=f'<ellipse cx="512" cy="512" rx="440" ry="120" transform="rotate(-14 512 512)" fill="url(#disc3)"/>'
b=f'<rect width="1024" height="1024" fill="url(#wash)"/><g filter="url(#blur28)">{disc}</g>{disc}<circle cx="512" cy="512" r="190" fill="#000"/><g clip-path="url(#lower3)">{disc}</g><circle cx="512" cy="512" r="190" fill="none" stroke="{WH}" stroke-width="24" filter="url(#gring)"/>'
open('3-horizon.svg','w').write(svg(b,d))
# 4 Double tap
d=defs_common+f'<radialGradient id="vig" cx="0.5" cy="0.55" r="0.6"><stop offset="0" stop-color="{VI}" stop-opacity="0.55"/><stop offset="1" stop-color="{VI}" stop-opacity="0"/></radialGradient>'
def lozenge(cx,cy,fill,op=1,f='gbolt'): return f'<rect x="{cx-65}" y="{cy-260}" width="130" height="520" rx="65" fill="{fill}" opacity="{op}" transform="rotate(12 {cx} {cy})" filter="url(#{f})"/>'
b=f'<rect width="1024" height="1024" fill="url(#vig)"/>'+lozenge(420-22,600+22,MG,0.9)+lozenge(604-22,430+22,MG,0.9)+lozenge(420,600,CY)+lozenge(604,430,CY)
open('4-doubletap.svg','w').write(svg(b,d))
# 5 Direct hit
d=defs_common+f'<radialGradient id="bloom" cx="0.55" cy="0.42" r="0.5"><stop offset="0" stop-color="#3e0c22" stop-opacity="0.9"/><stop offset="1" stop-color="#3e0c22" stop-opacity="0"/></radialGradient>'
# diamond at (560,390) size 300, split along bolt axis (12 deg from vertical) by a 34px fissure
b=f'<rect width="1024" height="1024" fill="url(#bloom)"/>'
b+=f'<g transform="rotate(12 560 390)"><polygon points="560,240 710,390 560,540 410,390" fill="{OR}" filter="url(#gbolt)"/><rect x="543" y="220" width="34" height="340" fill="{BG}"/></g>'
b+=f'<path d="M324,394 A250,250 0 0 1 734,394" fill="none" stroke="{MG}" stroke-width="26" stroke-linecap="round" opacity="0.95" filter="url(#gring)"/>'
b=b.replace('<g transform="rotate(12 560 390)">', '<g transform="rotate(12 560 390)">', 1)
# move the arc behind the diamond
parts=b.split('<g transform="rotate(12 560 390)">'); b=parts[0]+b[b.index('<path d="M324'):]+'<g transform="rotate(12 560 390)">'+parts[1].split('<path d="M324')[0]
b+=f'<rect x="443" y="494" width="110" height="380" rx="55" fill="{CY}" transform="rotate(12 498 684)" filter="url(#gbolt)"/>'
open('5-directhit.svg','w').write(svg(b,d))
for n in ['1-ascent','2-dive','3-horizon','4-doubletap','5-directhit']:
    subprocess.run(['rsvg-convert','-w','1024','-h','1024','-o',f'{n}.png',f'{n}.svg'],check=True)
    subprocess.run(['rsvg-convert','-w','120','-h','120','-o',f'{n}-120.png',f'{n}.svg'],check=True)
print('ok')
