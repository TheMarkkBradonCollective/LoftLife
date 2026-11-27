# LoftLife Administration

LoftLife platform staff are separate from player-created city staff. Platform roles are stored in `ll_staff_assignments` and checked by the Cloudflare Worker on every administrative request; hiding a control in the UI is not authorization.

## Leadership hierarchy

1. **Founders** — Markk and Alijah. Both founder seats are protected from staff-role changes and removals through the dashboard.
2. **Directors** — executive department oversight and appointment of Management, Administrators, Moderators, and Support within their assigned departments.
3. **Management** — daily operations and appointment/removal of Moderators and Support within assigned departments.
4. **Administrators** — player account lookup and moderation queue access.
5. **Moderators** — report review and temporary account suspensions.
6. **Support** — player assistance and account lookup; no staff appointments or moderation actions.

Departments currently supported: Development, Community, Operations, Marketing, Finance, Player Support, and Executive. Department scope is stored with each staff appointment.

## Founder bootstrap

Set the Cloudflare Worker variable/secret `LOFTLIFE_FOUNDER_HANDLES` to exactly two comma-separated account handles, in this order: Markk's handle, then Alijah's handle. Example format: `founder_handle_one,founder_handle_two`. Do not commit the real handles or any secrets to Git.

The Worker resolves these exact handles against `ll_accounts` and upserts the two protected Founder assignments. If either account has not registered yet, that Founder seat is assigned automatically when that account exists and the admin console is next opened.

## Admin dashboard

Authorized staff open **Game Menu → Administration**. The dashboard includes:

- Platform overview and staff counts
- Staff directory, role appointments, and department assignments
- Player account search and temporary suspensions (up to 30 days)
- Report review and action status
- Administrative audit history

All administrative actions are written to `ll_admin_audit`. Founder identities cannot be demoted or removed through the staff console. Self-promotion and self-removal are blocked.

## Database migration

Apply `migrations/0011_founder_admin.sql` to the LoftLife Neon database after testing it on a Neon branch. The migration creates the staff assignment and administrative audit tables. It is additive and does not modify existing account or game records.
