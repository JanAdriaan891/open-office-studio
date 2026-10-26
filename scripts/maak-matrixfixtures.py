"""Maak synthetische DOCX- en PPTX-fixtures voor de testmatrix (D1–D3, P1–P3).

Alleen Python-standaardbibliotheek. De uitvoer is reproduceerbaar: vaste
ZIP-tijdstempels, vaste volgorde en uitsluitend eigen testzinnen. De bestanden
bevatten geen praktijkinhoud en zijn geen representatief corpus; zij bevatten
precies de kenmerken uit docs/onderzoek/testmatrix.md.

Gebruik: python3 scripts/maak-matrixfixtures.py [uitvoermap]
Standaard: .local/matrix/documenten/bron (genegeerd door Git; .local/matrix/ zelf
wordt ook door de rekenbladproef gebruikt).
"""
import hashlib
import json
from pathlib import Path
import struct
import sys
import zipfile
import zlib

TIJD = (2026, 1, 1, 0, 0, 0)

NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
NS_PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture'
NS_WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart'
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
CT = 'application/vnd.openxmlformats-officedocument.'
NS_MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006'
NS_OPENAEC = 'urn:openaec:matrix'
EXT_URI = '{6B1E0A2D-0000-4000-8000-00000000F003}'
XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

# Bewerkingen per geval: (onderdeel, oorspronkelijk fragment, nieuw fragment).
# Het oorspronkelijke fragment komt precies één keer in het hele pakket voor.
BEWERKINGEN = {
    'D1': ('word/document.xml', 'gepland in week 12', 'gepland in week 14'),
    'D2': ('word/document.xml', 'Wandoppervlak 125 m2', 'Wandoppervlak 130 m2'),
    'D3': ('word/document.xml', 'losse matrixzin versie A', 'losse matrixzin versie B'),
    'P1': ('ppt/slides/slide1.xml', 'Matrixproef P1 concept', 'Matrixproef P1 definitief'),
    'P2': ('ppt/slides/slide1.xml', 'Toelichting kwartaal 3', 'Toelichting kwartaal 4'),
    'P3': ('ppt/slides/slide1.xml', 'Losse notitie variant A', 'Losse notitie variant B'),
}


def png(breedte, hoogte, kleur):
    """Een klein effen PNG-beeld, zonder externe pakketten."""
    def blok(soort, data):
        return struct.pack('>I', len(data)) + soort + data + struct.pack('>I', zlib.crc32(soort + data) & 0xFFFFFFFF)
    rijen = b''.join(b'\x00' + bytes(kleur) * breedte for _ in range(hoogte))
    return (b'\x89PNG\r\n\x1a\n' + blok(b'IHDR', struct.pack('>IIBBBBB', breedte, hoogte, 8, 2, 0, 0, 0))
            + blok(b'IDAT', zlib.compress(rijen, 9)) + blok(b'IEND', b''))


def schrijf_pakket(pad, delen):
    pad.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(pad, 'w', zipfile.ZIP_DEFLATED) as archief:
        for naam, inhoud in delen.items():
            info = zipfile.ZipInfo(naam, TIJD)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archief.writestr(info, inhoud.encode('utf-8') if isinstance(inhoud, str) else inhoud)


def relaties(items):
    regels = ''.join(f'<Relationship Id="{i}" Type="{t}" Target="{d}"/>' for i, t, d in items)
    return f'{XML}<Relationships xmlns="{PKG_REL}">{regels}</Relationships>'


def inhoudstypen(overrides, extra_defaults=()):
    defaults = [('rels', 'application/vnd.openxmlformats-package.relationships+xml'), ('xml', 'application/xml'), ('png', 'image/png'), *extra_defaults]
    d = ''.join(f'<Default Extension="{e}" ContentType="{t}"/>' for e, t in defaults)
    o = ''.join(f'<Override PartName="/{n}" ContentType="{t}"/>' for n, t in overrides)
    return f'{XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">{d}{o}</Types>'


def docprops(toepassing, titel):
    core = (f'{XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" '
            'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
            f'<dc:title>{titel}</dc:title><dc:creator>OpenAEC matrixfixture</dc:creator>'
            '<dcterms:created xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:created>'
            '<dcterms:modified xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:modified></cp:coreProperties>')
    app = (f'{XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">'
           f'<Application>{toepassing}</Application></Properties>')
    return core, app


# ---------------------------------------------------------------- DOCX

def w_run(tekst, rpr=''):
    return f'<w:r>{rpr}<w:t xml:space="preserve">{tekst}</w:t></w:r>'


def w_par(tekst='', stijl=None, extra='', ppr_extra=''):
    pstijl = f'<w:pStyle w:val="{stijl}"/>' if stijl else ''
    ppr = f'<w:pPr>{pstijl}{ppr_extra}</w:pPr>' if (stijl or ppr_extra) else ''
    return f'<w:p>{ppr}{w_run(tekst) if tekst else ""}{extra}</w:p>'


