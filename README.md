# Partiful NYC Calendar

A small serverless calendar feed that collects public events from Partiful's NYC Explore page and exposes them as an iCalendar (`.ics`) feed.

## Deploy

The easiest option is Vercel:

1. Import this GitHub repository into Vercel.
2. Deploy with the default settings.
3. Your calendar feed will be available at:

`https://YOUR-VERCEL-DOMAIN/api/partiful-nyc.ics`

## Add to Google Calendar

In Google Calendar, go to **Other calendars → From URL**, paste the `.ics` URL, and add the calendar.

Google Calendar periodically refreshes subscribed calendars; it does not necessarily update immediately after every change.

## Important limitation

Partiful's NYC Explore page is a public/curated discovery feed, not an official API containing every Partiful event in New York. This project therefore captures public events that Partiful exposes through Explore; it cannot guarantee literally every Partiful event.

The feed refreshes its data roughly every 6 hours and includes future NYC-area events it can parse from public event pages.
