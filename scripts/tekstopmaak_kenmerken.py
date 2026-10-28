"""Controleert de XML van de proefbestanden uit scripts/test-tekstopmaak.mjs.

Alleen standaardbibliotheek: zipfile + xml.etree. Elk bestand dat er is,
wordt gecontroleerd op de OOXML-elementen die de opmaakvensters horen te
schrijven (w:pPr, w:rPr, w:numPr, w:pBdr, w:shd, w:pgBorders, w:background).

    python3 scripts/tekstopmaak_kenmerken.py .local/tekstopmaak
"""

import os
import sys
import zipfile
import xml.etree.ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def lees(pad, deel="word/document.xml"):
    with zipfile.ZipFile(pad) as z:
        if deel not in z.namelist():
            return None
        return ET.fromstring(z.read(deel))


def val(el, naam="val"):
    return None if el is None else el.get(W + naam)


def alineas(doc):
    return list(doc.iter(W + "p"))


def tekst(p):
    return "".join(t.text or "" for t in p.iter(W + "t"))


def alinea_met(doc, begin):
    for p in alineas(doc):
        if tekst(p).startswith(begin):
            return p
    raise AssertionError(f"alinea '{begin}' ontbreekt")


def ppr(p):
    return p.find(W + "pPr")


def controleer_alinea(pad):
    doc = lees(pad)
    p = ppr(alinea_met(doc, "Tweede alinea"))
    ind = p.find(W + "ind")
    assert val(ind, "left") == "851" and val(ind, "right") == "567" and val(ind, "hanging") == "357", ET.tostring(ind)
    sp = p.find(W + "spacing")
    assert val(sp, "before") == "360" and val(sp, "line") == "280" and val(sp, "lineRule") == "atLeast"
    assert val(p.find(W + "jc")) == "both"
    assert p.find(W + "keepLines") is not None
    assert p.find(W + "pageBreakBefore") is not None
    assert val(p.find(W + "widowControl")) in ("0", "false")
    tabs = p.find(W + "tabs")
    assert [(val(t), val(t, "pos"), val(t, "leader")) for t in tabs] == [
        ("right", "2835", "dot"),
        ("decimal", "4536", None),
    ]
    eerste = ppr(alinea_met(doc, "Eerste alinea"))
    # De bronopmaak die niet gewijzigd is (afstand na) blijft staan.
    assert val(eerste.find(W + "spacing"), "after") == "0"
    assert val(eerste.find(W + "keepNext")) in ("0", "false")


def controleer_bijgehouden(pad):
    p = ppr(alinea_met(lees(pad), "Eerste alinea"))
    wijziging = p.find(W + "pPrChange")
    assert wijziging is not None and wijziging.get(W + "author") == "Proef"
    assert wijziging.get(W + "id").isdigit()
    vorig = wijziging.find(W + "pPr")
    assert val(vorig.find(W + "jc")) == "center"
    assert val(p.find(W + "jc")) == "right"


def controleer_lettertype(pad):
    p = alinea_met(lees(pad), "Tweede")
    runs = [r for r in p.iter(W + "r") if r.find(W + "t") is not None]
    eerste = runs[0].find(W + "rPr")
    assert val(eerste.find(W + "rFonts"), "ascii") == "Liberation Sans"
    assert val(eerste.find(W + "sz")) == "28"
    assert eerste.find(W + "b") is not None and eerste.find(W + "i") is not None
    assert val(eerste.find(W + "color")) == "1F4E79"
    u = eerste.find(W + "u")
    assert val(u) == "wave" and val(u, "color") == "C00000"
    assert eerste.find(W + "dstrike") is not None
    assert val(eerste.find(W + "vertAlign")) == "superscript"
    assert eerste.find(W + "smallCaps") is not None
    assert val(eerste.find(W + "spacing")) == "30"
    assert val(eerste.find(W + "w")) == "90"
    assert val(eerste.find(W + "position")) == "4"
    tweede = [r.find(W + "rPr") for r in runs if tekst(r).startswith("alinea")][0]
    assert tweede.find(W + "caps") is not None and tweede.find(W + "vanish") is not None
    assert val(tweede.find(W + "vertAlign")) == "subscript" and tweede.find(W + "strike") is not None


