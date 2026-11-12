# Changelog

## [0.8.2](https://github.com/morhaf-ko/spectater/compare/spectater-v0.8.1...spectater-v0.8.2) (2026-11-12)


### Bug Fixes

* open review links that carry a query string ([#40](https://github.com/morhaf-ko/spectater/issues/40)) ([200416f](https://github.com/morhaf-ko/spectater/commit/200416f5166976f61f07062b97dbe83d47733eb2))

## [0.8.1](https://github.com/morhaf-ko/spectater/compare/spectater-v0.8.0...spectater-v0.8.1) (2026-11-12)


### Bug Fixes

* load the reader from links on other sites ([#37](https://github.com/morhaf-ko/spectater/issues/37)) ([5d0bc9a](https://github.com/morhaf-ko/spectater/commit/5d0bc9ae146cfde72a010cb5addf77ea3674ee39))

## [0.8.0](https://github.com/morhaf-ko/spectater/compare/spectater-v0.7.0...spectater-v0.8.0) (2026-11-12)


### Features

* approve a review when nothing is pending ([#30](https://github.com/morhaf-ko/spectater/issues/30)) ([571f3f6](https://github.com/morhaf-ko/spectater/commit/571f3f6b4cabb7740acde1c67f0ce4e2c45b5ea8))

## [0.7.0](https://github.com/morhaf-ko/spectater/compare/spectater-v0.6.1...spectater-v0.7.0) (2026-11-12)


### Features

* add SSH tunnel fallback to public review access ([#27](https://github.com/morhaf-ko/spectater/issues/27)) ([559c3e3](https://github.com/morhaf-ko/spectater/commit/559c3e3c3d98006bbafedffafbac5fab92f72ba4))

## [0.6.1](https://github.com/morhaf-ko/spectater/compare/spectater-v0.6.0...spectater-v0.6.1) (2026-11-12)


### Miscellaneous Chores

* remove dead code and stale docs ([2b846e0](https://github.com/morhaf-ko/spectater/commit/2b846e0e7f6a87ffbe88a5c3ef9f0ffcf326c73a))

## [0.6.0](https://github.com/morhaf-ko/spectater/compare/spectater-v0.5.0...spectater-v0.6.0) (2026-11-11)


### Features

* support Windows, tmux over SSH, Tailscale review URLs and Herdr notifications ([#23](https://github.com/morhaf-ko/spectater/issues/23)) ([5ed5ccd](https://github.com/morhaf-ko/spectater/commit/5ed5ccd5c6f95f6377d502c4064cf098ac5fae55))

## [0.5.0](https://github.com/morhaf-ko/spectater/compare/spectater-v0.4.0...spectater-v0.5.0) (2026-11-11)


### Features

* reach reviews from another machine ([#20](https://github.com/morhaf-ko/spectater/issues/20)) ([75f4f06](https://github.com/morhaf-ko/spectater/commit/75f4f06f74d25cf598298ac34709b5e61f29e3a4))

## [0.4.0](https://github.com/morhaf-ko/spectater/compare/spectater-v0.3.0...spectater-v0.4.0) (2026-11-11)


### Features

* one review action that ends or sends and ends ([#17](https://github.com/morhaf-ko/spectater/issues/17)) ([2892039](https://github.com/morhaf-ko/spectater/commit/28920396529174fc772419635ee720433557e337))

## [0.3.0](https://github.com/morhaf-ko/spectater/compare/spectater-v0.2.1...spectater-v0.3.0) (2026-11-09)


### Features

* actionable first-run errors and implicit change selection ([#11](https://github.com/morhaf-ko/spectater/issues/11)) ([766c981](https://github.com/morhaf-ko/spectater/commit/766c981669b4a4f5674074c0f0368f1f3fc6e58d))

## [0.2.1](https://github.com/morhaf-ko/spectater/compare/spectater-v0.2.0...spectater-v0.2.1) (2026-11-09)


### Bug Fixes

* re-read the change when the agent replies ([#7](https://github.com/morhaf-ko/spectater/issues/7)) ([5966a55](https://github.com/morhaf-ko/spectater/commit/5966a55b09f54ef5d4aad6717db7f21652beaff9))

## [0.2.0](https://github.com/morhaf-ko/spectater/compare/spectater-v0.1.0...spectater-v0.2.0) (2026-11-09)


### ⚠ BREAKING CHANGES

* `--review`, `--after`, `feedback --wait` and the foreground `open` are removed. Use `open <change>`, `wait <change>`, `reply <change>` and `feedback <change> --batch <n>`.

### Features

* agent-ready CLI, detached server and open-source conventions ([#2](https://github.com/morhaf-ko/spectater/issues/2)) ([2038f99](https://github.com/morhaf-ko/spectater/commit/2038f99d7be08c561e2127d33590034f8ec3e856))
