# Changelog tài liệu và phạm vi

File này ghi lịch sử thay đổi phạm vi, tài liệu và governance của dự án. Không sửa hoặc xóa entry đã phát hành; nếu cần, thêm entry đính chính mới.

## Mẫu entry

```markdown
## YYYY-MM-DD — <Tiêu đề thay đổi>

- **Loại:** Scope | Requirement | Architecture | Data | API | Security | Governance | Documentation
- **Người yêu cầu/phê duyệt:** TBD
- **Mã bị ảnh hưởng:** BR-... / FR-... / Source Feature ID / Không áp dụng
- **Trước thay đổi:** ...
- **Sau thay đổi:** ...
- **Lý do:** ...
- **Artefact bị ảnh hưởng:** ...
- **Migration/tương thích:** ...
- **Trạng thái:** Proposed | Approved | Rejected | Implemented
```

## 2026-07-18 — Ghi local implementation và close-out bảo thủ US-004

- **Loại:** Architecture; Data; API; Security; Frontend; Worker; Test; DevOps; Documentation; không thay đổi phạm vi nghiệp vụ baseline.
- **Người yêu cầu/phê duyệt:** Người dùng/Product Owner đã delegated quyền thực hiện US-004; root Codex yêu cầu close-out theo evidence thực tế ngày 2026-07-18.
- **Mã bị ảnh hưởng:** `BR-018`, `BR-022`, `BR-031`, `BR-032`, `FR-098…FR-105`, `FR-146`, `UC-004`, `US-003`, `US-004`, `AC-012`, `AC-014…AC-017`, `WF-003`, `WF-015`, `WF-021`, `DB-005…DB-007`, `DB-020`, `DB-065…DB-067`, `DB-098`, `DB-102…DB-105`, `DB-112`, `DB-113`, `API-008`, `API-036`, `API-038`, `API-143…API-164`, `SEC-105…SEC-111`, `SEC-114`, `SEC-118`, `SEC-119`, `TEST-012`, `TEST-014…TEST-017` và mapped NFR/security tests.
- **Trước thay đổi:** Canonical artefacts/OpenAPI/ExecPlan vẫn ghi US-004 `Approved/Build-ready`, M1 active, API-008/038/143…164 planned và API-036 implemented-partial, dù source/API/data/worker/Vue local implementation đã materialize.
- **Sau thay đổi:** OpenAPI 0.9.0 đánh dấu API-008/036/038/143…164 implemented; API specification 1.3 và downstream SRS/domain/architecture/data/security/UX/workflow/backlog/test/trace/decision/index ghi đúng local implementation. TypeORM materializes DB-065…067/112/113, generalized DB-105, immutable approved-Change-backed positive REBASELINE/reverse trace, scoped API-008, worker projection và Vue Risk/Issue/Action/Change slice. Implementation status được tách khỏi acceptance/deployment: `TEST-014…017` giữ Partial và current GitHub Actions/EC2 release giữ Pending.
- **Lý do:** Bảo đảm tài liệu phản ánh runtime đã có nhưng không biến focused test hoặc historical CI run thành blanket acceptance/deployment Pass.
- **Artefact bị ảnh hưởng:** `.agent/execplans/2026-07-12-risk-issue-change-us004.md`; `docs/04-SRS.md`…`docs/16-open-questions-and-decisions.md`; `docs/INDEX.md`; `docs/openapi/openapi.yaml`; `docs/CHANGELOG.md`. Source implementation thuộc `apps/api`, `apps/web`, `apps/worker` và test trees được tham chiếu làm evidence nhưng entry này không sửa code.
- **Migration/tương thích:** Final local chain includes `1783731000000-CreateRiskIssueControl`, `1783732000000-CreateChangeControl`, `1783733000000-GeneralizeNotifications`, `1783734000000-AddActionResidualRationale`, `1783735000000` live-schema constraints/functions reconciliation và `1783736000000` existing seed role-grant/policy-v3 upgrade. Data handoff Complete; focused RiskChange migration 7/7 and exact-port full integration 60/60 Pass. Actual EC2 apply/post-deploy verification Pending. DB-068 Claim/FR-103 và FR-105 source adapters vẫn dependency; không có OT write path.
- **CI robustness:** `docker-compose.test.yml` parameterizes host ports; main self-hosted CI injects isolated PostgreSQL/Redis `15433/16380` thay vì local `5433/6380` and passes `TEST_*` through sudo via `sudo -n env ...`. Exact CI-like preflight Pass; actual GitHub Actions push/deploy/public smoke vẫn Pending.
- **Validation hiện có:** Post-fix root lint/type-check/API-Web-Worker build Pass; unit API 14 suites/52, Web 20 files/55, Worker 12 suites/61 = 168; Web full 55/focused Risk/Issue closure-form exact-payload 4/4 và backend focused HTTP closure 6/6 Pass post-fix. Exact isolated-port full integration API 8 suites/49 + Worker 3 suites/11 = 60 Pass trước final branch hardening; các branch thay đổi sau đó đều có focused post-fix evidence. Focused RiskChange migration 7/7; OpenAPI lint Pass; Web build 1,697 modules. Close-out documentation: Redocly/OpenAPI Pass; 164/164 unique API IDs và operation IDs với 33 implemented markers; 113 DB anchors; 233 TEST anchors; 22 Markdown files, 1,149 links tổng/864 relative-file links/968 fragment links, 0 broken file/anchor; baseline SHA-256 `51dbad85ffc548ab9d95743551de6be745ea2723b3f237054b9c793b3a8cf55c`; `git diff --check` Pass. Actual GitHub Actions rerun remains Pending.
- **Acceptance còn thiếu:** TEST-014 thiếu API-level Issue/Risk-OCCURRED và >page/filter matrix; TEST-015 thiếu ROUTINE/CANCEL/full closure-block matrix; TEST-016 thiếu RETURN/REJECT/race/cross-project và same-journey Change→REBASELINE E2E. TEST-017 đã cover missing-evidence reopen zero-write, CLOSED→MONITORING và request/approve second cycle với immutable `[2,1]`, nhưng còn thiếu Issue closure, RETURN/REJECT, cursor 50/100 traversal, masking và complete second-decision/update/delete negatives. GitHub Actions run/release, Compose health và public authenticated smoke cho US-004 chưa có evidence.
- **Trạng thái:** Local implementation and pre-push gate Complete; acceptance Partial; full E2E and actual GitHub Actions/EC2 deployment/public smoke Pending. Production vẫn Proposed/TBD.

