"""Kenmerkcontrole op synthetische XLSX-fixtures; geen bewijs van editorcompatibiliteit."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile

SCRIPTS = Path(__file__).parents[1] / 'scripts'


def laad(naam, bestand):
    spec = importlib.util.spec_from_file_location(naam, SCRIPTS / bestand)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


fixtures = laad('rekenbladfixtures', 'maak-rekenbladfixtures.py')
kenmerken = laad('rekenblad_kenmerken', 'rekenblad_kenmerken.py')


def kopie_zonder(bron, doel, weglaten=(), vervang=None):
    with zipfile.ZipFile(bron) as a, zipfile.ZipFile(doel, 'w') as b:
        for info in a.infolist():
            if info.filename in weglaten:
                continue
            inhoud = a.read(info.filename)
            if vervang and info.filename in vervang:
                inhoud = vervang[info.filename](inhoud)
            b.writestr(info, inhoud)


class Kenmerkcontrole(unittest.TestCase):
    def setUp(self):
        self.map = tempfile.TemporaryDirectory()
        self.addCleanup(self.map.cleanup)
        self.pad = Path(self.map.name)
        fixtures.r2().schrijf(self.pad / 'r2.xlsx')
        fixtures.r3().schrijf(self.pad / 'r3.xlsx')

    def test_r2_kenmerken(self):
        k = kenmerken.kenmerken(self.pad / 'r2.xlsx')
        self.assertEqual(k['verborgen_bladen'], [{'naam': 'Verborgen', 'state': 'hidden'}])
        self.assertEqual([n['naam'] for n in k['benoemde_bereiken']], ['Omzet', '_xlnm.Print_Titles'])
        self.assertEqual(k['afdrukbereik'][0]['formule'], 'Gegevens!$A$1:$B$7')
        self.assertEqual(k['pagina_instellingen'][0]['orientation'], 'landscape')
        self.assertEqual(k['grafieken'][0]['onderdeel'], 'xl/charts/chart1.xml')
        self.assertIn('Gegevens!$B$2:$B$5', k['grafieken'][0]['bronnen'])

    def test_r3_kenmerken(self):
        k = kenmerken.kenmerken(self.pad / 'r3.xlsx')
        self.assertEqual([v['type'] for v in k['validaties']], ['decimal', 'list'])
        self.assertEqual(k['voorwaardelijke_opmaak'], 1)
        self.assertEqual(k['draaitabellen'][0]['locatie'], 'A3:B6')
        self.assertEqual(k['draaicaches'][0]['records'], ['xl/pivotCache/pivotCacheRecords1.xml'])
        self.assertEqual(k['onbekende_onderdelen'], [{
            'onderdeel': 'xl/openaec/onbekend-onderdeel.xml', 'relatie': fixtures.ONBEKEND_TYPE,
            'aanwezig': True, 'inhoudstype': fixtures.ONBEKEND_CT}])

    def test_identieke_kopie_verliest_niets(self):
        self.assertEqual(kenmerken.verlies(self.pad / 'r3.xlsx', self.pad / 'r3.xlsx')['verloren_of_gewijzigd'], [])

    def test_losgeraakte_grafiek_telt_als_verlies(self):
        doel = self.pad / 'zonder-grafiek.xlsx'
        kopie_zonder(self.pad / 'r2.xlsx', doel, weglaten=('xl/charts/chart1.xml',))
        verloren = [v['kenmerk'] for v in kenmerken.verlies(self.pad / 'r2.xlsx', doel)['verloren_of_gewijzigd']]
        self.assertEqual(verloren, ['grafieken'])

    def test_verborgen_blad_zichtbaar_maken_telt_als_wijziging(self):
        doel = self.pad / 'zichtbaar.xlsx'
        kopie_zonder(self.pad / 'r2.xlsx', doel,
                     vervang={'xl/workbook.xml': lambda b: b.replace(b' state="hidden"', b'')})
        verloren = [v['kenmerk'] for v in kenmerken.verlies(self.pad / 'r2.xlsx', doel)['verloren_of_gewijzigd']]
        self.assertEqual(verloren, ['verborgen_bladen'])

    def test_onbekend_onderdeel_en_draaitabel_verlies(self):
        doel = self.pad / 'kaal.xlsx'
        kopie_zonder(self.pad / 'r3.xlsx', doel, weglaten=(
            'xl/openaec/onbekend-onderdeel.xml', 'xl/pivotCache/pivotCacheRecords1.xml'))
        verloren = {v['kenmerk'] for v in kenmerken.verlies(self.pad / 'r3.xlsx', doel)['verloren_of_gewijzigd']}
        self.assertEqual(verloren, {'draaicaches', 'onbekende_onderdelen'})


if __name__ == '__main__':
    unittest.main()
