# GlowEr Beauty Bot — Bot specification

**Archetype:** booking

**Voice:** warm and professional — write every user-facing message, button label, error, and empty state in this voice.

A Telegram bot for GlowEr beauty studio enabling clients to browse services, view a photo portfolio and reviews, book appointments, and receive post-appointment review prompts. Admins can manage services, portfolio, and reviews while receiving booking alerts.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- beauty clients
- studio admins

## Success criteria

- Clients successfully book appointments with confirmation notifications
- Admins receive real-time alerts for new bookings and reviews
- Clients submit reviews with photos after appointments
- Portfolio images are browsable by service category

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open main menu with Services/Portfolio/Reviews/My Bookings
- **Book Service** (button, actor: user, callback: booking:start) — Initiate service selection and booking flow
- **View Portfolio** (button, actor: user, callback: portfolio:gallery) — Browse curated portfolio images filtered by service
- **Submit Review** (button, actor: user, callback: reviews:submit) — Access review submission form with rating and photo upload
- **/admin** (command, actor: admin, command: /admin) — Open admin dashboard for service/portfolio management

## Flows

### booking_flow
_Trigger:_ button:booking:start

1. Select service category
2. Choose specific service
3. Pick available time slot
4. Confirm client details (name/phone)
5. Receive confirmation with booking ID

_Data touched:_ Booking, Service

### post_appointment_flow
_Trigger:_ appointment:completed

1. Send 1-hour follow-up prompt
2. Collect 1-5 star rating
3. Capture text review and photos
4. Display admin reply section

_Data touched:_ Review

### admin_management
_Trigger:_ command:/admin

1. Verify admin credentials
2. Edit service catalog (CRUD)
3. Upload portfolio images
4. Moderate reviews with reply functionality

_Data touched:_ Service, PortfolioItem, Review

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **Service** _(retention: persistent)_ — Beauty treatment offering with scheduling metadata
  - fields: name, category, duration, price, description, slots
- **Booking** _(retention: persistent)_ — Client appointment record
  - fields: client_name, user_id, service_id, datetime, status, notes
- **PortfolioItem** _(retention: persistent)_ — Visual content linked to services
  - fields: image_url, caption, tags, service_links
- **Review** _(retention: persistent)_ — Client feedback with optional admin response
  - fields: rating, text, photos, timestamp, admin_reply
- **AdminUser** _(retention: persistent)_ — Studio staff with management permissions
  - fields: telegram_id, permissions

## Integrations

- **Telegram** (required) — Bot API messaging
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Configure admin notification chat ID
- Set default service categories
- Manage portfolio image retention policy
- Adjust review moderation settings

## Notifications

- Booking confirmation to client
- 1-hour post-appointment review prompt
- Admin booking alerts
- Admin review moderation notifications
- 24-hour review reminder for clients

## Permissions & privacy

- Admins can view all bookings and reviews
- Clients only see their own booking history
- Review photos are stored with metadata
- Personal data retention follows studio policy

## Edge cases

- Handling missing client contact info during booking
- Slot availability conflicts during high demand
- Review submission without photos
- Expired booking reminders
- Admin permissions revocation

## Required tests

- End-to-end booking flow with cancellation scenario
- Post-appointment review submission with media
- Admin dashboard CRUD operations
- Notification delivery reliability
- Portfolio image filtering by service

## Assumptions

- Admin chat ID is pre-configured by owner
- Default service categories cover 80% of use cases
- Single admin chat simplifies initial setup
