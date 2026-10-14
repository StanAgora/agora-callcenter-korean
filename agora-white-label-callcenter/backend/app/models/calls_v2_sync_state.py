from datetime import datetime

from sqlalchemy import BigInteger, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CallV2SyncState(Base):
    __tablename__ = 'calls_v2_sync_state'

    campaign_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    last_call_ts: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

