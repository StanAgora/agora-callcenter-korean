from sqlalchemy import String, Integer, BigInteger, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CampaignCall(Base):
    __tablename__ = 'campaign_calls'

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    campaign_id: Mapped[str] = mapped_column(String(64), index=True)
    call_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    call_category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    hangup_reason: Mapped[str | None] = mapped_column(String(128), nullable=True)
    from_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    to_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    agent_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    agent_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    call_ts: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    answered_ts: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    llm_call_evaluation_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    llm_call_evaluation_failed_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    llm_call_evaluation_result: Mapped[str | None] = mapped_column(Text, nullable=True)
    record_file_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_complete: Mapped[bool] = mapped_column(Boolean, default=False)