def w_afbeelding(rid, naam, cx, cy, docpr):
    return (f'<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{cx}" cy="{cy}"/>'
            f'<wp:docPr id="{docpr}" name="{naam}" descr="Synthetische afbeelding"/><wp:cNvGraphicFramePr/>'
            f'<a:graphic xmlns:a="{NS_A}"><a:graphicData uri="{NS_PIC}"><pic:pic xmlns:pic="{NS_PIC}">'
            f'<pic:nvPicPr><pic:cNvPr id="0" name="{naam}"/><pic:cNvPicPr/></pic:nvPicPr>'
            f'<pic:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
            f'<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
            '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>')


W_KOP = f'xmlns:w="{NS_W}" xmlns:r="{NS_R}" xmlns:wp="{NS_WP}" xmlns:a="{NS_A}" xmlns:pic="{NS_PIC}"'


def w_stijlen():
    def stijl(soort, sid, naam, extra=''):
        return f'<w:style w:type="{soort}" w:styleId="{sid}"><w:name w:val="{naam}"/>{extra}</w:style>'
    kop = '<w:basedOn w:val="Standaard"/><w:next w:val="Standaard"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="{n}"/></w:pPr><w:rPr><w:b/><w:sz w:val="{s}"/></w:rPr>'
    return (f'{XML}<w:styles xmlns:w="{NS_W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>'
            '<w:sz w:val="22"/><w:lang w:val="nl-NL"/></w:rPr></w:rPrDefault><w:pPrDefault/></w:docDefaults>'
            + stijl('paragraph', 'Standaard', 'Normal', '<w:qFormat/>')
            + stijl('paragraph', 'Kop1', 'heading 1', kop.format(n=0, s=32))
            + stijl('paragraph', 'Kop2', 'heading 2', kop.format(n=1, s=26))
            + stijl('paragraph', 'Koptekst', 'header', '<w:basedOn w:val="Standaard"/>')
            + stijl('paragraph', 'Voettekst', 'footer', '<w:basedOn w:val="Standaard"/>')
            + stijl('paragraph', 'Voetnoottekst', 'footnote text', '<w:basedOn w:val="Standaard"/><w:rPr><w:sz w:val="18"/></w:rPr>')
            + stijl('character', 'Voetnootmarkering', 'footnote reference', '<w:rPr><w:vertAlign w:val="superscript"/></w:rPr>')
            + stijl('paragraph', 'Tekstopmerking', 'annotation text', '<w:basedOn w:val="Standaard"/>')
            + stijl('character', 'Verwijzingopmerking', 'annotation reference', '<w:rPr><w:sz w:val="16"/></w:rPr>')
            + stijl('table', 'Tabelraster', 'Table Grid', '<w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/></w:tblBorders></w:tblPr>')
            + '</w:styles>')


def w_settings(voetnoten=False):
    fn = '<w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>' if voetnoten else ''
    return f'{XML}<w:settings xmlns:w="{NS_W}"><w:defaultTabStop w:val="708"/>{fn}<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>'


def sectpr(liggend=False, kop=None, voet=None):
    refs = (f'<w:headerReference w:type="default" r:id="{kop}"/>' if kop else '') + (f'<w:footerReference w:type="default" r:id="{voet}"/>' if voet else '')
    grootte = '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>' if liggend else '<w:pgSz w:w="11906" w:h="16838"/>'
    return f'<w:sectPr>{refs}{grootte}<w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>'


def docx_basis(document, rels_extra, overrides_extra, extra_delen, voetnoten=False, titel='Matrixfixture', wortel_extra=''):
    core, app = docprops('OpenAEC matrixfixture', titel)
    overrides = [('word/document.xml', CT + 'wordprocessingml.document.main+xml'),
                 ('word/styles.xml', CT + 'wordprocessingml.styles+xml'),
                 ('word/settings.xml', CT + 'wordprocessingml.settings+xml'),
                 ('docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml'),
                 ('docProps/app.xml', CT + 'extended-properties+xml'), *overrides_extra]
    delen = {
        '[Content_Types].xml': inhoudstypen(overrides),
        '_rels/.rels': relaties([('rId1', REL + 'officeDocument', 'word/document.xml'),
                                 ('rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml'),
                                 ('rId3', REL + 'extended-properties', 'docProps/app.xml')]),
        'docProps/core.xml': core,
        'docProps/app.xml': app,
        'word/document.xml': f'{XML}<w:document {W_KOP}{wortel_extra}><w:body>{document}</w:body></w:document>',
        'word/styles.xml': w_stijlen(),
        'word/settings.xml': w_settings(voetnoten),
        'word/_rels/document.xml.rels': relaties([('rIdStijl', REL + 'styles', 'styles.xml'), ('rIdInst', REL + 'settings', 'settings.xml'), *rels_extra]),
    }
    delen.update(extra_delen)
    return delen


