#include <tunables/global>
profile scryproof-activities-nginx flags=(attach_disconnected) {
  #include <abstractions/base>
  /usr/sbin/nginx mr,
  /etc/scryproof-activities/nginx.conf r,
  /etc/nginx/mime.types r,
  /srv/sites/scryproof-activities/ r,
  /srv/sites/scryproof-activities/** r,
  /run/scryproof-activities/ rw,
  /run/scryproof-activities/** rwk,
  network unix stream,
  signal (send, receive) peer=scryproof-activities-nginx,
  signal (receive) peer=unconfined,
}