## 2026-07-18 — Đính chính và đóng validation cổng tài liệu US-004

- **Loại:** API contract correction; Documentation; Validation; không thay đổi phạm vi nghiệp vụ baseline.
- **Người yêu cầu/phê duyệt:** Người dùng/Product Owner đã trao quyền quyết định và yêu cầu tiếp tục hoàn thiện; Codex đính chính theo canonical SRS/Data/Security/Workflow đã phê duyệt.
- **Mã bị ảnh hưởng:** `FR-018`, `FR-098…FR-102`, `FR-146`, `US-004`, `AC-012`, `AC-014…AC-017`, `WF-015`, `WF-021`, `DB-005…DB-007`, `DB-020`, `DB-065…DB-067`, `DB-098`, `DB-105`, `DB-112`, `DB-113`, `API-008`, `API-036`, `API-038`, `API-143…API-164`, `TEST-012`, `TEST-014…TEST-017`.
- **Trước thay đổi:** API catalog header/conformance còn ghi 158 operation, thiếu catalog row API-159, một số row còn deny package-only và truy vết nhầm DB-005 thay DB-098; Risk nhận derived `impactRating`, Action dùng `COMPLETED`; list trả detail quá rộng nhưng lại thiếu stable detail/action reads; REBASELINE nhận client free-text; verification/cancellation/approval snapshot chưa đồng bộ; Redocly báo 15 schema warning.
- **Sau thay đổi:** Catalog/OpenAPI 0.8.2 có đúng 164 operation unique; API-008 là scoped assignee lookup, API-159 reverse baseline trace và API-160…164 cung cấp record detail/Action list-detail. Exact-package ABAC và full-project submit/approval/closure/VERIFY/CANCEL được diễn đạt nhất quán; DB-065 là residual SoR với versioned Action promotion; API-149 là four-command union; DB-113 giữ mọi closure cycle bất biến và detail page bằng bounded cursor; generalized DB-105 có typed/non-null derivation cùng deterministic source-derived priority; API-157 heatmap dùng toàn bộ authorized filter và group theo scoring/threshold version; REBASELINE lấy provenance từ approved Change bất biến; OpenAPI không warning.
- **Lý do:** Sửa inconsistency trước production code để implementation bám một hợp đồng duy nhất và bảo toàn package isolation/audit.
- **Artefact bị ảnh hưởng:** `docs/04-SRS.md`, `docs/07-data-model.md`…`docs/13-test-strategy.md`, `docs/15-traceability-matrix.md`, `docs/INDEX.md`, `docs/openapi/openapi.yaml`, ExecPlan US-004 và changelog.
- **Migration/tương thích:** Chưa có consumer/runtime US-004 nên correction không breaking production; migration/code M1 phải dùng contract đã đính chính.
- **Validation:** Redocly Pass/no warning; 164/164 unique `x-api-id`, 164/164 unique `operationId`; 113 DB anchors; 233 TEST anchors; 22 Markdown/1.132 relative links/0 broken; baseline SHA-256 `51dbad85ffc548ab9d95743551de6be745ea2723b3f237054b9c793b3a8cf55c` unchanged; semantic assertions và `git diff --check` Pass.
- **Trạng thái:** Approved; M0 final GO, M1 implementation được phép bắt đầu. Chưa claim runtime/test/deploy US-004 Pass.

## 2026-07-12 — Sửa projection correction progress để đóng CI gate

- **Loại:** Functional; Test; API contract correction; không thay đổi phạm vi nghiệp vụ baseline.
- **Người yêu cầu/phê duyệt:** Người dùng yêu cầu hoàn tất CI/CD ngày 2026-07-12; sửa theo canonical `TEST-011`/`DB-021` explicit-null correction contract.
- **Mã bị ảnh hưởng:** `FR-019`, `FR-021`, `US-003`, `AC-011`, `DB-021`, `API-037`, `TEST-010`, `TEST-011`, `TEST-185`.
- **Trước thay đổi:** Optional DTO field `undefined` bị nhận nhầm là explicit value; null trong correction basis bị `??` thay bằng current activity, khiến correction lịch sử kế thừa actual finish mới và reopen làm mất actual start. CSV integration expectation không khớp fixture `ACT_A`.
- **Sau thay đổi:** Chỉ giá trị được gửi, kể cả explicit `null`, mới thay basis; correction giữ chính xác null/value của target; reopen completion giữ actual start và xóa explicit actual finish. CSV assertion dùng code từ canonical test fixture.
- **Lý do:** Bảo toàn append-only correction/projection theo `DB-021` và đóng integration gate mà không nới validation.
- **Artefact bị ảnh hưởng:** Project Controls service/integration test, OpenAPI description quoting và CI/CD validation evidence.
- **Migration/tương thích:** Không đổi schema/API shape; sửa runtime projection semantics đúng contract đã phê duyệt.
- **Validation:** API integration 35/35, toàn bộ unit 100/100 và worker integration 7/7 pass; OpenAPI valid.
- **Trạng thái:** Implemented và deployed EC2 test trong release `cicd-setup-20260712`.

