# Social area

[Manual](README.md) · [Deutsch](../de/social.md)

## Public and server-only feed

Visitors without accounts can browse public posts at `#/social`. Signed-in users also see posts shared with all members of this server instance. Each post contains one photo and a caption of up to 2200 characters. The feed shows newest posts first and loads pages of 20. Individual posts have links at `#/social/:id`.

Posts and comments display usernames and current avatars. New posts default to server-only visibility. Users must explicitly select “Show in the public feed” for public access; the composer explains the selected visibility. Private aquarium photos are not automatically exposed; Social uses separate uploads.

## Publishing and interaction

Signed-in users can upload photos, like posts and write comments of up to 1000 characters. Each user can like a post once and undo that like. Comments load in pages of 20. Authors can delete their own posts and comments; administrators can delete any. Deleting a post removes its photo, likes and comments. Account deletion also removes the user's Social posts, comments, likes and photos.

Share uses the device's native sharing dialog, falls back to copying the post link or displays it for manual copying. Server-only posts require sign-in even through direct image, comment and share links.

## Photos

JPG, PNG, WebP and GIF uploads up to 5 MB are supported. The server validates and decodes images, limits input to 40 megapixels and resizes proportionally to fit within 1600 × 1600 pixels without enlarging or cropping. The longest edge therefore remains at most 1600 pixels. Images are stored as WebP at quality 82, without original metadata; GIFs become still images. Processing uses [sharp](https://sharp.pixelplumbing.com/api-resize/).

Photos are stored as `social_*.webp` in the existing uploads directory. Public endpoints serve only images of existing posts and avatars of users with activity on public posts. Signed-in users can also view internal posts and their authors. Public responses exclude email addresses, API keys and internal filenames.

## Database and backups

Migration **003_social** automatically upgrades SQLite and MongoDB to schema version 3, creating indexed `social_posts`, `social_comments` and `social_likes`. Existing data remains intact, with the existing pre-migration backup mechanism.

Social data is exported and restored; images are included when file backups are enabled (`includeFiles=true`). Older backups without Social data produce an empty feed. This extension does not fix the previously identified loss of other account settings during the existing restore process.

The `/api/social` API provides visibility-filtered GET endpoints for posts, photos, avatars and comments. Writes require a session and CSRF header. New posts, comments and likes have additional rate limits. Run `npm test -- test/social.test.js` to check image limits, public access, permissions, likes, comments, account deletion and backup/restore for both databases.

## Terms, content licence and privacy

Public pages `#/terms` and `#/privacy` provide German and English information. Registration requires `acceptTerms=true` and the current `termsVersion` returned by `/api/registration` or `/api/terms`. Version and timestamp are stored with the account. New OIDC accounts require the same acceptance; the CSRF-protected `POST /api/oidc/login` binds it to the signed login state. Existing accounts may continue signing in. Terms are accepted once at registration. Publishing and uploading do not require renewed acceptance, including for existing accounts.

The royalty-free, non-exclusive licence covers app storage, image processing, backups and display according to the chosen visibility. Copyright stays with the user. Advertising outside the app, content sales and AI training are excluded.

Migration **004_social_privacy_terms** upgrades both databases to version 4 and adds `is_public`, `terms_version` and `terms_accepted_at`. Previously published posts remain public; existing accounts are not falsely marked as having accepted. Backups preserve visibility and acceptance evidence. Increase `TERMS_VERSION` in `src/services/terms-service.ts` when materially changing the terms in `public/locales`.

Account deletion removes profile, aquarium, gallery, stock and Social images. Local `.json.gz` backups in `DATA_DIR/backups` are stripped of these image bytes and associated Social content before deletion completes. Image deletion failures abort account deletion; deletion during backup or restore must be retried. Other account data in backups follows the operator’s deletion policy. External and downloaded backups require separate cleanup by the operator. Raw database snapshots contain no embedded image files.

The operator must adapt the imprint, actual service providers, international transfers and retention policies to this instance. Wording follows [Section 31 UrhG](https://www.gesetze-im-internet.de/urhg/__31.html), [Section 305 BGB](https://www.gesetze-im-internet.de/bgb/__305.html) and [Article 13 GDPR](https://www.datenschutz.sachsen.de/informationspflichten.html).
