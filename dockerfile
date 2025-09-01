# Run OpenLDAP in Docker-

# docker run -p 389:389 -p 636:636 \
#     --name openldap \
#     -e LDAP_ORGANISATION="My Company" \
#     -e LDAP_DOMAIN="dcm4che.org" \
#     -e LDAP_ADMIN_PASSWORD="secret" \
#     -e LDAP_CONFIG_PASSWORD="config" \
#     -e LDAP_READONLY_USER=true \
#     -e LDAP_READONLY_USER_USERNAME="readonly" \
#     -e LDAP_READONLY_USER_PASSWORD="readonly" \
#     -d osixia/openldap:latest