from datetime import datetime

from sqlalchemy import LargeBinary, String, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ContractV2(Base):
    __tablename__ = 'contract_v2'

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(String(512))
    file_type: Mapped[str] = mapped_column(String(16))  # 'pdf' | 'docx'
    file_data: Mapped[bytes] = mapped_column(LargeBinary)

    # Extracted fields
    shiyousha: Mapped[str | None] = mapped_column(Text, nullable=True)      # 使用者
    shiyou_address: Mapped[str | None] = mapped_column(Text, nullable=True) # 使用場所住所
    heya_bangou: Mapped[str | None] = mapped_column(Text, nullable=True)    # 部屋番号
    keiyaku_plan: Mapped[str | None] = mapped_column(Text, nullable=True)   # 契約プラン
    shiharai_houhou: Mapped[str | None] = mapped_column(Text, nullable=True) # 支払方法
    denwa_bangou: Mapped[str | None] = mapped_column(Text, nullable=True)    # 電話番号

    # Corrections captured from post-call transcript analysis (JSON):
    # { "部屋番号": {"original": "...", "corrected": "...", "call_id": "...", "corrected_at": "..."}, ... }
    corrections: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
