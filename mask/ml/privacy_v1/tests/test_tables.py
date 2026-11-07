import csv
import datetime as dt
import json
import os
import re
import sys
import zipfile
import pytest
from openpyxl import Workbook, load_workbook
from openpyxl.comments import Comment
from mask.ml.privacy_v1.engine import Protector
from mask.ml.privacy_v1.contracts import ACTIONS, RELEVANCE, Prediction
from mask.ml.privacy_v1.engine import RulesModel
from mask.ml.privacy_v1.tables import MAX_CELLS, UnsupportedFile, protect_table, publish_bytes


class KeepFacts(RulesModel):
    def predict(self, *args, **kwargs):
        return Prediction({a: float(a == "KEEP") for a in ACTIONS},
                          {r: float(r == "essential") for r in RELEVANCE})


def test_csv_rare_last_cell_and_complete_coverage(tmp_path):
    source, output = tmp_path / "input.csv", tmp_path / "protected.csv"
    with source.open("w", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["note", "quantity"])
        for _ in range(100):
            writer.writerow(["ordinary", "5"])
        writer.writerow(["email: rare@example.invalid", "7"])
    report = protect_table(Protector(), source, output, "Count quantities")
    assert "rare@example.invalid" not in output.read_text()
    assert report["coverage"]["scanned_nonempty_cells"] == 204
    assert report["coverage"]["complete"]
    assert "rare@example.invalid" not in json.dumps(report)
    assert list(csv.reader(output.open()))[-1][1] == "7"


def test_xlsx_reconstructed_no_hidden_metadata_and_types(tmp_path):
    source, output = tmp_path / "input.xlsx", tmp_path / "protected.xlsx"
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Private customer name"
    sheet.append(["email", "measurement", "date"])
    sheet.append(["subject@example.invalid", 12.5, dt.datetime(2020, 5, 6)])
    sheet["B2"].comment = Comment("RAW_PRIVATE_COMMENT", "RAW_AUTHOR")
    sheet["B2"].hyperlink = "https://example.invalid/private-link"
    sheet.append(["HIDDEN_ROW", 123, None])
    sheet.row_dimensions[3].hidden = True
    hidden = workbook.create_sheet("RAW_HIDDEN_SHEET")
    hidden.sheet_state = "hidden"
    hidden["A1"] = "RAW_HIDDEN_CONTENT"
    workbook.properties.creator = "RAW_CREATOR"
    workbook.save(source)
    report = protect_table(Protector(KeepFacts()), source, output, "Describe the measurements and dates")
    result = load_workbook(output)
    assert result.sheetnames == ["Sheet1"]
    assert result.active["B2"].value == 12.5
    assert result.active["C2"].value == dt.datetime(2020, 5, 6)
    assert result.active["A2"].value == "[EMAIL]"
    assert report["coverage"]["hidden_sheets_omitted"] == 1
    assert report["coverage"]["hidden_rows_omitted"] == 1
    with zipfile.ZipFile(output) as archive:
        content = b"".join(archive.read(name) for name in archive.namelist())
    for value in (b"RAW_", b"HIDDEN_ROW", b"private-link", b"subject@example.invalid"):
        assert value not in content


@pytest.mark.parametrize("value", ["=HYPERLINK(\"https://example.invalid\")", " +cmd", "@SUM(A1)"])
def test_csv_formula_like_input_rejected(tmp_path, value):
    source, output = tmp_path / "input.csv", tmp_path / "protected.csv"
    with source.open("w", newline="") as stream:
        csv.writer(stream).writerows([["note"], [value]])
    with pytest.raises(UnsupportedFile, match="formula"):
        protect_table(Protector(), source, output, "Summarise")
    assert not output.exists()


def test_xlsx_formula_and_merged_layout_rejected(tmp_path):
    source, output = tmp_path / "input.xlsx", tmp_path / "protected.xlsx"
    workbook = Workbook()
    workbook.active["A1"] = "=1+2"
    workbook.save(source)
    with pytest.raises(UnsupportedFile, match="formula"):
        protect_table(Protector(), source, output, "Summarise")
    assert not output.exists()
    workbook.active["A1"] = "x"
    workbook.active.merge_cells("A1:B1")
    workbook.save(source)
    with pytest.raises(UnsupportedFile, match="merged"):
        protect_table(Protector(), source, output, "Summarise")


