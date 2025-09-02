Website Link - https://winchell.vercel.app/

To create LDAP server run this in docker/CMD-

docker run -p 389:389 -p 636:636 \
  --name openldap \
  -e LDAP_ORGANISATION="My Company" \
  -e LDAP_DOMAIN="dcm4che.org" \
  -e LDAP_ADMIN_PASSWORD="secret" \
  -e LDAP_CONFIG_PASSWORD="config" \
  -e LDAP_READONLY_USER=true \
  -e LDAP_READONLY_USER_USERNAME="readonly" \
  -e LDAP_READONLY_USER_PASSWORD="readonly" \
  -d osixia/openldap:latest


  Directory Information Tree (DIT)
├── Entries (like rows)
│   ├── Attributes (like columns)
│   └── Values (like cell data)
└── CRUD: Add, Search, Modify, Delete

dc=company,dc=com                    ← **Root Entry** (like a database)
├── ou=Users                         ← **Organizational Unit** (like a folder)
│   ├── cn=john,ou=Users,dc=company,dc=com  ← **User Entry** (like a row)
│   └── cn=jane,ou=Users,dc=company,dc=com  ← **User Entry** (like a row)
├── ou=Groups                        ← **Organizational Unit** (like a folder)
│   └── cn=admins,ou=Groups,dc=company,dc=com  ← **Group Entry** (like a row)
└── ou=Departments                   ← **Organizational Unit** (like a folder)
    └── ou=IT,ou=Departments,dc=company,dc=com  ← **Dept Entry** (like a row)


Entries -
    {
  "dn": "cn=john,ou=Users,dc=company,dc=com",
  "objectClass": ["top", "person", "inetOrgPerson"],
  "cn": "john",
  "sn": "Doe",
  "givenName": "John",
  "mail": "john@company.com",
  "userPassword": "{SHA}hashedpassword"
}
