# Collection-agent test/package information

Collection cards display up to three booked test/package names, including quantities, with a “more” indicator. View collection displays all supplied names and laboratory-provided instructions. Sample type is intentionally omitted at the user's request.

## Current backend limitation

The local backend's `AssignmentOrderSummary` currently returns `order.tests: string[]` only. It does not expose tube requirements, fasting instructions or package contents. The production `/openapi.json` returned 404 during verification, so the deployed schema was not independently confirmed. No backend changes were made in this task.

Names work with existing responses. Optional detailed UI is ready, but requires the backend to supply the additive data described below. Missing instructions are explicitly marked “Not provided — confirm with laboratory.” Missing fasting flags must never be interpreted as “not required.” Do not guess tube requirements or join booked items to the public catalog by name; names can collide across laboratories.

## Proposed additive data for the backend team

Keep the existing assignment routes, permissions, fields and names list. Populate optional `order.test_details` and `order.package_details` using actual booked item IDs and the assigned laboratory's verified information:

```json
{
  "tests": ["Booked test name"],
  "test_details": [{
    "id": 123,
    "name": "Booked test name",
    "quantity": 1,
    "tube_requirements": null,
    "fasting_required": null,
    "fasting_instructions": null,
    "collection_instructions": null
  }],
  "package_details": [{
    "id": 456,
    "name": "Booked package name",
    "quantity": 1,
    "fasting_required": null,
    "fasting_instructions": null,
    "collection_instructions": null,
    "tests": [{
      "id": 123,
      "name": "Actual included test name",
      "tube_requirements": null,
      "fasting_required": null,
      "fasting_instructions": null,
      "collection_instructions": null
    }]
  }]
}
```

This is a proposed extension, not an existing verified production contract. Nullable fields mean unknown, not false. Do not introduce clinical defaults. Preserve server-side collection-agent ownership, active/approval and screen access checks. Include packages as well as direct tests; do not expose unrelated customer bookings. No new mobile endpoint, public-catalog lookup or persistent patient-data cache was added.

After backend implementation/deployment, test an authorized assignment with direct tests and a package, including incomplete metadata and an inaccessible/reassigned record. Rebuild/install the partner APK. Automated mobile tests use mocked data, never live booking mutations.
