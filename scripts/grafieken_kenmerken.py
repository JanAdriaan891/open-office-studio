"""Grafiekkenmerken van OOXML-pakketten (DOCX/XLSX/PPTX), alleen lezend en zonder documentinhoud.

Gebruik:
  python3 scripts/grafieken_kenmerken.py kenmerken < paden.json    (JSON-lijst met paden)
  python3 scripts/grafieken_kenmerken.py vergelijk < paren.json    (JSON-lijst met [bron, uitvoer])

Uitvoer is JSON op stdout. Er worden alleen onderdeelnamen, aantallen, grafieksoorten,
makernamen (docProps/app.xml) en hashes gerapporteerd, nooit tekst of waarden uit het document.
"""
import hashlib
import json
import posixpath
import re
import sys
import zipfile
from collections import Counter
from xml.etree import ElementTree as ET

MAX_ARCHIEF = 20 * 1024 * 1024
MAX_INHOUD = 200 * 1024 * 1024
MAX_ONDERDELEN = 20000

NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart'
NS_CX = 'http://schemas.microsoft.com/office/drawing/2014/chartex'
NS_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
NS_CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
CT_CHART = 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml'
CT_CHARTEX = 'application/vnd.ms-office.chartex+xml'
HOOFD = {
    'word/document.xml': 'docx',
    'xl/workbook.xml': 'xlsx',
    'ppt/presentation.xml': 'pptx',
}
# Hoofdsoort per c:*Chart-element (plotArea), in het Nederlands zoals in het manifest gebruikt.
SOORTEN = {
    'barChart': None,  # kolom of staaf, afhankelijk van c:barDir
    'bar3DChart': None,
    'lineChart': 'lijn', 'line3DChart': 'lijn',
    'pieChart': 'taart', 'pie3DChart': 'taart', 'ofPieChart': 'taart',
    'doughnutChart': 'ring',
    'areaChart': 'vlak', 'area3DChart': 'vlak',
    'scatterChart': 'spreiding',
    'bubbleChart': 'bel',
    'radarChart': 'radar',
    'stockChart': 'koers',
    'surfaceChart': 'oppervlak', 'surface3DChart': 'oppervlak',
}
OLE_MAGIC = b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'


def lokaal(tag):
    return tag.rsplit('}', 1)[-1]


def rels_pad(deel):
    map_, naam = posixpath.split(deel)
    return posixpath.join(map_, '_rels', naam + '.rels')


def lees_rels(archief, namen, deel):
    pad = rels_pad(deel)
    if pad not in namen:
        return []
    uit = []
    try:
        wortel = ET.fromstring(archief.read(pad))
    except ET.ParseError:
        return [{'fout': 'rels-xml-ongeldig'}]
    basis = posixpath.dirname(deel)
    for rel in wortel.findall(f'{{{NS_REL}}}Relationship'):
        doel = rel.get('Target', '')
        extern = rel.get('TargetMode') == 'External'
        if not extern:
            doel = doel.lstrip('/') if doel.startswith('/') else posixpath.normpath(posixpath.join(basis, doel))
        uit.append({'id': rel.get('Id'), 'type': rel.get('Type', '').rsplit('/', 1)[-1], 'doel': doel, 'extern': extern})
    return uit


def open_pakket(pad):
    with open(pad, 'rb') as f:
        kop = f.read(8)
    if kop == OLE_MAGIC:
        raise ValueError('versleuteld-of-ole')
    archief = zipfile.ZipFile(pad)
    leden = archief.infolist()
    if len(leden) > MAX_ONDERDELEN:
        raise ValueError('te-veel-onderdelen')
    if sum(l.file_size for l in leden) > MAX_INHOUD:
        raise ValueError('uitgepakt-te-groot')
    for l in leden:
        if l.flag_bits & 1:
            raise ValueError('versleuteld-zip')
        n = l.filename
        if '\\' in n or n.startswith('/') or '..' in n.split('/'):
            raise ValueError('ongeldige-onderdeelnaam')
    return archief