## 2026-07-12 — Thiết lập self-hosted CI/CD cho main trên EC2 test

- **Loại:** DevOps; Security; Governance; Documentation; không thay đổi phạm vi nghiệp vụ baseline.
- **Người yêu cầu/phê duyệt:** Người dùng yêu cầu trực tiếp ngày 2026-07-12 cho repository và máy EC2 test hiện tại.
- **Mã bị ảnh hưởng:** `BR-040`, `NFR-007`, `NFR-021`, `NFR-023`, `SEC-124`, `ADR-001`, `US-024`, `AC-113…AC-116`, `TEST-196`, `TEST-221`; không cấp requirement/API/DB ID mới.
- **Trước thay đổi:** Repository chưa có GitHub Actions; deploy Compose thực hiện thủ công, image không có commit tag/release lock/automatic rollback. Năm runtime container đang healthy nhưng máy chưa đăng ký Actions runner.
- **Sau thay đổi:** Thêm workflow push `main` self-hosted chạy npm CI gates trước deploy; application image tag theo SHA; rollout serialized giữ project/volume `solar_bess_web`; health/HTTP smoke và automatic application-image rollback; có runbook đăng ký runner/branch protection/recovery.
- **Lý do:** Tự động hóa kiểm chứng và deploy EC2 test sau push `main` theo yêu cầu người dùng, vẫn fail closed và không mở OT write path.
- **Artefact bị ảnh hưởng:** `.github/workflows/main-cicd.yml`, `scripts/deploy-ec2.sh`, `docker-compose.yml`, ExecPlan CI/CD, DevOps/Traceability/Open Questions/INDEX/runbook/changelog.
- **Migration/tương thích:** Không tạo schema/API migration. API tiếp tục chạy pending TypeORM migration; rollback không tự down schema nên migration tương lai phải backward-compatible. Compose project cố định giữ volumes hiện hữu.
- **Validation:** `npm ci` cài 995 package, audit 0 vulnerability; lint/typecheck pass; unit API 47/47 + Web 32/32 + Worker 21/21; integration API 35/35 + Worker 7/7; OpenAPI valid với 15 non-blocking warning; build toàn workspace, shell syntax, Compose config và diff check pass. `deploy-ec2.sh` rollout release `cicd-setup-20260712`; năm runtime service healthy, `/web-health` và `/health` smoke pass. Runner registration/first GitHub run/branch protection còn Pending.
- **Hosted evidence:** Runner `solar-bess-ec2-test` v2.335.1 được đăng ký/cài systemd active+enabled. GitHub run `29178873783` từ push `f1e33428a0534e0519d0cede8125fa5fa7e9344e`: job CI Succeeded, job Deploy EC2 test Succeeded; SHA release được ghi nhận, năm service healthy và `/health` database/Redis OK.
- **Trạng thái:** Implemented và end-to-end validated cho EC2 test; branch protection là governance follow-up; production/registry/IaC/SBOM/signing vẫn Proposed/TBD.

## 2026-07-12 — Hoàn tất canonical documentation gate cho US-004 Risk, Issue và Change

- **Loại:** Requirement; Architecture; Data; API; Security; UX; Workflow; Test; Documentation; không thay đổi phạm vi nghiệp vụ baseline.
- **Người yêu cầu/phê duyệt:** Người dùng/Product Owner trao quyền quyết định và yêu cầu thực hiện liên tục ngày 2026-07-11/12; Codex chốt EC2 test profile theo delegated authority.
- **Mã bị ảnh hưởng:** `BR-022`, `BR-031`, `BR-032`, `FR-098…FR-105`, `UC-004`, `US-004`, `AC-014…AC-017`, `WF-015`, `WF-021`, `DB-020`, `DB-065…DB-068`, `DB-098`, `DB-102…DB-105`; cấp mới `DB-112`; concretize `API-038`, cấp mới `API-143…API-159`; `SEC-105…SEC-111`, `SEC-114`, `SEC-118`, `SEC-119`, `TEST-012`, `TEST-014…TEST-017` và mapped NFR/security tests.
- **Trước thay đổi:** API-038 dùng GenericCommand/Envelope; DB-065…068 chỉ logical dictionary; Risk/Issue/action/closure/change approval/rebaseline contract chưa decision-complete.
- **Sau thay đổi:** Risk, Issue, ChangeRequest là aggregate riêng; DB-112 sở hữu action; 1…5 exposure/env threshold, numeric(19,4), nullable package scope/exact-package ABAC, closure/change SoD, immutable approved impact, worker notification, Vue/Command Center và public ApprovedChangeReader→rebaseline được concretize. Claim DB-068/FR-103 và external FR-105 adapters giữ dependency rõ, không bị claim Implemented.
- **Lý do:** Đạt cổng tài liệu trước production implementation US-004 và mở khóa positive AC-012 mà không phá module boundary hoặc dùng UUID/free text giả approval.
- **Artefact bị ảnh hưởng:** SRS/Domain/Architecture/Data/API/OpenAPI/Security/UX/Workflow/Backlog/Test/Trace/Decision/INDEX, ExecPlan US-003/004; source/migration/frontend/worker sẽ thay đổi từ milestone implementation sau gate.
- **Migration/tương thích:** API-038 chưa có implementation/consumer nên concretize trước release; API-143…159 additive. Migration mới phải giữ composite tenant/project/package FK, DB-020→DB-067 provenance, approved immutability và DB-105 schedule regression; rollback không được drop committed source/approval history.
- **Validation:** OpenAPI lint/unique ID/link/trace/baseline checksum chạy tại M0 exit; không ghi test implementation Pass trong entry gate này.
- **Trạng thái:** Approved/Build-ready cho EC2 test; implementation chưa bắt đầu tại thời điểm gate.

