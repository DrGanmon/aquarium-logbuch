# Aquariums, care and sharing

[Manual](README.md) · [Deutsch](../de/aquariums.md) · [Project overview](../../README.en.md)

## Create and organize a tank

The overview separates owned tanks from accepted shared tanks. An aquarium stores its name, motto, description, water type, volume, notes and equipment information. Upload photos up to 5 MB (PNG, JPG, WebP, GIF), add captions and choose a cover image; the gallery offers a full-size view.

Residents can be recorded individually or as groups with a count. Custom names and portrait photos are supported. Catalog species provide care requirements; custom residents can be added without a catalog match.

## Care cycles and logbook

Measurements and fertilization have independent intervals in days or weeks, optionally tied to a weekday. The overview and tank details display due and overdue activities. With reminders enabled and SMTP configured, reminder emails include a direct action link.

Record water changes, filter cleaning and media changes, pruning, new plants, glass and substrate cleaning, fertilizer doses and special feeding. The timeline combines care activities with measurements and supports category filters. Additional entries load in batches of 25.

## Dosing pumps and channels

Each pump or channel stores a name, liquid, dose in ml, day interval and optional time. Plans can be active or paused. Confirming a dose manually creates a logbook entry at the current time. The app does not control hardware. Deleting a pump preserves its existing logbook entries.

## Sharing a tank

Share invitations target registered users. Recipients accept through the email link or the shared-tanks tab before gaining access.

| Permission | Capabilities |
|---|---|
| Read (`view`) | View measurements, charts, residents, logbook, photos and alarms |
| Write (`write`) | Also edit measurements and care activities, manage residents and photos, and acknowledge alarms |

Owners manage sharing. The server checks permissions for individually loaded sections as well.

## Loading tank details

Aquarium information, care cycles, latest measurements and warnings load immediately. Gallery, history, residents, dosing pumps and timeline load when their section approaches the viewport. Charts and the measurements table share one request. Loaded sections remain available and refresh after changes.

Failed sections can be retried. Superseded requests and requests for a page being left are cancelled. The timeline continues to load 25 entries at a time. Known residents offer a **Species details** button that opens the catalog details, image and credits in a modal, including for read-only users. Custom species without a catalog match show an explanatory note.

The API provides `GET /api/aquariums/:id?summary=true` for the compact overview and `GET /api/aquariums/:id/stock` for residents. The full detail response remains available without the summary parameter, with existing access rules unchanged. Browsers without `IntersectionObserver` load all sections automatically.
