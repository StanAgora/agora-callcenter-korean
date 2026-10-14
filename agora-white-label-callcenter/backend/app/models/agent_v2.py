from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AgentV2(Base):
    __tablename__ = 'agent_v2'

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    agent_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    agent_name: Mapped[str] = mapped_column(String(255))
    app_id: Mapped[str] = mapped_column(String(64))
    system_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    greeting_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    failure_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    voice_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    properties: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    created_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
    updated_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
