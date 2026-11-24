#!/usr/bin/env python3
"""Maakt de sjablonengalerij (#27): DOCX, XLSX en PPTX in OpenAEC-stijl.

Alleen de standaardbibliotheek (zip + XML), dus reproduceerbaar: dezelfde
invoer geeft byte-voor-byte dezelfde bestanden (vaste datum en zip-tijden).

Uitvoer:
  public/sjablonen/<taal>/<id>.<docx|xlsx|pptx>   (taal: nl, en)
  public/sjablonen/index.json                     (catalogus voor de app)
  public/sjablonen/miniaturen/<id>-<taal>.png     (met --miniaturen, via soffice)

Lettertype: Inter (OFL-1.1), dat de app meelevert (@betteroffice/fonts).
Gebruik: python3 scripts/maak-sjablonen-galerij.py [--miniaturen]
"""
import json
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

WORTEL = Path(__file__).resolve().parents[1]
UIT = WORTEL / 'public' / 'sjablonen'
DATUM = '2026-11-01T00:00:00Z'
ZIPTIJD = (2026, 11, 1, 0, 0, 0)
FONT = 'Inter'
AMBER = 'D97706'
FORGE = '36363E'
BETON = 'F5F5F4'
WIT = 'FAFAF9'
GRIJS = '6B6B73'
LIJN = 'E7E5E4'
TALEN = ('nl', 'en')
LANG = {'nl': 'nl-NL', 'en': 'en-GB'}


def x(s):
    return escape(str(s), {'"': '&quot;'})


def schrijf_zip(pad, delen):
    """Schrijft een OOXML-pakket met vaste tijden en [Content_Types].xml vooraan."""
    pad.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(pad, 'w', zipfile.ZIP_DEFLATED) as z:
        for naam in ['[Content_Types].xml'] + [n for n in delen if n != '[Content_Types].xml']:
            info = zipfile.ZipInfo(naam, ZIPTIJD)
            info.compress_type = zipfile.ZIP_DEFLATED
            data = delen[naam]
            z.writestr(info, data.encode('utf-8') if isinstance(data, str) else data)


XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'


def core(titel, taal):
    return XML + (
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
        'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" '
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
        f'<dc:title>{x(titel)}</dc:title><dc:creator></dc:creator><dc:language>{LANG[taal]}</dc:language>'
        f'<dcterms:created xsi:type="dcterms:W3CDTF">{DATUM}</dcterms:created>'
        f'<dcterms:modified xsi:type="dcterms:W3CDTF">{DATUM}</dcterms:modified>'
        '</cp:coreProperties>')


APP = XML + ('<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">'
             '<Application>OpenAEC Office Studio</Application></Properties>')


def rels(lijst):
    return XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + ''.join(
        f'<Relationship Id="{i}" Type="{t}" Target="{d}"/>' for i, t, d in lijst) + '</Relationships>'


R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
PKG_RELS = lambda hoofd: rels([
    ('rId1', R + 'officeDocument', hoofd),
    ('rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml'),
    ('rId3', R + 'extended-properties', 'docProps/app.xml'),
])


def typen(overrides, defaults=()):
    d = [('rels', 'application/vnd.openxmlformats-package.relationships+xml'), ('xml', 'application/xml'), *defaults]
    return XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' + ''.join(
        f'<Default Extension="{e}" ContentType="{c}"/>' for e, c in d) + ''.join(
        f'<Override PartName="/{p}" ContentType="{c}"/>' for p, c in overrides) + '</Types>'


CORE_T = ('docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml')
APP_T = ('docProps/app.xml', 'application/vnd.openxmlformats-officedocument.extended-properties+xml')

# ----------------------------------------------------------------------------- Tekst (DOCX)
W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
MM = 56.6929  # twips per mm


def tw(mm):
    return int(round(mm * MM))


def w_styles(taal):
    def stijl(sid, naam, ppr='', rpr='', soort='paragraph', basis='Normal', volgende='Normal', extra=''):
        b = f'<w:basedOn w:val="{basis}"/>' if basis else ''
        v = f'<w:next w:val="{volgende}"/>' if volgende else ''
        return (f'<w:style w:type="{soort}" w:styleId="{sid}"><w:name w:val="{naam}"/>{b}{v}{extra}<w:qFormat/>'
                f'<w:pPr>{ppr}</w:pPr><w:rPr>{rpr}</w:rPr></w:style>')
    kop = lambda lvl, sz, kleur, voor, na: (
        f'<w:keepNext/><w:keepLines/><w:spacing w:before="{voor}" w:after="{na}"/><w:outlineLvl w:val="{lvl}"/>',
        f'<w:b/><w:color w:val="{kleur}"/><w:sz w:val="{sz}"/><w:szCs w:val="{sz}"/>')
    k1, k2, k3 = kop(0, 32, FORGE, 360, 120), kop(1, 26, AMBER, 280, 80), kop(2, 22, FORGE, 220, 60)
    return XML + f'<w:styles {W}>' + (
        '<w:docDefaults><w:rPrDefault><w:rPr>'
        f'<w:rFonts w:ascii="{FONT}" w:hAnsi="{FONT}" w:eastAsia="{FONT}" w:cs="{FONT}"/>'
        f'<w:color w:val="{FORGE}"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="{LANG[taal]}"/>'
        '</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="288" w:lineRule="auto"/></w:pPr>'
        '</w:pPrDefault></w:docDefaults>'
        '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
        + stijl('Heading1', 'heading 1', *k1) + stijl('Heading2', 'heading 2', *k2) + stijl('Heading3', 'heading 3', *k3)
        + stijl('Title', 'Title', '<w:spacing w:after="120" w:line="240" w:lineRule="auto"/>',
                f'<w:b/><w:color w:val="{FORGE}"/><w:sz w:val="56"/><w:szCs w:val="56"/>')
        + stijl('Subtitle', 'Subtitle', '<w:spacing w:after="240"/>',
                f'<w:color w:val="{AMBER}"/><w:sz w:val="28"/><w:szCs w:val="28"/>')
        + stijl('TOCHeading', 'TOC Heading', k1[0].replace('<w:outlineLvl w:val="0"/>', '<w:outlineLvl w:val="9"/>'), k1[1], basis='Heading1')
        + stijl('TOC1', 'toc 1', '<w:spacing w:after="80"/>', '<w:b/>')
        + stijl('TOC2', 'toc 2', '<w:spacing w:after="60"/><w:ind w:left="240"/>')
        + stijl('TOC3', 'toc 3', '<w:spacing w:after="60"/><w:ind w:left="480"/>')
        + stijl('Header', 'header', '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>',
                f'<w:color w:val="{GRIJS}"/><w:sz w:val="16"/><w:szCs w:val="16"/>')
        + stijl('Footer', 'footer', '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>',
                f'<w:color w:val="{GRIJS}"/><w:sz w:val="16"/><w:szCs w:val="16"/>')
        + stijl('Klein', 'Small' if taal == 'en' else 'Klein', '<w:spacing w:after="0"/>',
                f'<w:color w:val="{GRIJS}"/><w:sz w:val="16"/><w:szCs w:val="16"/>')
        + '<w:style w:type="table" w:styleId="OpenAECTabel"><w:name w:val="OpenAEC Table"/><w:tblPr>'
        f'<w:tblBorders><w:top w:val="single" w:sz="4" w:color="{LIJN}"/><w:bottom w:val="single" w:sz="4" w:color="{LIJN}"/>'
        f'<w:insideH w:val="single" w:sz="4" w:color="{LIJN}"/></w:tblBorders>'
        '<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/>'
        '<w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>'
    ) + '</w:styles>'


def run(tekst, b=False, i=False, kleur=None, sz=None):
    rpr = ('<w:b/>' if b else '') + ('<w:i/>' if i else '') + (f'<w:color w:val="{kleur}"/>' if kleur else '') + (
        f'<w:sz w:val="{sz}"/><w:szCs w:val="{sz}"/>' if sz else '')
    delen = str(tekst).split('\t')
    inhoud = '<w:tab/>'.join(f'<w:t xml:space="preserve">{x(d)}</w:t>' for d in delen)
    return f'<w:r>{"<w:rPr>" + rpr + "</w:rPr>" if rpr else ""}{inhoud}</w:r>'