def maak_d1():
    logo = png(48, 16, (0x1f, 0x4e, 0x79))
    kop = (f'{XML}<w:hdr {W_KOP}><w:p><w:pPr><w:pStyle w:val="Koptekst"/></w:pPr>{w_afbeelding("rIdLogo", "Logo matrixbriefpapier", 1371600, 457200, 10)}'
           f'{w_run(" OpenAEC matrixbriefpapier")}</w:p></w:hdr>')
    voet = (f'{XML}<w:ftr {W_KOP}><w:p><w:pPr><w:pStyle w:val="Voettekst"/><w:jc w:val="center"/></w:pPr>{w_run("Pagina ")}'
            '<w:fldSimple w:instr=" PAGE \\* MERGEFORMAT "><w:r><w:t>1</w:t></w:r></w:fldSimple>'
            f'{w_run(" van ")}<w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>2</w:t></w:r></w:fldSimple></w:p></w:ftr>')
    body = (w_par('Projectnotitie matrixproef', 'Kop1')
            + w_par('De oplevering staat gepland in week 12.')
            + w_par('Deze controlezin blijft ongewijzigd.')
            + w_par('Uitgangspunten', 'Kop2')
            + w_par('Het briefpapier bevat een logo in de koptekst.')
            + w_par('', extra='<w:r><w:br w:type="page"/></w:r>')
            + w_par('Tweede pagina', 'Kop1')
            + w_par('Op deze pagina toont de voettekst paginanummer twee.')
            + sectpr(kop='rIdKop', voet='rIdVoet'))
    return docx_basis(body,
                      [('rIdKop', REL + 'header', 'header1.xml'), ('rIdVoet', REL + 'footer', 'footer1.xml')],
                      [('word/header1.xml', CT + 'wordprocessingml.header+xml'), ('word/footer1.xml', CT + 'wordprocessingml.footer+xml')],
                      {'word/header1.xml': kop, 'word/footer1.xml': voet,
                       'word/_rels/header1.xml.rels': relaties([('rIdLogo', REL + 'image', 'media/logo.png')]),
                       'word/media/logo.png': logo}, titel='Matrixfixture D1')


def w_tabel(rijen):
    def cel(t):
        return f'<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>{w_par(t)}</w:tc>'
    raster = ''.join('<w:gridCol w:w="3000"/>' for _ in rijen[0])
    return (f'<w:tbl><w:tblPr><w:tblStyle w:val="Tabelraster"/><w:tblW w:w="0" w:type="auto"/><w:tblLook w:val="04A0" w:firstRow="1"/></w:tblPr>'
            f'<w:tblGrid>{raster}</w:tblGrid>' + ''.join('<w:tr>' + ''.join(cel(t) for t in r) + '</w:tr>' for r in rijen) + '</w:tbl>')


def maak_d2():
    foto = png(32, 24, (0x8a, 0xa6, 0x3c))
    sectie1 = f'<w:p><w:pPr>{sectpr()}</w:pPr>{w_run("Einde staande sectie.")}</w:p>'
    body = (w_par('Hoeveelheden matrixproef', 'Kop1')
            + w_tabel([['Onderdeel', 'Hoeveelheid', 'Eenheid'], ['Wand', 'Wandoppervlak 125 m2', 'm2'], ['Vloer', 'Vloeroppervlak 80 m2', 'm2']])
            + w_par('Onder deze zin staat een synthetische afbeelding.')
            + f'<w:p>{w_afbeelding("rIdFoto", "Synthetische foto", 1828800, 1371600, 20)}</w:p>'
            + sectie1
            + w_par('Liggende bijlage', 'Kop1')
            + w_tabel([['Fase', 'Start', 'Eind'], ['Ontwerp', 'week 2', 'week 9'], ['Uitvoering', 'week 10', 'week 30']])
            + w_par('Deze sectie staat liggend.')
            + sectpr(liggend=True))
    return docx_basis(body, [('rIdFoto', REL + 'image', 'media/foto.png')], [], {'word/media/foto.png': foto}, titel='Matrixfixture D2')


