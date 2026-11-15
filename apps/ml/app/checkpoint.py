"""Checkpointer factory. thread_id = conversationId."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import InMemorySaver


@asynccontextmanager
async def open_checkpointer(url: str | None = None) -> AsyncIterator[BaseCheckpointSaver]:
    """AsyncPostgresSaver when AGENT_DATABASE_URL is set, else in-memory.

    Use a direct or session-pooler URL. The transaction pooler (port 6543) breaks
    prepared statements, so prepare_threshold is disabled on the pool as well.
    """
    url = url if url is not None else os.environ.get("AGENT_DATABASE_URL", "")
    if not url.strip():
        yield InMemorySaver()
        return

    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
    from psycopg.rows import dict_row
    from psycopg_pool import AsyncConnectionPool

    pool = AsyncConnectionPool(
        conninfo=url,
        max_size=5,
        open=False,
        kwargs={"autocommit": True, "prepare_threshold": None, "row_factory": dict_row},
    )
    await pool.open()
    try:
        saver = AsyncPostgresSaver(pool)  # type: ignore[arg-type]
        await saver.setup()  # idempotent migrations
        yield saver
    finally:
        await pool.close()