def p(inhoud='', stijl=None, uitlijn=None, voor=None, na=None, tabs=None, **rkw):
    ppr = (f'<w:pStyle w:val="{stijl}"/>' if stijl else '') + (
        '<w:tabs>' + ''.join(f'<w:tab w:val="{v}" w:pos="{pos}"/>' for v, pos in tabs) + '</w:tabs>' if tabs else '') + (
        f'<w:spacing{" w:before=%s" % chr(34) + str(voor) + chr(34) if voor is not None else ""}'
        f'{" w:after=%s" % chr(34) + str(na) + chr(34) if na is not None else ""}/>' if voor is not None or na is not None else '') + (
        f'<w:jc w:val="{uitlijn}"/>' if uitlijn else '')
    runs = inhoud if inhoud.startswith('<w:r') else (run(inhoud, **rkw) if inhoud else '')
    return f'<w:p>{"<w:pPr>" + ppr + "</w:pPr>" if ppr else ""}{runs}</w:p>'


def pagina_einde():
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'


def tabel(rijen, breedtes, kop=True, rechts=(), totaal=False, randloos=False):
    """Tabel in de stijl OpenAECTabel; breedtes in mm; kolommen in `rechts` rechts uitgelijnd."""
    grid = ''.join(f'<w:gridCol w:w="{tw(b)}"/>' for b in breedtes)
    uit = (f'<w:tbl><w:tblPr><w:tblStyle w:val="OpenAECTabel"/><w:tblW w:w="{tw(sum(breedtes))}" w:type="dxa"/>'
           + ('<w:tblBorders><w:top w:val="nil"/><w:bottom w:val="nil"/><w:insideH w:val="nil"/></w:tblBorders>' if randloos else '')
           + f'<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>{grid}</w:tblGrid>')
    for r, rij in enumerate(rijen):
        is_kop = kop and r == 0
        is_tot = totaal and r == len(rijen) - 1
        uit += '<w:tr>' + ('<w:trPr><w:tblHeader/></w:trPr>' if is_kop else '')
        for k, cel in enumerate(rij):
            schaduw = f'<w:shd w:val="clear" w:color="auto" w:fill="{FORGE}"/>' if is_kop else (
                f'<w:shd w:val="clear" w:color="auto" w:fill="{BETON}"/>' if is_tot else '')
            uit += (f'<w:tc><w:tcPr><w:tcW w:w="{tw(breedtes[k])}" w:type="dxa"/>{schaduw}</w:tcPr>'
                    + p(cel, uitlijn='right' if k in rechts else None, na=0, b=is_kop or is_tot,
                        kleur='FFFFFF' if is_kop else None) + '</w:tc>')
        uit += '</w:tr>'
    return uit + '</w:tbl>' + p('', na=0)


def veld(instructie, tekst):
    return ('<w:r><w:fldChar w:fldCharType="begin"/></w:r>'
            f'<w:r><w:instrText xml:space="preserve"> {x(instructie)} </w:instrText></w:r>'
            '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'
            f'{run(tekst)}<w:r><w:fldChar w:fldCharType="end"/></w:r>')


def maak_docx(pad, taal, titel, lichaam, kop=None, voet=None, marges=(25, 20, 25, 20), kopafstand=12):
    """marges: boven, rechts, onder, links in mm."""
    boven, rechts, onder, links = marges
    rel = [('rId1', R + 'styles', 'styles.xml'), ('rId2', R + 'settings', 'settings.xml')]
    delen = {}
    ref = ''
    over = [('word/document.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'),
            ('word/styles.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml'),
            ('word/settings.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml'),
            CORE_T, APP_T]
    if kop:
        rel.append(('rId3', R + 'header', 'header1.xml'))
        delen['word/header1.xml'] = XML + f'<w:hdr {W}>{kop}</w:hdr>'
        over.append(('word/header1.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml'))
        ref += '<w:headerReference w:type="default" r:id="rId3"/>'
    if voet:
        rel.append(('rId4', R + 'footer', 'footer1.xml'))
        delen['word/footer1.xml'] = XML + f'<w:ftr {W}>{voet}</w:ftr>'
        over.append(('word/footer1.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml'))
        ref += '<w:footerReference w:type="default" r:id="rId4"/>'
    sect = (f'<w:sectPr>{ref}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="{tw(boven)}" w:right="{tw(rechts)}" '
            f'w:bottom="{tw(onder)}" w:left="{tw(links)}" w:header="{tw(kopafstand)}" w:footer="{tw(10)}" w:gutter="0"/></w:sectPr>')
    delen.update({
        '[Content_Types].xml': typen(over),
        '_rels/.rels': PKG_RELS('word/document.xml'),
        'docProps/core.xml': core(titel, taal),
        'docProps/app.xml': APP,
        'word/_rels/document.xml.rels': rels(rel),
        'word/document.xml': XML + f'<w:document {W}><w:body>{"".join(lichaam)}{sect}</w:body></w:document>',
        'word/styles.xml': w_styles(taal),
        'word/settings.xml': XML + f'<w:settings {W}><w:defaultTabStop w:val="708"/><w:updateFields w:val="true"/>'
                             f'<w:themeFontLang w:val="{LANG[taal]}"/></w:settings>',
    })
    schrijf_zip(pad, delen)


def paginavoet(taal, links_tekst):
    return p(run(links_tekst + '\t') + veld('PAGE', '1'), stijl='Footer', tabs=[('right', tw(165))])


T = {  # Teksten per taal: (nl, en)
    'org': ('Uw organisatie', 'Your organisation'),
    'orgadres': ('Straatnaam 1 · 1234 AB Plaats · 010 123 45 67 · info@voorbeeld.nl',
                 '1 Street Name · Town AB1 2CD · +44 20 1234 5678 · info@example.com'),
}


def t(sleutel, taal):
    return T[sleutel][TALEN.index(taal)]


