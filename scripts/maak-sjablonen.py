"""Maak lege, geldige kantoorbestanden voor de knop Nieuw (ontwikkelhulpmiddel)."""
from pathlib import Path
from docx import Document
from openpyxl import Workbook
from pptx import Presentation
from pptx.util import Inches
uitvoer = Path(__file__).resolve().parents[1] / 'public' / 'templates'
uitvoer.mkdir(parents=True, exist_ok=True)
d = Document()
d.core_properties.author = ''
d.core_properties.last_modified_by = ''
d.add_paragraph('')
d.save(uitvoer / 'nieuw.docx')
w = Workbook()
w.active.title = 'Blad 1'
w.properties.creator = ''
w.save(uitvoer / 'nieuw.xlsx')
p = Presentation()
p.core_properties.author = ''
p.core_properties.last_modified_by = ''
p.slide_width = Inches(13.333333)
p.slide_height = Inches(7.5)
s = p.slides.add_slide(p.slide_layouts[0])
s.shapes.title.text = 'Titel van de presentatie'
s.placeholders[1].text = 'Voeg een ondertitel toe'
p.save(uitvoer / 'nieuw.pptx')