def test_xlsx_literal_equals_string_stays_literal(tmp_path):
    source, output = tmp_path / "input.xlsx", tmp_path / "protected.xlsx"
    workbook = Workbook()
    workbook.active["A1"] = "note"
    workbook.active["A2"] = "=literal string"
    workbook.active["A2"].data_type = "s"
    workbook.save(source)
    protect_table(Protector(), source, output, "Summarise")
    cell = load_workbook(output).active["A2"]
    assert cell.data_type == "s" and cell.value == "=literal string"


def test_limits_ragged_and_overwrite_fail_explicitly(tmp_path):
    source, output = tmp_path / "input.csv", tmp_path / "protected.csv"
    source.write_text("a,b\n1\n")
    with pytest.raises(UnsupportedFile, match="ragged"):
        protect_table(Protector(), source, output, "Count")
    source.write_text("x\n" * (MAX_CELLS + 1))
    with pytest.raises(UnsupportedFile, match="limit"):
        protect_table(Protector(), source, output, "Count")
    source.write_text("a\n1\n")
    output.write_text("existing")
    with pytest.raises(ValueError, match="new path"):
        protect_table(Protector(), source, output, "Count")
    assert output.read_text() == "existing"


def test_formatted_phone_csv_is_scanned_before_formula_check(tmp_path):
    source, output = tmp_path / "input.csv", tmp_path / "protected.csv"
    source.write_text("phone,measurement\n+1 202 555 0147,-3.5\n")
    report = protect_table(Protector(), source, output, "Explain the measurement")
    rows = list(csv.reader(output.open()))
    assert rows[1] == ["[PHONE]", "-3.5"]
    assert report["coverage"]["complete"]


def test_xlsx_large_declared_dimensions_rejected_before_load(tmp_path, monkeypatch):
    import openpyxl
    source, output = tmp_path / "input.xlsx", tmp_path / "protected.xlsx"
    original = tmp_path / "original.xlsx"
    workbook = Workbook()
    workbook.active["A1"] = "value"
    workbook.save(original)
    with zipfile.ZipFile(original) as archive, zipfile.ZipFile(source, "w") as destination:
        for entry in archive.infolist():
            data = archive.read(entry.filename)
            if entry.filename == "xl/worksheets/sheet1.xml":
                data = re.sub(rb'<dimension ref="[^"]+"', b'<dimension ref="A1:XFD1048576"', data)
            destination.writestr(entry, data)
    monkeypatch.setattr(openpyxl, "load_workbook", lambda *a, **k: (_ for _ in ()).throw(AssertionError("Must fail before workbook allocation")))
    with pytest.raises(UnsupportedFile, match="dimensions_limit"):
        protect_table(Protector(), source, output, "Summarise")
    assert not output.exists()


def test_xlsx_dishonest_dimensions_rejected_before_load(tmp_path, monkeypatch):
    import openpyxl
    source, output = tmp_path / "input.xlsx", tmp_path / "protected.xlsx"
    original = tmp_path / "original.xlsx"
    workbook = Workbook()
    workbook.active["A1"] = "value"
    workbook.save(original)
    with zipfile.ZipFile(original) as archive, zipfile.ZipFile(source, "w") as destination:
        for entry in archive.infolist():
            data = archive.read(entry.filename)
            if entry.filename == "xl/worksheets/sheet1.xml":
                data = data.replace(b'<c r="A1"', b'<c r="XFD1048576"')
            destination.writestr(entry, data)
    monkeypatch.setattr(openpyxl, "load_workbook", lambda *a, **k: (_ for _ in ()).throw(AssertionError("Must fail before workbook allocation")))
    with pytest.raises(UnsupportedFile, match="dimensions_limit"):
        protect_table(Protector(), source, output, "Summarise")
    assert not output.exists()


def test_interrupted_publication_leaves_no_partial_final_file(tmp_path, monkeypatch):
    output = tmp_path / "protected.csv"
    monkeypatch.setattr(os, "fsync", lambda fd: (_ for _ in ()).throw(OSError("simulated write failure")))
    with pytest.raises(OSError):
        publish_bytes(output, b"complete data")
    assert not output.exists()
    assert not list(tmp_path.glob(".mask-publish-*"))