def inhoudstypen(archief, namen):
    if '[Content_Types].xml' not in namen:
        raise ValueError('content-types-ontbreekt')
    wortel = ET.fromstring(archief.read('[Content_Types].xml'))
    standaard, override = {}, {}
    for e in wortel:
        if lokaal(e.tag) == 'Default':
            standaard[e.get('Extension', '').lower()] = e.get('ContentType', '')
        elif lokaal(e.tag) == 'Override':
            override[e.get('PartName', '').lstrip('/')] = e.get('ContentType', '')

    def type_van(naam):
        return override.get(naam) or standaard.get(naam.rsplit('.', 1)[-1].lower(), '')
    return type_van


def soorten_klassiek(xml):
    """Grafieksoorten uit een c:chartSpace; levert (soorten, details)."""
    wortel = ET.fromstring(xml)
    plot = wortel.find(f'.//{{{NS_C}}}plotArea')
    soorten, details = [], []
    if plot is None:
        return soorten, details
    typen = [e for e in plot if lokaal(e.tag).endswith('Chart') and e.tag.startswith(f'{{{NS_C}}}')]
    for e in typen:
        naam = lokaal(e.tag)
        details.append('c:' + naam)
        hoofd = SOORTEN.get(naam)
        if naam in ('barChart', 'bar3DChart'):
            richting = e.find(f'{{{NS_C}}}barDir')
            hoofd = 'staaf' if richting is not None and richting.get('val') == 'bar' else 'kolom'
        if hoofd:
            soorten.append(hoofd)
        if '3D' in naam:
            soorten.append('3d')
        groep = e.find(f'{{{NS_C}}}grouping')
        if groep is not None and groep.get('val') in ('stacked', 'percentStacked'):
            soorten.append('gestapeld' if groep.get('val') == 'stacked' else 'gestapeld-100')
        if naam == 'scatterChart':
            stijl = e.find(f'{{{NS_C}}}scatterStyle')
            if stijl is not None:
                details.append('scatterStyle=' + str(stijl.get('val')))
    if len(typen) > 1:
        soorten.append('combinatie')
    if wortel.find(f'.//{{{NS_C}}}externalData') is not None:
        details.append('c:externalData')
    if any(lokaal(x.tag) == 'pivotSource' for x in wortel.iter()):
        soorten.append('draaigrafiek')
    return soorten, details


def soorten_chartex(xml):
    wortel = ET.fromstring(xml)
    layouts = sorted({s.get('layoutId', '?') for s in wortel.iter(f'{{{NS_CX}}}series')})
    return ['chartex', *('chartex:' + l for l in layouts)], ['cx:chart']


