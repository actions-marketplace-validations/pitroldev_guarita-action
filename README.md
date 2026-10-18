# Guarita Security Scan

Run an authorized security scan of a deployed web app from GitHub Actions. The action waits for the result, links to the Guarita report, and fails the job when critical findings are present or the assessment is blocked, partial or passive.

## Requirements

- A [Guarita](https://www.guarita.dev) Pro or Business account with public API access.
- The target app verified in that account.
- A Guarita API key with scans:read and scans:write, stored as the repository secret GUARITA_API_KEY. The key owner must authorize scanning during key creation.
- A public HTTPS target, such as a staging deployment. The app's source repository is not uploaded.

## Usage

Set the repository variable GUARITA_TARGET_URL to the verified app URL, then add this workflow:

~~~yaml
name: Guarita security scan
on: workflow_dispatch
permissions: {}
jobs:
  scan:
    runs-on: ubuntu-latest
    timeout-minutes: 40
    steps:
      - uses: pitroldev/guarita-action@v1
        id: guarita
        with:
          api-key: ${{ secrets.GUARITA_API_KEY }}
          target-url: ${{ vars.GUARITA_TARGET_URL }}
~~~

Pin to an immutable release commit when your workflow requires an immutable dependency.

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| api-key | Required | Guarita API key with read/write scan scopes |
| target-url | Required | Verified public HTTPS app URL |
| with-ai | false | Explicitly use the account's AI quota for this run |
| fail-on-critical | true | Fail when the conclusive scan reports critical findings |
| timeout-seconds | 2100 | Total execution budget, 60–3600 seconds |

Blocked, incomplete, passive and failed scans fail the job even when fail-on-critical is false. This prevents missing coverage from becoming a successful check. The action inspects both the summary and the full report.

## Outputs

| Output | Meaning |
| --- | --- |
| scan-id | Created scan ID, also available while the scan is running |
| report-url | Guarita dashboard link; requires signing into the owning account |
| critical-count | Count from a completed, conclusive scan |
| risk-score | Risk score from 0 to 100 |

The action uses Node.js 24 and has no npm runtime dependencies. Credentials are sent only in the Authorization header to the official Guarita API, and are masked in GitHub logs. Findings and complete reports are not printed or uploaded as public artifacts. Interrupted or timed-out jobs attempt to cancel their scan; POST creation is never automatically retried.

Results apply to the tested scope at scan time. A successful check is not a certification of the entire app.

[API reference](https://www.guarita.dev/docs/api/reference/scans) · [Support](https://www.guarita.dev/support) · [Privacy](https://www.guarita.dev/legal/privacy) · [Terms](https://www.guarita.dev/legal/terms-of-use)

## Development

~~~sh
npm test
~~~

Tests exercise the public API payload, the polling flow, coverage failures, critical gates, interruption cleanup and secret redaction using local fixtures. They do not run a scan against an external app.

The MIT license applies to this API wrapper. The Guarita SaaS and scanner are separate products governed by their own terms.
