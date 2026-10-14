# Accounts, login and invitations

[Manual](README.md) · [Deutsch](../de/accounts.md) · [Project overview](../../README.en.md)

Logged-in users can open their **User Profile** (`#/profile`) from the header navigation:
- **Profile Picture (Avatar):** Upload (JPG, PNG, WebP, GIF up to 5 MB) or remove profile avatar.
- **Personal Details:** Manage first name, last name, username, "About me" bio, and email address.
- **Default Chart Timeframe:** Select a preferred timeframe (e.g., 3 months, 6 months, 1 year) for history graphs.
- **Language Preference:** Choose between German and English (`de` / `en`).
- **🤖 AI Assistant & LLM Settings:**
  - Choose preferred AI provider (**OpenAI / ChatGPT**, **Google Gemini**, **Anthropic Claude**).
  - Securely store, mask, and test personal API keys.
  - Dynamic model selection queried live from provider APIs upon key entry with custom free-text model input.
  - 1-click live connection testing and instant key removal.
- **Password Management:** Update local account password.
- **OIDC Account Linking:** Link or unlink the local account with Pocket ID / OpenID Connect.
- **Invite Friends (when invitation mode is active):** Generate registration codes and send email invitations, view status, and share invite links.
- **Account Deletion (2-Step Confirmation):**
  - **Step 1 (In-App):** Confirm deletion in profile settings (with password re-entry for local accounts) to initiate deletion request.
  - **Step 2 (Via Email):** A secure email with a time-limited confirmation link is dispatched. Deletion is executed only upon clicking this link.
  - **Cascading Data Cleanup:** Final deletion permanently removes user account, all owned aquariums, images, inhabitants, water measurements, logbook entries, and active sessions. Administrator accounts are protected against accidental deletion.

## Registration and appearance

Administrators choose open registration, admin-only invitations, invitations by all users, or closed registration. `ALLOW_REGISTRATION=false` blocks new accounts, including first-time OIDC logins. Invitation codes have expiry and usage limits; email invitations expire as well. Configure SMTP for verification, password resets and email invitations.

Language and appearance can be changed in the header and profile. German and English, light and dark themes, and the system theme are supported; charts follow the active theme.

New accounts require explicit acceptance of the terms, including first-time OIDC sign-in. The checkbox is unchecked by default; public terms and privacy links are in the footer. Terms are accepted once at registration; uploads and Social posts do not require renewed acceptance. Account deletion also removes Social content and associated images from managed local JSON backups; operators must separately manage external backups. [Details](social.md).