def maak_d3():
    datum = '2026-01-05T09:00:00Z'
    commentaar = (f'{XML}<w:comments {W_KOP}><w:comment w:id="0" w:author="Matrixproef" w:date="{datum}" w:initials="MP">'
                  '<w:p><w:pPr><w:pStyle w:val="Tekstopmerking"/></w:pPr><w:r><w:rPr><w:rStyle w:val="Verwijzingopmerking"/></w:rPr><w:annotationRef/></w:r>'
                  f'{w_run("Synthetische opmerking voor de matrixproef.")}</w:p></w:comment></w:comments>')
    noten = (f'{XML}<w:footnotes {W_KOP}>'
             '<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>'
             '<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>'
             '<w:footnote w:id="1"><w:p><w:pPr><w:pStyle w:val="Voetnoottekst"/></w:pPr><w:r><w:rPr><w:rStyle w:val="Voetnootmarkering"/></w:rPr><w:footnoteRef/></w:r>'
             f'{w_run(" Synthetische voetnoot bij de matrixproef.")}</w:p></w:footnote></w:footnotes>')
    body = (w_par('Review matrixproef', 'Kop1')
            + '<w:p><w:commentRangeStart w:id="0"/>' + w_run('Deze alinea draagt een opmerking.') + '<w:commentRangeEnd w:id="0"/>'
            + '<w:r><w:rPr><w:rStyle w:val="Verwijzingopmerking"/></w:rPr><w:commentReference w:id="0"/></w:r></w:p>'
            + '<w:p>' + w_run('De revisie ')
            + f'<w:ins w:id="11" w:author="Matrixproef" w:date="{datum}">{w_run("voegt deze woorden toe")}</w:ins>'
            + f'<w:del w:id="12" w:author="Matrixproef" w:date="{datum}"><w:r><w:delText xml:space="preserve"> en verwijdert deze woorden</w:delText></w:r></w:del>'
            + w_run('.') + '</w:p>'
            + '<w:p>' + w_run('Deze zin heeft een voetnoot.') + '<w:r><w:rPr><w:rStyle w:val="Voetnootmarkering"/></w:rPr><w:footnoteReference w:id="1"/></w:r></w:p>'
            # Onbekend, negeerbaar element in de te bewerken alinea (mc:Ignorable).
            + '<w:p><openaec:markering openaec:waarde="D3"/>' + w_run('Dit is de losse matrixzin versie A.') + '</w:p>'
            + w_par('Deze afsluitende zin blijft ongewijzigd.')
            + sectpr())
    item = f'{XML}<openaec:matrix xmlns:openaec="urn:openaec:matrixproef"><openaec:kenmerk>onbekend-maar-behouden</openaec:kenmerk></openaec:matrix>'
    props = (f'{XML}<ds:datastoreItem ds:itemID="{{4F1A2B3C-0000-4000-8000-00000000D003}}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml">'
             '<ds:schemaRefs><ds:schemaRef ds:uri="urn:openaec:matrixproef"/></ds:schemaRefs></ds:datastoreItem>')
    onbekend = f'{XML}<matrix:onbekend xmlns:matrix="urn:openaec:onbekend-onderdeel"><matrix:waarde>D3</matrix:waarde></matrix:onbekend>'
    return docx_basis(body,
                      [('rIdOpm', REL + 'comments', 'comments.xml'), ('rIdNoot', REL + 'footnotes', 'footnotes.xml'),
                       ('rIdCx', REL + 'customXml', '../customXml/item1.xml'),
                       ('rIdOnb', 'urn:openaec:relaties/onbekend-onderdeel', 'openaec-matrix.xml')],
                      [('word/comments.xml', CT + 'wordprocessingml.comments+xml'),
                       ('word/footnotes.xml', CT + 'wordprocessingml.footnotes+xml'),
                       ('customXml/itemProps1.xml', CT + 'customXmlProperties+xml'),
                       ('word/openaec-matrix.xml', 'application/vnd.openaec.matrix+xml')],
                      {'word/comments.xml': commentaar, 'word/footnotes.xml': noten,
                       'customXml/item1.xml': item, 'customXml/itemProps1.xml': props,
                       'customXml/_rels/item1.xml.rels': relaties([('rId1', REL + 'customXmlProps', 'itemProps1.xml')]),
                       'word/openaec-matrix.xml': onbekend}, voetnoten=True, titel='Matrixfixture D3',
                      wortel_extra=f' xmlns:mc="{NS_MC}" xmlns:openaec="{NS_OPENAEC}" mc:Ignorable="openaec"')


# ---------------------------------------------------------------- PPTX

P_KOP = f'xmlns:a="{NS_A}" xmlns:r="{NS_R}" xmlns:p="{NS_P}"'


def thema(naam='OpenAEC Matrixthema'):
    kleuren = [('dk1', '<a:sysClr val="windowText" lastClr="000000"/>'), ('lt1', '<a:sysClr val="window" lastClr="FFFFFF"/>'),
               ('dk2', '<a:srgbClr val="1F3B4D"/>'), ('lt2', '<a:srgbClr val="E8EEF2"/>'), ('accent1', '<a:srgbClr val="D9622B"/>'),
               ('accent2', '<a:srgbClr val="1F4E79"/>'), ('accent3', '<a:srgbClr val="8AA63C"/>'), ('accent4', '<a:srgbClr val="7F6084"/>'),
               ('accent5', '<a:srgbClr val="4BACC6"/>'), ('accent6', '<a:srgbClr val="F79646"/>'), ('hlink', '<a:srgbClr val="0563C1"/>'),
               ('folHlink', '<a:srgbClr val="954F72"/>')]
    clr = ''.join(f'<a:{n}>{v}</a:{n}>' for n, v in kleuren)
    vul = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
    lijn = '<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'
    return (f'{XML}<a:theme xmlns:a="{NS_A}" name="{naam}"><a:themeElements><a:clrScheme name="OpenAEC Matrix">{clr}</a:clrScheme>'
            '<a:fontScheme name="OpenAEC Matrix"><a:majorFont><a:latin typeface="Georgia"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>'
            '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>'
            f'<a:fmtScheme name="OpenAEC Matrix"><a:fillStyleLst>{vul * 3}</a:fillStyleLst><a:lnStyleLst>{lijn * 3}</a:lnStyleLst>'
            '<a:effectStyleLst>' + '<a:effectStyle><a:effectLst/></a:effectStyle>' * 3 + f'</a:effectStyleLst><a:bgFillStyleLst>{vul * 3}</a:bgFillStyleLst></a:fmtScheme>'
            '</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>')


