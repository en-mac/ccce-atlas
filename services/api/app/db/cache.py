"""
Redis cache client management.

Provides caching for API responses.
"""

import os
import json
import hashlib
from typing import Optional, Any
import redis.asyncio as redis


class RedisCache:
    """Async Redis cache client manager."""

    def __init__(self):
        self.client: Optional[redis.Redis] = None
        self.redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        self.default_ttl = 300  # 5 minutes

    async def connect(self) -> None:
        """Create Redis client."""
        if self.client is None:
            self.client = redis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True
            )

    async def disconnect(self) -> None:
        """Close Redis client."""
        if self.client is not None:
            await self.client.close()
            self.client = None

    def get_client(self) -> redis.Redis:
        """Get Redis client."""
        if self.client is None:
            raise RuntimeError("Redis client not initialized")
        return self.client

    @staticmethod
    def generate_key(prefix: str, *args, **kwargs) -> str:
        """
        Generate cache key from prefix and arguments.

        Args:
            prefix: Cache key prefix (e.g., "parcels:list")
            *args: Positional arguments to hash
            **kwargs: Keyword arguments to hash

        Returns:
            Cache key string
        """
        # Combine all arguments into a string
        key_parts = [str(arg) for arg in args]
        key_parts.extend(f"{k}={v}" for k, v in sorted(kwargs.items()))
        key_str = ":".join(key_parts)

        # Hash if too long
        if len(key_str) > 100:
            key_hash = hashlib.md5(key_str.encode()).hexdigest()
            return f"{prefix}:{key_hash}"

        return f"{prefix}:{key_str}" if key_str else prefix

    async def get(self, key: str) -> Optional[Any]:
        """
        Get cached value.

        Args:
            key: Cache key

        Returns:
            Cached value (parsed from JSON) or None
        """
        try:
            client = self.get_client()
            value = await client.get(key)
            if value:
                return json.loads(value)
            return None
        except Exception as e:
            print(f"Redis GET error: {e}")
            return None

    async def set(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None
    ) -> None:
        """
        Set cached value.

        Args:
            key: Cache key
            value: Value to cache (will be JSON serialized)
            ttl: Time to live in seconds (defaults to 5 minutes)
        """
        try:
            client = self.get_client()
            ttl = ttl or self.default_ttl
            await client.setex(
                key,
                ttl,
                json.dumps(value, default=str)  # default=str for datetime
            )
        except Exception as e:
            print(f"Redis SET error: {e}")

    async def delete(self, key: str) -> None:
        """Delete cached value."""
        try:
            client = self.get_client()
            await client.delete(key)
        except Exception as e:
            print(f"Redis DELETE error: {e}")

    async def clear_pattern(self, pattern: str) -> None:
        """
        Clear all keys matching a pattern.

        Args:
            pattern: Key pattern (e.g., "parcels:*")
        """
        try:
            client = self.get_client()
            cursor = 0
            while True:
                cursor, keys = await client.scan(
                    cursor,
                    match=pattern,
                    count=100
                )
                if keys:
                    await client.delete(*keys)
                if cursor == 0:
                    break
        except Exception as e:
            print(f"Redis CLEAR error: {e}")


# Global cache instance
redis_cache = RedisCache()
