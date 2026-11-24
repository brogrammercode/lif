# Mobile Form Action Visibility

## Rule

Create and edit forms keep their primary save, submit, send, or continue action
out of the layout until the user has entered data or changed a value. For edit
forms, compare the current values with the loaded record so an unchanged form
does not show Save. A selected file, map point, dropdown value, checkbox, or
typed value counts as input. Keep validation and request retry behavior after
the action appears.

This rule applies to form submission actions. Navigation, ride phase controls,
explicit confirmations, and actions that already require a selected entity
remain visible according to their own state and preconditions.

## Implemented screens

| Area | Screen or component | Visibility condition |
| --- | --- | --- |
| Profile | Edit Profile and Change Phone Number | Save appears when name or phone differs from the loaded account. Field-level Save appears only after its value changes. |
| Emergency | Add or edit emergency contact sheet | Add appears after any contact field has input; Save appears only when a field differs from the existing contact. |
| Partner Program | Policy, dynamic application steps, final confirmation | Continue appears after policy acceptance or a current-step edit. Final confirmation appears after acceptance and signature input. |
| Partner Program | Driver exit request | Request or resubmit appears after a reason is entered. The follow-up confirmation is shown only after submitting that form. |
| Partner Program | Driver activation | Activate appears after code input and remains enabled only for a complete six-digit code. |
| Driver vehicles | Vehicle registration and verification | Submit or Save appears when vehicle fields, verification values, or uploaded documents differ from their initial state. |
| Driver vehicles | Brand/model catalog suggestion | Submit appears after text input or a selected logo; edit mode compares values with the existing suggestion. |
| Driver account | Payout destination change | Submit appears after at least one payout field is entered; a failed request retains the same retry action. |
| Wallet | Add money | Continue appears after the amount is greater than zero. |
| Saved places | Map picker and save form | Continue appears after a map point is selected. Save appears after a new place has input or an existing place changes. |
| Saved places | Review editor | Save review appears after the rating or comment changes. |
| Support | New support/complaint request | Send appears after subject or details input. |
| Support | Support ticket and complaint chat | Send appears only when the message field is nonempty. |
| Driver ride | Trip support request | Send or retry appears after subject/details input or after a request was attempted. |
| Driver ride | Trip chat | Send appears only while a message has been entered. |
| Driver ride | Reason dialogs (unpaid fare, cancellation, dispute) | Submit appears once the reason contains at least five characters. |
| Rider ride | Rating dialog | Submit appears after a rating or comment is entered; submission still requires a rating. |
| Rider booking | Home location phase | Swipe-to-continue appears only after both pickup and drop-off locations are selected. |

## Actions intentionally kept visible

- Vehicle selection and ride booking progression are controlled by selected
  vehicle, quote, and route state rather than a free-form edit form.
- The vehicle-selection Continue action stays in its fixed footer, but is
  disabled until quotes and payment methods are loaded and available.
- Ride phase actions such as accept, arrive, start, complete, collect payment,
  and cancel are state transitions, not Save/Continue form actions.
- File replacement confirmation appears only after a replacement file is
  selected. Profile-photo and saved-place-photo confirmation likewise follows
  a completed local image selection.
- Explicit destructive-action confirmation remains available after the user
  invokes the action; it does not submit an unedited profile or form.

## Verification

- [x] Add the visibility guards and rebuild updates for all screens listed
      above.
- [x] Preserve validation and retry keys when an attempted request fails.
- [x] Keep map surfaces clear of the attribution overlay label across rider,
      driver, and saved-place maps.
- [x] Run Flutter analyzer for the mobile app after implementation.
- [ ] Verify representative create/edit and retry flows on device.