def kenmerken(pad):
    uit = {'pad': pad, 'geldig': False}
    try:
        archief = open_pakket(pad)
    except ValueError as fout:
        uit['fout'] = str(fout)
        uit['versleuteld'] = str(fout).startswith('versleuteld')
        return uit
    except (zipfile.BadZipFile, OSError) as fout:
        uit['fout'] = 'geen-zip: ' + type(fout).__name__
        return uit
    with archief:
        namen = set(archief.namelist())
        formaat = next((f for d, f in HOOFD.items() if d in namen), None)
        if not formaat:
            # Hoofddeel via _rels/.rels opzoeken (afwijkende onderdeelnamen).
            for rel in lees_rels(archief, namen, ''):
                if rel.get('type') == 'officeDocument':
                    formaat = {'word': 'docx', 'xl': 'xlsx', 'ppt': 'pptx'}.get(rel['doel'].split('/')[0])
        uit['formaat'] = formaat
        try:
            type_van = inhoudstypen(archief, namen)
        except (ValueError, ET.ParseError) as fout:
            uit['fout'] = str(fout)
            return uit
        if not formaat or '_rels/.rels' not in namen:
            uit['fout'] = 'geen-hoofddeel'
            return uit
        hoofdtype = type_van(next((d for d in HOOFD if d in namen), ''))
        uit['macro'] = 'macroEnabled' in hoofdtype
        uit['sjabloon'] = 'template' in hoofdtype
        grafieken, chartex = [], []
        for n in sorted(namen):
            t = type_van(n)
            if t == CT_CHART or (not t and re.search(r'/charts/chart\d*\.xml$', n)):
                grafieken.append(n)
            elif t == CT_CHARTEX or re.search(r'/charts/chartEx\d*\.xml$', n):
                chartex.append(n)
        soorten, details, fouten = Counter(), Counter(), []
        extern_data = ingesloten = extern_gekoppeld = 0
        for n in grafieken + chartex:
            try:
                xml = archief.read(n)
                s, d = soorten_chartex(xml) if n in chartex else soorten_klassiek(xml)
            except (ET.ParseError, KeyError) as fout:
                fouten.append(n)
                continue
            soorten.update(set(s))
            details.update(d)
            for rel in lees_rels(archief, namen, n):
                if rel.get('type') == 'package' and not rel.get('extern'):
                    ingesloten += rel['doel'] in namen
                elif rel.get('type') in ('oleObject', 'package') and rel.get('extern'):
                    extern_gekoppeld += 1
            if b'externalData' in xml:
                extern_data += 1
        maker = None
        if 'docProps/app.xml' in namen:
            try:
                app = ET.fromstring(archief.read('docProps/app.xml'))
                a = next((x.text for x in app if lokaal(x.tag) == 'Application'), None)
                v = next((x.text for x in app if lokaal(x.tag) == 'AppVersion'), None)
                maker = ' '.join(x for x in (a, v) if x) or None
            except ET.ParseError:
                pass
        uit.update({
            'geldig': True,
            'grafieken': len(grafieken) + len(chartex),
            'klassiek': len(grafieken),
            'chartex': len(chartex),
            'grafiekonderdelen': grafieken + chartex,
            'soorten': sorted(soorten),
            'details': dict(sorted(details.items())),
            'externalData': extern_data,
            'ingeslotenWerkboeken': ingesloten,
            'externGekoppeld': extern_gekoppeld,
            'onleesbareGrafieken': fouten,
            'maker': maker,
        })
        return uit


def grafiekgraaf(pad):
    """Alle grafiekgerelateerde onderdelen met hun hash, plus verwijzingen ernaartoe."""
    archief = open_pakket(pad)
    with archief:
        namen = set(archief.namelist())
        type_van = inhoudstypen(archief, namen)
        hash_van = lambda n: hashlib.sha256(archief.read(n)).hexdigest()
        grafieken = [n for n in namen if type_van(n) in (CT_CHART, CT_CHARTEX)
                     or re.search(r'/charts/chart(Ex)?\d*\.xml$', n)]
        onderdelen, kapot = {}, []
        soortenteller = Counter()
        extern_data = 0
        for g in grafieken:
            onderdelen[g] = {'rol': 'grafiek', 'sha256': hash_van(g)}
            try:
                xml = archief.read(g)
                s, _ = soorten_chartex(xml) if 'chartex' in type_van(g) or 'chartEx' in g else soorten_klassiek(xml)
                soortenteller.update(sorted(set(s)))
                extern_data += b'externalData' in xml
            except ET.ParseError:
                soortenteller['onleesbaar'] += 1
            for rel in lees_rels(archief, namen, g):
                if rel.get('extern') or 'doel' not in rel:
                    continue
                if rel['doel'] in namen:
                    onderdelen[rel['doel']] = {'rol': rel['type'], 'sha256': hash_van(rel['doel'])}
                else:
                    kapot.append(f'{g} -> {rel["doel"]}')
        # Verwijzingen van tekening/dia/document naar grafiekonderdelen.
        verwijzingen = 0
        for n in namen:
            if '/_rels/' not in n or not n.endswith('.rels'):
                continue
            map_ = posixpath.dirname(posixpath.dirname(n))
            bron = posixpath.join(map_, posixpath.basename(n)[:-5])
            if bron in grafieken:
                continue
            for rel in lees_rels(archief, namen, bron):
                if rel.get('type') in ('chart', 'chartEx') and not rel.get('extern'):
                    verwijzingen += 1
                    if rel['doel'] not in namen:
                        kapot.append(f'{bron} -> {rel["doel"]}')
        return {
            'onderdelen': onderdelen,
            'verwijzingen': verwijzingen,
            'kapotteRelaties': sorted(kapot),
            'soorten': dict(soortenteller),
            'externalData': extern_data,
        }


