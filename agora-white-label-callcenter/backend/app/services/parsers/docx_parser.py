"""
Extract plain text from a DOCX file using python-docx.
Preserves paragraph structure and table cell content.
"""
from __future__ import annotations

import io


def extract_docx_text(file_bytes: bytes, max_chars: int = 8000) -> str:
    from docx import Document

    doc = Document(io.BytesIO(file_bytes))
    parts: list[str] = []

    for block in doc.element.body:
        tag = block.tag.split('}')[-1]
        if tag == 'p':
            # Paragraph
            text = ''.join(r.text for r in block.iter() if r.tag.endswith('}t'))
            if text.strip():
                parts.append(text.strip())
        elif tag == 'tbl':
            # Table: join cells with separator
            for row in block.iter():
                if row.tag.endswith('}tr'):
                    cells = []
                    for cell in row.iter():
                        if cell.tag.endswith('}tc'):
                            cell_text = ''.join(r.text for r in cell.iter() if r.tag.endswith('}t'))
                            if cell_text.strip():
                                cells.append(cell_text.strip())
                    if cells:
                        parts.append(' | '.join(cells))

    result = '\n'.join(parts)
    return result[:max_chars]
