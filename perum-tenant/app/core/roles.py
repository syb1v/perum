"""Role constants for the tenant app.

Hierarchy (see docs/ROLES.md): org_admin → school_admin / director →
teacher / student / parent. `platform_admin` lives in the control plane, never
inside a tenant DB.
"""

ORG_ADMIN = "org_admin"
SCHOOL_ADMIN = "school_admin"
DIRECTOR = "director"
TEACHER = "teacher"
STUDENT = "student"
PARENT = "parent"

#: Roles that operate above a single school (school_id may be NULL).
ORG_LEVEL_ROLES = {ORG_ADMIN}
#: Roles scoped to one school.
SCHOOL_LEVEL_ROLES = {SCHOOL_ADMIN, DIRECTOR, TEACHER, STUDENT, PARENT}

ALL_ROLES = ORG_LEVEL_ROLES | SCHOOL_LEVEL_ROLES