def num_info(pad):
    num = lees(pad, "word/numbering.xml")
    nums = {n.get(W + "numId"): n for n in num.findall(W + "num")}
    abstracts = {a.get(W + "abstractNumId"): a for a in num.findall(W + "abstractNum")}
    return nums, abstracts


def lvl(abstract, ilvl):
    for l in abstract.findall(W + "lvl"):
        if l.get(W + "ilvl") == str(ilvl):
            return l
    raise AssertionError(f"niveau {ilvl} ontbreekt")


def numpr(p):
    n = ppr(p).find(W + "numPr")
    return (val(n.find(W + "numId")), val(n.find(W + "ilvl")))


def controleer_lijst(pad):
    doc = lees(pad)
    nums, abstracts = num_info(pad)
    # Notatie a) op de eerste twee items, opnieuw beginnen bij 5 op het derde.
    num_een, ilvl_een = numpr(alinea_met(doc, "Lijstitem Een"))
    num_twee, ilvl_twee = numpr(alinea_met(doc, "Lijstitem Twee"))
    assert num_een == num_twee and ilvl_twee == "1", (num_een, num_twee, ilvl_twee)
    abstract = abstracts[val(nums[num_een].find(W + "abstractNumId"))]
    assert val(lvl(abstract, 0).find(W + "numFmt")) == "lowerLetter"
    assert val(lvl(abstract, 0).find(W + "lvlText")) == "%1)"
    assert val(lvl(abstract, 1).find(W + "numFmt")) == "lowerRoman"
    num_drie, _ = numpr(alinea_met(doc, "Lijstitem Drie"))
    assert num_drie != num_een
    override = nums[num_drie].find(W + "lvlOverride")
    assert val(override.find(W + "startOverride")) == "5"
    # Opsomming met een eigen teken.
    num_slot, _ = numpr(alinea_met(doc, "Slot"))
    teken = lvl(abstracts[val(nums[num_slot].find(W + "abstractNumId"))], 0)
    assert val(teken.find(W + "numFmt")) == "bullet" and val(teken.find(W + "lvlText")) == "➢"
    # Doorgaan met nummering: de tweede alinea sluit aan bij de lijst erboven.
    assert numpr(alinea_met(doc, "Tweede alinea"))[0] == "2"


def controleer_randen(pad):
    p = ppr(alinea_met(lees(pad), "Eerste alinea"))
    bdr = p.find(W + "pBdr")
    boven, onder = bdr.find(W + "top"), bdr.find(W + "bottom")
    assert val(boven) == "single" and val(boven, "sz") == "12" and val(boven, "color") == "C00000"
    assert val(onder) == "double" and val(onder, "sz") == "6"
    assert bdr.find(W + "left") is not None and bdr.find(W + "right") is not None
    shd = p.find(W + "shd")
    assert val(shd) == "clear" and val(shd, "fill") == "FFF2CC"


def controleer_pagina(pad):
    doc = lees(pad)
    achtergrond = doc.find(W + "background")
    assert achtergrond is not None and val(achtergrond, "color") == "EAF1DD"
    sect = doc.find(W + "body").find(W + "sectPr")
    rand = sect.find(W + "pgBorders")
    assert rand is not None and val(rand, "offsetFrom") == "page"
    for zijde in ("top", "left", "bottom", "right"):
        z = rand.find(W + zijde)
        assert val(z) == "double" and val(z, "sz") == "12" and val(z, "color") == "1F4E79", zijde
    # De volgorde in sectPr: pgBorders komt na pgMar.
    namen = [c.tag for c in sect]
    assert namen.index(W + "pgBorders") == namen.index(W + "pgMar") + 1
    instellingen = lees(pad, "word/settings.xml")
    assert instellingen.find(W + "displayBackgroundShape") is not None


CONTROLES = {
    "alinea": controleer_alinea,
    "alinea-bijgehouden": controleer_bijgehouden,
    "lettertype": controleer_lettertype,
    "lijst": controleer_lijst,
    "randen": controleer_randen,
    "pagina": controleer_pagina,
}


def main(map_):
    fouten = 0
    for naam, controle in CONTROLES.items():
        pad = os.path.join(map_, naam + ".docx")
        if not os.path.exists(pad):
            continue
        try:
            controle(pad)
            print(f"✓ XML {naam}")
        except AssertionError as e:
            fouten += 1
            print(f"✗ XML {naam}: {e}")
    sys.exit(1 if fouten else 0)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".local/tekstopmaak")
