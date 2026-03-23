"""
Database connection pool management.

Provides async connection pool for PostgreSQL + PostGIS.
"""

import os
from typing import Optional

import asyncpg


class DatabasePool:
    """Async database connection pool manager."""

    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None
        self.database_url = os.getenv(
            "DATABASE_URL",
            "postgresql://ccce_atlas:ccce_atlas_dev@localhost:5432/ccce_atlas"
        )

    async def connect(self) -> None:
        """Create connection pool."""
        if self.pool is None:
            self.pool = await asyncpg.create_pool(
                self.database_url,
                min_size=5,
                max_size=20,
                command_timeout=60,
            )

    async def disconnect(self) -> None:
        """Close connection pool."""
        if self.pool is not None:
            await self.pool.close()
            self.pool = None

    def get_pool(self) -> asyncpg.Pool:
        """Get connection pool."""
        if self.pool is None:
            raise RuntimeError("Database pool not initialized")
        return self.pool


# Global pool instance
database_pool = DatabasePool()
