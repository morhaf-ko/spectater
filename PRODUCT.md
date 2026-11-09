# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Approved local Bun CLI, native OpenSpec discovery, plain browser JavaScript/CSS and maintained Markdown AST parsing. No hosted runtime.

## Users and purpose

An operator reviews an OpenSpec proposal drafted in an existing coding conversation, selects source text and submits revision-bound comments. The existing conversation retrieves an explicit batch and revises canonical Markdown.

## Capabilities and constraints

Canonical Markdown remains authoritative. Private local review state retains original revisions and stale/orphaned comments. No accounts, embedded models, source editing, agent control or approval inference. Implementation follows openspec/changes/local-change-review.

## Confirmed interface

The operator selected artifact navigation, a central document and a feedback sidebar. Rendered/source views, revision labels and explicit batch submission are required. The app screen uses a code-first build; no landing-page build preference is recorded.