## 2026-07-12 — Triển khai core US-003 Project Controls và cấp API-141 progress history

- **Loại:** Architecture; Data; API; Security; Frontend; Test; Deployment; Documentation; không thay đổi phạm vi nghiệp vụ baseline.
- **Người yêu cầu/phê duyệt:** Người dùng/Product Owner yêu cầu thực hiện liên tục và deploy EC2 test; Codex thực hiện theo delegated authority ngày 2026-07-12.
- **Mã bị ảnh hưởng:** `BR-018`, `BR-032`, `FR-016…FR-021`, `UC-003`, `US-003`, `AC-010…AC-013`, `WF-003`, `DB-012`, `DB-017…DB-021`, `DB-098`, `DB-101…DB-105`, `API-023`, `API-024`, `API-034…API-037`, `API-140`; cấp mới `API-141`, `API-142`; `SEC-105…SEC-111`, `SEC-118`, `SEC-119`, `TEST-010…TEST-013`, `TEST-185`, `TEST-187`, `TEST-189`, `TEST-190`, `TEST-193…TEST-196`.
- **Trước thay đổi:** US-003 mới Approved/Build-ready; chưa có physical schedule aggregate, API/controller, worker alert, Schedule UI hoặc progress-history query dùng được.
- **Sau thay đổi:** Có TypeORM entity/migration Package/Schedule/WBS/Activity/Dependency/Baseline/Progress/Notification; pure calendar/CPM/SPI/progress projector; PACKAGE ABAC/SoD/audit/outbox; draft preview/commit; initial baseline; append-only progress/correction; worker alert; Vue Schedule và Dashboard alert lane. `API-141` cung cấp history có cursor/scope để UI chọn stable correction target; `API-142` xuất authorized look-ahead CSV, neutralize spreadsheet formula và audit. Core được deploy EC2 test; positive rebaseline vẫn bị chặn đúng bởi `US-004/DB-067`.
- **Lý do:** Hiện thực hóa vertical slice đã được phê duyệt và đóng usability/security gap nhập UUID correction thủ công.
- **Artefact bị ảnh hưởng:** `apps/api`, `apps/worker`, `apps/web`, `tests/e2e`, Compose, OpenAPI, API/Trace/INDEX/Changelog và ExecPlan US-003.
- **Migration/tương thích:** Migration `1783730000000-CreateProjectControls` đã chạy idempotent; API-141 là additive. Hai action URL dấu `:` được escape cho Nest 11/path-to-regexp nhưng public URL không đổi. Approved baseline/progress history không bị drop khi rollback.
- **Validation:** Build toàn workspace pass; API unit 47/47, Web unit 32/32, Worker unit 21/21; lint/type/OpenAPI pass. Core Compose PostgreSQL/Redis/API/worker/web healthy và public root/login/health HTTP 200; Dashboard/API-142 source mới hơn đã build/test cục bộ nhưng latest image redeploy còn pending. PostgreSQL integration/Playwright final rerun còn pending do approval network sandbox, vì vậy không tuyên bố `TEST-010…013` hoặc US-003 full Pass.
- **Trạng thái:** Core Implemented và deployed EC2 test; full story In Progress.

## 2026-07-12 — Hoàn tất canonical documentation gate cho US-003 Project Controls

