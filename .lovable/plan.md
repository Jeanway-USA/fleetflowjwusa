## Problem

The floating Beta Feedback button (bottom-right) overlaps the "Save & Continue" button on the Driver Onboarding screen, blocking the driver from advancing.

## Fix

In `src/components/shared/BetaFeedbackWidget.tsx`, return `null` when the current route is an onboarding route so the floating button is not rendered while drivers (or new owners) are completing onboarding.

- Use `useLocation()` from `react-router-dom`.
- Hide when `pathname` starts with `/driver/onboarding` or equals `/onboarding`.

This is a presentation-only change — no business logic, no schema, no other components touched. The widget continues to work normally everywhere else.

## Out of scope

- Repositioning the widget
- Adding a settings toggle
- Any changes to the onboarding flow layout itself