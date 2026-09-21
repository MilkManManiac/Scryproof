from bonesinfra.services.runtime.valkey import ValKeyService


class RedisService(ValKeyService):
    service = "redis"
    unit = "redis-server"
    package_user = "redis"


REDIS_SERVICE = RedisService()