- **Loại:** Requirement; Data; API; Security; UX; Workflow; Test; Documentation; không mở rộng baseline.
- **Người yêu cầu/phê duyệt:** Người dùng/Product Owner trao quyền quyết định và yêu cầu thực hiện liên tục ngày 2026-07-11; Codex đóng M0 theo delegated authority.
- **Mã bị ảnh hưởng:** `BR-018`, `BR-032`, `FR-016…FR-021`, `UC-003`, `US-003`, `AC-010…AC-013`, `WF-003`, `DB-012`, `DB-017…DB-021`, `DB-101`, schedule-alert subset `DB-105`, `API-023`, `API-024`, `API-034…API-037`; cấp mới `API-140`; `SEC-105…SEC-111`, `SEC-118`, `SEC-119`, `TEST-010…TEST-013`, `TEST-185`, `TEST-187`, `TEST-189`, `TEST-190`, `TEST-193…TEST-196`.
- **Trước thay đổi:** US-003 có ExecPlan nhưng canonical data/API/workflow/SoD/calculation/import schema còn chưa đồng bộ; API baseline decision chưa có stable ID; implementation bị chặn ở M0.
- **Sau thay đổi:** Cụ thể hóa calendar/day-level CPM, weight/progress/SPI, Package/Schedule/WBS/Activity/Dependency/Baseline/Progress/alert projection, API request/response, PREVIEW/COMMIT, append-only correction, baseline state/independent approval và `API-140`. US-003 M1/M2 được phép triển khai; positive rebaseline vẫn phụ thuộc approved `US-004/DB-067`, full alert delivery phụ thuộc operational worker/`DB-102…105`.
- **Lý do:** Đạt cổng tài liệu trước production code và giữ direct/dependency trace chính xác.
- **Artefact bị ảnh hưởng:** Data/API/OpenAPI/Security/UX/Workflow/Backlog/Test/Trace/Decision/INDEX và `.agent/execplans/2026-07-11-project-controls-us003.md`.
- **Migration/tương thích:** Chưa tạo schema trong entry này. Migration US-003 phải có `down`, composite tenant/project FK, snapshot/history immutability và up/down/up evidence. API mới giữ planned status đến khi implementation/test pass.
- **Trạng thái:** Approved/Build-ready; implementation In Progress, chưa tuyên bố `US-003` hoặc `TEST-010…013` Pass.

## 2026-07-11 — Phê duyệt roadmap phụ thuộc và operational foundation cho EC2 test

- **Loại:** Architecture; Data; Security; DevOps; Documentation; không thay đổi phạm vi nghiệp vụ baseline.
- **Người yêu cầu/phê duyệt:** Người dùng/Product Owner trao quyền quyết định và yêu cầu thực hiện liên tục ngày 2026-07-11; Codex chốt implementation profile trong phạm vi được ủy quyền.
- **Mã bị ảnh hưởng:** `ADR-001`, `ADR-002`, `ADR-004`, `ADR-006`, `NFR-006`, `NFR-007`, `NFR-012`, `NFR-020`, `NFR-021`, `NFR-023`, `NFR-024`, `SEC-103`, `SEC-105…SEC-111`, `SEC-118`, `SEC-122`, `SEC-124`, `SEC-125`, `TEST-180`, `TEST-200`, `TEST-202…TEST-208`, `TEST-231`; cấp mới/reserve `DB-101…DB-111`.
- **Trước thay đổi:** PostgreSQL/API/web đã chạy nhưng chưa có Redis, BullMQ, worker, transactional outbox, generic command receipt hoặc database composite FK chống liên kết xuyên tenant; ADR vẫn ghi runtime/broker vật lý là TBD. Thứ tự backlog chưa phản ánh dependency và có thể khiến Command Center dùng dữ liệu nguồn chưa tồn tại.
- **Sau thay đổi:** Chấp nhận riêng cho EC2 test profile PostgreSQL 17 + Redis + BullMQ + worker/outbox; business/audit/outbox phải atomic, consumer idempotent, command có request hash, login rate limit dùng Redis fail-closed và FK dùng tenant composite key. Chốt roadmap theo dependency; `US-003/004` và các source domain được làm trước khi đóng `US-002`. Production ADR/topology/HA/SLO vẫn Proposed.
- **Lý do:** Ngăn pattern thiếu atomicity/tenant enforcement lan sang các module tiếp theo và bảo đảm feature chỉ được tuyên bố hoàn tất khi có dữ liệu/side effect kiểm chứng thật.
- **Artefact bị ảnh hưởng:** `.agent/execplans/2026-07-11-platform-delivery-program.md`, `.agent/execplans/2026-07-11-operational-foundation.md`, Architecture/Data/Test/DevOps/Trace/Decisions/INDEX; source/migration/Compose sẽ được tạo trong milestone implementation kế tiếp.
- **Migration/tương thích:** Migration mới phải expand/validate composite FK, tạo `DB-102…104` và có `down`; `DB-101`, `DB-105…111` chỉ reserve cho đúng slice, không tạo table trong operational milestone. Test DB synthetic có thể reset; production data không được tự sửa tenant khi validation fail.
- **Trạng thái:** Approved cho EC2 test; implementation In Progress. External provider/live-data acceptance và production profile vẫn chưa được phê duyệt.

## 2026-07-11 — Phê duyệt implementation slice US-001 Project Master

- **Loại:** Scope; Requirement; Data; API; Security; Workflow; Deployment.
- **Người yêu cầu/phê duyệt:** Người dùng/Product Owner xác nhận trực tiếp ngày 2026-07-11.
- **Mã bị ảnh hưởng:** `BR-001`, `BR-031`, `BR-033`, `FR-010…FR-025`, `US-001`, `AC-001…AC-004`, `WF-001`, `DB-001…DB-013`, `API-003…API-007`, `API-015…API-025`, `SEC-105…SEC-111`, `SEC-118`, `TEST-001…TEST-004`, `TEST-202…TEST-208`.
- **Trước thay đổi:** US-001 và tenant/org/project lifecycle/role catalog còn Draft/Open Question; production implementation ngoài auth chưa được phép.
- **Sau thay đổi:** US-001 là vertical slice đầu tiên được duyệt; chốt Tenant là customer/group boundary, Company 0..n Legal Entity, project code unique tenant, Project 1..n Site, type/phase/status catalog, archive-only và initial extensible roles. Test DB được phép reset/seed.
- **Lý do:** Product Owner yêu cầu bắt đầu hoàn thiện tính năng theo backlog sau khi base ổn định.
- **Artefact bị ảnh hưởng:** Data/API/OpenAPI/Security/Workflow/Backlog/Test/Trace/Open Questions/DevOps, ExecPlan và application source.
- **Migration/tương thích:** Migration mới phải có rollback; EC2 test không có dữ liệu cần giữ. Không áp dụng quyền reset này cho production.
- **Trạng thái:** Approved; implementation In Progress.

