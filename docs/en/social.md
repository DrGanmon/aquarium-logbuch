# Social area

[Manual](README.md) · [Deutsch](../de/social.md)

## Public feed

Everyone can browse posts at `#/social`, including visitors without accounts. Each post contains one photo and a caption of up to 2200 characters. The feed shows newest posts first and loads pages of 20. Individual posts have public links at `#/social/:id`.

Posts and comments display usernames and current avatars. The composer explains public visibility before publishing. Private aquarium photos are not automatically exposed; Social uses separate uploads.

## Publishing and interaction

Signed-in users can upload photos, like posts and write comments of up to 1000 characters. Each user can like a post once and undo that like. Comments load in pages of 20. Authors can delete their own posts and comments; administrators can delete any. Deleting a post removes its photo, likes and comments. Account deletion also removes the user's Social posts, comments, likes and photos.

Share uses the device's native sharing dialog, falls back to copying the public link or displays it for manual copying. Recipients can open the link without signing in.

## Photos

JPG, PNG, WebP and GIF uploads up to 5 MB are supported. The server validates and decodes images, limits input to 40 megapixels and resizes proportionally to fit within 1600 × 1600 pixels without enlarging or cropping. The longest edge therefore remains at most 1600 pixels. Images are stored as WebP at quality 82, without original metadata; GIFs become still images. Processing uses [sharp](https://sharp.pixelplumbing.com/api-resize/).

Photos are stored as `social_*.webp` in the existing uploads directory. Public endpoints serve only images of existing posts and avatars of users with Social activity. Public responses exclude email addresses, API keys and internal filenames.

## Database and backups

Migration **003_social** automatically upgrades SQLite and MongoDB to schema version 3, creating indexed `social_posts`, `social_comments` and `social_likes`. Existing data remains intact, with the existing pre-migration backup mechanism.

Social data is exported and restored; images are included when file backups are enabled (`includeFiles=true`). Older backups without Social data produce an empty feed. This extension does not fix the previously identified loss of other account settings during the existing restore process.

The `/api/social` API provides public GET endpoints for posts, photos, avatars and comments. Writes require a session and CSRF header. New posts, comments and likes have additional rate limits. Run `npm test -- test/social.test.js` to check image limits, public access, permissions, likes, comments, account deletion and backup/restore for both databases.
