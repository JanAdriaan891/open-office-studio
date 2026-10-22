"""Vergelijk pakketonderdelen zonder documentinhoud naar het rapport te kopiëren."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import sys
import zipfile

MAX_ARCHIEF = 20 * 1024 * 1024
MAX_INHOUD = 100 * 1024 * 1024
MAX_ONDERDELEN = 10000
HOOFDDELEN = {'.docx': 'word/document.xml', '.xlsx': 'xl/workbook.xml', '.pptx': 'ppt/presentation.xml'}


def lees_pakket(pad):
    pad = Path(pad)
    hoofddeel = HOOFDDELEN.get(pad.suffix.lower())
    if not hoofddeel:
        raise ValueError('Alleen DOCX, XLSX en PPTX worden ondersteund.')
    if pad.stat().st_size > MAX_ARCHIEF:
        raise ValueError('Archief is groter dan 20 MiB.')
    with zipfile.ZipFile(pad) as archief:
        leden = archief.infolist()
        if len(leden) > MAX_ONDERDELEN:
            raise ValueError('Te veel pakketonderdelen.')
        namen = [lid.filename for lid in leden]
        if len(namen) != len(set(namen)):
            raise ValueError('Dubbele onderdeelnamen zijn niet toegestaan.')
        if sum(lid.file_size for lid in leden) > MAX_INHOUD:
            raise ValueError('Uitgepakte inhoud is groter dan 100 MiB.')
        if hoofddeel not in namen or '[Content_Types].xml' not in namen or '_rels/.rels' not in namen:
            raise ValueError('Vereiste pakketonderdelen ontbreken.')
        resultaat = {}
        for lid in leden:
            naam = lid.filename
            if '\\' in naam or PurePosixPath(naam).is_absolute() or '..' in PurePosixPath(naam).parts or any(ord(c) < 32 for c in naam):
                raise ValueError('Ongeldige onderdeelnaam.')
            if lid.flag_bits & 1:
                raise ValueError('Versleutelde onderdelen worden niet ondersteund.')
            if lid.is_dir():
                continue
            digest = hashlib.sha256()
            gelezen = 0
            with archief.open(lid) as bestand:
                while blok := bestand.read(65536):
                    gelezen += len(blok)
                    if gelezen > lid.file_size or gelezen > MAX_INHOUD:
                        raise ValueError('Onderdeel overschrijdt de opgegeven grootte.')
                    digest.update(blok)
            resultaat[naam] = digest.hexdigest()
        return resultaat


def vergelijk(voor, na, verwacht=()):
    """Een toegestane wijziging is nog geen bewijs van de juiste bewerking."""
    if Path(voor).suffix.lower() != Path(na).suffix.lower():
        raise ValueError('Bron en resultaat moeten hetzelfde formaat hebben.')
    bron, kopie = lees_pakket(voor), lees_pakket(na)
    gewijzigd = sorted(n for n in bron.keys() & kopie.keys() if bron[n] != kopie[n])
    verwijderd = sorted(bron.keys() - kopie.keys())
    toegevoegd = sorted(kopie.keys() - bron.keys())
    onverwacht = sorted(set(gewijzigd) - set(verwacht))
    return {
        'verwijderd': verwijderd,
        'toegevoegd': toegevoegd,
        'gewijzigd': gewijzigd,
        'onverwacht_gewijzigd': onverwacht,
        'pakketcontrole': 'afwijkingen' if verwijderd or toegevoegd or onverwacht else 'geen_onverwachte_pakketverschillen',
        'inhoudelijke_en_visuele_controle': 'niet_uitgevoerd',
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bron', type=Path)
    parser.add_argument('resultaat', type=Path)
    parser.add_argument('--verwacht-gewijzigd', action='append', default=[], metavar='ONDERDEEL')
    args = parser.parse_args()
    try:
        rapport = vergelijk(args.bron, args.resultaat, args.verwacht_gewijzigd)
    except (OSError, ValueError, zipfile.BadZipFile, RuntimeError, NotImplementedError) as fout:
        print(json.dumps({'fout': str(fout)}, ensure_ascii=False), file=sys.stderr)
        return 2
    print(json.dumps(rapport, ensure_ascii=False, indent=2))
    return 1 if rapport['pakketcontrole'] == 'afwijkingen' else 0


if __name__ == '__main__':
    sys.exit(main())
