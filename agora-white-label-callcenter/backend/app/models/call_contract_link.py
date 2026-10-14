from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CallContractLink(Base):
    """Maps a dialed phone number within a campaign to the contract_v2 row it was dialed from.

    Populated at campaign creation time (dial_tasks carry contract_id). Agora's call APIs do not
    echo custom fields back on the call record, so calls_v2.contract_id is resolved by looking up
    this table via (campaign_id, phone_number) when a call is synced.
    """

    __tablename__ = 'call_contract_link'

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    campaign_id: Mapped[str] = mapped_column(String(64), index=True)
    phone_number: Mapped[str] = mapped_column(String(64), index=True)
    contract_id: Mapped[int] = mapped_column(Integer)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
