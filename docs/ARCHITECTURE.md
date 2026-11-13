# Architecture notes

## Current state
Zero-dependency static HTML/CSS/JavaScript concept. All content is fictional. Checklist changes and updates exist only in page memory and reset on reload. No backend, user accounts, analytics, or storage.

## Proposed implementation path
- Validate workflows and mobile UX first.
- Choose a typed web stack after ideation (likely TypeScript and a component framework).
- Add identity, invite-only membership, server-enforced role authorization, audit logs, and encrypted transport/storage before any real user data.
- Design per-circle isolation and explicit permissions for sensitive care information.
- Perform privacy/legal review, including whether HIPAA or other health privacy obligations apply to the actual business model and partners.
- Add automated accessibility, unit, integration, and end-to-end tests when migrating to the application stack.

## Guardrails
Do not enter actual client information, health information, addresses, or caregiver personal data into this prototype. This is not a clinical record or emergency response tool. No feature here constitutes a production security guarantee.
