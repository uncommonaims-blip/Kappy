# Kappy: multi-user backend foundation

Kappy currently runs as a **fictional in-memory prototype** on GitHub Pages. This branch adds a database design only. **It does not enable live accounts or shared calendar synchronization yet.** Do not enter real client, caregiver, or medical information into the prototype.

## Architecture

- Frontend: existing static GitHub Pages site (no Vercel).
- Backend: Supabase Auth + PostgreSQL with row-level security.
- Anyone with a verified account may create a team using `create_team(name)`; its creator becomes an admin.
- Existing teams are invitation-only: an admin invokes `invite_member(team_id,email,role)` and privately delivers the resulting one-time token. The intended recipient signs in with the **same verified email** and calls `accept_invitation(token)`.
- Users can belong to multiple teams. Every calendar record has a `team_id`, and membership is checked by the database on every read.
- Roles: admin, caregiver, family. Only admins can add confirmed shifts or modify existing calendar entries in this initial policy. Other members can create their own availability, requests, and events. Further role-specific visibility policies are needed before real-world use.

## Setup (not yet connected)

1. Create a Supabase project under an account owned by the Kappy operator.
2. Review and apply `supabase/schema.sql` in its SQL editor, preferably in a **development** project first.
3. Configure email verification and approved GitHub Pages redirect URLs in Supabase Auth.
4. Integrate the Supabase JS client into Kappy, with a public project URL and **publishable** key only.
5. Build sign-up, sign-in, sign-out, create-team, invite, accept-invite, team switcher, and calendar CRUD flows. Keep existing fictional demo data until this is fully implemented.
6. Test with at least two users in different teams and one user in both teams. Assert that cross-team reads and writes are denied. Also test expired, reused, and wrong-email invitations.
7. Add audit logging, rate limits, backup/restore verification, and a privacy/security review before storing any real care or health data.

**Security:** Never commit Supabase service-role keys or secrets. Invitation tokens are returned only once and stored hashed. Do not expose invitation tokens in logs or public issues. This initial foundation is **not a HIPAA compliance claim**; healthcare deployments require separate legal, operational, contractual, and technical assessment.
