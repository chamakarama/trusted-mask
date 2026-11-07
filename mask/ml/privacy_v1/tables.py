"""Bounded CSV / values-only XLSX adapters. Rebuild output; never patch source ZIPs."""
import csv
import datetime as dt
import io
import os
import re
import tempfile
import zipfile
from xml.etree import ElementTree
from pathlib import Path
from .engine import MAX_TEXT_CHARS
from .policy import Aliases

MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_UNPACKED_BYTES = 50 * 1024 * 1024
MAX_CELLS = 10_000
MAX_RECTANGLE = 100_000
MAX_TOTAL_CHARS = 1_000_000


class UnsupportedFile(ValueError):
    pass


def read_bounded(path, limit):
    """Bound the actual read, rather than trusting a racing stat or ZIP metadata."""
    with Path(path).open("rb") as stream:
        data = stream.read(limit + 1)
    if len(data) > limit:
        raise UnsupportedFile("file_size_limit")
    return data


def publish_bytes(output, content):
    """Publish a complete file atomically without replacing any existing pathname."""
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output.parent, prefix=".mask-publish-") as directory:
        temporary = Path(directory) / "complete"
        with temporary.open("xb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        # Same-filesystem hard linking is atomic and fails if output already exists.
        # A cancellation before this point leaves no final output; after it, the file is complete.
        os.link(temporary, output)


def _phone_literal(value):
    return bool(re.fullmatch(r"\+[0-9](?:[ ()-]*[0-9]){7,14}", value.strip()))


def _csv_dangerous(value, *, source=False):
    stripped = value.lstrip()
    if source and _phone_literal(value):
        return False  # Scan/mask phone data first; unsafe unchanged output is still rejected.
    numeric = re.fullmatch(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?", stripped)
    return bool(stripped and stripped[0] in "=+-@" and not numeric)


def _read_csv(path):
    try:
        source = read_bounded(path, MAX_FILE_BYTES).decode("utf-8-sig")
        rows, width, nonempty, characters, rectangle = [], None, 0, 0, 0
        for row in csv.reader(io.StringIO(source, newline=""), strict=True):
            if not row or width is not None and len(row) != width:
                raise UnsupportedFile("empty_or_ragged_csv")
            width = len(row)
            rectangle += len(row)
            for value in row:
                nonempty += value != ""
                characters += len(value)
                if len(value) > MAX_TEXT_CHARS or "\x00" in value:
                    raise UnsupportedFile("cell_or_content_limit")
                if _csv_dangerous(value, source=True):
                    raise UnsupportedFile("csv_formula_like_content")
            if rectangle > MAX_RECTANGLE or nonempty > MAX_CELLS or characters > MAX_TOTAL_CHARS:
                raise UnsupportedFile("cell_or_content_limit")
            rows.append(row)
    except (UnicodeError, csv.Error) as error:
        raise UnsupportedFile("csv_encoding_or_parse_error") from error
    if not rows:
        raise UnsupportedFile("empty_or_ragged_csv")
    return [{"source_name": "", "source_index": 1, "rows": rows,
             "source_rows": list(range(1, len(rows) + 1)), "source_columns": list(range(1, len(rows[0]) + 1))}], {
                 "hidden_sheets_omitted": 0, "hidden_rows_omitted": 0, "hidden_columns_omitted": 0}


def _xlsx_preflight(data):
    """Reject oversized/dishonest worksheet dimensions before openpyxl allocates cells."""
    from openpyxl.utils.cell import coordinate_to_tuple, range_boundaries
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        if len(entries) > 1000 or sum(e.file_size for e in entries) > MAX_UNPACKED_BYTES:
            raise UnsupportedFile("xlsx_archive_limit")
        if any(e.flag_bits & 1 for e in entries):
            raise UnsupportedFile("encrypted_workbook")
        names = [e.filename.lower() for e in entries]
        if len(names) != len(set(names)):
            raise UnsupportedFile("ambiguous_archive_paths")
        forbidden = ("vbaproject", "xl/embeddings/", "xl/media/", "xl/externallinks/", "xl/pivot")
        drawings = [name for name in names if name.startswith("xl/drawings/")]
        ordinary_comment = re.compile(r"xl/drawings/commentsdrawing\d+\.vml")
        if (any(any(token in name for token in forbidden) for name in names)
                or any(not ordinary_comment.fullmatch(name) for name in drawings)):
            raise UnsupportedFile("unsupported_embedded_or_external_content")
        if any(e.filename.startswith("/") or ".." in Path(e.filename).parts for e in entries):
            raise UnsupportedFile("invalid_archive_paths")
        rectangles, physical_cells = 0, 0
        for entry in entries:
            if not entry.filename.lower().endswith((".xml", ".rels", ".vml")):
                continue
            with archive.open(entry) as stream:
                xml = stream.read(MAX_UNPACKED_BYTES + 1)
            if len(xml) > MAX_UNPACKED_BYTES:
                raise UnsupportedFile("xlsx_archive_limit")
            if b"\x00" in xml:
                raise UnsupportedFile("xml_encoding_unsupported")
            if b"<!DOCTYPE" in xml.upper() or b"<!ENTITY" in xml.upper():
                raise UnsupportedFile("xml_entities_unsupported")
            if not re.fullmatch(r"xl/worksheets/[^/]+\.xml", entry.filename, re.I):
                continue
            max_row, max_column = 1, 1
            for event, element in ElementTree.iterparse(io.BytesIO(xml), events=("start", "end")):
                if event == "end":
                    element.clear()
                    continue
                tag = element.tag.rsplit("}", 1)[-1]
                if tag == "dimension" and element.get("ref"):
                    _, _, end_column, end_row = range_boundaries(element.get("ref"))
                    if end_row is None or end_column is None:
                        raise UnsupportedFile("invalid_sheet_dimensions")
                    max_row, max_column = max(max_row, end_row), max(max_column, end_column)
                elif tag == "c":
                    physical_cells += 1
                    if physical_cells > MAX_RECTANGLE or not element.get("r"):
                        raise UnsupportedFile("xlsx_dimensions_limit")
                    row, column = coordinate_to_tuple(element.get("r"))
                    max_row, max_column = max(max_row, row), max(max_column, column)
                elif tag in ("f", "mergeCell"):
                    raise UnsupportedFile("formula_or_merged_cells_unsupported")
                if max_row * max_column + rectangles > MAX_RECTANGLE:
                    raise UnsupportedFile("xlsx_dimensions_limit")
            rectangles += max_row * max_column


def _read_xlsx(path):
    from openpyxl import load_workbook
    try:
        data = read_bounded(path, MAX_FILE_BYTES)
        _xlsx_preflight(data)
        workbook = load_workbook(io.BytesIO(data), data_only=False, keep_links=False)
    except UnsupportedFile:
        raise
    except (zipfile.BadZipFile, KeyError, OSError, ValueError, ElementTree.ParseError) as error:
        raise UnsupportedFile("invalid_or_encrypted_xlsx") from error
    tables = []
    omitted = {"hidden_sheets_omitted": 0, "hidden_rows_omitted": 0, "hidden_columns_omitted": 0}
    try:
        rectangle_total = 0
        for source_index, sheet in enumerate(workbook.worksheets, 1):
            rectangle_total += sheet.max_row * sheet.max_column
            if rectangle_total > MAX_RECTANGLE:
                raise UnsupportedFile("xlsx_dimensions_limit")
            if sheet.merged_cells.ranges:
                raise UnsupportedFile("merged_cells_unsupported")
            # Reject unsupported formulas even on hidden sheets; never evaluate caches.
            for row in sheet.iter_rows():
                if any(cell.data_type in ("f", "e") for cell in row):
                    raise UnsupportedFile("formula_or_error_cells_unsupported")
            if sheet.sheet_state != "visible":
                omitted["hidden_sheets_omitted"] += 1
                continue
            if sheet.row_dimensions[1].hidden:
                raise UnsupportedFile("hidden_header_row_unsupported")
            hidden_cols = set()
            for dimension in sheet.column_dimensions.values():
                if dimension.hidden:
                    hidden_cols.update(range(dimension.min, dimension.max + 1))
            omitted["hidden_columns_omitted"] += len(hidden_cols)
            rows, source_rows = [], []
            for row in sheet.iter_rows():
                if sheet.row_dimensions[row[0].row].hidden:
                    omitted["hidden_rows_omitted"] += 1
                    continue
                rows.append([cell.value for cell in row if cell.column not in hidden_cols])
                source_rows.append(row[0].row)
            if rows and rows[0]:
                tables.append({"source_name": sheet.title, "source_index": source_index, "rows": rows,
                               "source_rows": source_rows,
                               "source_columns": [c for c in range(1, sheet.max_column + 1) if c not in hidden_cols]})
    finally:
        workbook.close()
    if not tables:
        raise UnsupportedFile("no_visible_cells")
    return tables, omitted


def _string(value):
    if isinstance(value, (dt.date, dt.datetime, dt.time)):
        return value.isoformat()
    return str(value)


def protect_table(protector, source, output, task, *, language="en"):
    """Write a local review draft only. Return a report without raw cell/header values."""
    source, output = Path(source), Path(output)
    if os.path.lexists(output) or source.resolve() == output.resolve():
        raise ValueError("Output must be a new path")
    if language != "en" or not isinstance(task, str) or len(task) > 4000:
        raise UnsupportedFile("unsupported_language_or_task")
    suffix = source.suffix.lower()
    if suffix not in (".csv", ".xlsx") or output.suffix.lower() != suffix:
        raise UnsupportedFile("unsupported_file_type")
    if source.stat().st_size > MAX_FILE_BYTES:
        raise UnsupportedFile("file_size_limit")
    tables, omitted = _read_csv(source) if suffix == ".csv" else _read_xlsx(source)
    values = [_string(v) for t in tables for row in t["rows"] for v in row if v is not None and v != ""]
    rectangles = sum(sum(len(row) for row in t["rows"]) for t in tables)
    if (len(values) > MAX_CELLS or rectangles > MAX_RECTANGLE or sum(map(len, values)) > MAX_TOTAL_CHARS
            or any(len(v) > MAX_TEXT_CHARS or "\x00" in v for v in values)):
        raise UnsupportedFile("cell_or_content_limit")
    aliases = Aliases("\n".join(values + [task] + [t["source_name"] for t in tables]))
    protected, coverage, edits, retained, pending = [], [], [], [], []
    review_reasons = {"experimental_model_not_release_validated", "cross_field_inference_not_validated"}
    runtime_versions = None
    scanned = 0
    for sheet_index, table in enumerate(tables, 1):
        rows = table["rows"]
        # Source sheet name is scanned then replaced by a neutral unique output label.
        name_result = _scan(protector, table["source_name"], task, "", aliases)
        review_reasons.update(name_result.review_reasons)
        runtime_versions = getattr(name_result, "runtime_versions", None)
        headers = ["" if v is None else _string(v) for v in rows[0]]
        clean_rows = []
        for row_index, row in enumerate(rows, 1):
            context = "\n".join(f"{h}: {_string(v)}" for h, v in zip(headers, row) if v is not None)
            if len(context) + len(task) > 16_000:
                raise UnsupportedFile("row_context_limit")
            clean = []
            for col_index, value in enumerate(row, 1):
                if value is None or value == "":
                    clean.append(value)
                    continue
                text = _string(value)
                result = _scan(protector, text, task, context, aliases, headers[col_index-1] if row_index > 1 else "")
                if not result.coverage.get("complete"):
                    raise UnsupportedFile("incomplete_cell_scan")
                new_value = value if result.protected_text == text else result.protected_text
                if suffix == ".csv" and _csv_dangerous(_string(new_value)):
                    raise UnsupportedFile("unsafe_csv_output")
                clean.append(new_value)
                scanned += 1
                review_reasons.update(result.review_reasons)
                runtime_versions = getattr(result, "runtime_versions", None)
                for detection in getattr(result, "pending_reviews", []):
                    pending.append({"sheet": sheet_index, "row": row_index, "column": col_index,
                                    "source_sheet": table["source_index"], "source_row": table["source_rows"][row_index-1],
                                    "source_column": table["source_columns"][col_index-1], **detection})
                for fact in result.retained_sensitive:
                    retained.append({"sheet": sheet_index, "row": row_index, "column": col_index,
                                     "source_sheet": table["source_index"], "source_row": table["source_rows"][row_index-1],
                                     "source_column": table["source_columns"][col_index-1],
                                     **{k: fact[k] for k in ("start", "end", "label", "reason") if k in fact}})
                for edit in result.edits:
                    edits.append({"sheet": sheet_index, "row": row_index, "column": col_index,
                                  "source_sheet": table["source_index"], "source_row": table["source_rows"][row_index-1],
                                  "source_column": table["source_columns"][col_index-1],
                                  "start": edit.start, "end": edit.end, "label": edit.label,
                                  "action": edit.action, "reason": edit.reason})
            clean_rows.append(clean)
        protected.append(clean_rows)
        coverage.append({"sheet": sheet_index, "output_name": f"Sheet{sheet_index}", "rows": len(rows),
                         "columns": len(headers), "source_sheet": table["source_index"], "sheet_name_scanned": True,
                         "source_rows": table["source_rows"], "source_columns": table["source_columns"]})
    if scanned != len(values):
        raise RuntimeError("Cell coverage mismatch")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output.parent, prefix=".mask-") as directory:
        temp = Path(directory) / ("protected" + suffix)
        if suffix == ".csv":
            with temp.open("w", encoding="utf-8", newline="") as stream:
                csv.writer(stream).writerows(protected[0])
        else:
            from openpyxl import Workbook
            from openpyxl.packaging.core import DocumentProperties
            book = Workbook()
            book.remove(book.active)
            book.properties = DocumentProperties(creator="Mask", lastModifiedBy="Mask",
                                                 created=dt.datetime(2000, 1, 1), modified=dt.datetime(2000, 1, 1))
            for index, rows in enumerate(protected, 1):
                sheet = book.create_sheet(f"Sheet{index}")
                for row_index, row in enumerate(rows, 1):
                    for col_index, value in enumerate(row, 1):
                        cell = sheet.cell(row_index, col_index, value)
                        if isinstance(value, str):
                            cell.data_type = "s"  # Literal strings cannot become Excel formulas.
                        elif isinstance(value, (dt.date, dt.datetime)):
                            cell.number_format = "yyyy-mm-dd hh:mm:ss" if isinstance(value, dt.datetime) else "yyyy-mm-dd"
            book.save(temp)
            book.close()
        publish_bytes(output, temp.read_bytes())
    return {"status": "needs_review", "model_version": protector.model.model_id, "edits": edits,
            "review_reasons": sorted(review_reasons), "retained_sensitive": retained, "pending_reviews": pending,
            "runtime_versions": runtime_versions,
            "coverage": {"complete": True, "scanned_nonempty_cells": scanned, "total_nonempty_cells": len(values),
                         "sheets": coverage, **omitted}, "metadata": "new_values_only_file"}


def _scan(protector, text, task, context, aliases, header=""):
    try:
        result = protector._segment(text, task, context, aliases, header)
    except (ValueError, RuntimeError):
        # Hide the original exception chain too: model errors may contain source values.
        raise UnsupportedFile("cell_inference_failed") from None
    if (result.status == "unsupported" or not result.coverage.get("complete")
            or not isinstance(result.protected_text, str)):
        raise UnsupportedFile("incomplete_cell_scan")
    return result
