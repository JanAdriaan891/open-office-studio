"""Onafhankelijke kenmerkcontrole voor XLSX-pakketten (alleen Python-standaardbibliotheek).

Leest structuur, geen documentinhoud: bladnamen, benoemde bereiken, verborgen bladen,
afdrukinstellingen, grafieken, validatie, voorwaardelijke opmaak, draaitabellen, onbekende
onderdelen, getalnotaties en formuletellingen. Volgt relaties in plaats van alleen bestandsnamen,
zodat een losgeraakt onderdeel niet als 'aanwezig' telt.

Gebruik:
  python3 scripts/rekenblad_kenmerken.py bestand.xlsx
  python3 scripts/rekenblad_kenmerken.py bron.xlsx resultaat.xlsx   # meldt verloren kenmerken

Exitcode bij vergelijken: 0 = geen verlies, 1 = kenmerken verloren of gewijzigd, 2 = onleesbaar.
"""
import json
import posixpath
import sys
import zipfile
from xml.etree import ElementTree as ET

M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
PKG = '{http://schemas.openxmlformats.org/package/2006/relationships}'
CT = '{http://schemas.openxmlformats.org/package/2006/content-types}'
C = '{http://schemas.openxmlformats.org/drawingml/2006/chart}'
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
BEKENDE_RELATIES = {REL + s for s in (
    'officeDocument', 'worksheet', 'styles', 'sharedStrings', 'theme', 'calcChain', 'drawing', 'chart',
    'pivotTable', 'pivotCacheDefinition', 'pivotCacheRecords', 'chartsheet', 'externalLink', 'table',
    'comments', 'vmlDrawing', 'image', 'printerSettings', 'hyperlink', 'extended-properties', 'chartUserShapes',
    'customXml', 'connections', 'queryTable')} | {
    'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
    'http://schemas.microsoft.com/office/2011/relationships/chartStyle',
    'http://schemas.microsoft.com/office/2011/relationships/chartColorStyle'}
MAX_INHOUD = 100 * 1024 * 1024


def _relaties(archief, deel):
    map_, naam = posixpath.split(deel)
    pad = posixpath.join(map_, '_rels', naam + '.rels')
    if pad not in archief.namelist():
        return []
    uit = []
    for r in ET.fromstring(archief.read(pad)).iter(PKG + 'Relationship'):
        doel = r.get('Target')
        if r.get('TargetMode') != 'External':
            doel = doel.lstrip('/') if doel.startswith('/') else posixpath.normpath(posixpath.join(map_, doel))
        uit.append({'id': r.get('Id'), 'type': r.get('Type'), 'doel': doel, 'extern': r.get('TargetMode') == 'External'})
    return uit


