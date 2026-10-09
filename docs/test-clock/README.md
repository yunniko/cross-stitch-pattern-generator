# Test-clock records

One file per release, `v<version>.json`, written when the test-clock scenarios (G-106 M4, G-126 M3) have run in
Stripe's test mode against that release. `npm run launch:check` reads the one for the version production reports and
passes only when its `commit` is the commit production runs and every scenario passed (D385).

```json
{
  "version": "0.30.0",
  "commit": "abc1234",
  "ranAt": "2026-11-01T18:00:00Z",
  "scenarios": [{ "name": "renewal fails, then paid", "passed": true }]
}
```

None exists yet: the scenarios wait on the Owner's Stripe test keys.