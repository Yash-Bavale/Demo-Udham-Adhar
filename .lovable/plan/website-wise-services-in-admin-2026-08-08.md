# Website-wise Services in Admin

Today the Services page (`/admin/services`) lists every service from every website in one flat table, so udyamadhar.in and udyamregistrations.in services are mixed together with only a small domain badge to tell them apart.

## What changes

- Add a **website switcher** at the top of the Services page: one tab per website (name + domain) plus an "All websites" tab.
- Selecting a website filters the table to only that website's services, and shows a count per tab.
- Services with no website assigned appear under an "Unassigned" tab so they can be found and fixed.
- Within the selected website, services are **grouped by category** (with an "Uncategorised" group), ordered by sort order.
- "+ New Service" pre-fills the currently selected website, so new services land on the right site by default.
- The table keeps everything it already does: inline sort order, active toggle, Configure / Edit Form / Edit / Delete.

## Technical notes

- Frontend-only change in `src/routes/admin.services.index.tsx`.
- Data already available: `listServices` returns `website_id`/`category_id`, and `listWebsiteTree` returns websites and categories — no new server functions or database changes.
- Selected website is kept in component state (defaults to the first active website) and used for both filtering and the new-service form default.
