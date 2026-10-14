import asyncio
import logging

from app.core.database import async_session_factory
from app.services.contract_correction import process_pending_corrections

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 20


async def poll_pending_corrections_forever() -> None:
    """Periodically check newly-completed calls for spoken contract-field corrections."""
    logger.info('Contract correction poll started (interval=%ss)', POLL_INTERVAL_SECONDS)
    try:
        while True:
            try:
                async with async_session_factory() as db:
                    result = await process_pending_corrections(db)
                    if result.get('processed'):
                        logger.debug('Contract correction poll processed %s call(s)', result['processed'])
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception('Contract correction poll tick failed')
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
    finally:
        logger.info('Contract correction poll stopped')


def start_contract_correction_poll() -> None:
    asyncio.create_task(poll_pending_corrections_forever())