def vergelijk(bron, uitvoer):
    a = grafiekgraaf(bron)
    try:
        b = grafiekgraaf(uitvoer)
    except (ValueError, zipfile.BadZipFile, OSError) as fout:
        return {'fout': f'uitvoer onleesbaar: {fout}'}
    hashes_b = {v['sha256'] for v in b['onderdelen'].values()}
    verloren, gewijzigd, identiek = [], [], 0
    for naam, info in sorted(a['onderdelen'].items()):
        if naam in b['onderdelen'] and b['onderdelen'][naam]['sha256'] == info['sha256']:
            identiek += 1
        elif info['sha256'] in hashes_b:
            identiek += 1  # onder een andere naam bewaard
        elif naam in b['onderdelen'] or any(v['rol'] == info['rol'] for v in b['onderdelen'].values()):
            gewijzigd.append(naam)
        else:
            verloren.append(naam)
    rol = lambda g, r: sum(1 for v in g['onderdelen'].values() if v['rol'] == r)
    # Een onderdeel dat niet meer bestaat en waarvan de rol vaker voorkwam dan in de uitvoer telt als verloren.
    tekort = {r: rol(a, r) - rol(b, r) for r in {v['rol'] for v in a['onderdelen'].values()} if rol(a, r) > rol(b, r)}
    behouden = (not tekort and rol(a, 'grafiek') == rol(b, 'grafiek')
                and a['verwijzingen'] <= b['verwijzingen'] and not b['kapotteRelaties']
                and a['externalData'] <= b['externalData'])
    return {
        'grafiekenVoor': rol(a, 'grafiek'), 'grafiekenNa': rol(b, 'grafiek'),
        'onderdelenVoor': len(a['onderdelen']), 'onderdelenNa': len(b['onderdelen']),
        'identiek': identiek, 'gewijzigd': gewijzigd, 'verloren': verloren,
        'tekortPerRol': tekort,
        'verwijzingenVoor': a['verwijzingen'], 'verwijzingenNa': b['verwijzingen'],
        'externalDataVoor': a['externalData'], 'externalDataNa': b['externalData'],
        'ingeslotenVoor': rol(a, 'package'), 'ingeslotenNa': rol(b, 'package'),
        'kapotteRelatiesNa': b['kapotteRelaties'][:20],
        'soortenVoor': a['soorten'], 'soortenNa': b['soorten'],
        'behouden': behouden,
        'byteIdentiek': not gewijzigd and not verloren and not tekort and rol(a, 'grafiek') == rol(b, 'grafiek'),
    }


def main():
    modus = sys.argv[1] if len(sys.argv) > 1 else ''
    invoer = json.load(sys.stdin)
    if modus == 'kenmerken':
        uit = []
        for p in invoer:
            try:
                uit.append(kenmerken(p))
            except Exception as fout:  # één kapot bestand mag de reeks niet stoppen
                uit.append({'pad': p, 'geldig': False, 'fout': f'{type(fout).__name__}: {fout}'[:200]})
    elif modus == 'vergelijk':
        uit = []
        for bron, resultaat in invoer:
            try:
                uit.append(vergelijk(bron, resultaat))
            except Exception as fout:
                uit.append({'fout': f'{type(fout).__name__}: {fout}'[:200]})
    else:
        print(__doc__, file=sys.stderr)
        return 2
    json.dump(uit, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == '__main__':
    sys.exit(main())
