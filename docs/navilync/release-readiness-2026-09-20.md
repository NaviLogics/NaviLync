# NaviLync Windows portable: release readiness, 20 September 2026

## Scope and evidence

Target: Windows x64 portable for NAVIS ATLAS, based on upstream 1.18.4.
Branch: `feature/navis-atlas-status-v1.18.4`. No merge or release tag is part of this change.

- Windows workflow #28, commit `5ecc8320c7b217806749ad96f9dfb9cdcea722d0`: successful build, executable existence check and artifact upload.
- Commit `53cec15476b2ad84d3a9bfa3e068f5962822459d`: completes Vehicle Defaults wizard copy in Russian/English, including dynamic step titles, import notifications and axis/button labels; adds existing unit suite to Windows quality gate; fixes the general CI Windows artifact path.
- Source validation: changed Vue components parse and compile with Vue SFC compiler; Prettier formatting and new translation-key presence checked.
- Windows #29: lint and typecheck passed; unit suite reported 50 passed and one widget-file check timeout. The follow-up replaces side-effectful dynamic imports with a Vite file catalog; verification is pending.
- Draft PR to `main` was rejected by GitHub: the branches have no common history. A deliberate integration branch and Windows Foundation reconciliation are required.
- No Windows launch test, hardware test, visual acceptance or code-signing verification has been performed in this workspace. Build success is not evidence for those gates.

## Findings requiring closure

| Area | Observed evidence | Required action |
| --- | --- | --- |
| Automated tests | Historical `Test` job only ran lint, typecheck and build | Execute the existing unit suite and resolve failures; preserve the gate |
| General CI | #71 Windows artifact upload expected `Cockpit-win-x64-1.18.4.exe` | Corrected to actual NaviLync portable name; verify new run |
| Publishing | #71 Pages push denied with HTTP 403; Docker login lacked credentials | Decide intended NaviLync publication targets, then configure their access; do not reuse upstream publication destinations blindly |
| Release configuration | Tag upload steps still reference Cockpit artifact names; package version remains `0.0.0` with build-time override `1.18.4` | Establish NaviLync version/channel, artifact naming and checksums before tagging |
| Electron foundation | Current `main.ts` has context isolation and disables Node integration; no single-instance or navigation/window-open restriction appears in this file | Reconcile current upstream-based branch with prior Windows Foundation work; review IPC/storage and navigation before public release |
| Runtime/updater | Electron dependency is `^29.2.0`; updater is initialized for the portable build | Plan supported runtime upgrade with native-module validation; establish explicit portable update behavior and controlled release metadata |
| Localization | Literal-English scan still finds CameraReplacementDialog, VideoLibraryModal, JoystickCalibration, MissionControlPanel, external features and admin editors | Complete operator paths first, then admin paths; inspect Russian layouts and language switching |
| Branding/data | Some locale values and storage folder names retain Cockpit | Separate product labels from compatibility identifiers and attribution; validate migration before renaming storage |
| Vehicle readiness | NavisAtlasStatus displays READY from telemetry and freshness checks | Verify disconnect, stale metrics, RTK loss and recovery against the real Shore/USV agent; display is not proof of mission inhibition |
| Signing | No signing evidence established in this review | Verify signing policy and certificate availability for public distribution |

## Acceptance on Windows 10/11 x64

Record executable SHA-256, Windows version, date, tester, outcome and logs for each test.

1. Start portable executable from a path containing spaces and Cyrillic; verify first launch, restart, saved settings and clean exit.
2. Open Vehicle Defaults in Russian and English. Exercise intro, all/none selection, no-default/matching-default states, append, replace confirmation, cancel, ignore and finish. Confirm user views are not deleted on cancel.
3. Verify operator/admin menus, joystick calibration, mission planning, video library and import/export. Check text clipping at the operator's display scaling.
4. Connect to BlueOS/BasaltOS and PX4; verify telemetry, mode, discovery, reconnection and the configured links. Test joystick bindings on a secured bench with propulsion unable to move the vessel.
5. Validate NAVIS ATLAS metrics from Shore/USV. Interrupt RTCM, GNSS and MAVLink individually; verify stale/unknown status and loss of READY, then recovery and fixed dwell behavior.
6. Upload/download/clear a mission on a secured bench. Record PX4/QGC comparison and confirm mission coordinates and sequencing.
7. Complete controlled water trials: manual control, mission execution, communications loss, operator takeover and recovery, with an agreed safe test procedure.
8. Validate offline start, update UI behavior, configuration migration, video recording and log export.

## Planning estimate (conditional, not a release promise)

- Internal test baseline: #28 already exists; it is not an accepted release candidate.
- RC for limited operator testing: approximately 3–5 working days after automated-test issues are resolved, with focused localization, packaging and Windows acceptance capacity available.
- Operational Windows release: approximately 1–2 weeks after RC if bench/water trials pass without major fixes and signing/publication are ready.
- Runtime/IPC remediation, unavailable hardware or a failed water trial can extend this to 2–4 weeks or longer. Re-estimate from actual test results, not number of green packaging runs.