def tekst_sjablonen(taal):
    nl = taal == 'nl'
    org, adres = t('org', taal), t('orgadres', taal)
    briefkop = (p(run(org, b=True, kleur=FORGE, sz=22), stijl='Header', uitlijn='right')
                + p(adres, stijl='Header', uitlijn='right')
                + p(run('', kleur=AMBER), stijl='Header'))
    uit = {}

    # Brief: adresvak op 50 mm van boven en binnen het venster (NEN 1026, 20–110 mm van links).
    brief = [
        p('Naam ontvanger' if nl else 'Recipient name', na=0), p('Afdeling of t.a.v.' if nl else 'Department or attention of', na=0),
        p('Straatnaam 12' if nl else '12 Street Name', na=0), p('1234 AB  PLAATS' if nl else 'TOWN  AB1 2CD', na=0),
        p('', na=0), p('', na=0), p('', na=0),
        tabel([['Datum' if nl else 'Date', '1 november 2026' if nl else '1 November 2026'],
               ['Kenmerk' if nl else 'Reference', 'OA-2026-001'],
               ['Onderwerp' if nl else 'Subject', 'Onderwerp van de brief' if nl else 'Subject of the letter']],
              [30, 130], kop=False, randloos=True),
        p('Geachte heer, mevrouw,' if nl else 'Dear Sir or Madam,', voor=120),
        p('Dit is de eerste alinea van uw brief. Vervang deze tekst door uw eigen boodschap. Het adresvak staat zo dat het '
          'precies in het venster van een vensterenvelop valt (NEN 1026).' if nl else
          'This is the first paragraph of your letter. Replace this text with your own message. The address block is positioned '
          'to show through the window of a standard window envelope.'),
        p('Een tweede alinea werkt een punt uit of beschrijft de vervolgstappen. Houd de brief kort en concreet.' if nl else
          'A second paragraph explains a point or describes the next steps. Keep the letter short and to the point.'),
        p('Met vriendelijke groet,' if nl else 'Kind regards,', voor=240),
        p('', na=0), p('', na=0),
        p(run('Voornaam Achternaam' if nl else 'First Last', b=True), na=0), p('Functie' if nl else 'Position', stijl='Klein'),
    ]
    uit['brief'] = dict(lichaam=brief, kop=briefkop, marges=(50, 20, 25, 25),
                        voet=p(org + ' · ' + ('KvK 12345678 · IBAN NL00 BANK 0123 4567 89' if nl else 'Company no. 12345678'),
                               stijl='Footer', uitlijn='center'))

    # Rapport: voorblad, inhoudsopgave, koppen 1–3.
    rapport = [
        p('', voor=tw(60)), p('Titel van het rapport' if nl else 'Report title', stijl='Title'),
        p('Ondertitel of projectnaam' if nl else 'Subtitle or project name', stijl='Subtitle'),
        p(run('Auteur · ' + ('november 2026' if nl else 'November 2026'), kleur=GRIJS)),
        p(run('Versie 1.0 · Concept' if nl else 'Version 1.0 · Draft', kleur=GRIJS)),
        pagina_einde(),
        p('Inhoud' if nl else 'Contents', stijl='TOCHeading'),
        p(veld('TOC \\o "1-3" \\h \\z \\u', 'Werk de inhoudsopgave bij (rechtermuisknop › Veld bijwerken).' if nl
              else 'Update the table of contents (right-click › Update field).')),
        pagina_einde(),
        p('Inleiding' if nl else 'Introduction', stijl='Heading1'),
        p('Beschrijf hier de aanleiding, het doel en de opbouw van dit rapport.' if nl else
          'Describe the background, the purpose and the structure of this report.'),
        p('Aanleiding' if nl else 'Background', stijl='Heading2'),
        p('Waarom is dit onderzoek of advies nodig? Welke vraag staat centraal?' if nl else
          'Why is this study or advice needed? What is the central question?'),
        p('Leeswijzer' if nl else 'Reading guide', stijl='Heading3'),
        p('Hoofdstuk 2 beschrijft de aanpak, hoofdstuk 3 de resultaten en hoofdstuk 4 de conclusies.' if nl else
          'Chapter 2 describes the approach, chapter 3 the results and chapter 4 the conclusions.'),
        p('Aanpak' if nl else 'Approach', stijl='Heading1'),
        p('Licht de werkwijze, bronnen en uitgangspunten toe.' if nl else 'Explain the method, sources and assumptions.'),
        p('Resultaten' if nl else 'Results', stijl='Heading1'),
        tabel([['Onderdeel' if nl else 'Item', 'Waarde' if nl else 'Value', 'Toelichting' if nl else 'Notes'],
               ['A', '12,5', 'Voorbeeld' if nl else 'Example'], ['B', '8,0', 'Voorbeeld' if nl else 'Example']],
              [50, 30, 80], rechts=(1,)),
        p('Conclusies en aanbevelingen' if nl else 'Conclusions and recommendations', stijl='Heading1'),
        p('Vat de belangrijkste bevindingen samen en geef concrete aanbevelingen.' if nl else
          'Summarise the main findings and give concrete recommendations.'),
    ]
    uit['rapport'] = dict(lichaam=rapport, voet=paginavoet(taal, 'Titel van het rapport' if nl else 'Report title'))

    memo = [
        p('Memo', stijl='Title'),
        tabel([['Aan' if nl else 'To', 'Naam ontvanger(s)' if nl else 'Recipient(s)'], ['Van' if nl else 'From', 'Uw naam' if nl else 'Your name'],
               ['Datum' if nl else 'Date', '1 november 2026' if nl else '1 November 2026'],
               ['Onderwerp' if nl else 'Subject', 'Onderwerp van de memo' if nl else 'Subject of the memo']], [30, 135], kop=False),
        p('Aanleiding' if nl else 'Background', stijl='Heading1'),
        p('Waarom deze memo? Beschrijf kort de situatie.' if nl else 'Why this memo? Briefly describe the situation.'),
        p('Voorstel' if nl else 'Proposal', stijl='Heading1'),
        p('Wat stelt u voor en wat is daarvoor nodig?' if nl else 'What do you propose and what is needed?'),
        p('Gevraagd besluit' if nl else 'Decision requested', stijl='Heading1'),
        p('Welke beslissing of actie verwacht u van de lezer?' if nl else 'Which decision or action do you expect from the reader?'),
    ]
    uit['memo'] = dict(lichaam=memo, kop=briefkop, voet=paginavoet(taal, 'Memo'))

    euro = lambda v: ('€ ' + f'{v:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')) if nl else f'€{v:,.2f}'
    regels = [('Advies en ontwerp' if nl else 'Consultancy and design', 8, 95.0),
              ('Tekenwerk' if nl else 'Drawing work', 12, 75.0), ('Reiskosten' if nl else 'Travel expenses', 1, 45.0)]
    sub = sum(a * b for _, a, b in regels)
    factuur = [
        p('Factuur' if nl else 'Invoice', stijl='Title'),
        tabel([['Factuur aan' if nl else 'Invoice to', 'Factuurnummer' if nl else 'Invoice number', '2026-001'],
               ['Naam klant' if nl else 'Customer name', 'Factuurdatum' if nl else 'Invoice date', '01-11-2026' if nl else '01/11/2026'],
               ['Straatnaam 12' if nl else '12 Street Name', 'Vervaldatum' if nl else 'Due date', '01-12-2026' if nl else '01/12/2026'],
               ['1234 AB  PLAATS' if nl else 'TOWN  AB1 2CD', 'Uw referentie' if nl else 'Your reference', 'PO-4711']],
              [70, 45, 50], kop=False, randloos=True),
        tabel([['Omschrijving' if nl else 'Description', 'Aantal' if nl else 'Qty', 'Prijs' if nl else 'Price', 'Bedrag' if nl else 'Amount']]
              + [[o, str(a), euro(b), euro(a * b)] for o, a, b in regels]
              + [['Subtotaal' if nl else 'Subtotal', '', '', euro(sub)], [('Btw 21%' if nl else 'VAT 20%'), '', '', euro(sub * (0.21 if nl else 0.2))],
                 ['Totaal' if nl else 'Total', '', '', euro(sub * (1.21 if nl else 1.2))]],
              [85, 20, 30, 30], rechts=(1, 2, 3), totaal=True),
        p('Graag het totaalbedrag binnen 30 dagen overmaken op NL00 BANK 0123 4567 89 onder vermelding van het factuurnummer.' if nl else
          'Please pay the total within 30 days to account 12345678 (sort code 00-00-00), quoting the invoice number.'),
    ]
    uit['factuur'] = dict(lichaam=factuur, kop=briefkop,
                          voet=p(org + ' · ' + ('KvK 12345678 · btw NL000000000B01' if nl else 'Company no. 12345678 · VAT GB000000000'),
                                 stijl='Footer', uitlijn='center'))

    notulen = [
        p('Notulen' if nl else 'Minutes', stijl='Title'),
        p('Naam van het overleg' if nl else 'Name of the meeting', stijl='Subtitle'),
        tabel([['Datum' if nl else 'Date', '1 november 2026, 10.00–11.30 uur' if nl else '1 November 2026, 10:00–11:30'],
               ['Locatie' if nl else 'Location', 'Vergaderruimte of online' if nl else 'Meeting room or online'],
               ['Aanwezig' if nl else 'Present', 'Namen' if nl else 'Names'], ['Afwezig' if nl else 'Absent', 'Namen' if nl else 'Names'],
               ['Notulist' if nl else 'Minutes by', 'Naam' if nl else 'Name']], [30, 135], kop=False),
        p('1. Opening en vaststellen agenda' if nl else '1. Opening and agenda', stijl='Heading2'),
        p('De voorzitter opent de vergadering en heet iedereen welkom.' if nl else 'The chair opens the meeting and welcomes everyone.'),
        p('2. Verslag vorige vergadering' if nl else '2. Minutes of the previous meeting', stijl='Heading2'),
        p('Het verslag wordt ongewijzigd vastgesteld.' if nl else 'The minutes are approved without changes.'),
        p('3. Onderwerp' if nl else '3. Topic', stijl='Heading2'),
        p('Bespreking, standpunten en besluit.' if nl else 'Discussion, positions and decision.'),
        p('4. Rondvraag en sluiting' if nl else '4. Any other business and close', stijl='Heading2'),
        p('Actiepunten' if nl else 'Action items', stijl='Heading1'),
        tabel([['Nr.' if nl else 'No.', 'Actie' if nl else 'Action', 'Wie' if nl else 'Who', 'Wanneer' if nl else 'When'],
               ['1', 'Omschrijving van de actie' if nl else 'Description of the action', 'Naam' if nl else 'Name', '15-11-2026' if nl else '15/11/2026'],
               ['2', '', '', '']], [12, 93, 30, 30]),
    ]
    uit['notulen'] = dict(lichaam=notulen, voet=paginavoet(taal, 'Notulen' if nl else 'Minutes'))

    cv = [
        p('Voornaam Achternaam' if nl else 'First Last', stijl='Title'),
        p('Functietitel' if nl else 'Job title', stijl='Subtitle'),
        p(run('Plaats · 06 12 34 56 78 · naam@voorbeeld.nl · linkedin.com/in/naam' if nl else
              'Town · +44 7700 900000 · name@example.com · linkedin.com/in/name', kleur=GRIJS)),
        p('Profiel' if nl else 'Profile', stijl='Heading1'),
        p('Twee tot drie zinnen over wie u bent, wat u kunt en wat u zoekt.' if nl else
          'Two or three sentences about who you are, what you can do and what you are looking for.'),
        p('Werkervaring' if nl else 'Experience', stijl='Heading1'),
        p('Functie · Organisatie' if nl else 'Position · Organisation', stijl='Heading3'),
        p('2022 – heden' if nl else '2022 – present', stijl='Klein'),
        p('Belangrijkste taken en resultaten, bij voorkeur meetbaar.' if nl else 'Key responsibilities and results, measurable where possible.'),
        p('Functie · Organisatie' if nl else 'Position · Organisation', stijl='Heading3'),
        p('2018 – 2022', stijl='Klein'),
        p('Belangrijkste taken en resultaten.' if nl else 'Key responsibilities and results.'),
        p('Opleiding' if nl else 'Education', stijl='Heading1'),
        p('Opleiding · Instelling' if nl else 'Degree · Institution', stijl='Heading3'),
        p('2014 – 2018', stijl='Klein'),
        p('Vaardigheden' if nl else 'Skills', stijl='Heading1'),
        tabel([['Talen' if nl else 'Languages', 'Nederlands (moedertaal), Engels (vloeiend)' if nl else 'English (native), Dutch (fluent)'],
               ['Software', 'Open Office Studio, …'], ['Overig' if nl else 'Other', 'Rijbewijs B' if nl else 'Driving licence']],
              [35, 130], kop=False),
    ]
    uit['cv'] = dict(lichaam=cv)
    return uit


