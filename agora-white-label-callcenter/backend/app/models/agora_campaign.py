from datetime import datetime
from sqlalchemy import String, DateTime, BigInteger, Boolean, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

TERMINAL_STATUSES = {'completed', 'interrupted', 'interrupt'}


class AgoraCampaign(Base):
    __tablename__ = 'agora_campaigns'

    # 本地字段
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    campaign_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    campaign_name: Mapped[str] = mapped_column(String(255))
    ts: Mapped[int] = mapped_column(BigInteger)
    upload_method: Mapped[str | None] = mapped_column(String(32), nullable=True)
    quota_method: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # 从 Agora API 同步的字段
    status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    phone_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pipeline_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    agent_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    start_immediately: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    # schedule_option
    scheduled_start_time_input: Mapped[str | None] = mapped_column(String(64), nullable=True)
    scheduled_start_time: Mapped[str | None] = mapped_column(String(64), nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    scheduled_time_ranges_config: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON

    # hangup_config
    max_duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_silence_duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_ring_duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # features_config
    enable_transcript: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    enable_recording: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    enable_voice_assistant_hangup: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    enable_voicemail: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    enable_user_auto_hangup: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    enable_max_silence_duration_hangup: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    enable_fax_tone_auto_hangup: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    # 统计
    already_dialed_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_calls: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Agora 时间戳
    agora_created_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
    agora_updated_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