def test_publication_race_never_overwrites_new_file(tmp_path, monkeypatch):
    output = tmp_path / "protected.csv"
    real_link = os.link
    def race(source, target):
        output.write_text("other writer")
        return real_link(source, target)
    monkeypatch.setattr(os, "link", race)
    with pytest.raises(FileExistsError):
        publish_bytes(output, b"our data")
    assert output.read_text() == "other writer"


def test_cell_inference_failure_does_not_write_or_echo_private_data(tmp_path):
    class BrokenModel(RulesModel):
        def predict(self, *args, **kwargs):
            raise RuntimeError("PRIVATE_VALUE_FROM_MODEL")
    source, output = tmp_path / "input.csv", tmp_path / "protected.csv"
    source.write_text("note\nI have asthma\n")
    with pytest.raises(UnsupportedFile, match="cell_inference_failed") as caught:
        protect_table(Protector(BrokenModel()), source, output, "Summarise")
    assert "PRIVATE_VALUE" not in str(caught.value)
    assert not output.exists()


def test_report_preserves_review_and_retained_fact_locations(tmp_path):
    source, output = tmp_path / "input.csv", tmp_path / "protected.csv"
    source.write_text("note\nI have asthma\n")
    result = protect_table(Protector(), source, output, "")
    assert "missing_task" in result["review_reasons"]
    assert result["retained_sensitive"]
    assert result["retained_sensitive"][0]["row"] == 2
    assert "I have asthma" not in json.dumps(result)
    assert result["runtime_versions"]["pipeline"]
    assert result["runtime_versions"]["policy"]


def test_cli_invalid_input_is_structured_without_raw_paths(tmp_path, monkeypatch, capsys):
    from mask.ml.privacy_v1.protect import main
    source, task, output = tmp_path / "PRIVATE_FILENAME.txt", tmp_path / "task.txt", tmp_path / "protected.json"
    source.write_bytes(b"\xffPRIVATE_VALUE")
    task.write_text("Explain")
    monkeypatch.setattr(sys, "argv", ["protect", "--input", str(source), "--task-file", str(task), "--output", str(output)])
    assert main() == 2
    captured = capsys.readouterr()
    assert json.loads(captured.err)["status"] == "unsupported"
    assert "PRIVATE_" not in captured.err
    assert "Traceback" not in captured.err
    assert not output.exists()


def test_cli_keeps_crlf_offsets_and_creates_parent_directory(tmp_path, monkeypatch, capsys):
    from mask.ml.privacy_v1.protect import main
    source, task, output = tmp_path / "message.txt", tmp_path / "task.txt", tmp_path / "nested" / "protected.json"
    source.write_bytes(b"First line\r\nemail: demo@example.invalid\r\n")
    task.write_text("Summarise")
    monkeypatch.setattr(sys, "argv", ["protect", "--input", str(source), "--task-file", str(task), "--output", str(output)])
    assert main() == 0
    result = json.loads(output.read_text())
    assert result["protected_text"].startswith("First line\r\n")
    assert result["edits"][0]["start"] == len("First line\r\nemail: ")
    assert json.loads(capsys.readouterr().out)["complete"]


def test_hidden_rows_columns_keep_source_coordinates(tmp_path):
    source, output = tmp_path / "input.xlsx", tmp_path / "protected.xlsx"
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["note", "hidden", "email"])
    sheet.append(["HIDDEN_ROW", "RAW_PRIVATE", "hidden@example.invalid"])
    sheet.append(["ordinary", "RAW_PRIVATE", "visible@example.invalid"])
    sheet.row_dimensions[2].hidden = True
    sheet.column_dimensions["B"].hidden = True
    workbook.save(source)
    report = protect_table(Protector(), source, output, "Summarise")
    edit = next(e for e in report["edits"] if e["label"] == "EMAIL")
    assert (edit["row"], edit["column"]) == (2, 2)
    assert (edit["source_row"], edit["source_column"]) == (3, 3)
    assert report["coverage"]["sheets"][0]["source_rows"] == [1, 3]
    assert report["coverage"]["sheets"][0]["source_columns"] == [1, 3]
    assert load_workbook(output).active.max_row == 2
