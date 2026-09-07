# Optional one-shot feedback review experiment

This experiment is outside the membership MVP and is not a required provider/model/cadence setup step. The supported workflow is Admin Copy prompt, human inspection/editing and deliberate submission through ChatGPT (Codex) or Claude.app (Code mode) on macOS, followed by separate approval of the native proposal. Deploying the site does not invoke this client.

If separately authorized and configured, this client claims at most one eligible saved comment, requests at most one model response for plain text, and submits an ordinary unapproved proposal or a human-review note. It does not approve, apply, publish, send email, change a schedule or operate a browser. The site independently enforces the restricted grant and native proposal boundaries. Running the image or CLI without configuration exits unconfigured; no model, provider, credential, cadence or scheduler is supplied.

The model receives only a bounded comment and the current eligible plain-text field. Comment strings may themselves contain information a visitor typed; public target eligibility is not a claim that every submitted sentence is free of personal information. The model receives no site grant, model key, administrator session, selectors, photos, private lesson body or executable tools. Feedback and current text are untrusted data. Rich text, private/ambiguous targets and unsupported requests use the human authoring path. A syntactically valid proposal still needs a human to judge truth and meaning and approve its exact native preview.

## Explicit configuration

Before any real run, the operator must choose the provider, exact endpoint, model, spending allowance and data-handling terms and deliberately obtain a scoped site grant. That deployment decision is separate from this source release. No live grant or provider call is created by preparation/tests.

Use one owner-only JSON configuration file outside all Git repositories and the installed code directory. All fields below are required except `allowLocalTestHttp`. Values are illustrative placeholders, not operational defaults:

```json
{
    "site": "https://YOUR-SITE.example",
    "modelUrl": "https://YOUR-PROVIDER.example/v1/chat/completions",
    "model": "EXPLICITLY-CHOSEN-MODEL",
    "maxCompletionTokens": 1024,
    "requestTimeoutMs": 30000,
    "grantFile": "/private/reviewer-inputs/site-grant",
    "apiKeyFile": "/private/reviewer-inputs/model-key",
    "journalDirectory": "/private/reviewer-state"
}
```

Replace the example origins with their canonical lowercase form. `site` accepts an HTTPS origin with no credentials, path, query or fragment. `modelUrl` must be the exact canonical HTTPS endpoint, with an explicit path and no credentials, query or fragment. Neither transport follows redirects. Only explicitly setting `allowLocalTestHttp: true` permits HTTP, and then only canonical `localhost`, `127.0.0.1` or `[::1]`. It does not permit a private-network hostname or a noncanonical numeric alias.

`maxCompletionTokens` is an integer from 1 through 4096. `requestTimeoutMs` is 1000 through 45000 for each HTTP request. These are bounds, not a promise of zero cost or a full-run deadline. Input and response bodies are also bounded. Duplicate JSON keys, unknown/nested configuration fields and missing provider/model/limits are refused. This client accepts no secrets from command arguments or environment variables.

Pre-create the configuration, grant and model-key files as distinct regular files owned by the process user with mode0600, and the journal directory with mode0700. Inputs must be outside the journal directory. Paths must be absolute; symlink files, hardlinked files, repository paths, oversized files and changed files are refused. Each token file contains only its credential, optionally followed by one final newline. Never paste credentials into configuration JSON, a shell command, a model prompt, logs, screenshots or tracked evidence. If acquiring a key from 1Password, the project's mandatory `op-reason` workflow still applies.

One explicit invocation is:

```bash
node services/feedback-reviewer/cli.mjs run-once --config /private/reviewer-inputs/config.json
```

The output contains only `idle`, `confirmed`, `recovered`, `unconfigured`, or a sanitized stop code and, on confirmation, the outcome category. It does not print the comment, proposal, credentials or provider error body. Exit0 means no eligible work or a confirmed server receipt; exit1 means preserve the journal and inspect the stop; exit2 means no configured invocation. `recovered` means a previously accepted server intent was reconciled, with no new model call. A retained proposal is still awaiting the separate administrator approval flow.

## Provider transport limitations

The provider must support the Chat Completions JSON envelope used by `transport.mjs`: `response_format: {type:"json_object"}`, `n:1`, `max_completion_tokens`, `store:false` and a non-streaming assistant choice with `finish_reason:"stop"`. No tool definitions are sent, and tool/function calls, refusals, incomplete output, extra choices and invalid result shapes are rejected. A provider that implements only another API or rejects these fields needs an explicitly reviewed adapter; changing the endpoint alone cannot guarantee compatibility.

