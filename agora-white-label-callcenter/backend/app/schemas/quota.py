from pydantic import BaseModel

from app.models.quota import QuotaCellStatus


class QuotaCellOut(BaseModel):
    id: str
    survey_id: str
    area: int
    area_name: str
    gender: int
    gender_name: str
    age_group: int
    age_name: str
    target: int
    completed: int
    status: QuotaCellStatus

    model_config = {'from_attributes': True}


class QuotaCellUpdate(BaseModel):
    id: str
    target: int


class AiSuggestionOut(BaseModel):
    target_population: str
    dimensions: dict
    suggested_quota_per_cell: int
    screening_rules: list[str]
    notes: str
