# Phase 4 — control who uses CloudForge (invite code, admin panel, quotas)

## 1. Invite code (stops strangers from signing up)
In `Backend/.env`:
```
SIGNUP_CODE=choose-a-secret-phrase
```
Restart the backend (`docker compose up -d --build backend`). The Register form now shows an
"Invite code" field. Wrong/missing code -> "Invalid invite code". Empty `SIGNUP_CODE` = open sign-up.
Existing accounts are not affected. Share the code only with the people you want.

## 2. Admin page (Admin in the sidebar, admins only)
| Column / button | What it does |
|---|---|
| Role + Save | make someone admin / user (you cannot change your own role) |
| Status + **Block / Unblock** | a blocked user is logged out at once, cannot log in, and **all their running apps are stopped** |
| Usage | their projects and running apps |
| **Limits** | per-user exceptions to the default quotas (empty = default) |

Safety rules: you cannot block or demote yourself, and the last active admin cannot be removed.
Role and block status are read from the database on every request (cached ~10 s), so demoting an
admin or blocking a user works immediately even though their login token is still valid.

How to become admin the first time: set `role` to `admin` for your user in MongoDB Atlas
(Browse Collections -> users), then log in again.

## 3. Quotas on the dashboard
Users see "Your plan limits": projects, running apps, deploys this hour (admins see nothing).
Defaults come from `.env` (`MAX_PROJECTS_PER_USER=5`, `MAX_RUNNING_CONTAINERS_PER_USER=3`,
`MAX_DEPLOYS_PER_HOUR=20`); the Limits dialog overrides them per user. `0` blocks that action.

## New API
| Endpoint | Who | Purpose |
|---|---|---|
| `GET /api/auth/config` | public | `{ inviteRequired }` for the sign-up form |
| `GET /api/auth/usage` | logged in | my quota usage |
| `GET /api/admin/users` | admin | users + usage + status + overrides |
| `PATCH /api/admin/users/:id` | admin | `{ role?, status?, limitOverrides? }` |

## Also fixed
- Admin "Joined" column showed an invalid date (backend sent `createdAt`, page read `joinedAt`).
- Sign-up form allowed 6-character passwords while the server needs 8.

## Check it works
1. Set `SIGNUP_CODE`, restart, open Register: the invite field appears; a wrong code is rejected.
2. Make a second account, deploy an app, then Block it from the Admin page: its app stops, its
   open dashboard tab gets logged out on the next request, login says "Your account has been blocked".
3. Give a user "Max projects = 1" in Limits: creating a second project shows the limit message.
