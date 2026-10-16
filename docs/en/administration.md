# Administration, email and backups

[Manual](README.md) · [Deutsch](../de/administration.md) · [Project overview](../../README.en.md)

The admin view has six tabs: **User management**, **Metrics**, **Invitations & registration**, **Settings**, **Backups**, and **Logs**. An illustrated introduction is available in the public German user guide at `/handbuch/#admin` on your app server.

On an empty installation, the initial setup wizard creates the first administrator and collects SMTP, automated-backup and registration settings. Administrative privileges are stored as a database role; multiple administrators are supported. The user-management interface can grant the corresponding role. Existing verified accounts from the former `ADMIN_EMAIL` configuration are considered during migration; matching an email address is not a substitute for persistent role management. Verification emails, password resets and email reminders require configured outbound mail.

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
- **System Logbook:** Initially shows the newest 200 lines at the bottom. Each page contains between 10 and 1000 configurable lines. Older entries load when scrolling up or using the button, preserving the reading position. Level and search filters apply on the server across the full history. Automatic refresh runs only at the bottom. Clearing server logs (`../../data/aquarium.log`).

## Email templates and delivery

Default templates live in `../../src/templates/mail` and are copied into the backend build. Custom overrides belong in `data/mail-templates/`. German and English use separate `.tpl` files. Placeholders such as `{{username}}`, `{{verifyUrl}}` and `{{resetUrl}}` are replaced during delivery.

A FIFO queue spaces outgoing messages using `SMTP_RATE_LIMIT_MS`. Configure SMTP through environment variables or the admin panel, which also provides test delivery and queue status.

Backups contain sensitive account and configuration data as well as uploads; store them securely. Create a current backup before restoring. Restore replaces the data set; older backups are adapted to the current schema. Automated backups remain local and do not replace an external backup.

Account deletion removes image bytes and associated Social content from managed local `.json.gz` backups. Deletion during backup/restore asks the user to retry afterward. Other backup data, external and downloaded backups require an operator-defined retention and deletion policy. [Details](social.md).