## 2026-07-11 — Hoàn tất và deploy US-001 Project Master

- **Loại:** Architecture; Data; API; Security; Frontend; Test; Deployment; Documentation.
- **Người yêu cầu/phê duyệt:** Người dùng/Product Owner yêu cầu tiếp tục đến khi hoàn tất ngày 2026-07-11.
- **Mã bị ảnh hưởng:** `BR-001`, `BR-031`, `BR-033`, `FR-010…FR-025`, `US-001`, `AC-001…AC-004`, `WF-001`, `DB-002/003/006/007/009…011/013/098`, `API-003…007`, `API-015…022`, `API-025`, `SEC-105…111/118`, `TEST-001…004`, `TEST-202…208`.
- **Trước thay đổi:** US-001 Approved/In Progress; EC2 chỉ có base/auth và frontend structure, chưa có Project Master end-to-end.
- **Sau thay đổi:** Có TypeORM entities/migration/rollback/seed; PostgreSQL-backed RBAC scope; organization/portfolio/project/site/party API; Vue list/create/detail/edit/activate/archive/Site/party UI; public EC2 deployment.
- **Lý do:** Hoàn thiện vertical slice nghiệp vụ đầu tiên theo backlog và quyết định Product Owner.
- **Artefact bị ảnh hưởng:** `apps/api`, `apps/web`, `tests/e2e`, Compose/API image, OpenAPI, Architecture/Data/API/Security/Workflow/Backlog/Test/DevOps/Trace/INDEX và ExecPlan.
- **Migration/tương thích:** Migration `1783728000000-CreateProjectMaster` có `down` và đã pass `up → down → up`; API container chạy pending migration trước HTTP. E2E credential là fixture tạm, đã xóa sau test. Không có OT/BESS control path.
- **Validation:** Root/API/Web lint zero warning; API type/build/unit 15/15; Web type/build/unit 19/19; integration 13/13; OpenAPI valid; Playwright final 3/3; public health/database OK và HTTP 200. Blank-screen do top-level-await/lazy-route deadlock được phát hiện, sửa và regression pass.
- **Trạng thái:** Implemented và deployed tại EC2 test.

## 2026-07-11 — Thiết lập governance repository

- **Loại:** Governance và Documentation.
- **Người yêu cầu/phê duyệt:** Người dùng repository.
- **Mã bị ảnh hưởng:** Không áp dụng; không thay đổi requirement nghiệp vụ.
- **Trước thay đổi:** Repository chưa có `AGENTS.md`, hướng dẫn ExecPlan hoặc changelog chuẩn; thư mục tài liệu dùng casing `Docs`.
- **Sau thay đổi:** Bổ sung `AGENTS.md`, `.agent/PLANS.md`, `docs/CHANGELOG.md`; chuẩn hóa thư mục tài liệu thành `docs`.
- **Lý do:** Thiết lập quy tắc phát triển, truy vết, kiểm soát phạm vi và an toàn PM/O&M/OT cho dự án Solar & BESS.
- **Artefact bị ảnh hưởng:** Governance repository và đường dẫn tài liệu. Nội dung `docs/Đề xuất tính năng nền tảng Solar và BESS.md` được giữ nguyên.
- **Migration/tương thích:** Mọi liên kết mới phải dùng `docs/`; không tạo lại `Docs/`.
- **Trạng thái:** Implemented.

## 2026-07-11 — Đồng bộ đường dẫn artefact với chương trình tài liệu

- **Loại:** Governance và Documentation.
- **Người yêu cầu/phê duyệt:** Người dùng repository qua goal objective.
- **Mã bị ảnh hưởng:** Không áp dụng; không thay đổi requirement nghiệp vụ.
- **Trước thay đổi:** `AGENTS.md` dùng các path ví dụ không đánh số và `docs/api/openapi.yaml`, khác path được yêu cầu trực tiếp.
- **Sau thay đổi:** Chuẩn hóa path governance theo bộ tài liệu `docs/00…16`, `docs/INDEX.md` và `docs/openapi/openapi.yaml`.
- **Lý do:** Bảo đảm một nguồn sự thật và không tạo file alias trùng nội dung.
- **Artefact bị ảnh hưởng:** `AGENTS.md`, ExecPlan, `docs/00-documentation-plan.md` và changelog.
- **Migration/tương thích:** Không tạo các path alias cũ; link mới chỉ dùng bộ path được đánh số.
- **Trạng thái:** Implemented.

## 2026-07-11 — Tạo bộ tài liệu phát triển phần mềm Solar & BESS v0.1