For OpenAI, `max_completion_tokens` includes visible output and reasoning tokens; JSON mode is not schema validation, so the client and site validate the exact result independently. `n:1` requests one choice. `store:false` disables the documented storage use of that completion; **it is not a zero-retention guarantee**. Provider/model support, pricing and data-retention terms must be checked for the actual selected account before activation. [Official Chat Completions creation reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).

A received invalid/error response becomes a bounded human-review result. There is no automatic inference retry, provider fallback or model selection. The configured completion ceiling does not cap input charges or spending across separately authorized repeated invocations.

## Durable retry and manual recovery

Keep one private journal for this site/grant and one process at a time. The runner binds pending work to a hash of that site and grant. Do not edit or rotate a credential merely to get past a stopped run.

- **`pending.json` with `kind:"prepared"`:** the exact result and lease fields are durable. Retry the same invocation after a transient response/network failure. It resubmits that result without asking the model again. The server's deterministic proposal identity prevents a second proposal. If expiry, revocation, changed input or a different result conflicts, preserve the journal and inspect the site status; retrying is not permission to create a new generation.
- **`pending.json` with `kind:"inference-started"`:** a process may have crashed after a provider request began. A repeat stops with `inference-needs-review`, so it cannot silently spend again. Confirm the old process has stopped, review provider request/account evidence and the site's saved review status, and retain the marker. There is no automatic replay or marker-to-result reconstruction. Use the existing human authoring path for any recovered output; authorize a new inference separately if one is needed.
- **`confirmed-<feedbackId>-<generation>.json`:** one private receipt is retained per confirmed review. The pending file is removed only after the confirmation is durable. A crash during completion may leave both; the same prepared request is safe to reconcile again.
- **`run.lock`:** another process, or a crashed prior process, owns the journal. Check the stored PID and process/container identity and establish that no process is using the journal before removing only a stale lock. PIDs may be reused and container PIDs belong to their namespace. Never delete the journal or a live lock to force progress.
- **Revoked grant or `journal-credential-mismatch`:** retain the old journal unchanged. An authorized new grant can finish an already accepted server intent through `claim` using a separate private journal; it cannot authorize different output or restore erased feedback. Before running a new grant, review the backend's durable intent so a missing acceptance is not mistaken for an accepted result. No CLI force-unlock, grant creation, journal reset or approval option exists.

The journal can contain original comment-derived text and unapproved copy. Keep it owner-only and outside backups or sharing systems that are not authorized for that material. Following the project's retention policy, remove a retired journal only after confirming no pending intent/process needs it and retaining any required audit receipt. Removing a local journal does not erase provider records or the site's retained proposal audit. Do not remove unresolved journals during routine cleanup.

## Container isolation

The supplied Dockerfile has no dependencies to install, runs as the image's non-root `node` user and copies only the seven runtime modules. It contains no credentials, configuration, scheduler or active grant. Root owns image creation/deployment; this source addition does not start a container.

If the operator chooses a container, run its filesystem read-only, drop Linux capabilities, enable no-new-privileges and mount only the private input directory read-only plus the private journal directory read-write. Arrange ownership so the non-root process can read0600 inputs and write0700 state. The configuration paths must refer to these container paths. An example invocation shape, after separately preparing an explicitly chosen image and private inputs, is:

```bash
docker run --rm --read-only --cap-drop=ALL --security-opt=no-new-privileges \
  --mount type=bind,src=/private/reviewer-inputs,dst=/inputs,readonly \
  --mount type=bind,src=/private/reviewer-state,dst=/state \
  REVIEWED_IMAGE run-once --config /inputs/config.json
```

Do not mount the Docker socket, SSH/agent sockets, home directory, Git repository, credential vault, browser profile or host tooling. Network access is needed only to the explicitly configured site/provider. The CLI does not install an egress firewall. An HTTP loopback test endpoint refers to the runner's own network namespace; do not weaken the loopback rule to reach a different host. The isolated source tests use local fixtures and dummy credentials.

## Tests

```bash
node --test services/feedback-reviewer/*.test.mjs
```

Tests cover strict configuration and private-file boundaries, no default work, destination redirects, exact bounded model payload/results, response failures, deterministic lost-response retry without another inference, durable journal/lock behavior and the HTTP protocol using isolated fixtures. They perform no provider inference, grant issuance, live site mutation or scheduling.

The backend protocol and native authority remain documented in [Restricted feedback review backend](../../apps/web/services/feedback-review/README.md). The experiment is disconnected from the current site interface and worker startup. Any future runner use requires separate explicit authorization; this command runs once.
