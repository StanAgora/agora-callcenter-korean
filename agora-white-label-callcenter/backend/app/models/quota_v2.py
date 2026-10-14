import json
from datetime import datetime

from sqlalchemy import Integer, String, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class QuotaV2(Base):
    """
    One row per quota cell, bound to an Agora campaign.
    - filters: JSON object — the dimension values that must ALL match for a call to "hit" this cell
               e.g. {"Region": "首尔", "性别": "男", "年龄": "19-29"}
    - label:   Human-readable string derived from filters, e.g. "Region=首尔, 性别=男, 年龄=19-29"
    - target:  Required number of successful interviews for this cell
    - completed: Actual hits so far (incremented on each matching call result)
    """
    __tablename__ = 'quota_v2'

    id:          Mapped[int]      = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[str]      = mapped_column(String(128), nullable=False, index=True)
    label:       Mapped[str]      = mapped_column(String(512), nullable=False)
    filters:     Mapped[str|None] = mapped_column(Text, nullable=True)   # JSON
    target:      Mapped[int]      = mapped_column(Integer, default=0)
    completed:   Mapped[int]      = mapped_column(Integer, default=0)
    # JSON list: [{ "call_id", "at", "confidence", "evidence", "variables" }, ...]
    hit_evidence: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at:  Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    def filters_dict(self) -> dict:
        if self.filters:
            try:
                return json.loads(self.filters)
            except Exception:
                return {}
        return {}

    def is_hit(self, call_result: dict) -> bool:
        """Return True if all filter dimensions match the call result variables."""
        fd = self.filters_dict()
        if not fd:
            return False
        return all(str(call_result.get(k)) == str(v) for k, v in fd.items())
