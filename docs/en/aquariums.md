# Aquariums, care and sharing

[Manual](README.md) · [Deutsch](../de/aquariums.md) · [Project overview](../../README.en.md)

## Create and organize a tank

The overview separates owned tanks from accepted shared tanks. An aquarium stores its name, motto, description, water type, volume, notes and equipment information. Upload photos up to 5 MB (PNG, JPG, WebP, GIF), add captions and choose a cover image; the gallery offers a full-size view.

Residents can be recorded individually or as groups with a count. Custom names and portrait photos are supported. Catalog species provide care requirements; custom residents can be added without a catalog match.

## Care cycles and logbook

Measurements and fertilization have independent intervals in days or weeks, optionally tied to a weekday. The overview and tank details display due and overdue activities. With reminders enabled and SMTP configured, reminder emails include a direct action link.

Record water changes, filter cleaning and media changes, pruning, new plants, glass and substrate cleaning, fertilizer doses and special feeding. The timeline combines care activities with measurements and supports category filters. Additional entries load in batches of 25.

## Recurring tasks and calendar

**Tasks & intervals** schedules water changes, filter changes and cleaning, pruning, care & cleaning, special feeding and other work every few days, weeks or months (at most 50 tasks per aquarium). Fertilizing stays in the fertilizer section and water tests in the measuring cycle. The first due date is freely selectable; afterwards the interval counts from the latest logbook entry of the same care type. “Done” creates that entry; a manually added logbook entry has the same effect. Monthly intervals keep the day of month where possible (31 January → 28/29 February). Tasks work offline like fertilizers: changes are queued with an operation ID and shown as a conflict if the base state differs.

The profile tab **Calendar** offers an iCal file for the current and next year. It contains measuring cycles, active manual fertilizers and active tasks of your own aquariums and aquariums shared with write access. Each event starts at the next due date, overdue events appear today; recurrence ends on 31 December of the following year. Events without a time are all-day; times use the device time zone.

For automatic updates the app provides a read-only CalDAV calendar at `<app address>/caldav/`. Sign in with username or e-mail and a separate, automatically generated CalDAV password; the account password and session cookies are rejected. Only a hash for verification and a copy encrypted with the server key for display in the profile are stored. Each account only sees its own calendar; other paths return 404. A new password revokes the old one immediately. Failed sign-ins are rate limited. After restoring a backup CalDAV passwords are generated again because accounts may receive different IDs. Access and download require a connection. Setup on iPhone/iPad, Android (DAVx⁵) and desktop as well as discovery via `/.well-known/caldav` are described in the [API documentation](../api/README.md#kalender-und-caldav). Behind a sub path the reverse proxy must forward `/.well-known/caldav` to the app.

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
