# Kappy: Interactive care coordination prototype

Kappy is a working name. The app is intended to make care teams more coordinated without turning care into a rigid hierarchy.

## Main navigation

1. **Calendar:** Readable month grid, tap a date for assigned shifts, submit a coverage/swap/availability request, coordinator can approve a request. Approval currently changes the request status only; it does **not** reassign or modify shifts automatically.
2. **Messages:** Direct messages, group chats, and care-circle-wide focused discussion forums. Demo conversations are local only.
3. **Wellbeing:** Fast mood check-in; bedtime, wake time, estimated sleep, nighttime awakenings; outdoors; optional steps, minutes, and blood pressure; food preferences and trials; demo supplement list and recorded status; simple avatar and trend charts.
4. **People:** Fictional circle members and an explanation of the coordinator role.

## Product principles
- Calendar and messages are front and center, not pay or hours.
- Anyone may request a scheduling change; coordinator confirms final arrangements. Coordinator responsibility can be delegated in a future release.
- Focus forums are accessible to all authorized members of the care circle. Direct/group messages have their own audiences.
- Nutrition records distinguish likes/dislikes, avoidance, and trials. Gluten-free exploration is not a diagnosis.
- Observations are time-stamped and never presented as a medical diagnosis or computed health score.
- Keep quick check-ins fast; optional detail stays collapsed by default.
- Make all health and care information accessible only to authorized members in a production system.

## Next design questions
- Exact shift edit flow after approval, conflict detection, and notification behavior
- Who can view/edit supplements and medical observations
- Approval handoff and multiple coordinators
- Whether notes should attach to dates, shifts, or both
- Accessibility, caregiver usability, and patient consent
- How to display overnight sleep spanning two calendar days
- Whether avatar is optional and how observations affect it

## Security boundary
This is a **local-only demo**, not a real caregiving system. No real personal, health, medication, or contact information should be entered. There is no backend, user authentication, persistent storage, encryption of user records, or HIPAA compliance claim.
