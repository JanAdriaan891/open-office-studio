"""Visuele vergelijking voor de testmatrix via een onafhankelijke renderer.

Zet bron en uitvoer met LibreOffice (headless, tijdelijk profiel) om naar PDF,
rastert met pdftoppm (Poppler) en vergelijkt per pagina de pixels. Dit meet
verschillen zoals LibreOffice ze weergeeft, niet de weergave in de eigen editor.
Een bewerking hoort een klein, lokaal verschil te geven; een no-op nul.

Gebruik: python3 scripts/matrix_visueel.py [.local/matrix/documenten]
Schrijft .local/matrix/documenten/visueel.json. Zonder soffice/pdftoppm: 'niet gemeten'.
"""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

DPI = 40
DREMPEL = 48  # kanaalverschil dat als ander pixel telt (anti-aliasing negeren)


def lees_ppm(pad):
    data = pad.read_bytes()
    delen, pos = [], 0
    while len(delen) < 4:  # P6, breedte, hoogte, maximum
        while data[pos:pos + 1].isspace():
            pos += 1
        if data[pos:pos + 1] == b'#':
            pos = data.index(b'\n', pos) + 1
            continue
        eind = pos
        while not data[eind:eind + 1].isspace():
            eind += 1
        delen.append(data[pos:eind])
        pos = eind
    if delen[0] != b'P6' or delen[3] != b'255':
        raise ValueError('Onverwacht PPM-formaat.')
    return int(delen[1]), int(delen[2]), data[pos + 1:]


def pagina_verschil(a, b):
    (wa, ha, pa), (wb, hb, pb) = lees_ppm(a), lees_ppm(b)
    if (wa, ha) != (wb, hb):
        return None
    anders = sum(1 for i in range(0, len(pa), 3)
                 if abs(pa[i] - pb[i]) > DREMPEL or abs(pa[i + 1] - pb[i + 1]) > DREMPEL or abs(pa[i + 2] - pb[i + 2]) > DREMPEL)
    return anders / (wa * ha)


def naar_pdf(bestanden, uitmap, profiel):
    uitmap.mkdir(parents=True, exist_ok=True)
    subprocess.run(['soffice', '--headless', '--norestore', '--nolockcheck', f'-env:UserInstallation={profiel.as_uri()}',
                    '--convert-to', 'pdf', '--outdir', str(uitmap), *map(str, bestanden)],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=600)


def rasters(pdf, map_):
    map_.mkdir(parents=True, exist_ok=True)
    subprocess.run(['pdftoppm', '-r', str(DPI), str(pdf), str(map_ / 'p')], check=True, timeout=120)
    return sorted(map_.glob('p-*.ppm'))


def main():
    map_ = Path(sys.argv[1] if len(sys.argv) > 1 else '.local/matrix/documenten').resolve()
    uit = map_ / 'visueel.json'
    if not shutil.which('soffice') or not shutil.which('pdftoppm'):
        uit.write_text(json.dumps({'status': 'niet gemeten: soffice of pdftoppm ontbreekt'}) + '\n', encoding='utf-8')
        return 0
    resultaten = json.loads((map_ / 'resultaten.json').read_text(encoding='utf-8'))
    manifest = json.loads((map_ / 'bron' / 'manifest.json').read_text(encoding='utf-8'))
    werk = map_ / 'visueel'
    shutil.rmtree(werk, ignore_errors=True)
    profiel = Path(tempfile.mkdtemp(prefix='matrix-vis-'))
    try:
        bronnen = [map_ / 'bron' / v['bestand'] for v in manifest.values()]
        uitvoer = [map_ / r['uitvoer'] for r in resultaten if r.get('uitvoer')]
        naar_pdf(bronnen, werk / 'pdf-bron', profiel)
        naar_pdf(uitvoer, werk / 'pdf-uitvoer', profiel)
    finally:
        shutil.rmtree(profiel, ignore_errors=True)
    rapport = {'status': 'gemeten', 'renderer': 'LibreOffice → PDF → pdftoppm', 'dpi': DPI, 'drempel': DREMPEL, 'regels': []}
    for r in resultaten:
        if not r.get('uitvoer'):
            continue
        bron_pdf = werk / 'pdf-bron' / (Path(manifest[r['geval']]['bestand']).stem + '.pdf')
        doel_pdf = werk / 'pdf-uitvoer' / (Path(r['uitvoer']).stem + '.pdf')
        regel = {'geval': r['geval'], 'route': r['route'], 'actie': r['actie']}
        if not bron_pdf.exists() or not doel_pdf.exists():
            regel['fout'] = 'PDF-omzetting mislukt'
        else:
            a = rasters(bron_pdf, werk / 'ras' / 'bron' / r['geval'])
            b = rasters(doel_pdf, werk / 'ras' / Path(r['uitvoer']).stem)
            regel['paginas_bron'], regel['paginas_resultaat'] = len(a), len(b)
            regel['verschil_per_pagina'] = [None if v is None else round(v, 5) for v in (pagina_verschil(x, y) for x, y in zip(a, b))]
        rapport['regels'].append(regel)
    uit.write_text(json.dumps(rapport, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for regel in rapport['regels']:
        print(regel['geval'], regel['route'].split(' ')[0], regel['actie'], regel.get('paginas_bron'), regel.get('paginas_resultaat'), regel.get('verschil_per_pagina', regel.get('fout')))
    return 0


if __name__ == '__main__':
    sys.exit(main())
