"""DTOs for the PDF journal importer (ported verbatim from the legacy
parser_dtos). Pure pydantic models — no DB, no tenant specifics."""

from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class ParsedGradeRaw(BaseModel):
    model_config = ConfigDict(extra="forbid")

    student_name: str
    date: str
    acronym: str
    grade_value: Optional[int] = None
    attendance_mark: Optional[str] = None
    original_cell_text: str


class ParsingPreviewResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject_raw_name: Optional[str] = None
    class_raw_name: Optional[str] = None
    unique_acronyms: List[str]
    unique_dates: List[str]
    student_names: List[str]
    preview_grades: List[ParsedGradeRaw]
    total_grades_found: int
    validation_errors: List[str] = Field(default_factory=list)


class ImportLog(BaseModel):
    model_config = ConfigDict(extra="forbid")

    student_name: str
    date: str
    message: str
    level: Literal["info", "warning", "error"]


class ImportExecutionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mapping: Dict[str, int]  # normalized acronym → work_type_id
    preview_grades_json: str = ""


class ImportExecutionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    added_count: int
    skipped_count: int
    replaced_count: int = 0
    logs: List[ImportLog]