def kenmerken(pad):
    with zipfile.ZipFile(pad) as archief:
        if sum(i.file_size for i in archief.infolist()) > MAX_INHOUD:
            raise ValueError('Uitgepakte inhoud is groter dan 100 MiB.')
        namen = set(archief.namelist())
        xml = lambda deel: ET.fromstring(archief.read(deel))
        types = xml('[Content_Types].xml')
        overrides = {o.get('PartName').lstrip('/'): o.get('ContentType') for o in types.iter(CT + 'Override')}
        wb = xml('xl/workbook.xml')
        wb_rels = {r['id']: r for r in _relaties(archief, 'xl/workbook.xml')}
        calc = wb.find(M + 'calcPr')
        uit = {
            'bladen': [], 'verborgen_bladen': [], 'benoemde_bereiken': [], 'afdrukbereik': [],
            'grafieken': [], 'draaitabellen': [], 'draaicaches': [], 'validaties': [],
            'voorwaardelijke_opmaak': 0, 'pagina_instellingen': [], 'getalnotaties': {},
            'formules': 0, 'kruisverwijzingen': 0, 'onbekende_onderdelen': [],
            'rekenketen': 'xl/calcChain.xml' in namen,
            'calcPr': dict(calc.attrib) if calc is not None else {},
        }
        for d in wb.iter(M + 'definedName'):
            naam = d.get('name')
            item = {'naam': naam, 'formule': d.text, 'blad': d.get('localSheetId')}
            (uit['afdrukbereik'] if naam == '_xlnm.Print_Area' else uit['benoemde_bereiken']).append(item)
        for pc in wb.iter(M + 'pivotCache'):
            rel = wb_rels.get(pc.get(R + 'id'))
            definitie = rel['doel'] if rel else None
            records = [r['doel'] for r in _relaties(archief, definitie) if r['type'] == REL + 'pivotCacheRecords'] if definitie in namen else []
            uit['draaicaches'].append({'cacheId': pc.get('cacheId'), 'definitie': definitie if definitie in namen else None,
                                       'records': [r for r in records if r in namen]})
        nf = xml('xl/styles.xml').find(M + 'numFmts') if 'xl/styles.xml' in namen else None
        if nf is not None:
            uit['getalnotaties'] = {n.get('numFmtId'): n.get('formatCode') for n in nf.iter(M + 'numFmt')}
        for blad in wb.iter(M + 'sheet'):
            rel = wb_rels[blad.get(R + 'id')]
            uit['bladen'].append(blad.get('name'))
            if blad.get('state') in ('hidden', 'veryHidden'):
                uit['verborgen_bladen'].append({'naam': blad.get('name'), 'state': blad.get('state')})
            ws = xml(rel['doel'])
            blad_rels = {r['id']: r for r in _relaties(archief, rel['doel'])}
            for f in ws.iter(M + 'f'):
                uit['formules'] += 1
                if f.text and '!' in f.text:
                    uit['kruisverwijzingen'] += 1
            ps = ws.find(M + 'pageSetup')
            if ps is not None:
                uit['pagina_instellingen'].append({'blad': blad.get('name'), **ps.attrib})
            for dv in ws.iter(M + 'dataValidation'):
                uit['validaties'].append({'blad': blad.get('name'), 'type': dv.get('type'), 'sqref': dv.get('sqref'),
                                          'formule1': (dv.findtext(M + 'formula1') or '')})
            uit['voorwaardelijke_opmaak'] += len(ws.findall(M + 'conditionalFormatting'))
            for dr in ws.iter(M + 'drawing'):
                tek = blad_rels.get(dr.get(R + 'id'))
                if not tek or tek['doel'] not in namen:
                    continue
                tek_rels = {r['id']: r for r in _relaties(archief, tek['doel'])}
                for gc in xml(tek['doel']).iter(C + 'chart'):
                    g = tek_rels.get(gc.get(R + 'id'))
                    if g and g['doel'] in namen:
                        bronnen = [f.text for f in xml(g['doel']).iter(C + 'f')]
                        uit['grafieken'].append({'blad': blad.get('name'), 'onderdeel': g['doel'], 'bronnen': bronnen})
            for r in blad_rels.values():
                if r['type'] == REL + 'pivotTable' and r['doel'] in namen:
                    pt = xml(r['doel'])
                    loc = pt.find(M + 'location')
                    cache = [x['doel'] for x in _relaties(archief, r['doel']) if x['type'] == REL + 'pivotCacheDefinition']
                    uit['draaitabellen'].append({'blad': blad.get('name'), 'onderdeel': r['doel'], 'naam': pt.get('name'),
                                                 'locatie': loc.get('ref') if loc is not None else None,
                                                 'cache': [c for c in cache if c in namen]})
        # Onbekend: relaties van een type buiten de bekende lijst, vanaf pakket of werkboek.
        for bron in ('', 'xl/workbook.xml'):
            for r in _relaties(archief, bron):
                if r['type'] not in BEKENDE_RELATIES:
                    uit['onbekende_onderdelen'].append({'onderdeel': r['doel'], 'relatie': r['type'],
                                                       'aanwezig': r['doel'] in namen,
                                                       'inhoudstype': overrides.get(r['doel'])})
        return uit


def verlies(voor, na):
    """Kenmerken die in `na` ontbreken of afwijken ten opzichte van `voor`."""
    a, b = kenmerken(voor), kenmerken(na)
    meldingen = []
    vergelijk = ['bladen', 'verborgen_bladen', 'benoemde_bereiken', 'afdrukbereik', 'grafieken', 'draaitabellen',
                 'draaicaches', 'validaties', 'voorwaardelijke_opmaak', 'pagina_instellingen', 'onbekende_onderdelen',
                 'formules', 'kruisverwijzingen']
    for sleutel in vergelijk:
        if a[sleutel] != b[sleutel]:
            meldingen.append({'kenmerk': sleutel, 'voor': a[sleutel], 'na': b[sleutel]})
    ontbrekend = {k: v for k, v in a['getalnotaties'].items() if v not in b['getalnotaties'].values()}
    if ontbrekend:
        meldingen.append({'kenmerk': 'getalnotaties', 'voor': ontbrekend, 'na': None})
    info = {'rekenketen': [a['rekenketen'], b['rekenketen']], 'calcPr': [a['calcPr'], b['calcPr']]}
    return {'verloren_of_gewijzigd': meldingen, 'informatief': info}


def main():
    try:
        if len(sys.argv) == 2:
            print(json.dumps(kenmerken(sys.argv[1]), ensure_ascii=False, indent=1))
            return 0
        if len(sys.argv) == 3:
            rapport = verlies(sys.argv[1], sys.argv[2])
            print(json.dumps(rapport, ensure_ascii=False, indent=1))
            return 1 if rapport['verloren_of_gewijzigd'] else 0
    except (OSError, KeyError, ValueError, ET.ParseError, zipfile.BadZipFile) as fout:
        print(json.dumps({'fout': str(fout)}, ensure_ascii=False), file=sys.stderr)
        return 2
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main())
