"""Bestandskoppelingen van de Windows-installer tegen de formaatcatalogus."""
import json
from pathlib import Path
import re
import unittest

wortel = Path(__file__).parents[1]
koppelingen = json.loads((wortel / 'src-tauri/tauri.windows.conf.json').read_text(encoding='utf-8'))['bundle']['fileAssociations']
catalogus = json.loads((wortel / 'src/formaten.json').read_text(encoding='utf-8'))
haak = (wortel / 'src-tauri/windows/koppelingen.nsh').read_text(encoding='utf-8')
modules = {'OpenAEC.OfficeStudio.Tekst': 'docx', 'OpenAEC.OfficeStudio.Rekenblad': 'xlsx', 'OpenAEC.OfficeStudio.Presentatie': 'pptx'}


class Koppelingen(unittest.TestCase):
    def test_elke_extensie_wordt_door_de_juiste_module_geopend(self):
        for koppeling in koppelingen:
            soort = modules.get(koppeling['name'])
            for ext in koppeling['ext']:
                with self.subTest(ext=ext):
                    if soort:
                        self.assertIn(ext, catalogus[soort]['invoer'])
                    else:
                        self.assertIn(ext, ('mdb', 'accdb'))

    def test_extensies_zijn_uniek(self):
        alle = [ext for koppeling in koppelingen for ext in koppeling['ext']]
        self.assertEqual(len(alle), len(set(alle)))

    def test_standaard_apps_registratie_gelijk_aan_koppelingen(self):
        verwacht = {(ext, koppeling['name']) for koppeling in koppelingen for ext in koppeling['ext']}
        gevonden = set(re.findall(r'!insertmacro \$\{MACRO\} (\w+) ([\w.]+)', haak))
        self.assertEqual(gevonden, verwacht)


if __name__ == '__main__':
    unittest.main()
