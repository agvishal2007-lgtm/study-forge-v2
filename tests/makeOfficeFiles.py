# Builds small, real Office files for the viewer tests. Usage: makeOfficeFiles.py <folder>
import base64, sys, zipfile
from pathlib import Path

folder = Path(sys.argv[1])
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/7yMK/gAAAABJRU5ErkJggg==')
W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

def write(name, parts):
    with zipfile.ZipFile(folder / name, 'w', zipfile.ZIP_DEFLATED) as package:
        for path, content in parts.items():
            package.writestr(path, content)

write('notes.docx', {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/_rels/document.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:window.__hacked=1" TargetMode="External"/><Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/" TargetMode="External"/></Relationships>',
    'word/document.xml': f'<w:document {W}><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Accruals chapter</w:t></w:r></w:p><w:p><w:r><w:t>&lt;img src=x onerror=window.__hacked=1&gt; stays plain text.</w:t></w:r></w:p><w:p><w:hyperlink r:id="rId9"><w:r><w:t>Bad link</w:t></w:r></w:hyperlink></w:p><w:p><w:hyperlink r:id="rId10"><w:r><w:t>Good link</w:t></w:r></w:hyperlink></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell one</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>',
})

def sheet(rows):
    body = ''
    for r, row in enumerate(rows, 1):
        cells = ''
        for c, value in enumerate(row):
            ref = f'{chr(65 + c)}{r}'
            cells += f'<c r="{ref}"><v>{value}</v></c>' if isinstance(value, (int, float)) else f'<c r="{ref}" t="inlineStr"><is><t>{value}</t></is></c>'
        body += f'<row r="{r}">{cells}</row>'
    return f'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{body}</sheetData></worksheet>'

def workbook(name, sheets):
    ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    entries = ''.join(f'<sheet name="{title}" sheetId="{i}" r:id="rId{i}"/>' for i, title in enumerate(sheets, 1))
    links = ''.join(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>' for i, _ in enumerate(sheets, 1))
    types = ''.join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i, _ in enumerate(sheets, 1))
    parts = {
        '[Content_Types].xml': f'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>{types}</Types>',
        '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        'xl/workbook.xml': f'<workbook {ns}><sheets>{entries}</sheets></workbook>',
        'xl/_rels/workbook.xml.rels': f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{links}</Relationships>',
    }
    for i, rows in enumerate(sheets.values(), 1):
        parts[f'xl/worksheets/sheet{i}.xml'] = sheet(rows)
    write(name, parts)

workbook('grades.xlsx', {'Quizzes': [['Name', 'Score'], ['Dana', 91.5], ['Sam', 77]], 'Budget': [['Item', 'Cost'], ['Books', 120]]})
workbook('long.xlsx', {'Rows': [['Row']] + [[i] for i in range(2500)]})

P = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
def shape(kind, text):
    return f'<p:sp><p:nvSpPr><p:cNvPr id="1" name="s"/><p:cNvSpPr/><p:nvPr><p:ph type="{kind}"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>{text}</a:t></a:r><a:r><a:t> continued</a:t></a:r></a:p></p:txBody></p:sp>'
write('lecture.pptx', {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    'ppt/presentation.xml': f'<p:presentation {P}><p:sldIdLst><p:sldId id="1" r:id="rIdB"/><p:sldId id="2" r:id="rIdA"/></p:sldIdLst></p:presentation>',
    'ppt/_rels/presentation.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdA" Target="slides/slide1.xml"/><Relationship Id="rIdB" Target="slides/slide2.xml"/></Relationships>',
    'ppt/slides/slide2.xml': f'<p:sld {P}><p:cSld><p:spTree>{shape("title", "First in order")}{shape("body", "Body words")}<p:pic><p:blipFill><a:blip r:embed="rId1"/></p:blipFill></p:pic><p:pic><p:blipFill><a:blip r:embed="rId3"/></p:blipFill></p:pic></p:spTree></p:cSld></p:sld>',
    'ppt/slides/_rels/slide2.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="../media/image1.png"/><Relationship Id="rId2" Target="../notesSlides/notesSlide1.xml"/><Relationship Id="rId3" Target="../media/bad.svg"/></Relationships>',
    'ppt/media/image1.png': PNG,
    'ppt/media/bad.svg': '<svg xmlns="http://www.w3.org/2000/svg" onload="window.__hacked=1"/>',
    'ppt/notesSlides/notesSlide1.xml': f'<p:notes {P}><p:cSld><p:spTree>{shape("body", "Say this out loud")}</p:spTree></p:cSld></p:notes>',
    'ppt/slides/slide1.xml': f'<p:sld {P}><p:cSld><p:spTree>{shape("title", "Second in order")}</p:spTree></p:cSld></p:sld>',
})
