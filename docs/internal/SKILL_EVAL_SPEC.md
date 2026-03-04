# Skill Evaluation Scaffold Spec

Date: 2026-03-04
Status: scaffold implemented

## Purpose
Define baseline evaluation contracts for Tandem skills before broad auto-generation rollout.

## Endpoints

### POST `/skills/evals/benchmark`
Runs benchmark cases against router behavior.

Request:
```json
{
  "threshold": 0.35,
  "cases": [
    { "prompt": "Check my email every morning", "expected_skill": "email-digest" },
    { "prompt": "Monitor competitor prices", "expected_skill": "competitor-price-tracker" }
  ]
}
```

Response:
```json
{
  "status": "scaffold",
  "total": 2,
  "passed": 2,
  "failed": 0,
  "accuracy": 1.0,
  "threshold": 0.35,
  "cases": []
}
```

### POST `/skills/evals/triggers`
Checks whether prompts recall a target skill.

Request:
```json
{
  "skill_name": "email-digest",
  "threshold": 0.35,
  "prompts": [
    "check my email every morning",
    "send me a daily inbox summary"
  ]
}
```

Response:
```json
{
  "status": "scaffold",
  "skill_name": "email-digest",
  "threshold": 0.35,
  "total": 2,
  "true_positive": 2,
  "false_negative": 0,
  "recall": 1.0,
  "cases": []
}
```

## Notes
- This is a non-blocking scaffold.
- Future phases will add persisted eval suites (`skill.eval.yaml`), with/without-skill A/B evaluation, and CI thresholds.
- UI should use these responses for `Validated` / `Not validated` indicators.