- **Loại:** Documentation; Requirement; Architecture; Data; API; Security.
- **Người yêu cầu/phê duyệt:** Người dùng yêu cầu tạo bộ hồ sơ; nội dung dẫn xuất vẫn chờ Product Owner và các owner chuyên môn phê duyệt.
- **Mã bị ảnh hưởng:** Định nghĩa mới có truy vết: `BR-001…BR-040`, `FR-001…FR-198`, `NFR-001…NFR-024`, `UC-001…UC-037`, `ADR-001…ADR-010`, `DB-001…DB-098`, `API-001…API-136`, `SEC-101…SEC-132`, `WF-001…WF-025`, `US-001…US-037`, `AC-001…AC-173`, `TEST-001…TEST-229`.
- **Trước thay đổi:** Chỉ có baseline tính năng và tài liệu governance; chưa có chuỗi Vision → BRD → PRD → SRS → Domain/Architecture/Data/API/Security/UX/Workflow/Backlog/Test/DevOps/Traceability.
- **Sau thay đổi:** Tạo `docs/00-documentation-plan.md` đến `docs/16-open-questions-and-decisions.md`, `docs/INDEX.md` và `docs/openapi/openapi.yaml`; thêm ExecPlan sống tại `.agent/execplans/2026-07-11-software-documentation-suite.md`.
- **Lý do:** Cung cấp đầu vào có thể review cho thiết kế và lập trình, đồng thời giữ nguyên phạm vi nguồn, truy vết ID, multi-tenant và ranh giới PM/O&M/OT.
- **Artefact bị ảnh hưởng:** Các file dẫn xuất nêu trên, `docs/CHANGELOG.md`, ExecPlan và các link governance. Baseline `docs/Đề xuất tính năng nền tảng Solar và BESS.md` không thay đổi; SHA-256 vẫn là `51DBAD85FFC548AB9D95743551DE6BE745EA2723B3F237054B9C793B3A8CF55C`.
- **Migration/tương thích:** Không có code, schema hay dữ liệu production. Open Questions, ADR Proposed, payload/technology/threshold còn `TBD` phải được đóng trước build/production gate.
- **Trạng thái:** Implemented (documentation Draft v0.1; business/architecture approval chưa hoàn tất).

## 2026-07-11 — Phê duyệt base/auth MVP và EC2 test deployment

- **Loại:** Requirement; Architecture; Data; API; Security; Documentation.
- **Người yêu cầu/phê duyệt:** Người dùng/Product Owner qua yêu cầu trực tiếp ngày 2026-07-11.
- **Mã bị ảnh hưởng:** `BR-033`, `BR-040`, `FR-147`, `UC-020`, `US-020`, `SEC-101`, `SEC-103`, `SEC-117`, `SEC-118`; mới `WF-026`, `DB-099…DB-100`, `API-137…API-139`, `AC-174…AC-177`, `TEST-230…TEST-233`.
- **Trước thay đổi:** Auth chỉ mô tả SSO/MFA ở Draft, chưa có API login/refresh/logout, credential/session entity hoặc quyền viết production code.
- **Sau thay đổi:** Phê duyệt local email/password cho base/test, access JWT 15 phút, refresh JWT HttpOnly 7 ngày có rotation/revoke, PostgreSQL và triển khai Docker Compose trên EC2 test. SSO/MFA được hoãn, không bị loại khỏi roadmap.
- **Lý do:** Tạo vertical slice đầu tiên có thể truy cập và kiểm thử từ máy cá nhân trong giai đoạn xây base.
- **Artefact bị ảnh hưởng:** ExecPlan auth, API/OpenAPI, data, security, workflow, backlog, test, traceability, INDEX và source code/toolchain sẽ tạo.
- **Migration/tương thích:** Schema mới chỉ dùng dữ liệu test; phải có migration up/down. Trước production thật phải review HTTPS, secret/KMS, SSO/MFA, retention và security operations.
- **Trạng thái:** Implemented trên EC2 test; production thật chưa được phê duyệt.

## 2026-07-11 — Chuẩn hóa base/auth theo modular DDD và TypeORM CLI

- **Loại:** Architecture; Data; DevOps; Documentation; không thay đổi phạm vi nghiệp vụ.
- **Người yêu cầu/phê duyệt:** Người dùng/Product Owner qua yêu cầu trực tiếp ngày 2026-07-11.
- **Mã bị ảnh hưởng:** `ADR-001`, `ADR-004`, `FR-147`, `DB-001`, `DB-005`, `DB-098…DB-100`, `API-001`, `API-137…API-139`, `SEC-101`, `SEC-103`, `SEC-117`, `SEC-118`, `TEST-200`, `TEST-230…TEST-233`.
- **Trước thay đổi:** Auth controller/service, ORM entity và database access còn ghép theo cấu trúc framework; migration dùng custom runner/alias `db:migrate`; typography chưa ưu tiên font Windows hỗ trợ tiếng Việt.
- **Sau thay đổi:** Identity & Access được tách thành domain/application/infrastructure/interfaces với domain entity khác ORM entity, repository/security ports và composition root; migration dùng TypeORM CLI qua `npm run migration:show|run|revert|generate|create`; UI ưu tiên Calibri/Segoe UI/Arial.
- **Lý do:** Biến auth slice thành reference bounded context có thể mở rộng, giữ dependency rule kiểm chứng tự động và chuẩn hóa lifecycle schema cho dự án dài hạn.
- **Artefact bị ảnh hưởng:** `apps/api`, `apps/web/src/styles.css`, root/API manifests, Docker/Compose config, `.agent/execplans/2026-07-11-ddd-base-refactor.md`, `docs/05-domain-model.md`, `docs/06-solution-architecture.md`, `docs/14-devops-and-deployment.md`, `docs/INDEX.md`.
- **Migration/tương thích:** Không đổi schema hoặc API contract; timestamp/class migration giữ nguyên. Up/down/up chạy trên PostgreSQL test; image cũ vẫn tương thích schema. Production thật vẫn bị chặn bởi các điều kiện HTTPS/secret/SSO-MFA/operations đã ghi nhận.
- **Trạng thái:** Implemented cho base/auth EC2 test profile.

