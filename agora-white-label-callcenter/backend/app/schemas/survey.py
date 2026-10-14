from datetime import datetime
from pydantic import BaseModel

from app.models.survey import SurveyType, SurveyStatus, QuotaMode


class SurveyOut(BaseModel):
    id: str
    name: str
    type: SurveyType
    status: SurveyStatus
    quota_mode: QuotaMode
    total_target: int = 0
    total_completed: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {'from_attributes': True}


class SurveyCreate(BaseModel):
    name: str
    type: SurveyType
    quota_mode: QuotaMode = QuotaMode.manual