# ----------------------------------------------------------------------------- Rekenblad (XLSX)
S = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
# Celstijlen (index in cellXfs).
ST = dict(standaard=0, titel=1, kop=2, tekst=3, getal=4, euro=5, datum=6, totaal=7, procent=8, balk=9, vet=10, tijd=11,
          label=12, geheel=13, uren=14, kopr=15)


def x_styles(taal):
    datumfmt = 'dd-mm-yyyy' if taal == 'nl' else 'dd/mm/yyyy'
    eurofmt = '"€ "#,##0.00;"€ "-#,##0.00' if taal == 'nl' else '"€"#,##0.00;-"€"#,##0.00'
    fonts = [f'<font><sz val="10"/><color rgb="FF{FORGE}"/><name val="{FONT}"/></font>',
             f'<font><b/><sz val="18"/><color rgb="FF{FORGE}"/><name val="{FONT}"/></font>',
             f'<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="{FONT}"/></font>',
             f'<font><b/><sz val="10"/><color rgb="FF{FORGE}"/><name val="{FONT}"/></font>',
             f'<font><sz val="9"/><color rgb="FF{GRIJS}"/><name val="{FONT}"/></font>']
    fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>',
             f'<fill><patternFill patternType="solid"><fgColor rgb="FF{FORGE}"/></patternFill></fill>',
             f'<fill><patternFill patternType="solid"><fgColor rgb="FF{BETON}"/></patternFill></fill>',
             f'<fill><patternFill patternType="solid"><fgColor rgb="FF{AMBER}"/></patternFill></fill>']
    borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>',
               f'<border><left/><right/><top/><bottom style="thin"><color rgb="FF{LIJN}"/></bottom><diagonal/></border>',
               f'<border><left/><right/><top style="thin"><color rgb="FF{FORGE}"/></top><bottom style="double"><color rgb="FF{FORGE}"/></bottom><diagonal/></border>']
    #   (numFmt, font, fill, border, rechts)
    xfs = [(0, 0, 0, 0, 0), (0, 1, 0, 0, 0), (0, 2, 2, 0, 0), (0, 0, 0, 1, 0), (4, 0, 0, 1, 0), (164, 0, 0, 1, 0),
           (165, 0, 0, 1, 0), (164, 3, 3, 2, 0), (10, 0, 0, 1, 0), (0, 0, 4, 1, 0), (0, 3, 0, 0, 0), (20, 0, 0, 1, 0),
           (0, 4, 0, 0, 0), (1, 0, 0, 1, 0), (2, 3, 3, 2, 0), (0, 2, 2, 0, 1)]
    xf = ''.join(f'<xf numFmtId="{n}" fontId="{f}" fillId="{fi}" borderId="{b}" xfId="0"'
                 + (' applyNumberFormat="1"' if n else '') + ' applyFont="1" applyFill="1" applyBorder="1"'
                 + ('><alignment horizontal="right"/></xf>' if r else '/>') for n, f, fi, b, r in xfs)
    return XML + f'<styleSheet {S}>' + (
        f'<numFmts count="2"><numFmt numFmtId="164" formatCode="{x(eurofmt)}"/><numFmt numFmtId="165" formatCode="{datumfmt}"/></numFmts>'
        f'<fonts count="{len(fonts)}">{"".join(fonts)}</fonts><fills count="{len(fills)}">{"".join(fills)}</fills>'
        f'<borders count="{len(borders)}">{"".join(borders)}</borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        f'<cellXfs count="{len(xfs)}">{xf}</cellXfs>'
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>') + '</styleSheet>'


def kol(n):
    s = ''
    n += 1
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


class Blad:
    """Bladinhoud: cellen als (rij, kolom) → (waarde, stijl, formule)."""

    def __init__(self, naam, breedtes):
        self.naam, self.breedtes, self.cellen, self.vast, self.samen = naam, breedtes, {}, None, []

    def zet(self, rij, k, waarde=None, stijl='tekst', formule=None):
        self.cellen[(rij, k)] = (waarde, ST[stijl], formule)

    def xml(self, gedeeld):
        rijen = {}
        for (r, k), cel in sorted(self.cellen.items()):
            rijen.setdefault(r, []).append((k, cel))
        data = ''
        for r in sorted(rijen):
            data += f'<row r="{r + 1}">'
            for k, (w, s, f) in rijen[r]:
                ref = f'{kol(k)}{r + 1}'
                if f is not None:
                    data += f'<c r="{ref}" s="{s}"><f>{x(f)}</f>' + (f'<v>{round(w, 10)}</v>' if w is not None else '') + '</c>'
                elif isinstance(w, str):
                    if w not in gedeeld:
                        gedeeld[w] = len(gedeeld)
                    data += f'<c r="{ref}" s="{s}" t="s"><v>{gedeeld[w]}</v></c>'
                elif w is None:
                    data += f'<c r="{ref}" s="{s}"/>'
                else:
                    data += f'<c r="{ref}" s="{s}"><v>{w}</v></c>'
            data += '</row>'
        vast = (f'<pane ySplit="{self.vast}" topLeftCell="A{self.vast + 1}" activePane="bottomLeft" state="frozen"/>'
                if self.vast else '')
        cols = ''.join(f'<col min="{i + 1}" max="{i + 1}" width="{b}" customWidth="1"/>' for i, b in enumerate(self.breedtes))
        samen = (f'<mergeCells count="{len(self.samen)}">' + ''.join(f'<mergeCell ref="{m}"/>' for m in self.samen)
                 + '</mergeCells>') if self.samen else ''
        return (XML + f'<worksheet {S}><sheetViews><sheetView workbookViewId="0" showGridLines="0">{vast}</sheetView></sheetViews>'
                f'<sheetFormatPr defaultRowHeight="15"/><cols>{cols}</cols><sheetData>{data}</sheetData>{samen}'
                '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>'
                '<pageSetup paperSize="9" orientation="landscape" fitToHeight="0"/></worksheet>')


def maak_xlsx(pad, taal, titel, bladen):
    gedeeld = {}
    bladxml = [b.xml(gedeeld) for b in bladen]
    over = [('xl/workbook.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'),
            ('xl/styles.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml'),
            ('xl/sharedStrings.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml'),
            CORE_T, APP_T] + [(f'xl/worksheets/sheet{i + 1}.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml')
                              for i in range(len(bladen))]
    strings = sorted(gedeeld, key=gedeeld.get)
    delen = {
        '[Content_Types].xml': typen(over),
        '_rels/.rels': PKG_RELS('xl/workbook.xml'),
        'docProps/core.xml': core(titel, taal),
        'docProps/app.xml': APP,
        'xl/workbook.xml': XML + f'<workbook {S}><bookViews><workbookView/></bookViews><sheets>' + ''.join(
            f'<sheet name="{x(b.naam)}" sheetId="{i + 1}" r:id="rId{i + 1}"/>' for i, b in enumerate(bladen))
                           + '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>',
        'xl/_rels/workbook.xml.rels': rels([(f'rId{i + 1}', R + 'worksheet', f'worksheets/sheet{i + 1}.xml') for i in range(len(bladen))]
                                           + [('rIdS', R + 'styles', 'styles.xml'), ('rIdT', R + 'sharedStrings', 'sharedStrings.xml')]),
        'xl/styles.xml': x_styles(taal),
        'xl/sharedStrings.xml': XML + f'<sst {S} count="{len(strings)}" uniqueCount="{len(strings)}">' + ''.join(
            f'<si><t xml:space="preserve">{x(s)}</t></si>' for s in strings) + '</sst>',
    }
    for i, b in enumerate(bladxml):
        delen[f'xl/worksheets/sheet{i + 1}.xml'] = b
    schrijf_zip(pad, delen)


def excel_datum(j, m, d):
    from datetime import date
    return (date(j, m, d) - date(1899, 12, 30)).days


def kopregel(b, rij, koppen, rechts=()):
    for k, tekst in enumerate(koppen):
        b.zet(rij, k, tekst, 'kopr' if k in rechts else 'kop')


def rekenblad_sjablonen(taal):
    nl = taal == 'nl'
    uit = {}

    # Begroting
    b = Blad('Begroting' if nl else 'Budget', [34, 16, 16, 16, 12])
    b.zet(0, 0, 'Begroting 2027' if nl else 'Budget 2027', 'titel')
    b.zet(1, 0, 'Bedragen in euro, exclusief btw' if nl else 'Amounts in euros, excluding VAT', 'label')
    kopregel(b, 3, ['Post' if nl else 'Item', 'Begroot' if nl else 'Budget', 'Werkelijk' if nl else 'Actual',
                    'Verschil' if nl else 'Difference', '%'], rechts=(1, 2, 3, 4))
    posten = [('Personeel' if nl else 'Staff', 120000, 118500), ('Huisvesting' if nl else 'Accommodation', 24000, 24600),
              ('ICT en software' if nl else 'IT and software', 15000, 12800), ('Opleiding' if nl else 'Training', 6000, 4200),
              ('Marketing', 8000, 9100), ('Overig' if nl else 'Other', 5000, 3900)]
    for i, (o, bg, wk) in enumerate(posten):
        r = 4 + i
        b.zet(r, 0, o)
        b.zet(r, 1, bg, 'euro')
        b.zet(r, 2, wk, 'euro')
        b.zet(r, 3, wk - bg, 'euro', f'C{r + 1}-B{r + 1}')
        b.zet(r, 4, (wk - bg) / bg, 'procent', f'IF(B{r + 1}=0,0,D{r + 1}/B{r + 1})')
    tr = 4 + len(posten)
    sb, sw = sum(p[1] for p in posten), sum(p[2] for p in posten)
    b.zet(tr, 0, 'Totaal' if nl else 'Total', 'totaal')
    b.zet(tr, 1, sb, 'totaal', f'SUM(B5:B{tr})')
    b.zet(tr, 2, sw, 'totaal', f'SUM(C5:C{tr})')
    b.zet(tr, 3, sw - sb, 'totaal', f'C{tr + 1}-B{tr + 1}')
    b.zet(tr, 4, (sw - sb) / sb, 'procent', f'IF(B{tr + 1}=0,0,D{tr + 1}/B{tr + 1})')
    b.vast = 4
    uit['begroting'] = [b]

    # Factuur met berekeningen
    f = Blad('Factuur' if nl else 'Invoice', [40, 10, 12, 14, 16])
    btw = 0.21 if nl else 0.2
    f.zet(0, 0, 'Factuur' if nl else 'Invoice', 'titel')
    gegevens = [('Factuurnummer' if nl else 'Invoice number', '2026-001'), ('Factuurdatum' if nl else 'Invoice date', excel_datum(2026, 11, 1)),
                ('Vervaldatum' if nl else 'Due date', None), ('Klant' if nl else 'Customer', 'Naam klant' if nl else 'Customer name')]
    for i, (l, w) in enumerate(gegevens):
        f.zet(2 + i, 0, l, 'vet')
        if i == 1:
            f.zet(2 + i, 1, w, 'datum')
        elif i == 2:
            f.zet(2 + i, 1, excel_datum(2026, 12, 1), 'datum', 'B4+30')
        else:
            f.zet(2 + i, 1, w)
    kopregel(f, 7, ['Omschrijving' if nl else 'Description', 'Aantal' if nl else 'Qty', 'Eenheid' if nl else 'Unit',
                    'Prijs' if nl else 'Price', 'Bedrag' if nl else 'Amount'], rechts=(1, 3, 4))
    items = [('Advies en ontwerp' if nl else 'Consultancy and design', 8, 'uur' if nl else 'hour', 95),
             ('Tekenwerk' if nl else 'Drawing work', 12, 'uur' if nl else 'hour', 75),
             ('Reiskosten' if nl else 'Travel expenses', 120, 'km', 0.23)]
    for i, (o, a, e, pr) in enumerate(items + [('', None, '', None)] * 3):
        r = 8 + i
        f.zet(r, 0, o)
        f.zet(r, 1, a, 'geheel')
        f.zet(r, 2, e)
        f.zet(r, 3, pr, 'euro')
        f.zet(r, 4, (a or 0) * (pr or 0), 'euro', f'B{r + 1}*D{r + 1}')
    eind = 8 + len(items) + 3
    sub = sum(a * pr for _, a, _, pr in items)
    f.zet(eind + 1, 3, 'Subtotaal' if nl else 'Subtotal', 'vet')
    f.zet(eind + 1, 4, sub, 'euro', f'SUM(E9:E{eind})')
    f.zet(eind + 2, 3, f'Btw {int(btw * 100)}%' if nl else f'VAT {int(btw * 100)}%', 'vet')
    f.zet(eind + 2, 4, sub * btw, 'euro', f'ROUND(E{eind + 2}*{btw},2)')
    f.zet(eind + 3, 3, 'Totaal' if nl else 'Total', 'totaal')
    f.zet(eind + 3, 4, sub * (1 + btw), 'totaal', f'E{eind + 2}+E{eind + 3}')
    f.zet(eind + 5, 0, 'Betaling binnen 30 dagen op NL00 BANK 0123 4567 89.' if nl else 'Payment within 30 days to account 12345678.', 'label')
    uit['factuur-berekend'] = [f]

    # Urenstaat
    u = Blad('Urenstaat' if nl else 'Timesheet', [13, 22, 30, 9, 9, 9, 10])
    u.zet(0, 0, 'Urenstaat' if nl else 'Timesheet', 'titel')
    u.zet(1, 0, ('Medewerker: naam · week 45' if nl else 'Employee: name · week 45'), 'label')
    kopregel(u, 3, ['Datum' if nl else 'Date', 'Project', 'Activiteit' if nl else 'Activity', 'Begin' if nl else 'Start',
                    'Einde' if nl else 'End', 'Pauze' if nl else 'Break', 'Uren' if nl else 'Hours'], rechts=(3, 4, 5, 6))
    dagen = [(2, 'P-101', 'Ontwerp' if nl else 'Design', 8.5, 17, 0.5), (3, 'P-101', 'Overleg' if nl else 'Meeting', 9, 17.5, 0.5),
             (4, 'P-102', 'Tekenwerk' if nl else 'Drawing', 8, 16.5, 0.5), (5, 'P-102', 'Tekenwerk' if nl else 'Drawing', 8.5, 17, 0.5),
             (6, 'P-101', 'Rapportage' if nl else 'Reporting', 8, 12, 0)]
    for i, (d, pr, act, bg, ei, pz) in enumerate(dagen):
        r = 4 + i
        u.zet(r, 0, excel_datum(2026, 11, d), 'datum')
        u.zet(r, 1, pr)
        u.zet(r, 2, act)
        u.zet(r, 3, bg / 24, 'tijd')
        u.zet(r, 4, ei / 24, 'tijd')
        u.zet(r, 5, pz, 'getal')
        u.zet(r, 6, ei - bg - pz, 'getal', f'(E{r + 1}-D{r + 1})*24-F{r + 1}')
    tr = 4 + len(dagen)
    u.zet(tr, 0, 'Totaal' if nl else 'Total', 'totaal')
    for k in range(1, 6):
        u.zet(tr, k, None, 'totaal')
    u.zet(tr, 6, sum(e - b_ - p_ for _, _, _, b_, e, p_ in dagen), 'uren', f'SUM(G5:G{tr})')
    u.vast = 4
    uit['urenstaat'] = [u]

    # Planning (eenvoudige Gantt per week)
    g = Blad('Planning', [30, 12, 9, 12] + [5] * 12)
    g.zet(0, 0, 'Projectplanning' if nl else 'Project plan', 'titel')
    g.zet(1, 0, 'Balken tonen de weken waarin een taak loopt; pas start en duur aan.' if nl else
          'Bars show the weeks a task runs; adjust start and duration.', 'label')
    kopregel(g, 3, ['Taak' if nl else 'Task', 'Start', 'Duur (d)' if nl else 'Days', 'Einde' if nl else 'End'], rechts=(2,))
    start0 = excel_datum(2027, 1, 4)  # maandag
    for w in range(12):
        g.zet(3, 4 + w, f'W{w + 1}', 'kopr')
    taken = [('Voorbereiding' if nl else 'Preparation', 0, 10), ('Ontwerp' if nl else 'Design', 7, 21),
             ('Uitwerking' if nl else 'Detailing', 28, 21), ('Vergunning' if nl else 'Permit', 35, 28),
             ('Uitvoering' if nl else 'Construction', 49, 28), ('Oplevering' if nl else 'Handover', 77, 5)]
    for i, (naam, off, duur) in enumerate(taken):
        r = 4 + i
        g.zet(r, 0, naam)
        g.zet(r, 1, start0 + off, 'datum')
        g.zet(r, 2, duur, 'geheel')
        g.zet(r, 3, start0 + off + duur - 1, 'datum', f'B{r + 1}+C{r + 1}-1')
        for w in range(12):
            ws, we = w * 7, w * 7 + 6
            g.zet(r, 4 + w, None, 'balk' if off <= we and off + duur - 1 >= ws else 'tekst')
    g.vast = 4
    uit['planning'] = [g]

    # Materiaalstaat
    m = Blad('Materiaalstaat' if nl else 'Materials', [12, 34, 10, 12, 14, 16, 22])
    m.zet(0, 0, 'Materiaalstaat' if nl else 'Bill of materials', 'titel')
    m.zet(1, 0, 'Project: naam · fase: definitief ontwerp' if nl else 'Project: name · stage: detailed design', 'label')
    kopregel(m, 3, ['Code', 'Omschrijving' if nl else 'Description', 'Eenheid' if nl else 'Unit', 'Hoeveelheid' if nl else 'Quantity',
                    'Prijs/eenheid' if nl else 'Unit price', 'Totaal' if nl else 'Total', 'Leverancier' if nl else 'Supplier'], rechts=(3, 4, 5))
    mat = [('BT-01', 'Beton C30/37' if nl else 'Concrete C30/37', 'm³', 42, 135), ('WP-02', 'Wapeningsstaal B500B' if nl else 'Rebar B500B', 'kg', 3800, 1.15),
           ('KZ-03', 'Kalkzandsteen 150 mm' if nl else 'Sand-lime brick 150 mm', 'm²', 260, 38.5),
           ('IS-04', 'Isolatie PIR 120 mm' if nl else 'PIR insulation 120 mm', 'm²', 310, 21.9), ('HT-05', 'Vuren balk 71×171' if nl else 'Spruce beam 71×171', 'm', 180, 9.75)]
    for i, (c, o, e, h, pr) in enumerate(mat):
        r = 4 + i
        m.zet(r, 0, c)
        m.zet(r, 1, o)
        m.zet(r, 2, e)
        m.zet(r, 3, h, 'getal')
        m.zet(r, 4, pr, 'euro')
        m.zet(r, 5, h * pr, 'euro', f'D{r + 1}*E{r + 1}')
        m.zet(r, 6, 'Leverancier' if nl else 'Supplier')
    tr = 4 + len(mat)
    m.zet(tr, 0, 'Totaal' if nl else 'Total', 'totaal')
    for k in range(1, 5):
        m.zet(tr, k, None, 'totaal')
    m.zet(tr, 5, sum(h * pr for *_, h, pr in mat), 'totaal', f'SUM(F5:F{tr})')
    m.zet(tr, 6, None, 'totaal')
    m.vast = 4
    uit['materiaalstaat'] = [m]
    return uit


# ----------------------------------------------------------------------------- Presentatie (PPTX)
P = ('xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
     'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
     'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"')
CX, CY = 12192000, 6858000
EMU = 12700  # per punt

THEMAS = {
    # naam: (achtergrond, tekst, accent, titeldia-achtergrond, titeldia-tekst, gedempt)
    'licht': ('FFFFFF', FORGE, '2563EB', 'FFFFFF', FORGE, GRIJS),
    'donker': ('1F1F24', 'F5F5F4', 'F59E0B', '141418', 'FFFFFF', 'A8A29E'),
    'openaec': (WIT, FORGE, AMBER, FORGE, 'FFFFFF', GRIJS),
}


def theme_xml(naam, achter, tekst, accent):
    kleur = lambda n, v: f'<a:{n}><a:srgbClr val="{v}"/></a:{n}>'
    fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
    lijn = '<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'
    return XML + (
        f'<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="OpenAEC {naam}"><a:themeElements>'
        f'<a:clrScheme name="OpenAEC {naam}">{kleur("dk1", tekst if naam != "donker" else "141418")}'
        f'{kleur("lt1", achter if naam != "donker" else "FFFFFF")}{kleur("dk2", FORGE)}{kleur("lt2", BETON)}'
        f'{kleur("accent1", accent)}{kleur("accent2", FORGE)}{kleur("accent3", "0F766E")}{kleur("accent4", "7C3AED")}'
        f'{kleur("accent5", "DC2626")}{kleur("accent6", "65A30D")}{kleur("hlink", accent)}{kleur("folHlink", "7C3AED")}</a:clrScheme>'
        f'<a:fontScheme name="Inter"><a:majorFont><a:latin typeface="{FONT}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>'
        f'<a:minorFont><a:latin typeface="{FONT}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>'
        f'<a:fmtScheme name="OpenAEC"><a:fillStyleLst>{fill * 3}</a:fillStyleLst><a:lnStyleLst>{lijn * 3}</a:lnStyleLst>'
        '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle>'
        f'<a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst>{fill * 3}</a:bgFillStyleLst></a:fmtScheme>'
        '</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>')


def sp(id_, naam, ph=None, rect=None, tekst=None, vulling=None, lijst=None, uitlijn=None, sz=None, kleur=None, b=False, anker=None):
    """Vorm: plaatshouder (ph=(type, idx)) of rechthoek met vulling; tekst = lijst alinea's (str of (niveau, str))."""
    nv = f'<p:nvSpPr><p:cNvPr id="{id_}" name="{x(naam)}"/><p:cNvSpPr>' + (
        '<a:spLocks noGrp="1"/>' if ph else '') + '</p:cNvSpPr><p:nvPr>' + (
        f'<p:ph type="{ph[0]}"' + (f' idx="{ph[1]}"' if ph[1] is not None else '') + '/>' if ph else '') + '</p:nvPr></p:nvSpPr>'
    geo = ''
    if rect:
        geo = (f'<a:xfrm><a:off x="{rect[0]}" y="{rect[1]}"/><a:ext cx="{rect[2]}" cy="{rect[3]}"/></a:xfrm>'
               + ('<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' if not ph else ''))
    geo += (f'<a:solidFill><a:srgbClr val="{vulling}"/></a:solidFill><a:ln><a:noFill/></a:ln>' if vulling else '')
    body = ''
    if tekst is not None or ph:
        alineas = ''
        for a in (tekst or []):
            niv, s = a if isinstance(a, tuple) else (0, a)
            rpr = f'<a:rPr lang="nl-NL" dirty="0"' + (f' sz="{sz}"' if sz else '') + (' b="1"' if b else '') + '>' + (
                f'<a:solidFill><a:srgbClr val="{kleur}"/></a:solidFill>' if kleur else '') + '</a:rPr>'
            ppr = (f'<a:pPr lvl="{niv}"' + (f' algn="{uitlijn}"' if uitlijn else '') + '/>') if niv or uitlijn else ''
            alineas += f'<a:p>{ppr}<a:r>{rpr}<a:t>{x(s)}</a:t></a:r></a:p>'
        body = (f'<p:txBody><a:bodyPr{" anchor=" + chr(34) + anker + chr(34) if anker else ""}/><a:lstStyle/>'
                + (alineas or '<a:p><a:endParaRPr lang="nl-NL"/></a:p>') + '</p:txBody>')
    return f'<p:sp>{nv}<p:spPr>{geo}</p:spPr>{body}</p:sp>'


def sptree(vormen):
    return ('<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
            '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
            + ''.join(vormen) + '</p:spTree>')


def achtergrond(kleur):
    return f'<p:bg><p:bgPr><a:solidFill><a:srgbClr val="{kleur}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>'


def maak_pptx(pad, taal, titel, thema):
    achter, tekst, accent, tachter, ttekst, gedempt = THEMAS[thema]
    nl = taal == 'nl'
    M = 640080  # marge 0,7"
    BR = CX - 2 * M
    lvl = lambda n, sz, b=False, kleur=None, voor=0: (
        f'<a:lvl{n}pPr marL="{0 if n == 1 else (n - 1) * 342900}" indent="{0 if n == 1 else -228600}">'
        f'<a:spcBef><a:spcPts val="{voor}"/></a:spcBef>'
        + ('<a:buNone/>' if n == 1 else f'<a:buClr><a:srgbClr val="{accent}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="•"/>')
        + f'<a:defRPr sz="{sz}"' + (' b="1"' if b else '') + f'><a:solidFill><a:srgbClr val="{kleur or tekst}"/></a:solidFill>'
        '<a:latin typeface="+mn-lt"/></a:defRPr></a:lvl' + str(n) + 'pPr>')
    master = (XML + f'<p:sldMaster {P}><p:cSld>{achtergrond(achter)}' + sptree([
        sp(2, 'Title', ('title', None), (M, 457200, BR, 1005840), anker='b'),
        sp(3, 'Body', ('body', 1), (M, 1737360, BR, 4206240)),
        sp(4, 'Accent', rect=(M, 1554480, 914400, 54864), vulling=accent),
        sp(5, 'Slide Number', ('sldNum', 12), (CX - M - 1371600, CY - 548640, 1371600, 320040)),
    ]) + '</p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" '
        'accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst>' + ''.join(
        f'<p:sldLayoutId id="{2147483649 + i}" r:id="rId{i + 1}"/>' for i in range(5)) + '</p:sldLayoutIdLst><p:txStyles>'
        f'<p:titleStyle><a:lvl1pPr><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:defRPr sz="3600" b="1"><a:solidFill><a:srgbClr val="{tekst}"/></a:solidFill>'
        '<a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle>'
        f'<p:bodyStyle>{lvl(1, 2200, voor=600)}{lvl(2, 2000, voor=400)}{lvl(3, 1800, kleur=gedempt, voor=300)}</p:bodyStyle>'
        f'<p:otherStyle>{lvl(1, 1800)}</p:otherStyle></p:txStyles></p:sldMaster>')

    def layout(naam, vormen, soort, bg=None):
        # Lagen met eigen achtergrond tonen de vormen van het model (accentstreep) niet.
        verberg = ' showMasterSp="0"' if bg else ''
        return XML + f'<p:sldLayout {P} type="{soort}" preserve="1"{verberg}><p:cSld name="{x(naam)}">' + (
            achtergrond(bg) if bg else '') + sptree(vormen) + '</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'
    half = (BR - 457200) // 2
    titel_kleur = lambda sz: f'<a:lstStyle><a:lvl1pPr><a:defRPr sz="{sz}"><a:solidFill><a:srgbClr val="{ttekst}"/></a:solidFill></a:defRPr></a:lvl1pPr></a:lstStyle>'

    def ph_met_stijl(id_, naam, ph, rect, stijl, anker=None):
        s = sp(id_, naam, ph, rect, anker=anker)
        return s.replace('<a:lstStyle/>', stijl)
    layouts = [
        ('Titeldia' if nl else 'Title Slide', 'title', [
            ph_met_stijl(2, 'Title', ('ctrTitle', None), (M, 2286000, BR, 1463040), titel_kleur(4800), 'b'),
            ph_met_stijl(3, 'Subtitle', ('subTitle', 1), (M, 3931920, BR, 914400), titel_kleur(2000)),
            sp(4, 'Accent', rect=(M, 3840480, 1371600, 64008), vulling=accent)], tachter),
        ('Sectiekop' if nl else 'Section Header', 'secHead', [
            sp(5, 'Band', rect=(0, 0, 274320, CY), vulling=accent),
            ph_met_stijl(2, 'Title', ('title', None), (M, 2468880, BR, 1188720), titel_kleur(4000), 'b'),
            ph_met_stijl(3, 'Text', ('body', 1), (M, 3749040, BR, 640080), titel_kleur(1800))], tachter),
        ('Titel en inhoud' if nl else 'Title and Content', 'obj', [
            sp(2, 'Title', ('title', None)), sp(3, 'Content', ('body', 1))], None),
        ('Twee kolommen' if nl else 'Two Content', 'twoObj', [
            sp(2, 'Title', ('title', None)), sp(3, 'Left', ('body', 1), (M, 1737360, half, 4206240)),
            sp(4, 'Right', ('body', 2), (M + half + 457200, 1737360, half, 4206240))], None),
        ('Afsluiting' if nl else 'Closing', 'title', [
            ph_met_stijl(2, 'Title', ('ctrTitle', None), (M, 2286000, BR, 1371600), titel_kleur(4400).replace('<a:lvl1pPr>', '<a:lvl1pPr algn="ctr">'), 'b'),
            ph_met_stijl(3, 'Subtitle', ('subTitle', 1), (M, 3749040, BR, 914400), titel_kleur(2000).replace('<a:lvl1pPr>', '<a:lvl1pPr algn="ctr">')),
            sp(4, 'Accent', rect=(CX // 2 - 685800, 3657600, 1371600, 64008), vulling=accent)], tachter),
    ]
    dias = [
        (0, [('ctrTitle', None, ['Titel van de presentatie' if nl else 'Presentation title']),
             ('subTitle', 1, ['Ondertitel · naam · datum' if nl else 'Subtitle · name · date'])]),
        (1, [('title', None, ['Sectietitel' if nl else 'Section title']),
             ('body', 1, ['Korte inleiding op dit onderdeel' if nl else 'A short introduction to this part'])]),
        (2, [('title', None, ['Titel en inhoud' if nl else 'Title and content']),
             ('body', 1, ['Eerste punt: houd het kort' if nl else 'First point: keep it short', (1, 'Toelichting op het tweede niveau' if nl else 'Detail on the second level'),
                          'Tweede punt' if nl else 'Second point', 'Derde punt' if nl else 'Third point'])]),
        (3, [('title', None, ['Twee kolommen' if nl else 'Two columns']),
             ('body', 1, ['Links' if nl else 'Left', (1, 'Voordelen of situatie nu' if nl else 'Benefits or current situation')]),
             ('body', 2, ['Rechts' if nl else 'Right', (1, 'Nadelen of gewenste situatie' if nl else 'Drawbacks or desired situation')])]),
        (4, [('ctrTitle', None, ['Dank u wel' if nl else 'Thank you']),
             ('subTitle', 1, ['Vragen? naam@voorbeeld.nl' if nl else 'Questions? name@example.com'])]),
    ]
    delen = {
        '_rels/.rels': PKG_RELS('ppt/presentation.xml'),
        'docProps/core.xml': core(titel, taal),
        'docProps/app.xml': APP,
        'ppt/theme/theme1.xml': theme_xml(thema, achter, tekst, accent),
        'ppt/slideMasters/slideMaster1.xml': master,
        'ppt/slideMasters/_rels/slideMaster1.xml.rels': rels(
            [(f'rId{i + 1}', R + 'slideLayout', f'../slideLayouts/slideLayout{i + 1}.xml') for i in range(5)]
            + [('rId9', R + 'theme', '../theme/theme1.xml')]),
        'ppt/presProps.xml': XML + f'<p:presentationPr {P}/>',
        'ppt/viewProps.xml': XML + f'<p:viewPr {P}><p:normalViewPr/><p:slideViewPr><p:cSldViewPr><p:cViewPr varScale="1">'
                             '<p:scale><a:sx n="100" d="100"/><a:sy n="100" d="100"/></p:scale><p:origin x="0" y="0"/></p:cViewPr>'
                             '</p:cSldViewPr></p:slideViewPr></p:viewPr>',
        'ppt/tableStyles.xml': XML + '<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
                               'def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>',
    }
    over = [('ppt/presentation.xml', 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml'),
            ('ppt/theme/theme1.xml', 'application/vnd.openxmlformats-officedocument.theme+xml'),
            ('ppt/slideMasters/slideMaster1.xml', 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml'),
            ('ppt/presProps.xml', 'application/vnd.openxmlformats-officedocument.presentationml.presProps+xml'),
            ('ppt/viewProps.xml', 'application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml'),
            ('ppt/tableStyles.xml', 'application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml'), CORE_T, APP_T]
    for i, (naam, soort, vormen, bg) in enumerate(layouts):
        delen[f'ppt/slideLayouts/slideLayout{i + 1}.xml'] = layout(naam, vormen, soort, bg)
        delen[f'ppt/slideLayouts/_rels/slideLayout{i + 1}.xml.rels'] = rels([('rId1', R + 'slideMaster', '../slideMasters/slideMaster1.xml')])
        over.append((f'ppt/slideLayouts/slideLayout{i + 1}.xml', 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml'))
    for i, (lay, inhoud) in enumerate(dias):
        vormen = [sp(2 + j, f'{t_} {j + 1}', (t_, idx), tekst=tekst_) for j, (t_, idx, tekst_) in enumerate(inhoud)]
        delen[f'ppt/slides/slide{i + 1}.xml'] = (XML + f'<p:sld {P}><p:cSld>' + sptree(vormen)
                                                + '</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>')
        delen[f'ppt/slides/_rels/slide{i + 1}.xml.rels'] = rels([('rId1', R + 'slideLayout', f'../slideLayouts/slideLayout{lay + 1}.xml')])
        over.append((f'ppt/slides/slide{i + 1}.xml', 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'))
    delen['ppt/presentation.xml'] = (
        XML + f'<p:presentation {P} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
        '<p:sldIdLst>' + ''.join(f'<p:sldId id="{256 + i}" r:id="rId{10 + i}"/>' for i in range(len(dias))) + '</p:sldIdLst>'
        f'<p:sldSz cx="{CX}" cy="{CY}"/><p:notesSz cx="6858000" cy="9144000"/>'
        f'<p:defaultTextStyle><a:lvl1pPr><a:defRPr lang="{LANG[taal]}"/></a:lvl1pPr></p:defaultTextStyle></p:presentation>')
    delen['ppt/_rels/presentation.xml.rels'] = rels(
        [('rId1', R + 'slideMaster', 'slideMasters/slideMaster1.xml'), ('rId2', R + 'theme', 'theme/theme1.xml'),
         ('rId3', R + 'presProps', 'presProps.xml'), ('rId4', R + 'viewProps', 'viewProps.xml'),
         ('rId5', R + 'tableStyles', 'tableStyles.xml')]
        + [(f'rId{10 + i}', R + 'slide', f'slides/slide{i + 1}.xml') for i in range(len(dias))])
    delen['[Content_Types].xml'] = typen(over)
    schrijf_zip(pad, delen)


# ----------------------------------------------------------------------------- catalogus
CATALOGUS = [
    # id, soort, naam (nl, en), omschrijving (nl, en)
    ('brief', 'docx', ('Brief', 'Letter'), ('Adresvak voor vensterenvelop (NEN 1026)', 'Address block for window envelopes')),
    ('rapport', 'docx', ('Rapport', 'Report'), ('Voorblad, inhoudsopgave en koppen', 'Cover, table of contents and headings')),
    ('memo', 'docx', ('Memo', 'Memo'), ('Kort en zakelijk, met besluitpunt', 'Short and businesslike, with decision')),
    ('factuur', 'docx', ('Factuur', 'Invoice'), ('Klantgegevens, regels en totalen', 'Customer details, lines and totals')),
    ('notulen', 'docx', ('Notulen', 'Minutes'), ('Agenda, besluiten en actiepunten', 'Agenda, decisions and action items')),
    ('cv', 'docx', ('Cv', 'CV'), ('Profiel, ervaring en opleiding', 'Profile, experience and education')),
    ('begroting', 'xlsx', ('Begroting', 'Budget'), ('Begroot, werkelijk en verschil', 'Budget, actual and difference')),
    ('factuur-berekend', 'xlsx', ('Factuur met berekeningen', 'Invoice with calculations'), ('Regels, btw en totaal rekenen mee', 'Lines, VAT and total are calculated')),
    ('urenstaat', 'xlsx', ('Urenstaat', 'Timesheet'), ('Begin, einde en pauze per dag', 'Start, end and break per day')),
    ('planning', 'xlsx', ('Planning', 'Project plan'), ('Taken met eenvoudige Gantt-balken', 'Tasks with simple Gantt bars')),
    ('materiaalstaat', 'xlsx', ('Materiaalstaat', 'Bill of materials'), ('Hoeveelheden, prijzen en totalen', 'Quantities, prices and totals')),
    ('thema-licht', 'pptx', ('Thema licht', 'Light theme'), ('Wit met blauw accent', 'White with a blue accent')),
    ('thema-donker', 'pptx', ('Thema donker', 'Dark theme'), ('Donker met amber accent', 'Dark with an amber accent')),
    ('thema-openaec', 'pptx', ('Thema OpenAEC', 'OpenAEC theme'), ('Deep Forge en Construction Amber', 'Deep Forge and Construction Amber')),
]


def miniaturen(paden):
    """Rendert de eerste pagina/dia/blad van elk sjabloon als PNG via soffice (optioneel)."""
    soffice = shutil.which('soffice') or shutil.which('libreoffice')
    if not soffice:
        print('soffice niet gevonden: geen miniaturen', file=sys.stderr)
        return
    doel = UIT / 'miniaturen'
    doel.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        profiel = Path(tmp) / 'profiel'
        for bron, naam in paden:
            subprocess.run([soffice, f'-env:UserInstallation=file://{profiel}', '--headless', '--convert-to', 'png',
                            '--outdir', tmp, str(bron)], check=True, capture_output=True, timeout=120)
            png = Path(tmp) / (bron.stem + '.png')
            try:  # verkleinen naar 320 px breed als Pillow er is
                from PIL import Image
                with Image.open(png) as im:
                    im = im.convert('RGB')
                    im.thumbnail((320, 320))
                    im.save(doel / naam, optimize=True)
            except ImportError:
                shutil.copy(png, doel / naam)


def main():
    tekst = {taal: tekst_sjablonen(taal) for taal in TALEN}
    reken = {taal: rekenblad_sjablonen(taal) for taal in TALEN}
    gemaakt = []
    for id_, soort, naam, _ in CATALOGUS:
        for taal in TALEN:
            n = naam[TALEN.index(taal)]
            pad = UIT / taal / f'{id_}.{soort}'
            if soort == 'docx':
                maak_docx(pad, taal, n, **tekst[taal][id_])
            elif soort == 'xlsx':
                maak_xlsx(pad, taal, n, reken[taal][id_])
            else:
                maak_pptx(pad, taal, n, id_.split('-', 1)[1])
            gemaakt.append((pad, f'{id_}-{taal}.png'))
    catalogus = {
        'versie': 1,
        'talen': list(TALEN),
        'sjablonen': [{'id': i, 'soort': s, 'naam': dict(zip(TALEN, n)), 'omschrijving': dict(zip(TALEN, o))}
                      for i, s, n, o in CATALOGUS],
    }
    if '--miniaturen' in sys.argv:
        miniaturen(gemaakt)
    for item in catalogus['sjablonen']:
        item['miniatuur'] = all((UIT / 'miniaturen' / f'{item["id"]}-{taal}.png').exists() for taal in TALEN)
    (UIT / 'index.json').write_text(json.dumps(catalogus, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{len(gemaakt)} sjablonen in {UIT.relative_to(WORTEL)}')


if __name__ == '__main__':
    main()
