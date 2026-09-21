from bonesinfra.services.runtime.mysql import MySQLService


class MariaDBService(MySQLService):
    apt_package = "mariadb-server"
    implementation = "mariadb"


MARIADB_SERVICE = MariaDBService()
