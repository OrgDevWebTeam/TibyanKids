# The AI result format (docs/contracts/ai-result.md), kept in line with the JSON Schema by tests.
from typing import List, Literal

from pydantic import BaseModel, Field, model_validator

Category = Literal["memorization", "pronunciation", "tajweed", "technical"]
Decision = Literal["accepted", "error", "uncertain"]
Quality = Literal["ok", "silent", "too_short", "too_noisy", "too_long"]
Level = Literal["beginner", "intermediate", "advanced"]
ErrorCode = Literal[
    "ERR_MEM_OMISSION",
    "ERR_MEM_SUBSTITUTION",
    "ERR_MEM_INSERTION",
    "ERR_PRON_LETTER_SUB",
    "ERR_PRON_HARAKA",
    "ERR_PRON_MADD_ASLI_SHORT",
    "ERR_TAJ_MADD_SHORT",
    "ERR_TAJ_GHONNA_OMIT",
    "ERR_TAJ_QALQALA_OMIT",
    "ERR_TAJ_UNMAPPED",
    "ERR_TECH_MODELS_DISAGREE",
]

CATEGORY_PREFIX = {
    "memorization": "ERR_MEM_",
    "pronunciation": "ERR_PRON_",
    "tajweed": "ERR_TAJ_",
    "technical": "ERR_TECH_",
}


class Finding(BaseModel):
    """One problem in one word, with the segment of the reference recitation to replay."""

    wordIndex: int = Field(ge=1)
    category: Category
    code: ErrorCode
    confidence: float = Field(ge=0, le=1)
    wordStartMs: int = Field(ge=0)
    wordEndMs: int = Field(ge=0)
    messageKey: str = Field(pattern=r"^FEEDBACK_[A-Z_]+$")

    @model_validator(mode="after")
    def check_finding(self):
        """The code belongs to the category, and the segment does not end before it starts."""
        if not self.code.startswith(CATEGORY_PREFIX[self.category]):
            raise ValueError(f"code {self.code} does not belong to category {self.category}")
        if self.wordEndMs < self.wordStartMs:
            raise ValueError("wordEndMs is before wordStartMs")
        return self


class AnalysisResult(BaseModel):
    """The one result format every model returns."""

    attemptId: str = Field(min_length=1)
    model: str = Field(min_length=1)
    modelVersion: str = Field(min_length=1)
    decision: Decision
    quality: Quality
    findings: List[Finding] = []
    processingMs: int = Field(ge=0)

    @model_validator(mode="after")
    def check_quality_rejection(self):
        """A quality rejection is not an attempt: always uncertain, with no findings."""
        if self.quality != "ok" and (self.decision != "uncertain" or self.findings):
            raise ValueError("a quality rejection must be uncertain with no findings")
        return self
