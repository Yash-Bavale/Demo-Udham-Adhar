# Udyam Aadhar 

We are rebuilding our existing production website (udyamadhar.in) from WordPress to a fully custom platform.

IMPORTANT:

The objective is NOT redesign.

The objective is a pixel-perfect recreation of the current website including:

- identical layout structure

- identical UI/UX

- identical content hierarchy

- identical navigation

- identical footer

- identical service pages

- identical mobile responsiveness

- identical lead generation flow

- identical SEO page structure

- identical forms

- identical trust sections

- identical FAQs

- identical CTAs

- identical visual spacing

- identical typography hierarchy

- identical color scheme

- identical user journey

Treat the current website as the source of truth.

Do not simplify anything.

Do not modernize anything.

Do not redesign anything.

First recreate the website exactly.

After the exact recreation is completed, extend the platform with the following custom modules.

━━━━━━━━━━━━━━━━━━━

PHASE 1 — WEBSITE REBUILD

━━━━━━━━━━━━━━━━━━━

Recreate every page and route.

Include:

- Header

- Mega navigation

- Footer

- Hidden pages

- Service landing pages

- Download pages

- FAQ pages

- Legal pages

- Contact pages

- Blog/content pages

- All forms

Maintain:

- SEO URLs

- Meta structures

- Internal linking

- Content hierarchy

━━━━━━━━━━━━━━━━━━━

PHASE 2 — LEAD MANAGEMENT SYSTEM

━━━━━━━━━━━━━━━━━━━

Current flow:

User enters:

- Name

- Email

- Mobile

- State

- Language

- Service

System:

- Creates Lead

- Generates Lead ID

- Stores lead in CRM

- Redirects to payment

━━━━━━━━━━━━━━━━━━━

PHASE 3 — PAYMENT ENGINE

━━━━━━━━━━━━━━━━━━━

Integrate Razorpay.

Flow:

Lead Created

→ Payment Initiated

→ Payment Success

→ Update CRM Record

→ Generate Invoice

→ Trigger Welcome Email

→ Trigger Service Onboarding

No duplicate records.

Single Lead Record must be updated throughout lifecycle.

━━━━━━━━━━━━━━━━━━━

PHASE 4 — SERVICE ONBOARDING ENGINE

━━━━━━━━━━━━━━━━━━━

After payment:

Customer receives:

- Welcome Email

- Tax Invoice

- Personalized Form Link

Each service should have:

- Dynamic onboarding form

- Dynamic required fields

- Dynamic document requirements

Customer submissions should update existing CRM record.

━━━━━━━━━━━━━━━━━━━

PHASE 5 — CUSTOMER PORTAL

━━━━━━━━━━━━━━━━━━━

Customer can:

- Track application status

- Upload documents

- Complete pending details

- Download invoices

- View payment history

- Raise support tickets

- View service timeline

━━━━━━━━━━━━━━━━━━━

PHASE 6 — ADMIN CRM

━━━━━━━━━━━━━━━━━━━

Modules:

Dashboard

Lead Management

Payments

Invoices

Documents

Applications

Service Processing

Support Tickets

Customers

Email Logs

Activity Logs

Reports

Roles:

Super Admin

Operations

Support

Accounts

Manager

━━━━━━━━━━━━━━━━━━━

PHASE 7 — APPLICATION WORKFLOW

━━━━━━━━━━━━━━━━━━━

Statuses:

Lead Created

Payment Pending

Payment Successful

Details Pending

Documents Pending

Under Review

Under Process

Completed

Closed

━━━━━━━━━━━━━━━━━━━

PHASE 8 — TECHNICAL REQUIREMENTS

━━━━━━━━━━━━━━━━━━━

Frontend:

Next.js

Backend:

Node.js

Database:

PostgreSQL

Authentication:

JWT + RBAC

Storage:

AWS S3 Compatible

Email:

SMTP

Payments:

Razorpay

Architecture:

Production Ready

Scalable

Modular

━━━━━━━━━━━━━━━━━━━

OUTPUT REQUIRED

━━━━━━━━━━━━━━━━━━━

Generate:

1. Complete sitemap

2. All page structures

3. Database schema

4. CRM architecture

5. Customer portal architecture

6. Admin panel architecture

7. Workflow diagrams

8. API structure

9. Folder structure

10. UI component system

The first priority is exact recreation of the existing website.

Only after recreation is complete should custom CRM functionality be added.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://udyamadhar.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b9dc2e49-0e43-4d3d-84b6-7e29ce7bb6d7).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
