# AI notes

## Tools used

**Claude Code** (Claude Opus 5.5, in the VS Code extension) wrote most of the code, the tests and the first drafts of these notes. I directed it: I chose the stack (NestJS, Next.js, PostgreSQL, Docker), the ORM (Prisma), and the folder structure for both apps, which I gave it as screenshots of an existing project. I reviewed the design decisions, especially the late-payment policy and how stock is held. Claude Code also ran the test suite, the Docker build and a scripted browser check, and I read the results.

## A prompt that worked well

> "Use Prisma for the transactions as well. Fall back to raw SQL only where Prisma genuinely can't do it."

The first design used Prisma for the schema only and kept the concurrency-critical paths in raw SQL with `SELECT … FOR UPDATE` and careful lock ordering. This prompt set a constraint without prescribing a solution, which forced a rethink rather than a wrapper. The result was simpler and safer: stock lives in an `available` counter that changes only through a conditional `updateMany` (`available >= qty`), and every order state change is conditional on the current status. Postgres re-checks the `WHERE` after a row lock, so no explicit locks or lock ordering are needed. Raw SQL shrank to one parameter-free tagged-template query that reads the database clock.

What I took from it: giving the AI a constraint plus an escape hatch works better than dictating the implementation.

## What I'd ask for up front next time

> "Before writing code, list the race conditions in this design and, for each, the test that would catch it. Then break the code on purpose to prove each test fails."

I ended up doing this after the fact (deliberately removing the stock guard and the pickup condition to confirm the tests went red). Asking for it first would have shaped the design around provable guarantees from the start.

## Things the AI got wrong, and how they were noticed

- **A made-up test reference.** The first version of the signature unit test had a comment saying its expected value came from an `openssl` command. No such command was ever run, and the assertion only checked the output was 64 hex characters. It was caught in review and replaced with the published RFC 4231 test vector, which checks the HMAC against a known answer.
- **Hold length off by a few milliseconds.** `createdAt` used the column default, which Postgres sets at transaction start, while `expiresAt` was computed from a later database-clock reading. The live smoke test showed `createdAt` 5 ms after `expiresAt − 120 s`. The fix sets both from the same reading.
- **Webhook validation too strict.** The global validation pipe was first set to reject unknown fields. A provider adding a field to its payload would then get 400s and retry forever. It was changed to strip unknown fields instead.
- **Tooling slips:** a PowerShell write added a byte-order mark to `package.json`, which broke Jest's JSON parser (caught by the next test run). The first browser-check script replaced `Date` with a subclass that hung page load; the app was fine, the probe was wrong. It was diagnosed by loading the page with and without the override.

To be sure the concurrency tests prove something, I had Claude Code break the stock guard and the pickup condition on purpose. Both broken versions failed their tests, and the originals passed again.
