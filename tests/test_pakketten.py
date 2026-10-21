"""Synthetische ZIP-gevallen; geen bewijs van editorcompatibiliteit."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('pakketten', Path(__file__).parents[1] / 'scripts/vergelijk_pakketten.py')
pakketten = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pakketten)


class Pakketcontrole(unittest.TestCase):
    def setUp(self):
        self.map = tempfile.TemporaryDirectory()
        self.addCleanup(self.map.cleanup)

    def schrijf(self, naam, extra=None, weglaten=()):
        inhoud = {'[Content_Types].xml': b'<Types/>', '_rels/.rels': b'<Relationships/>', 'word/document.xml': b'<document/>', 'customXml/item1.xml': b'<onbekend/>'}
        inhoud.update(extra or {})
        pad = Path(self.map.name) / naam
        with zipfile.ZipFile(pad, 'w') as archief:
            for deel, tekst in inhoud.items():
                if deel not in weglaten:
                    archief.writestr(deel, tekst)
        return pad

    def test_identiek_is_geen_visueel_bewijs(self):
        a = self.schrijf('bron.docx')
        r = pakketten.vergelijk(a, self.schrijf('kopie.docx'))
        self.assertEqual(r['pakketcontrole'], 'geen_onverwachte_pakketverschillen')
        self.assertEqual(r['inhoudelijke_en_visuele_controle'], 'niet_uitgevoerd')

    def test_onbekend_onderdeel_verloren(self):
        a = self.schrijf('bron.docx')
        r = pakketten.vergelijk(a, self.schrijf('kopie.docx', weglaten=['customXml/item1.xml']))
        self.assertEqual(r['verwijderd'], ['customXml/item1.xml'])
        self.assertEqual(r['pakketcontrole'], 'afwijkingen')

    def test_gewijzigde_afbeelding(self):
        a = self.schrijf('bron.docx', {'word/media/image.png': b'beeld-1'})
        b = self.schrijf('kopie.docx', {'word/media/image.png': b'beeld-2'})
        self.assertEqual(pakketten.vergelijk(a, b)['onverwacht_gewijzigd'], ['word/media/image.png'])

    def test_bewuste_wijziging_blijft_zichtbaar(self):
        a = self.schrijf('bron.docx')
        b = self.schrijf('kopie.docx', {'word/document.xml': b'<document>nieuw</document>'})
        r = pakketten.vergelijk(a, b, ['word/document.xml'])
        self.assertEqual(r['gewijzigd'], ['word/document.xml'])
        self.assertEqual(r['onverwacht_gewijzigd'], [])

    def test_toegevoegd_onderdeel(self):
        a = self.schrijf('bron.docx')
        b = self.schrijf('kopie.docx', {'word/media/extra.png': b'beeld'})
        self.assertEqual(pakketten.vergelijk(a, b)['pakketcontrole'], 'afwijkingen')

    def test_verkeerd_formaat(self):
        with self.assertRaises(ValueError):
            pakketten.vergelijk(self.schrijf('bron.docx'), self.schrijf('kopie.xlsx'))

    def test_vereist_onderdeel_ontbreekt(self):
        with self.assertRaises(ValueError):
            pakketten.lees_pakket(self.schrijf('bron.docx', weglaten=['word/document.xml']))

    def test_pad_buiten_pakket(self):
        with self.assertRaises(ValueError):
            pakketten.lees_pakket(self.schrijf('bron.docx', {'../bestand': b'inhoud'}))

    def test_dubbele_naam(self):
        a = self.schrijf('bron.docx')
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', UserWarning)
            with zipfile.ZipFile(a, 'a') as z:
                z.writestr('word/document.xml', b'vervangen')
        with self.assertRaises(ValueError):
            pakketten.lees_pakket(a)

    def test_uitpaklimiet(self):
        with patch.object(pakketten, 'MAX_INHOUD', 10), self.assertRaises(ValueError):
            pakketten.lees_pakket(self.schrijf('bron.docx'))

    def test_alle_drie_formaatwortels(self):
        for ext, deel in pakketten.HOOFDDELEN.items():
            p = self.schrijf('bron' + ext, {deel: b'<wortel/>'})
            self.assertIn(deel, pakketten.lees_pakket(p))


if __name__ == '__main__':
    unittest.main()
