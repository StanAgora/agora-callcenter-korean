from sqlalchemy import String, Integer, BigInteger, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CallV2(Base):
    __tablename__ = 'calls_v2'

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    campaign_id: Mapped[str] = mapped_column(String(64), index=True)
    call_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    sip_call_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    agent_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    agent_session_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    agent_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    from_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    to_number: Mapped[str | None] = mapped_column(String(64), nullable=True)

    call_category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    hangup_reason: Mapped[str | None] = mapped_column(String(128), nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    answered_ts: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    call_ts: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    start_ts: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    end_ts: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    channel_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    record_file_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    structured_output: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    structured_output_status: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Transcript-based quota (LLM) — each call processed at most once
    quota_checked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    quota_check_detail: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON: status, llm, hits, error

    # Contract linkage (resolved at sync time via call_contract_link)
    contract_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Transcript-based contract-field correction (LLM) — each call processed at most once
    correction_checked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

