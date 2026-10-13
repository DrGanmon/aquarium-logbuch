# Administration, email and backups

[Manual](README.md) · [Deutsch](../de/administration.md) · [Project overview](../../README.en.md)

The admin view is organized into five tabs: **User management**, **Invitations & registration** (registration modes, validity periods, invitation codes and email invitations), **Settings** (legal settings and email/SMTP, including test email and queue), **Backups**, and **Logs**.

Administrators are identified by their email address matching `ADMIN_EMAIL` in `../../config.js` or environment variables (comma-separated for multiple admins).

- Users matching `ADMIN_EMAIL` receive administrative privileges.
- An **Admin** button appears in the navigation bar (`#/admin`).
- Administrators can view all users, create new accounts, edit credentials, and delete users along with their data.
- **Registration Modes & Invitation Management:**
  - Switch between 4 modes: **Open**, **Invitation (Admin)**, **Invitation (Open)**, and **Closed**.
  - Configure maximum validity for user invite codes (default: 7 days).
  - Create admin invite codes with custom usage limits (unlimited or single-use) and direct email invitations.
  - Manage and revoke active or expired invitations.
- **Email & SMTP Configuration:**
  - Configure outbound SMTP server settings for verification, password resets, and notifications.
  - Monitor mail queue status and trigger live test emails.
- **Legal & Contact Emails:**
  - Set custom contact addresses for support (`CONTACT_EMAIL`) and legal imprint (`IMPRINT_EMAIL`).
- **Backup & Restore:**
  - **Manual Backups:** Complete backup of database and all uploaded photos as a compressed archive (`.json.gz`).
  - **Restore:** Upload backup files via Web UI or restore from existing server archives.
  - **Backward Compatibility:** Older backups are automatically migrated and normalized to current database schemas.
  - **Automated Local Backups:** Configurable automated backups (enable/disable, intervals e.g. 6h/12h/24h, retention count, and automatic pruning of old archives).
  - **Access Security:** Backup and restore features are strictly restricted to administrators.
- **System Logbook:** Live viewing and clearing of server logs (`../../data/aquarium.log`).

## Email templates and delivery

Default templates live in `../../src/templates/mail` and are copied into the backend build. Custom overrides belong in `data/mail-templates/`. German and English use separate `.tpl` files. Placeholders such as `{{username}}`, `{{verifyUrl}}` and `{{resetUrl}}` are replaced during delivery.

A FIFO queue spaces outgoing messages using `SMTP_RATE_LIMIT_MS`. Configure SMTP through environment variables or the admin panel, which also provides test delivery and queue status.

Backups contain sensitive account and configuration data as well as uploads; store them securely. Create a current backup before restoring. Restore replaces the data set; older backups are adapted to the current schema. Automated backups remain local and do not replace an external backup.
