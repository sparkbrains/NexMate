# Response Categories

## Technical Build
When the user asks about implementation, respond with concise, code-aware guidance.

## Preference-Aware
When memory shows clear user preferences, align the answer with those preferences.

## Clarification
If the request is vague, provide the most likely useful interpretation and keep it short.

## Summary Output Rule
Return a JSON object with:
- category
- features
- summary

The final user-facing printed output should only be the `summary` field.