def p_groep():
    return ('<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
            '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>')


def p_tekst(alineas):
    ps = ''.join(f'<a:p><a:r><a:rPr lang="nl-NL" dirty="0"/><a:t>{t}</a:t></a:r></a:p>' if t else '<a:p><a:endParaRPr lang="nl-NL"/></a:p>' for t in alineas)
    return f'<p:txBody><a:bodyPr/><a:lstStyle/>{ps}</p:txBody>'


def p_vorm(sid, naam, ph=None, rect=None, alineas=(), lettertype=None, tekstvak=False):
    nvpr = f'<p:nvPr><p:ph {ph}/></p:nvPr>' if ph else '<p:nvPr/>'
    cnv = '<p:cNvSpPr txBox="1"/>' if tekstvak else ('<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>' if ph else '<p:cNvSpPr/>')
    sppr = (f'<p:spPr><a:xfrm><a:off x="{rect[0]}" y="{rect[1]}"/><a:ext cx="{rect[2]}" cy="{rect[3]}"/></a:xfrm>'
            '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>') if rect else '<p:spPr/>'
    tekst = p_tekst(alineas) if alineas else '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="nl-NL"/></a:p></p:txBody>'
    if lettertype:
        tekst = tekst.replace('dirty="0"/>', f'dirty="0"><a:latin typeface="{lettertype}"/></a:rPr>')
    return f'<p:sp><p:nvSpPr><p:cNvPr id="{sid}" name="{naam}"/>{cnv}{nvpr}</p:nvSpPr>{sppr}{tekst}</p:sp>'


def p_afbeelding(sid, naam, rid, rect):
    return (f'<p:pic><p:nvPicPr><p:cNvPr id="{sid}" name="{naam}" descr="Synthetische afbeelding"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>'
            f'<p:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
            f'<p:spPr><a:xfrm><a:off x="{rect[0]}" y="{rect[1]}"/><a:ext cx="{rect[2]}" cy="{rect[3]}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>')


def p_frame(sid, naam, rect, uri, inhoud, locks='<a:graphicFrameLocks noGrp="1"/>'):
    return (f'<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="{sid}" name="{naam}"/><p:cNvGraphicFramePr>{locks}</p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>'
            f'<p:xfrm><a:off x="{rect[0]}" y="{rect[1]}"/><a:ext cx="{rect[2]}" cy="{rect[3]}"/></p:xfrm>'
            f'<a:graphic><a:graphicData uri="{uri}">{inhoud}</a:graphicData></a:graphic></p:graphicFrame>')


def master():
    stijl = '<a:lvl1pPr><a:defRPr sz="{s}"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="{f}"/></a:defRPr></a:lvl1pPr>'
    boom = (p_groep() + p_vorm(2, 'Titel 1', 'type="title"', (838200, 365125, 10515600, 1325563))
            + p_vorm(3, 'Tekst 2', 'type="body" idx="1"', (838200, 1825625, 10515600, 4351338)))
    return (f'{XML}<p:sldMaster {P_KOP}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>{boom}</p:spTree></p:cSld>'
            '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
            '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>'
            f'<p:txStyles><p:titleStyle>{stijl.format(s=4000, f="+mj-lt")}</p:titleStyle><p:bodyStyle>{stijl.format(s=2400, f="+mn-lt")}</p:bodyStyle>'
            f'<p:otherStyle>{stijl.format(s=1800, f="+mn-lt")}</p:otherStyle></p:txStyles></p:sldMaster>')


def lay_out():
    boom = p_groep() + p_vorm(2, 'Titel 1', 'type="title"') + p_vorm(3, 'Inhoud 2', 'idx="1"')
    return (f'{XML}<p:sldLayout {P_KOP} type="obj" preserve="1"><p:cSld name="Titel en inhoud"><p:spTree>{boom}</p:spTree></p:cSld>'
            '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>')


