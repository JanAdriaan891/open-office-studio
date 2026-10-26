"""Tweede route voor de testmatrix: volledige suite (LibreOffice headless via UNO).

Per fixture uit .local/matrix/documenten/bron: openen → opslaan zonder wijziging, één
bewerking via zoeken/vervangen, opslaan en heropenen. Voegt regels toe aan
.local/matrix/documenten/resultaten.json; de beoordeling gebeurt met
scripts/matrix_kenmerken.py. Gebruikt een tijdelijk profiel; macro's blijven
uitgeschakeld. Vereist het systeempakket python3-uno en soffice.

Gebruik: python3 scripts/test-matrix-libreoffice.py [.local/matrix/documenten]
"""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

import uno  # noqa: F401  (systeempakket; zet ook het com.sun.star-pad)
from com.sun.star.beans import PropertyValue

FILTERS = {'docx': 'MS Word 2007 XML', 'pptx': 'Impress MS PowerPoint 2007 XML'}


def eigenschappen(**kw):
    uit = []
    for k, v in kw.items():
        p = PropertyValue()
        p.Name, p.Value = k, v
        uit.append(p)
    return tuple(uit)


def versie():
    try:
        return subprocess.run(['soffice', '--version'], capture_output=True, text=True, timeout=60).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return 'onbekend'


def verbind(pijp):
    lokaal = uno.getComponentContext()
    resolver = lokaal.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', lokaal)
    for _ in range(120):
        try:
            return resolver.resolve(f'uno:pipe,name={pijp};urp;StarOffice.ComponentContext')
        except Exception:  # noqa: BLE001 - UNO geeft NoConnectException pas na opstart
            time.sleep(0.5)
    raise RuntimeError('LibreOffice reageerde niet binnen 60 seconden.')


def vervang(doc, oud, nieuw):
    """Zoeken/vervangen; Writer op documentniveau, Impress per dia."""
    doelen = [doc] if hasattr(doc, 'createReplaceDescriptor') else [doc.DrawPages.getByIndex(i) for i in range(doc.DrawPages.Count)]
    aantal = 0
    for doel in doelen:
        d = doel.createReplaceDescriptor()
        d.SearchString, d.ReplaceString, d.SearchCaseSensitive = oud, nieuw, True
        aantal += doel.replaceAll(d)
    return aantal


def tekst_aanwezig(doc, fragment):
    doelen = [doc] if hasattr(doc, 'createSearchDescriptor') else [doc.DrawPages.getByIndex(i) for i in range(doc.DrawPages.Count)]
    for doel in doelen:
        d = doel.createSearchDescriptor()
        d.SearchString, d.SearchCaseSensitive = fragment, True
        if doel.findFirst(d) is not None:
            return True
    return False


def main():
    map_ = Path(sys.argv[1] if len(sys.argv) > 1 else '.local/matrix/documenten').resolve()
    manifest = json.loads((map_ / 'bron' / 'manifest.json').read_text(encoding='utf-8'))
    resultaten_pad = map_ / 'resultaten.json'
    resultaten = [r for r in json.loads(resultaten_pad.read_text(encoding='utf-8')) if not r['route'].startswith('libreoffice')]
    (map_ / 'uitvoer').mkdir(exist_ok=True)
    profiel = Path(tempfile.mkdtemp(prefix='matrix-lo-'))
    pijp = f'openaec_matrix_{profiel.name}'
    proces = subprocess.Popen(['soffice', '--headless', '--invisible', '--nologo', '--norestore', '--nodefault', '--nolockcheck',
                               f'-env:UserInstallation={profiel.as_uri()}', f'--accept=pipe,name={pijp};urp;'],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    engine = f'{versie()} (headless, UNO)'
    route = 'libreoffice-suite (soffice headless/UNO)'
    try:
        ctx = verbind(pijp)
        desktop = ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)
        laad = eigenschappen(Hidden=True, ReadOnly=False, MacroExecutionMode=0)
        for geval, info in manifest.items():
            bron = map_ / 'bron' / info['bestand']
            soort = bron.suffix[1:]
            for actie in ('noop', 'bewerking'):
                regel = {'geval': geval, 'route': route, 'engine': engine, 'actie': actie,
                         'bronhash': hashlib.sha256(bron.read_bytes()).hexdigest()}
                doel = map_ / 'uitvoer' / f'{geval}-libreoffice-{actie}.{soort}'
                doc = None
                try:
                    doc = desktop.loadComponentFromURL(bron.as_uri(), '_blank', 0, laad)
                    if doc is None:
                        raise RuntimeError('openen mislukt')
                    if actie == 'bewerking':
                        b = info['bewerking']
                        regel['vervangingen'] = vervang(doc, b['oud'], b['nieuw'])
                    doc.storeToURL(doel.as_uri(), eigenschappen(FilterName=FILTERS[soort], Overwrite=True))
                    doc.close(True)
                    doc = None
                    terug = desktop.loadComponentFromURL(doel.as_uri(), '_blank', 0, laad)
                    regel['heropend'] = bool(terug) and (actie == 'noop' or tekst_aanwezig(terug, info['bewerking']['nieuw']))
                    terug.close(True)
                    regel['uitvoer'] = str(doel.relative_to(map_))
                    regel['resulthash'] = hashlib.sha256(doel.read_bytes()).hexdigest()
                except Exception as fout:  # noqa: BLE001 - per bestand vastleggen, niet afbreken
                    regel['fout'] = str(fout)[:200]
                    if doc is not None:
                        doc.close(True)
                resultaten.append(regel)
        try:
            desktop.terminate()
        except Exception:  # noqa: BLE001 - verbinding valt weg tijdens afsluiten
            pass
    finally:
        try:
            proces.wait(timeout=30)
        except subprocess.TimeoutExpired:
            proces.kill()
        shutil.rmtree(profiel, ignore_errors=True)
    resultaten_pad.write_text(json.dumps(resultaten, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'LibreOffice-route: {sum(1 for r in resultaten if r["route"] == route and "uitvoer" in r)} uitvoerbestanden.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
