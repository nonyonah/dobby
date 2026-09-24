#!/usr/bin/env python3
"""Extract one text chunk per PDF page, using OCR for scanned/empty pages."""
import base64
import io
import json
import sys


def is_usable(text: str) -> bool:
    compact = " ".join(text.split())
    if len(compact) < 20:
        return False
    alphanumeric = sum(char.isalnum() for char in compact)
    return alphanumeric >= 10 and alphanumeric / max(len(compact), 1) >= 0.25


def extract_with_pdfplumber(pdf_bytes: bytes):
    import io
    import pdfplumber

    pages = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as document:
        for page_number, page in enumerate(document.pages, start=1):
            try:
                text = page.extract_text() or ""
                extracted_tables = page.extract_tables() or []
                table_text = "\n".join(
                    "\n".join("| " + " | ".join((cell or "").replace("|", "\\|").replace("\n", " ").strip() for cell in row) + " |" for row in table)
                    for table in extracted_tables
                    if table
                )
                if table_text:
                    text = f"{text}\n{table_text}".strip()
                pages.append(text)
            except Exception:
                pages.append("")
    return pages


def extract_with_pymupdf(pdf_bytes: bytes):
    import fitz

    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        return [(page.get_text("text") or "") for page in document]
    finally:
        document.close()


def render_page(pdf_bytes: bytes, page_number: int) -> str:
    import fitz

    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        page = document.load_page(page_number - 1)
        pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
        return base64.b64encode(pixmap.tobytes("png")).decode("ascii")
    finally:
        document.close()


def ocr_page(pdf_bytes: bytes, page_number: int) -> str:
    import io
    import fitz
    import pytesseract
    from PIL import Image

    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        page = document.load_page(page_number - 1)
        # 180 DPI is a practical balance for receipts/statements and memory usage.
        pixmap = page.get_pixmap(matrix=fitz.Matrix(2.5, 2.5), alpha=False)
        image = Image.open(io.BytesIO(pixmap.tobytes("png")))
        return pytesseract.image_to_string(image) or ""
    finally:
        document.close()


def main():
    pdf_bytes = sys.stdin.buffer.read()
    if not pdf_bytes:
        raise ValueError("PDF input is empty")

    try:
        pages = extract_with_pdfplumber(pdf_bytes)
    except Exception:
        pages = []

    try:
        fallback_pages = extract_with_pymupdf(pdf_bytes)
    except Exception as error:
        if not pages:
            raise RuntimeError(f"Unable to extract PDF text: {error}") from error
        fallback_pages = []

    page_count = max(len(pages), len(fallback_pages))
    result = []
    for index in range(page_count):
        page_number = index + 1
        text = pages[index] if index < len(pages) else ""
        used_ocr = False
        if not is_usable(text) and index < len(fallback_pages):
            fallback_text = fallback_pages[index]
            if is_usable(fallback_text):
                text = fallback_text
        if not is_usable(text):
            text = ocr_page(pdf_bytes, page_number)
            used_ocr = True
        result.append({"page": page_number, "text": text.strip(), "ocr": used_ocr, "image": render_page(pdf_bytes, page_number)})

    print(json.dumps({"pages": result}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr)
        sys.exit(1)