def notitiemaster():
    boom = (p_groep() + p_vorm(2, 'Dia-afbeelding 1', 'type="sldImg"', (1143000, 685800, 4572000, 3429000))
            + p_vorm(3, 'Notities 2', 'type="body" idx="1"', (685800, 4400550, 5486400, 3600450)))
    return (f'{XML}<p:notesMaster {P_KOP}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>{boom}</p:spTree></p:cSld>'
            '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
            '</p:notesMaster>')


def notitiedia(tekst):
    boom = (p_groep() + '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Dia-afbeelding 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>'
            + p_vorm(3, 'Notities 2', 'type="body" idx="1"', alineas=[tekst]))
    return f'{XML}<p:notes {P_KOP}><p:cSld><p:spTree>{boom}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>'


def grafiek():
    return (f'{XML}<c:chartSpace xmlns:c="{NS_C}" xmlns:a="{NS_A}" xmlns:r="{NS_R}"><c:roundedCorners val="0"/>'
            '<c:chart><c:autoTitleDeleted val="1"/><c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>'
            '<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>Matrixreeks</c:v></c:tx>'
            '<c:cat><c:strLit><c:ptCount val="3"/><c:pt idx="0"><c:v>Q1</c:v></c:pt><c:pt idx="1"><c:v>Q2</c:v></c:pt><c:pt idx="2"><c:v>Q3</c:v></c:pt></c:strLit></c:cat>'
            '<c:val><c:numLit><c:formatCode>General</c:formatCode><c:ptCount val="3"/><c:pt idx="0"><c:v>12</c:v></c:pt><c:pt idx="1"><c:v>18</c:v></c:pt><c:pt idx="2"><c:v>15</c:v></c:pt></c:numLit></c:val></c:ser>'
            '<c:gapWidth val="150"/><c:axId val="501"/><c:axId val="502"/></c:barChart>'
            '<c:catAx><c:axId val="501"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="502"/></c:catAx>'
            '<c:valAx><c:axId val="502"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="501"/></c:valAx>'
            '</c:plotArea><c:plotVisOnly val="1"/></c:chart></c:chartSpace>')


def tabel_pptx(rijen):
    def cel(t):
        return f'<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="nl-NL"/><a:t>{t}</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>'
    raster = ''.join('<a:gridCol w="2000000"/>' for _ in rijen[0])
    return (f'<a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>{raster}</a:tblGrid>'
            + ''.join('<a:tr h="370840">' + ''.join(cel(t) for t in r) + '</a:tr>' for r in rijen) + '</a:tbl>')


def animatie(spid):
    return ('<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>'
            '<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>'
            '<p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst>'
            '<p:par><p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>'
            '<p:par><p:cTn id="5" presetID="10" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="clickEffect">'
            '<p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>'
            '<p:set><p:cBhvr><p:cTn id="6" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>'
            f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr>'
            '<p:to><p:strVal val="visible"/></p:to></p:set>'
            f'<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="7" dur="500"/><p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl></p:cBhvr></p:animEffect>'
            '</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>'
            '</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>'
            '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>'
            f'</p:childTnLst></p:cTn></p:par></p:tnLst><p:bldLst><p:bldP spid="{spid}" grpId="0"/></p:bldLst></p:timing>')


