from bonesinfra.services.runtime.mariadb import MARIADB_SERVICE
from bonesinfra.services.runtime.mongodb import MONGODB_SERVICE
from bonesinfra.services.runtime.mysql import MYSQL_SERVICE
from bonesinfra.services.runtime.postgres import POSTGRES_SERVICE
from bonesinfra.services.runtime.redis import REDIS_SERVICE
from bonesinfra.services.runtime.valkey import VALKEY_SERVICE

SERVICES = {
    "mariadb": MARIADB_SERVICE,
    "mongodb": MONGODB_SERVICE,
    "mysql": MYSQL_SERVICE,
    "postgres": POSTGRES_SERVICE,
    "redis": REDIS_SERVICE,
    "valkey": VALKEY_SERVICE,
}

__all__ = ["get_service"]


def get_service(name):
    svc = SERVICES.get(name)
    if svc is None:
        available = ", ".join(sorted(SERVICES))
        raise ValueError(f"Unknown service: {name}. Available: {available}")
    return svc