## 2026-07-11 — Supersede DDD source tree bằng Nest convention và encrypted environment

- **Loại:** Architecture; Data; Security; DevOps; Documentation; không thay đổi phạm vi nghiệp vụ.
- **Người yêu cầu/phê duyệt:** Người dùng/Product Owner qua yêu cầu trực tiếp ngày 2026-07-11.
- **Mã bị ảnh hưởng:** `ADR-001`, `ADR-004`, `FR-147`, `FR-154`, `DB-001`, `DB-005`, `DB-098…DB-100`, `API-001`, `API-137…API-139`, `SEC-101`, `SEC-103`, `SEC-117`, `SEC-118`, `TEST-200`, `TEST-230…TEST-233`.
- **Trước thay đổi:** TypeORM artifacts nằm sâu trong module/shared infrastructure; Identity Access bắt buộc domain/application/infrastructure/interfaces và custom repository/ports; DB/JWT credential trong `.env` là plaintext; rate/TTL/Argon cost hard-code.
- **Sau thay đổi:** Entity/migration/DataSource/seed tập trung ở `src/database`; Identity Access dùng controller/service/guard/DTO + TypeORM repository chuẩn; thêm `CipherModule` AES-256-GCM, encrypted credential enforcement và typed env config cho rate/JWT/Argon/cookie. Password DB giữ Argon2id hash một chiều.
- **Lý do:** Theo convention source tree và mức abstraction do owner chốt; giảm ceremony, tăng khả năng tìm kiếm/configure và bảo vệ credential file base/test.
- **Artefact bị ảnh hưởng:** `apps/api/src`, API/root manifests, `.env.example`, `.gitignore`, `docker-compose.yml`, test, ExecPlan, domain/architecture/security/devops/index/changelog.
- **Migration/tương thích:** Không đổi schema/API/migration identity. `.env` cần one-time encryption và Compose cần runtime PostgreSQL secret files. Rollback code cũ cần controlled plaintext runtime config; không ghi plaintext trở lại repository.
- **Trạng thái:** Implemented và static/unit validated; migration/integration/deploy validation đang chờ quyền truy cập local PostgreSQL/Docker của phiên hiện tại.

## 2026-07-11 — Chuẩn hóa cấu trúc frontend Vue cho khả năng mở rộng

- **Loại:** Architecture; Frontend; Documentation; không thay đổi phạm vi nghiệp vụ.
- **Người yêu cầu/phê duyệt:** Người dùng/Product Owner qua yêu cầu trực tiếp ngày 2026-07-11.
- **Mã bị ảnh hưởng:** `ADR-001`, `ADR-003`, `FR-147`, `NFR-011`, `API-137…API-139`, `SEC-103`, `SEC-118`, `TEST-230…TEST-233`.
- **Trước thay đổi:** Store chứa raw fetch/error/retry; view chứa trực tiếp form/layout/header/status markup; router/routes/guard chung file; chưa có API/shared component/layout/type/constants structure; Element Plus register toàn bộ.
- **Sau thay đổi:** Frontend tách `app`, `api`, `components/common`, `components/auth`, `layouts`, `router`, `stores`, `styles`, `types`, `constants`, `views`; store gọi typed auth API; view lazy-load; Element Plus register tối thiểu.
- **Lý do:** Tạo convention rõ cho dự án lớn, giảm coupling và giữ transport/state/presentation đúng owner.
- **Artefact bị ảnh hưởng:** `apps/web/src`, Vite/Vitest/TypeScript config, frontend ExecPlan, architecture/test/index/changelog.
- **Migration/tương thích:** Không đổi API/data/browser storage. Asset hash thay đổi khi deploy; rollback bằng web image trước. Entry JS/CSS giảm đáng kể.
- **Trạng thái:** Implemented và lint/type/unit/build validated; combined E2E/deploy pending cùng backend blocker.

## 2026-07-11 — Chuẩn hóa cấu trúc backend test tree

- **Loại:** Architecture; Test; Documentation; không thay đổi phạm vi nghiệp vụ.
- **Người yêu cầu/phê duyệt:** Người dùng/Product Owner qua yêu cầu trực tiếp ngày 2026-07-11.
- **Mã bị ảnh hưởng:** `ADR-001`, `ADR-004`, `SEC-101`, `SEC-117`, `SEC-118`, `TEST-200`, `TEST-230…TEST-233`.
- **Trước thay đổi:** Jest config, integration setup, unit test và integration test cùng nằm ở root `apps/api/test`.
- **Sau thay đổi:** Tách `test/config`, `test/setup`, `test/unit/{architecture,config,modules}` và `test/integration/modules`; test tree phản chiếu production concern và có testMatch/setup riêng.
- **Lý do:** Tránh root test lộn xộn khi thêm module, phân biệt dependency/runtime của từng test level và giữ production `src` sạch.
- **Artefact bị ảnh hưởng:** `apps/api/test`, API package scripts, architecture/test/index/changelog.
- **Migration/tương thích:** Không đổi production code/API/schema. Unit pass; integration chưa chạy được do sandbox local network `EPERM`.
- **Trạng thái:** Implemented; lint/type/unit validated.