def pptx_basis(dia, dia_rels, dia_delen, overrides_extra, notities=False, extra_defaults=(), titel='Matrixfixture', pres_extra=()):
    core, app = docprops('OpenAEC matrixfixture', titel)
    pres_rels = [('rId1', REL + 'slideMaster', 'slideMasters/slideMaster1.xml'), ('rId2', REL + 'slide', 'slides/slide1.xml'),
                 ('rId3', REL + 'theme', 'theme/theme1.xml'), ('rId4', REL + 'presProps', 'presProps.xml'),
                 ('rId5', REL + 'viewProps', 'viewProps.xml'), ('rId6', REL + 'tableStyles', 'tableStyles.xml')]
    if notities:
        pres_rels.append(('rId7', REL + 'notesMaster', 'notesMasters/notesMaster1.xml'))
    pres_rels.extend(pres_extra)
    overrides = [('ppt/presentation.xml', CT + 'presentationml.presentation.main+xml'),
                 ('ppt/slideMasters/slideMaster1.xml', CT + 'presentationml.slideMaster+xml'),
                 ('ppt/slideLayouts/slideLayout1.xml', CT + 'presentationml.slideLayout+xml'),
                 ('ppt/slides/slide1.xml', CT + 'presentationml.slide+xml'),
                 ('ppt/theme/theme1.xml', CT + 'theme+xml'),
                 ('ppt/presProps.xml', CT + 'presentationml.presProps+xml'),
                 ('ppt/viewProps.xml', CT + 'presentationml.viewProps+xml'),
                 ('ppt/tableStyles.xml', CT + 'presentationml.tableStyles+xml'),
                 ('docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml'),
                 ('docProps/app.xml', CT + 'extended-properties+xml'), *overrides_extra]
    nm = '<p:notesMasterIdLst><p:notesMasterId r:id="rId7"/></p:notesMasterIdLst>' if notities else ''
    delen = {
        '[Content_Types].xml': inhoudstypen(overrides, extra_defaults),
        '_rels/.rels': relaties([('rId1', REL + 'officeDocument', 'ppt/presentation.xml'),
                                 ('rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml'),
                                 ('rId3', REL + 'extended-properties', 'docProps/app.xml')]),
        'docProps/core.xml': core,
        'docProps/app.xml': app,
        'ppt/presentation.xml': (f'{XML}<p:presentation {P_KOP} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
                                 f'{nm}<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/>'
                                 '</p:presentation>'),
        'ppt/_rels/presentation.xml.rels': relaties(pres_rels),
        'ppt/presProps.xml': f'{XML}<p:presentationPr {P_KOP}/>',
        'ppt/viewProps.xml': f'{XML}<p:viewPr {P_KOP}/>',
        'ppt/tableStyles.xml': f'{XML}<a:tblStyleLst xmlns:a="{NS_A}" def="{{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}}"/>',
        'ppt/slideMasters/slideMaster1.xml': master(),
        'ppt/slideMasters/_rels/slideMaster1.xml.rels': relaties([('rId1', REL + 'slideLayout', '../slideLayouts/slideLayout1.xml'), ('rId2', REL + 'theme', '../theme/theme1.xml')]),
        'ppt/slideLayouts/slideLayout1.xml': lay_out(),
        'ppt/slideLayouts/_rels/slideLayout1.xml.rels': relaties([('rId1', REL + 'slideMaster', '../slideMasters/slideMaster1.xml')]),
        'ppt/theme/theme1.xml': thema(),
        'ppt/slides/slide1.xml': dia,
        'ppt/slides/_rels/slide1.xml.rels': relaties([('rId1', REL + 'slideLayout', '../slideLayouts/slideLayout1.xml'), *dia_rels]),
    }
    delen.update(dia_delen)
    return delen


def dia_xml(boom, na=''):
    return (f'{XML}<p:sld {P_KOP}><p:cSld><p:spTree>{p_groep()}{boom}</p:spTree></p:cSld>'
            f'<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>{na}</p:sld>')


def maak_p1():
    boom = (p_vorm(2, 'Titel 1', 'type="title"', alineas=['Matrixproef P1 concept'])
            + p_vorm(3, 'Inhoud 2', 'idx="1"', alineas=['Deze opsomming gebruikt het thema.', 'Tweede punt blijft ongewijzigd.'])
            + p_vorm(4, 'Tekstvak 3', rect=(838200, 5900000, 6000000, 500000), alineas=['Expliciet lettertype Georgia.'], lettertype='Georgia', tekstvak=True)
            + p_afbeelding(5, 'Afbeelding 4', 'rId2', (8500000, 4800000, 2400000, 1200000)))
    return pptx_basis(dia_xml(boom), [('rId2', REL + 'image', '../media/image1.png')], {'ppt/media/image1.png': png(64, 32, (0xd9, 0x62, 0x2b))}, [], titel='Matrixfixture P1')


def maak_p2():
    boom = (p_vorm(2, 'Titel 1', 'type="title"', alineas=['Kwartaalcijfers matrixproef'])
            + p_vorm(3, 'Tekstvak 2', rect=(838200, 1500000, 4000000, 600000), alineas=['Toelichting kwartaal 3'], tekstvak=True)
            + p_frame(4, 'Tabel 3', (838200, 2300000, 6000000, 1112520), 'http://schemas.openxmlformats.org/drawingml/2006/table',
                      tabel_pptx([['Kwartaal', 'Waarde', 'Status'], ['Q1', '12', 'gereed'], ['Q2', '18', 'gereed']]))
            + p_frame(5, 'Grafiek 4', (7200000, 1500000, 4200000, 3200000), NS_C,
                      f'<c:chart xmlns:c="{NS_C}" r:id="rId3"/>', locks=''))
    rels = [('rId2', REL + 'notesSlide', '../notesSlides/notesSlide1.xml'), ('rId3', REL + 'chart', '../charts/chart1.xml')]
    delen = {'ppt/charts/chart1.xml': grafiek(),
             'ppt/notesSlides/notesSlide1.xml': notitiedia('Synthetische sprekersnotitie voor de matrixproef.'),
             'ppt/notesSlides/_rels/notesSlide1.xml.rels': relaties([('rId1', REL + 'notesMaster', '../notesMasters/notesMaster1.xml'), ('rId2', REL + 'slide', '../slides/slide1.xml')]),
             'ppt/notesMasters/notesMaster1.xml': notitiemaster(),
             'ppt/notesMasters/_rels/notesMaster1.xml.rels': relaties([('rId1', REL + 'theme', '../theme/theme2.xml')]),
             'ppt/theme/theme2.xml': thema('OpenAEC Notitiethema')}
    overrides = [('ppt/charts/chart1.xml', CT + 'drawingml.chart+xml'),
                 ('ppt/notesSlides/notesSlide1.xml', CT + 'presentationml.notesSlide+xml'),
                 ('ppt/notesMasters/notesMaster1.xml', CT + 'presentationml.notesMaster+xml'),
                 ('ppt/theme/theme2.xml', CT + 'theme+xml')]
    return pptx_basis(dia_xml(boom), rels, delen, overrides, notities=True, titel='Matrixfixture P2')


def maak_p3(ingebed_docx):
    ole = (f'<p:oleObj name="Document" r:id="rId2" imgW="1828800" imgH="1371600" progId="Word.Document.12"><p:embed/>'
           + p_afbeelding(7, 'Voorbeeld ingebed object', 'rId3', (7000000, 2000000, 1828800, 1371600)) + '</p:oleObj>')
    boom = (p_vorm(2, 'Titel 1', 'type="title"', alineas=['Animatie en overgang matrixproef'])
            + p_vorm(3, 'Tekstvak 2', rect=(838200, 2000000, 5000000, 800000), alineas=['Dit tekstvak verschijnt met een animatie.'], tekstvak=True)
            + p_vorm(4, 'Tekstvak 3', rect=(838200, 3200000, 5000000, 800000), alineas=['Losse notitie variant A'], tekstvak=True)
            + p_frame(6, 'Object 5', (7000000, 2000000, 1828800, 1371600), 'http://schemas.openxmlformats.org/presentationml/2006/ole', ole,
                      locks='<a:graphicFrameLocks noChangeAspect="1"/>'))
    markering = f'<p:extLst><p:ext uri="{EXT_URI}"><openaec:markering xmlns:openaec="{NS_OPENAEC}" waarde="P3"/></p:ext></p:extLst>'
    # Onbekende extensie in het te bewerken tekstvak en op dia-niveau.
    boom = boom.replace('<p:cNvPr id="4" name="Tekstvak 3"/><p:cNvSpPr txBox="1"/><p:nvPr/>',
                        f'<p:cNvPr id="4" name="Tekstvak 3"/><p:cNvSpPr txBox="1"/><p:nvPr>{markering}</p:nvPr>')
    assert markering in boom
    na = '<p:transition spd="med"><p:fade/></p:transition>' + animatie(3) + markering
    rels = [('rId2', REL + 'package', '../embeddings/Microsoft_Word_Document1.docx'), ('rId3', REL + 'image', '../media/image2.png')]
    onbekend = f'{XML}<matrix:onbekend xmlns:matrix="urn:openaec:onbekend-onderdeel"><matrix:waarde>P3</matrix:waarde></matrix:onbekend>'
    delen = {'ppt/embeddings/Microsoft_Word_Document1.docx': ingebed_docx, 'ppt/media/image2.png': png(40, 30, (0x7f, 0x60, 0x84)),
             'ppt/openaec-matrix.xml': onbekend}
    return pptx_basis(dia_xml(boom, na), rels, delen, [('ppt/openaec-matrix.xml', 'application/vnd.openaec.matrix+xml')],
                      extra_defaults=[('docx', CT + 'wordprocessingml.document')], titel='Matrixfixture P3',
                      pres_extra=[('rIdOnb', 'urn:openaec:relaties/onbekend-onderdeel', 'openaec-matrix.xml')])


def zip_bytes(delen):
    import io
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as archief:
        for naam, inhoud in delen.items():
            info = zipfile.ZipInfo(naam, TIJD)
            info.compress_type = zipfile.ZIP_DEFLATED
            archief.writestr(info, inhoud.encode('utf-8') if isinstance(inhoud, str) else inhoud)
    return buf.getvalue()


def maak_alle():
    klein = docx_basis(w_par('Ingebed synthetisch document.') + sectpr(), [], [], {}, titel='Ingebed')
    return {
        'D1.docx': maak_d1(), 'D2.docx': maak_d2(), 'D3.docx': maak_d3(),
        'P1.pptx': maak_p1(), 'P2.pptx': maak_p2(), 'P3.pptx': maak_p3(zip_bytes(klein)),
    }


def main():
    map_ = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / '.local' / 'matrix' / 'documenten' / 'bron'
    manifest = {}
    for naam, delen in maak_alle().items():
        pad = map_ / naam
        schrijf_pakket(pad, delen)
        geval = naam.split('.')[0]
        onderdeel, oud, nieuw = BEWERKINGEN[geval]
        manifest[geval] = {'bestand': naam, 'sha256': hashlib.sha256(pad.read_bytes()).hexdigest(),
                           'bewerking': {'onderdeel': onderdeel, 'oud': oud, 'nieuw': nieuw}}
    (map_ / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v['sha256'][:16] for k, v in manifest.items()}, indent=2))


if __name__ == '__main__':
    main()
