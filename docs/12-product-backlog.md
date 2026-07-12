# Product Backlog — Nền tảng Solar & BESS

> **Purpose:** Chuyển 37 source stories thành backlog Epic → Capability → Feature → US → AC → Technical Task, giữ nguyên 173 Given/When/Then nguồn và bổ sung 4 AC được phê duyệt cho base auth MVP.
> **Scope:** Backlog planning-level; story point sơ bộ; không phải sprint commitment hoặc production-code authorization.
> **Source:** [PRD](./03-PRD.md), [SRS](./04-SRS.md), [Domain Model](./05-domain-model.md), [API](./08-api-specification.md), [Security](./09-security-and-permissions.md), [UX](./10-ux-information-architecture.md), [Workflows](./11-workflows-and-state-machines.md), baseline US-E01…US-E37.
> **Version:** 0.7
> **Status:** Draft toàn backlog; US-001/auth Implemented; US-003 core Implemented/deployed; US-004 Approved/Build-ready cho EC2 test
> **Owner:** Product Owner / Delivery Lead (cá nhân: TBD)
> **Updated:** 2026-07-12
> **Approval:** US-003/US-004 documentation/implementation profile — Product Owner delegated; full story acceptance còn pending; phần còn lại TBD — Product Owner, Process Owners, Architecture, UX, Engineering, QA và Security

## 1. Backlog hierarchy and governance

- Epic groups business outcome; Capability follows domain/module; Feature is source-story theme; US/AC are canonical here.
- US-001…US-037 map one-to-one US-E01…US-E37. AC-001…AC-173 preserve source Given/When/Then; AC-174…177 là delta đã được Product Owner phê duyệt cho US-020/base auth.
- Technical Tasks are prose because AGENTS defines no TASK ID family; teams decompose after documentation/architecture gate.
- Phase is normalized working plan, not a change to source priority; Product Owner must approve.
- A story is not Ready if owner, permission, state, data source or non-waivable rule is unknown.

## 2. Epic and capability map

| Epic | Capabilities | Outcome |
|---|---|---|
| Portfolio/Project Delivery | PFM, PRJ, RSK | PM daily control, baseline and exceptions |
| Commercial/Legal/Cost | CTR, CST | Contract/obligation/money integrity |
| Engineering/Procurement/Site | ENG, PRC, LOG, CON | Design-to-delivery lineage |
| Quality/HSE/Commissioning | QAC, HSE, COM | Safe verification and COD |
| O&M/Solar/BESS | OMM, SOL, BES | Handover, work and read-only performance |
| Platform Governance | DOC, WFL, IAM | DMS, approval, identity and audit |
| Integration/Reporting/AI | INT, reporting, AIX | SoR, data access and governed assistance |

## 3. Release split

| Phase | US | Count | Exit intent |
|---|---|---:|---|
| MVP | US-001…013, US-015…024, US-029, US-031 | 25 | PM-first daily value plus security/safety/OT/AI governance foundations |
| Release 1 | US-014, US-025…028, US-030 | 6 | O&M/work, feasibility, specialist and integration/lineage expansion |
| Release 2 | US-032…036 | 5 | Five prioritized AI use cases under governance |
| Future | US-037 | 1 | Forecast/anomaly/optimization advisory pilot only |

MVP excludes full pre-feasibility, broad live telemetry, advanced optimization and predictive AI. US-029 establishes read-only/no-control guardrail; US-031 establishes AI governance only.

## 4. Definition of Ready

Persona/value/BR/FR/UC/phase agreed; normal/exception/state/workflow/permission/SoD/data scope defined; SoR/fields/unit/currency/timezone/evidence known or explicit blocker; UX/API/domain path identified; AC testable; security/privacy/HSE/OT reviewed; estimate reviewed; no unrecorded scope change.

## 5. Definition of Done

All AC and mapped TEST pass; negative permission/tenant/concurrency/idempotency/error pass; audit/notification/report/search/offline behavior complete; API/OpenAPI/data/workflow/UX/runbook updated; accessibility/localization/observability/rollback evidence complete; vulnerability gate passes; no OT control; PO/owner/QA acceptance and changelog recorded.

## 6. Backlog stories

<a id="us-001"></a>
### US-001 — Quản lý portfolio và project master

- **Delivery status:** **Implemented / EC2 test deployed** ngày 2026-07-11; decision và execution evidence trong `.agent/execplans/2026-07-11-project-master-us001.md`.

- **Source:** US-E01; source heading/priority: Quản lý portfolio và project master (`PFM-*`, `PRJ-*`) — Must/MVP, Dùng chung, Quản lý dự án.
- **Epic → Capability → Feature:** Portfolio & Command Center → PFM, PRJ → Quản lý portfolio và project master.
- **Persona:** PMO hoặc Ban Giám đốc.
- **User story:** As a PMO hoặc Ban Giám đốc, I want quản lý danh mục nhiều dự án, khách hàng, nhà máy và pháp nhân trên một cấu trúc chuẩn, so that tôi có một nguồn dữ liệu thống nhất để điều hành và phân quyền.
- **Business value:** tôi có một nguồn dữ liệu thống nhất để điều hành và phân quyền.
- **Trace:** BR-001, BR-031; FR-010…FR-025; UC-001; WF-001. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **MVP**; Must/MVP; **5 points preliminary**.
- **Normal flow:** PMO tạo project master từ cơ hội đã duyệt, gán team và chuẩn dự án, PM chấp nhận bàn giao rồi cấu hình baseline.
- **Exception flow:** mã trùng, thiếu pháp nhân chịu trách nhiệm hoặc PM ngoài data scope làm yêu cầu bị trả về; merge bản ghi trùng cần quyền data steward.
- **Permission:** PMO tạo/sửa; PM quản lý dự án được giao; Ban Giám đốc xem theo portfolio; chủ đầu tư chỉ xem dự án của mình; không bên ngoài nào xem dự án khác dù biết URL/ID.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** Project master, baseline, data freshness and PMO rules.
- **Risk:** Stale/low-confidence decision, dependency cycle or scope leakage.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-001

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-001"></a> **AC-001** | Người dùng có quyền tạo dự án trong tenant/pháp nhân | Nhập mã dự án, tên, loại Solar/BESS/Hybrid, khách hàng, site, mô hình hợp đồng, PM, ngày mục tiêu và currency | Hệ thống tạo ID bất biến, kiểm mã duy nhất, ghi audit và đưa dự án vào đúng portfolio |
| <a id="ac-002"></a> **AC-002** | Một dự án có nhiều pháp nhân và đối tác | Người dùng gán vai trò từ danh mục như chủ đầu tư, EPC, vendor, lender | Mỗi quan hệ có hiệu lực từ–đến, scope và contact; không dùng chuỗi tự do thay thế định danh pháp nhân |
| <a id="ac-003"></a> **AC-003** | Người dùng xem portfolio | Áp bộ lọc tenant/pháp nhân/PM/khách hàng/công nghệ/trạng thái/health | Chỉ dự án trong data scope được trả về; tổng hợp và export dùng cùng bộ lọc/quyền |
| <a id="ac-004"></a> **AC-004** | Dự án có giao dịch hoặc hồ sơ đã ký | Người dùng yêu cầu xóa | Hệ thống từ chối xóa, cho phép đóng/lưu trữ theo quyền và ghi lý do |

<a id="us-002"></a>
### US-002 — PM Command Center và Project Health Score

- **Source:** US-E02; source heading/priority: PM Command Center và Project Health Score (`PFM-*`, `PRJ-*`, `RSK-*`, `COM-*`) — Must/MVP + Differentiator, Dùng chung, Quản lý dự án.
- **Epic → Capability → Feature:** Portfolio & Command Center → PFM, PRJ, RSK, COM → PM Command Center và Project Health Score.
- **Persona:** Project Manager.
- **User story:** As a Project Manager, I want nhìn trong một trang toàn bộ sức khỏe dự án và các việc cần xử lý hôm nay, so that tôi ưu tiên đúng vấn đề có thể ảnh hưởng tiến độ, chi phí, chất lượng, an toàn hoặc COD.
- **Business value:** tôi ưu tiên đúng vấn đề có thể ảnh hưởng tiến độ, chi phí, chất lượng, an toàn hoặc COD.
- **Trace:** BR-032; FR-010…FR-015, FR-019…FR-025, FR-098…FR-114; UC-002; WF-001. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **MVP**; Must/MVP; **8 points preliminary**.
- **Normal flow:** hệ thống tính hàng ngày và theo event, PM lọc “Hôm nay/7 ngày tới”, giao hoặc nhắc action ngay tại nguồn.
- **Exception flow:** dữ liệu thiếu làm confidence giảm, không tự coi là điểm tốt; source sync lỗi hiển thị stale badge; PM được ghi chú/acknowledge nhưng không tự sửa điểm.
- **Permission:** PM xem toàn dự án; lãnh đạo xem portfolio; functional lead drill-down đúng module; bên ngoài chỉ thấy widget được chia sẻ. Công thức/threshold chỉ Product Admin có quyền version hóa, mọi thay đổi có hiệu lực từ ngày xác định và audit.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** Systemization, procedure/criteria, evidence, gate/waiver and signer authority.
- **Risk:** False readiness, immutable-result violation or incomplete handover.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-002

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-005"></a> **AC-005** | Dự án có dữ liệu schedule, cost, quality, safety, procurement, document, contract và commissioning | PM mở Command Center | Hệ thống hiển thị milestone plan/actual/forecast, overdue tasks/approvals/documents, late equipment, committed/paid/EAC, top risks/issues, open NCR/punch, COD gaps, owner và due date |
| <a id="ac-006"></a> **AC-006** | Có chỉ số áp dụng và chỉ số `N/A` | Hệ thống tính Health Score | Hệ thống dùng trọng số 20/15/10/15/10/10/10/10%, tái phân bổ phần `N/A`, hiển thị từng điểm thành phần, dữ liệu nguồn, timestamp và confidence |
| <a id="ac-007"></a> **AC-007** | Tổng điểm được tính | Điểm ≥85, 70–84 hoặc <70 | Màu lần lượt xanh, vàng, đỏ; màu không phải tín hiệu duy nhất mà luôn có nhãn/icon để bảo đảm accessibility |
| <a id="ac-008"></a> **AC-008** | Có stop-work, COD forecast chậm >30 ngày, giấy phép critical hết hiệu lực hoặc failed critical commissioning test | Score engine chạy | Áp hard-cap đã cấu hình, nêu rõ trigger; không cho dữ liệu tích cực khác che lấp tình trạng critical |
| <a id="ac-009"></a> **AC-009** | PM click một chỉ báo | Drill down | Danh sách nguồn dùng cùng snapshot/filter mở ra; PM truy được người chịu trách nhiệm và hành động đề xuất, không phải số tổng hợp “hộp đen” |

<a id="us-003"></a>
### US-003 — WBS, milestone, task và baseline

- **Delivery status:** **Core Implemented/deployed, full story In Progress** ngày 2026-07-12. M1/M2 và core M3 đã có code/migration/unit/deploy evidence; chưa chuyển Done/Pass trước final integration/E2E, M3 close-out và positive rebaseline phụ thuộc US-004/`DB-067`.
- **Source:** US-E03; source heading/priority: WBS, milestone, task và baseline (`PRJ-*`) — Must/MVP, Dùng chung, Quản lý dự án.
- **Epic → Capability → Feature:** Project Controls → PRJ → WBS, milestone, task và baseline.
- **Persona:** Project Planner.
- **User story:** As a Project Planner, I want lập WBS, logic tiến độ, baseline và forecast, so that PM đo được sai lệch và dự báo ngày hoàn thành/COD thay vì chỉ báo cáo phần trăm chủ quan.
- **Business value:** PM đo được sai lệch và dự báo ngày hoàn thành/COD thay vì chỉ báo cáo phần trăm chủ quan.
- **Trace:** BR-018, BR-032; FR-016…FR-021; UC-003; WF-003; direct API-023/024/034…037/140…142; direct DB-012/017…021/101/105; operational dependency DB-102…104; change-control dependency API-038/DB-067; SEC-105…111/118/119; TEST-010…013/185/187/189/190/193…196.
- **Phase/priority/story points:** **MVP**; Must/MVP; **5 points preliminary**.
- **Normal flow:** Project Controls tạo/import draft → API-035 PREVIEW validation/reconciliation → COMMIT atomic → submit initial baseline → approver độc lập quyết định qua API-140 → package owner append progress/evidence → engine tính CPM/variance/forecast/SPI và materialize look-ahead/alert từ committed event.
- **Exception flow:** Preview không ghi; commit lỗi rollback toàn lô; cycle/self/cross-schedule dependency, invalid working day/weight, import quá giới hạn, version conflict và cross-scope bị từ chối bằng stable error. Actual/baseline history không xóa/sửa; correction tạo row mới. Rebaseline thiếu approved `DB-067` cùng tenant/project bị chặn.
- **Permission:** `PROJECT_CONTROLS` tạo/sửa schedule; `PACKAGE_OWNER` chỉ cập nhật task thuộc package được gán; `PROJECT_MANAGER`/`PMO`/Baseline Approver quyết định theo policy; creator/submitter không tự approve và delegation không bypass SoD; viewer/export luôn tenant/project/package scoped.
- **Audit:** COMMIT/submit/decision/progress/correction ghi actor/effective actor, tenant/project/package, object/version, result/reason, correlation và snapshot hash khi áp dụng. PREVIEW không ghi audit nghiệp vụ.
- **Notification:** Chỉ committed event qua `DB-102…104` tạo `DB-105`; delivery retry/DLQ không auto-approve, rollback baseline hoặc đóng source state.
- **Dependencies:** Direct: project/package `DB-012`, schedule records `DB-017…021/101/105`. Operational: M1 `DB-102…104` để AC-013 giao cảnh báo bền vững. Change control: US-004/API-038/`DB-067` để positive rebaseline AC-012; initial baseline và negative AC-012 vẫn độc lập.
- **Risk:** CPM/calendar sai, weight/progress không nhất quán, baseline bị ghi đè, self-approval, import một phần, duplicate notification hoặc cross-tenant/project/package leakage.
- **Story-specific DoR:** **Met cho implementation start** — state, calendar, CPM, weight, import, permission/SoD, API/data/error/config/UX/test contract đã khóa trong artefact liên quan; dependency còn lại được ghi rõ và không bị trình bày như đã Implemented.
- **Story-specific DoD:** Standard DoD + AC-010…013; migration/rollback, API compatibility, tenant/project/package negative, SoD, cycle/weight/CPM, immutable baseline/progress, concurrency/idempotency, outbox/DLQ, accessibility và deployment evidence phải Pass. Positive AC-012 và end-to-end AC-013 không được waive.
- **Technical Tasks:** implement `DB-101`/schedule aggregate và repository; concrete API-023/024/034…037/140…142; day-level calendar + FS/SS/FF/SF/lag + CPM; preview/commit import reconciliation; immutable baseline SHA-256 + independent decision; append-only progress/SPI/history; package scope policy; Gantt-lite/mobile boundary; Dashboard alert/audited CSV; committed outbox/notification integration; automated unit/integration/E2E/security/performance/rollback tests; observability/runbook/deploy.
- **Approved configuration:** `SCHEDULE_NEAR_CRITICAL_FLOAT_DAYS=5` (0…30), `SCHEDULE_DEFAULT_LOOKAHEAD_DAYS=21` (1…180), `SCHEDULE_IMPORT_MAX_ROWS=5000` (1…20000), `SCHEDULE_MAX_ABS_LAG_DAYS=3650` (0…3650); invalid/missing value fails startup. One explicit project schedule calendar/IANA timezone; không tự suy diễn ngày nghỉ quốc gia.

#### Acceptance Criteria for US-003

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-010"></a> **AC-010** | Dự án đã khởi tạo | Planner tạo/import WBS, task, milestone, calendar, dependency, owner và weight | Hệ thống kiểm cycle, ngày không hợp lệ, tổng weight theo rule và lưu draft schedule |
| <a id="ac-011"></a> **AC-011** | Baseline đã được phê duyệt | Planner cập nhật actual start/finish, remaining duration và progress evidence | Hệ thống giữ nguyên baseline, tính variance và forecast; không ghi đè lịch sử |
| <a id="ac-012"></a> **AC-012** | Thay đổi ảnh hưởng milestone kiểm soát/COD | Người dùng xin rebaseline | Workflow yêu cầu reason, impact, change approval và approver đúng thẩm quyền trước khi tạo baseline version mới |
| <a id="ac-013"></a> **AC-013** | Task quá hạn hoặc float dưới ngưỡng | Schedule engine chạy | Owner/PM nhận cảnh báo; task xuất hiện trong Command Center và báo cáo look-ahead |

<a id="us-004"></a>
### US-004 — Risk, issue và change control

- **Source:** US-E04; source heading/priority: Risk, issue và change control (`RSK-*`, `PRJ-*`, `CST-*`) — Must/MVP, Dùng chung, Quản lý dự án.
- **Epic → Capability → Feature:** Risk/Issue/Change → RSK, PRJ, CST → Risk, issue và change control.
- **Persona:** Project Manager.
- **User story:** As a Project Manager, I want quản lý riêng risk, issue và change nhưng liên kết chúng, so that đội dự án xử lý đúng bản chất và lượng hóa ảnh hưởng trước khi ra quyết định.
- **Business value:** đội dự án xử lý đúng bản chất và lượng hóa ảnh hưởng trước khi ra quyết định.
- **Trace:** BR-022, BR-031, BR-032; FR-098…FR-105; UC-004; WF-015/WF-021. API/DB/SEC follow related artefacts; TEST forward reference.
- **Direct/dependency boundary:** AC-014…017 materialize Risk/Issue/Change qua `DB-065…067/112` và `API-038/143…158`; Project Controls sở hữu reverse baseline query `API-159`; `DB-068 Claim/FR-103` chờ Contract/Legal slice, còn external-source adapters của FR-105 chờ delivery/obligation/NCR/punch. Không dependency nào được trình bày như story implementation đã Pass.
- **Phase/priority/story points:** **MVP**; Must/MVP; **5 points preliminary**.
- **Normal flow:** team ghi nhận, PM phân tích/assign, owner thực hiện response, risk owner đánh giá residual và PM/committee đóng.
- **Exception flow:** confidential legal/commercial risk bị giới hạn nhóm; duplicate được link/merge nhưng không mất audit; overdue critical tự escalation.
- **Permission:** mọi thành viên được đề xuất theo phạm vi; PM/risk manager chỉnh taxonomy và owner; only approver đóng high/critical; bên ngoài chỉ xem item được chia sẻ rõ ràng.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** Finance rules, contract/legal entities, decimal/FX and ERP ownership.
- **Risk:** Risk/Issue bị trộn; package-only assignment bị nâng thành project-wide; closure/change tự duyệt; approved impact hoặc baseline bị ghi đè; alert duplicate/stale recipient; Claim bị hiểu nhầm là đã hoàn thành.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** implement `DB-065…067/112` và generalize DB-105 projection; concrete `API-038/143…159`; pure exposure/state policy; tenant/project/package scope + granular permission/SoD/version/idempotency; Risk Occurred→Issue link; action/history/closure; Change source/evidence/impact/decision; public approved-change reader + positive rebaseline/reverse trace; worker dedup alert; Vue register/Command Center; unit/integration/E2E/security/migration/rollback/deploy evidence.
- **Approved configuration:** probability và cost/schedule/HSE impact integer 1…5; server tính `impactRating=max(dimensions)` rồi exposure = probability × impactRating; money `numeric(19,4)` + currency; `RISK_HIGH_EXPOSURE_THRESHOLD=15`, `RISK_CRITICAL_EXPOSURE_THRESHOLD=20`, `RISK_ACTION_ALERT_SCAN_INTERVAL_MS=60000`, `RISK_THRESHOLD_VERSION=RISK_THRESHOLDS_V1`; invalid/range-inconsistent value fails startup. Permissions `riskChange.read/create/manage/submit/approve/requestClosure/close/closeCritical`; mọi closure cần evidence, verified actions và approver khác creator/owner/requester; package-only assignment chỉ exact package, Change approval/project-level item cần full-project scope.

#### Acceptance Criteria for US-004

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-014"></a> **AC-014** | Người dùng ghi nhận sự kiện chưa xảy ra hoặc đã xảy ra | Chọn loại Risk hoặc Issue | Hệ thống yêu cầu probability/impact cho Risk, actual impact/root cause cho Issue và không trộn hai register |
| <a id="ac-015"></a> **AC-015** | Risk/Issue có response/action | Owner cập nhật status, due date, residual rating và evidence | Hệ thống giữ history, cảnh báo overdue và cập nhật top risks/issues tại Command Center |
| <a id="ac-016"></a> **AC-016** | Issue/risk tạo thay đổi scope/cost/time/design | PM chọn “Tạo change request” | Hệ thống sao chép liên kết/bằng chứng, không tự phê duyệt thay đổi và duy trì traceability hai chiều |
| <a id="ac-017"></a> **AC-017** | Người dùng muốn đóng item | Gửi closure | Approver xác nhận response/evidence; risk đỏ hoặc issue critical không thể đóng chỉ bằng comment |

<a id="us-005"></a>
### US-005 — Document register, revision và transmittal

- **Source:** US-E05; source heading/priority: Document register, revision và transmittal (`DOC-*`) — Must/MVP, Dùng chung, Quản lý dự án.
- **Epic → Capability → Feature:** Document Control → DOC → Document register, revision và transmittal.
- **Persona:** Document Controller.
- **User story:** As a Document Controller, I want quản lý mã, revision, trạng thái, transmittal và liên kết của tài liệu, so that mọi bên dùng đúng bản và có bằng chứng phát hành/phản hồi.
- **Business value:** mọi bên dùng đúng bản và có bằng chứng phát hành/phản hồi.
- **Trace:** BR-003, BR-009, BR-011, BR-012, BR-019, BR-026, BR-035; FR-026…FR-035; UC-005; WF-004…006. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **MVP**; Must/MVP; **8 points preliminary**.
- **Normal flow:** upload → kiểm tra mã/metadata → review/approve → phát hành transmittal → nhận response → revise/close.
- **Exception flow:** virus, file hỏng, mã trùng hoặc revision nhảy sai bị quarantine/return; OCR failure không chặn lưu nhưng gắn trạng thái; legal hold chặn xóa.
- **Permission:** Document Controller quản lý register/phát hành; originator sửa draft; approver duyệt; recipient bên ngoài chỉ thấy gói được chia sẻ; download/sign/share là các quyền riêng, không suy ra từ quyền view.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** DMS coding/ACL, object storage, malware scanner and reviewer matrix.
- **Risk:** Malware release, revision conflict or external disclosure.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-005

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-018"></a> **AC-018** | Người dùng upload tài liệu | Chọn loại, discipline, project, originator và purpose | Hệ thống sinh/kiểm mã theo quy tắc, quét file, trích metadata/OCR khi bật và tạo revision đầu |
| <a id="ac-019"></a> **AC-019** | Tài liệu đã Approved/Issued | Người có quyền cần sửa | Hệ thống bắt tạo revision mới; bản cũ khóa, mang watermark `Superseded` khi xem/tải sau khi bị thay thế |
| <a id="ac-020"></a> **AC-020** | Document Controller phát hành transmittal | Chọn recipient/action/due date | Hệ thống snapshot đúng revision, áp quyền tải/preview/watermark, lưu delivery receipt và theo dõi response SLA |
| <a id="ac-021"></a> **AC-021** | Người dùng tìm kiếm | Nhập từ khóa và bộ lọc | Full-text/OCR chỉ trả kết quả mà người dùng có quyền với cả tài liệu và revision; snippet không làm lộ nội dung bị cấm |
| <a id="ac-022"></a> **AC-022** | Tài liệu liên kết task/milestone/contract/equipment/vendor | Mở một đối tượng nguồn | Người dùng thấy đúng liên kết và revision hiện hành nhưng lịch sử vẫn truy được theo quyền |

<a id="us-006"></a>
### US-006 — Hợp đồng, phụ lục, nghĩa vụ và bảo lãnh

- **Source:** US-E06; source heading/priority: Hợp đồng, phụ lục, nghĩa vụ và bảo lãnh (`CTR-*`, `DOC-*`) — Must/MVP + Differentiator, Dùng chung, Quản lý dự án.
- **Epic → Capability → Feature:** Contract & Legal → CTR, DOC → Hợp đồng, phụ lục, nghĩa vụ và bảo lãnh.
- **Persona:** Contract Manager.
- **User story:** As a Contract Manager, I want theo dõi hợp đồng, nhiều phụ lục, nghĩa vụ, điều kiện tiên quyết và bảo lãnh theo pháp nhân, so that dự án không bỏ lỡ quyền, thời hạn hoặc điều kiện thanh toán/COD.
- **Business value:** dự án không bỏ lỡ quyền, thời hạn hoặc điều kiện thanh toán/COD.
- **Trace:** BR-009…BR-011, BR-022, BR-026, BR-030; FR-036…FR-044; UC-006; WF-008/009. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **MVP**; Must/MVP; **8 points preliminary**.
- **Normal flow:** tạo draft → review/legal approval → ký → theo dõi nghĩa vụ/bảo lãnh → amendment khi thay đổi → close-out.
- **Exception flow:** phụ lục chưa effective không làm đổi contract value; pháp nhân đổi tên không làm thay snapshot văn bản cũ; nghĩa vụ tranh chấp giữ trạng thái riêng và legal access.
- **Permission:** Contract/Legal tạo và sửa draft; signatory ký; PM xem và quản lý action nhưng không thay văn bản ký; vendor/client chỉ xem hợp đồng hoặc nghĩa vụ mình là bên liên quan.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** Legal master/signer authority, DMS/e-sign and effective policy.
- **Risk:** Invalid party snapshot, privilege leak or signed record overwrite.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-006

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-023"></a> **AC-023** | Người dùng tạo hợp đồng | Chọn dự án, số hợp đồng, loại, các bên, payer, currency, value, ngày và người ký | Hệ thống kiểm số hợp đồng duy nhất trong dự án; dùng ID pháp nhân ổn định và lưu snapshot pháp lý/người ký tại thời điểm ký |
| <a id="ac-024"></a> **AC-024** | Hợp đồng có nhiều phụ lục | Tạo amendment/addendum | Mỗi phụ lục liên kết hợp đồng gốc, có số/revision/effective date riêng; giá trị hiện hành được tính từ chuỗi văn bản có hiệu lực |
| <a id="ac-025"></a> **AC-025** | Contract Manager ghi nghĩa vụ/CP/bảo lãnh | Gán owner, beneficiary, due/expiry, evidence và consequence | Hệ thống cảnh báo theo mốc, hiển thị overdue/at-risk tại dashboard và không tự đóng khi chỉ upload tệp chưa duyệt |
| <a id="ac-026"></a> **AC-026** | Văn bản đã ký | Người dùng thay thông tin parties/value/date | Hệ thống từ chối sửa tại chỗ; yêu cầu amendment/correction có approval và audit |
| <a id="ac-027"></a> **AC-027** | Đến thời điểm payment/COD | Hệ thống đánh giá điều kiện | Condition bắt buộc chưa đạt tạo hold có giải thích; waiver chỉ theo workflow và không dùng cho điều kiện an toàn/pháp lý bị cấm |

<a id="us-007"></a>
### US-007 — Ngân sách, commitment, payment và multi-currency

- **Source:** US-E07; source heading/priority: Ngân sách, commitment, payment và multi-currency (`CST-*`, `CTR-*`) — Must/MVP, Dùng chung, Quản lý dự án.
- **Epic → Capability → Feature:** Cost & Payment → CST, CTR → Ngân sách, commitment, payment và multi-currency.
- **Persona:** Cost Controller.
- **User story:** As a Cost Controller, I want theo dõi budget, commitment, actual, payment và estimate-at-completion theo cost code/currency, so that PM biết sớm vượt ngân sách và Finance thanh toán đúng hợp đồng.
- **Business value:** PM biết sớm vượt ngân sách và Finance thanh toán đúng hợp đồng.
- **Trace:** BR-007, BR-015, BR-030, BR-033; FR-053…FR-060, FR-138…FR-155; UC-007; WF-014. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **MVP**; Must/MVP; **8 points preliminary**.
- **Normal flow:** lập baseline → reserve budget khi PR → commitment khi PO/hợp đồng effective → chứng nhận/payment → đối soát bank/accounting → cập nhật EAC.
- **Exception flow:** invoice trùng, bank detail mới, VAT sai, FX thiếu, legal hold hoặc contract cap exceeded chặn gửi/chi; adjustment phải là bút toán riêng, không sửa giao dịch đã đối soát.
- **Permission:** Cost Controller quản lý forecast; Finance kiểm/chi; PM đề xuất/chứng nhận theo RACI; approver theo hạn mức; vendor chỉ thấy payment của mình; dữ liệu lương/nhạy cảm có field-level restriction.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** Finance rules, contract/legal entities, decimal/FX and ERP ownership.
- **Risk:** Incorrect money, cross-currency sum, duplicate/self-approved payment.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-007

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-028"></a> **AC-028** | Baseline ngân sách được duyệt | PO/contract/payment/change phát sinh | Hệ thống cập nhật budget/commitment/actual/forecast theo event, chống ghi nhận trùng và giữ drill-down tới chứng từ |
| <a id="ac-029"></a> **AC-029** | Payment được tạo | Người dùng gửi duyệt | `contractId`, payer, payee, currency, gross, VAT, deductions, net, milestone và evidence là bắt buộc; hệ thống kiểm lũy kế không vượt văn bản có hiệu lực |
| <a id="ac-030"></a> **AC-030** | Có giao dịch USD và báo cáo VND | Cost Controller chọn kỳ/tỷ giá policy | Hệ thống giữ số gốc theo currency, lưu exchange-rate snapshot và hiển thị quy đổi; không cộng trực tiếp số tiền khác currency |
| <a id="ac-031"></a> **AC-031** | PM là requester/chứng nhận khoản chi | Workflow tìm approver | PM bị loại khỏi bước phê duyệt bị SoD cấm; hệ thống chọn approver hợp lệ tiếp theo hoặc báo thiếu cấu hình |
| <a id="ac-032"></a> **AC-032** | Forecast EAC vượt budget/contingency threshold | Cost engine tính | Cảnh báo xuất hiện tại Command Center và yêu cầu change/management action, không tự tăng budget |

<a id="us-008"></a>
### US-008 — Procurement và logistics tracker

- **Source:** US-E08; source heading/priority: Procurement và logistics tracker (`PRC-*`, `LOG-*`, `ENG-*`) — Must/MVP, Dùng chung với trường riêng Solar/BESS, Quản lý dự án.
- **Epic → Capability → Feature:** Procurement → PRC, LOG, ENG → Procurement và logistics tracker.
- **Persona:** Procurement Manager.
- **User story:** As a Procurement Manager, I want theo dõi từ PR/RFQ/đánh giá/PO đến sản xuất, FAT, vận chuyển và giao nhận, so that tôi cảnh báo sớm thiết bị giao chậm ảnh hưởng đường găng.
- **Business value:** tôi cảnh báo sớm thiết bị giao chậm ảnh hưởng đường găng.
- **Trace:** BR-015…BR-017; FR-045…FR-052, FR-061…FR-074; UC-008; WF-010…013. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **MVP**; Must/MVP; **8 points preliminary**.
- **Normal flow:** PR → RFQ → technical/commercial evaluation → vendor/purchase approval → PO → expediting/FAT → logistics → receipt/inspection/warranty.
- **Exception flow:** partial delivery tạo line/lot riêng; serial trùng, shortage/damage hoặc failed FAT tạo hold/NCR; thay đổi ETA không được sửa baseline cam kết mà lưu forecast/history.
- **Permission:** Buyer quản lý sourcing; kỹ thuật chỉ chấm kỹ thuật; Finance xem thương mại theo RACI; vendor scope theo package; award/PO theo hạn mức và SoD.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** Approved design/demand/budget, supplier, ERP/carrier and serial policy.
- **Risk:** Bid leak, SoD conflict, late/partial/damaged delivery or duplicate serial.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-008

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-033"></a> **AC-033** | BOM/requisition đã duyệt | Buyer tạo sourcing event | RFQ dùng đúng revision/specification, chỉ mời vendor đủ phạm vi/hiệu lực và lưu clarification/addendum cho mọi bidder |
| <a id="ac-034"></a> **AC-034** | Có nhiều báo giá | Hội đồng đánh giá | Technical và commercial score tách theo rule, normalized currency/TCO có basis; override bắt buộc lý do/audit |
| <a id="ac-035"></a> **AC-035** | PO effective | Expeditor cập nhật manufacture/FAT/shipping/ETA/site receipt | Tracker hiển thị plan/forecast/actual, serial, CO/CQ/packing/invoice/BL/customs/warranty và thiếu/lỗi/thay thế |
| <a id="ac-036"></a> **AC-036** | Forecast delivery vượt required-on-site hoặc ảnh hưởng critical task | Schedule/procurement engine chạy | PM, buyer và owner nhận cảnh báo mức độ/impact; Command Center hiển thị thiết bị và hành động giảm thiểu |
| <a id="ac-037"></a> **AC-037** | Supplier đăng nhập portal | Mở package | Chỉ RFQ/PO/submittal/delivery của supplier đó được trả về; không thấy bid của đối thủ, ngân sách nội bộ hoặc package khác |

<a id="us-009"></a>
### US-009 — Nhật ký hiện trường và xác nhận khối lượng trên PWA

- **Source:** US-E09; source heading/priority: Nhật ký hiện trường và xác nhận khối lượng trên PWA (`CON-*`, `PRJ-*`) — Must/MVP, Dùng chung, Quản lý dự án.
- **Epic → Capability → Feature:** Construction → CON, PRJ → Nhật ký hiện trường và xác nhận khối lượng trên PWA.
- **Persona:** Site Engineer.
- **User story:** As a Site Engineer, I want ghi nhật ký, khối lượng, nhân lực, máy móc, vật tư và ảnh theo công việc/khu vực ngay tại hiện trường, so that báo cáo tiến độ có bằng chứng và không phải nhập lại từ giấy/Excel.
- **Business value:** báo cáo tiến độ có bằng chứng và không phải nhập lại từ giấy/Excel.
- **Trace:** BR-018…BR-020, BR-033; FR-075…FR-084, FR-151…FR-155; UC-009; WF-001/019. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **MVP**; Must/MVP; **8 points preliminary**.
- **Normal flow:** tải work package → nhập nhật ký/ảnh/khối lượng → sync → supervisor kiểm và ký → planner/QA/Cost dùng dữ liệu đã xác nhận.
- **Exception flow:** xung đột offline, ảnh quá lớn, quyền bị thu hồi hoặc WBS đã đóng được đưa vào hàng lỗi để xử lý, không silently discard; timestamp thiết bị lệch được giữ nhưng gắn cờ.
- **Permission:** Site Engineer tạo trong area/package được giao; Supervisor duyệt; subcontractor chỉ thấy gói mình; PM xem toàn dự án; HSE/QA truy cập record liên quan nhưng không sửa nhật ký đã ký.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** Project/site/package, PWA/offline policy and workfront readiness.
- **Risk:** Offline conflict, evidence loss or unsafe workfront.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-009

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-038"></a> **AC-038** | Người dùng đã tải trước work package được phép | Mất mạng và tạo nhật ký/ảnh/checklist | PWA lưu mã hóa cục bộ, hiển thị trạng thái `Chưa đồng bộ` và tự đưa vào offline queue, không tuyên bố đã gửi server |
| <a id="ac-039"></a> **AC-039** | Kết nối trở lại | Người dùng sync | Server kiểm quyền hiện tại, duplicate và conflict; bản ghi nhận server timestamp, nguồn thiết bị và kết quả sync |
| <a id="ac-040"></a> **AC-040** | Site Engineer khai khối lượng | Chọn WBS/area/date/unit và đính kèm evidence | Hệ thống kiểm đơn vị, giới hạn BOQ/remaining quantity và gửi xác nhận thay vì tự cộng vào earned progress |
| <a id="ac-041"></a> **AC-041** | Người dùng chụp/upload ảnh | Gắn project/area/WBS/date/category | Hệ thống giữ file gốc, metadata được phép, thumbnail và audit; vị trí GPS chỉ thu khi có policy/consent |
| <a id="ac-042"></a> **AC-042** | Supervisor ký nhật ký ngày | Ngày đã chốt | Bản ghi khóa; sửa sau đó tạo correction revision có lý do và phê duyệt |

<a id="us-010"></a>
### US-010 — ITP, inspection, NCR và punch list

- **Source:** US-E10; source heading/priority: ITP, inspection, NCR và punch list (`QAC-*`, `CON-*`) — Must/MVP + Safety, Dùng chung, Quản lý dự án.
- **Epic → Capability → Feature:** Quality → QAC, CON → ITP, inspection, NCR và punch list.
- **Persona:** QA/QC Manager.
- **User story:** As a QA/QC Manager, I want quản lý ITP, hold/witness point, inspection, NCR và punch list theo hệ thống/thiết bị, so that công việc không đạt không bị che khuất hoặc chuyển sang commissioning/COD.
- **Business value:** công việc không đạt không bị che khuất hoặc chuyển sang commissioning/COD.
- **Trace:** BR-021, BR-023…BR-026; FR-091…FR-097; UC-010; WF-017/018. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **MVP**; Must/MVP; **8 points preliminary**.
- **Normal flow:** phê duyệt ITP → IR → inspection → pass hoặc NCR/punch → corrective action → reinspection → close/turnover.
- **Exception flow:** hold point bị bỏ qua tạo critical exception; concession/use-as-is cần Engineering/Client; lỗi lặp kích hoạt systemic CAPA.
- **Permission:** Contractor tạo IR/action; QA/QC quyết định result; Engineering duyệt technical disposition; Client witness/approve theo ITP; người làm rework không tự xác minh đóng NCR nếu SoD yêu cầu độc lập.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** ITP/current revision, acceptance criteria, witness and verifier authority.
- **Risk:** Hold-point bypass or contractor self-closure.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-010

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-043"></a> **AC-043** | ITP/checklist được phê duyệt | Nhà thầu gửi IR | Hệ thống kiểm notice time, IFC/material/calibration và open hold; thiếu điều kiện thì trả lại có lý do |
| <a id="ac-044"></a> **AC-044** | Inspection không đạt | QA/QC ghi failed item | Theo severity, hệ thống tạo punch hoặc NCR, hold affected scope và liên kết ảnh/serial/location/specification |
| <a id="ac-045"></a> **AC-045** | Nhà thầu hoàn tất corrective action | Gửi reinspection | Hệ thống giữ lần kiểm cũ, yêu cầu evidence và approver độc lập; chỉ failed item được tái kiểm nhưng kết quả tổng thể tính đúng |
| <a id="ac-046"></a> **AC-046** | NCR critical hoặc Punch A đang mở | Người dùng yêu cầu nghiệm thu/commissioning/COD | Gate bị chặn với danh sách item và owner; waiver chỉ nếu rule cho phép và không vi phạm safety/statutory requirement |
| <a id="ac-047"></a> **AC-047** | Người dùng đóng NCR | Evidence Pass và CAPA được xác minh | Hệ thống release hold, cập nhật trend/repeat finding và ghi chữ ký/audit |

<a id="us-011"></a>
### US-011 — Permit to Work, inspection và incident HSE

- **Source:** US-E11; source heading/priority: Permit to Work, inspection và incident HSE (`HSE-*`, `CON-*`) — Must/MVP + Safety, Dùng chung với kiểm soát đặc thù BESS, Quản lý dự án.
- **Epic → Capability → Feature:** HSE → HSE, CON → Permit to Work, inspection và incident HSE.
- **Persona:** HSE Manager.
- **User story:** As a HSE Manager, I want kiểm soát PTW/JSA, inspection, toolbox, incident, near-miss và stop-work, so that không công việc nào tiếp tục khi critical control chưa bảo đảm.
- **Business value:** không công việc nào tiếp tục khi critical control chưa bảo đảm.
- **Trace:** BR-020, BR-025, BR-026, BR-032; FR-081, FR-085…FR-090; UC-011; WF-019/020. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **MVP**; Must/MVP; **8 points preliminary**.
- **Normal flow:** plan/JSA → PTW approval → toolbox/check-in → execute/inspect → close permit; hoặc report event → containment → investigate → CAPA → verify/close.
- **Exception flow:** emergency có thể stop-work ngay không cần approval; report ẩn danh được bảo vệ; dữ liệu sức khỏe/cá nhân giới hạn; offline report P1 phải hiển thị yêu cầu gọi khẩn cấp thay vì chờ sync.
- **Permission:** mọi người có quyền báo nguy/stop-work; HSE quản lý điều tra; Site/Authorized Operator phát hành permit theo loại; chỉ nhóm need-to-know xem dữ liệu cá nhân; lãnh đạo xem bản tổng hợp.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** HSE authority, restricted-data policy, PTW/isolation and emergency process.
- **Risk:** Safety bypass, privacy leak or delayed incident response.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-011

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-048"></a> **AC-048** | Công việc cần permit | Supervisor gửi PTW với JSA, people, equipment, isolation, area và time window | Hệ thống kiểm competency, permit conflict, prerequisite và approver; permit có QR/ID và thời hạn |
| <a id="ac-049"></a> **AC-049** | Permit đã phát hành | Hết thời hạn, điều kiện đổi hoặc emergency xảy ra | Permit tự chuyển `Hết hiệu lực/Tạm dừng`, cảnh báo site; phải revalidate/reissue trước khi làm tiếp |
| <a id="ac-050"></a> **AC-050** | Người dùng báo incident/near-miss | Chọn severity/potential severity | Hệ thống ưu tiên hướng dẫn gọi khẩn cấp, sau đó ghi timestamp/location/evidence và kích hoạt call tree/escalation |
| <a id="ac-051"></a> **AC-051** | Stop-work đang hoạt động | Bất kỳ workflow yêu cầu lift/restart | Chỉ HSE Manager cùng authority bắt buộc có thể duyệt sau khi CAPA/critical control được xác minh; PM không tự lift |
| <a id="ac-052"></a> **AC-052** | HSE dashboard được mở | Người dùng xem trend | Hiển thị man-hours, inspection/finding, incident/near-miss, overdue CAPA và leading/lagging indicators theo data scope |

<a id="us-012"></a>
### US-012 — Commissioning package và test có kiểm soát

- **Source:** US-E12; source heading/priority: Commissioning package và test có kiểm soát (`COM-*`, `QAC-*`, `ENG-*`) — Must/MVP + Differentiator, Solar/BESS, Quản lý dự án.
- **Epic → Capability → Feature:** Commissioning & COD → COM, QAC, ENG → Commissioning package và test có kiểm soát.
- **Persona:** Commissioning Manager.
- **User story:** As a Commissioning Manager, I want quản lý system/subsystem, prerequisite, test procedure, kết quả và turnover dossier, so that chỉ hệ thống đủ điều kiện mới được energize, test và trình COD.
- **Business value:** chỉ hệ thống đủ điều kiện mới được energize, test và trình COD.
- **Trace:** BR-023…BR-025; FR-106…FR-112; UC-012; WF-022. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **MVP**; Must/MVP; **8 points preliminary**.
- **Normal flow:** define package → readiness review → approve procedure → pre-commissioning → energization permit → functional/performance test → dossier/turnover.
- **Exception flow:** test aborted lưu kết quả `Aborted`, lý do và safe state, không coi Pass/Fail; quality flag telemetry xấu làm kết quả `Inconclusive`; retest là run mới.
- **Permission:** Commissioning lập/chạy workflow; Engineering/HSE/Client approve/witness; Authorized Operator duy nhất thao tác OT; Document Control khóa dossier; viewer không sửa raw result.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** Systemization, procedure/criteria, evidence, gate/waiver and signer authority.
- **Risk:** False readiness, immutable-result violation or incomplete handover.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-012

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-053"></a> **AC-053** | System/subsystem đã định danh | Lập commissioning package | Mọi test trace tới tag/serial, approved revision, acceptance criteria, witness và contractual requirement |
| <a id="ac-054"></a> **AC-054** | Có Punch A, critical NCR, permit/fire/grid clearance thiếu | Người dùng yêu cầu ready/energize | Hệ thống chặn gate và liệt kê evidence thiếu; không cho override bằng comment chung |
| <a id="ac-055"></a> **AC-055** | Test được thực hiện | Team nhập/import raw result | Hệ thống giữ raw data bất biến, instrument/calibration, thời gian, người chứng kiến; result tính theo acceptance criteria version được duyệt |
| <a id="ac-056"></a> **AC-056** | Test Fail | Người dùng kết thúc test | Package giữ `Failed`, tạo issue/NCR và hard-cap Health Score; retest chỉ sau approved corrective action |
| <a id="ac-057"></a> **AC-057** | BESS test cần thao tác PCS/BMS/EMS | Người dùng mở web PM | Web chỉ hiển thị request/status/read-only data; không có endpoint/nút điều khiển; thao tác xảy ra trong OT bởi Authorized Operator |

<a id="us-013"></a>
### US-013 — COD readiness và bàn giao O&M

- **Source:** US-E13; source heading/priority: COD readiness và bàn giao O&M (`COM-*`, `CTR-*`, `DOC-*`, `OMM-*`) — Must/MVP + Differentiator, Solar/BESS, Quản lý dự án.
- **Epic → Capability → Feature:** Commissioning & COD → COM, CTR, DOC, OMM → COD readiness và bàn giao O&M.
- **Persona:** Project Manager.
- **User story:** As a Project Manager, I want một checklist COD có bằng chứng, owner và gate liên phòng ban, so that quyết định COD minh bạch và hồ sơ/tài sản được bàn giao đầy đủ sang O&M.
- **Business value:** quyết định COD minh bạch và hồ sơ/tài sản được bàn giao đầy đủ sang O&M.
- **Trace:** BR-023…BR-026; FR-109…FR-114, FR-026…FR-044; UC-013; WF-023. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **MVP**; Must/MVP; **8 points preliminary**.
- **Normal flow:** baseline checklist → collect/review evidence → gap closure → gate review → sign COD → activate O&M/billing → close post-COD obligations.
- **Exception flow:** conditional COD chỉ theo hợp đồng và không hợp thức hóa thiếu safety/statutory item; open punch minor giữ owner/deadline; revoked signature làm certificate invalid và kích hoạt legal workflow.
- **Permission:** condition owner upload; functional lead review; committee recommend; authorized legal representatives sign; O&M/Finance accept scope mình; khách hàng/nhà tài trợ xem certificate/evidence theo agreement.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** Accepted handover, asset registry, O&M/CMMS ownership and PTW rules.
- **Risk:** Stale alarms, SLA ambiguity, unsafe close or source-state confusion.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-013

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-058"></a> **AC-058** | Hợp đồng/quy định xác định điều kiện COD | PM thiết lập checklist | Mỗi điều kiện có nguồn, loại bắt buộc/waivable/info, reviewer, evidence, due date và consequence |
| <a id="ac-059"></a> **AC-059** | Owner nộp evidence | Functional reviewer thẩm tra | Trạng thái Pass/Fail/Conditional lưu người, thời gian, comment và revision; file hết hạn/superseded không được Pass |
| <a id="ac-060"></a> **AC-060** | Critical condition thiếu, stop-work, permit critical hết hạn hoặc failed critical test | COD Committee review | Recommendation bắt buộc `No-go/Chờ bổ sung`; không được waiver |
| <a id="ac-061"></a> **AC-061** | 100% điều kiện bắt buộc Pass và waiver hợp lệ | Signatories ký COD | Hệ thống khóa certificate, lưu snapshot pháp nhân/người ký/effective time và chuyển project state `Đã COD` |
| <a id="ac-062"></a> **AC-062** | COD hoàn tất | O&M/Finance nhận bàn giao | Asset/serial, warranty, spare, SLA, manual/as-built, training, monitoring account và billing basis được chuyển với acceptance record |

<a id="us-014"></a>
### US-014 — O&M work order, warranty và SLA

- **Source:** US-E14; source heading/priority: O&M work order, warranty và SLA (`OMM-*`, `HSE-*`) — Should/Differentiator, Dùng chung với dữ liệu Solar/BESS, Giám sát vận hành.
- **Epic → Capability → Feature:** O&M → OMM, HSE → O&M work order, warranty và SLA.
- **Persona:** O&M Dispatcher.
- **User story:** As an O&M Dispatcher, I want biến alarm/yêu cầu/bảo trì định kỳ thành work order có SLA, an toàn, vật tư và lịch sử tài sản, so that sự cố được xử lý đúng ưu tiên và đo được hiệu quả dịch vụ.
- **Business value:** sự cố được xử lý đúng ưu tiên và đo được hiệu quả dịch vụ.
- **Trace:** BR-027…BR-030, BR-040; FR-115…FR-124, FR-165…FR-170; UC-014; WF-024/025. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **Release 1**; Should/R1; **8 points preliminary**.
- **Normal flow:** request/alarm → triage → assign → permit → execute → test/return → customer confirmation → close/reliability review.
- **Exception flow:** P1 call tree không phụ thuộc email; failed test giữ WO mở; spare thiếu hoặc warranty dispute tạo linked action; duplicate alarms gom nhóm nhưng giữ mọi event nguồn.
- **Permission:** Dispatcher phân công; Technician cập nhật WO được giao; Authorized Operator điều khiển OT và return-to-service; Customer chỉ xem/confirm WO site mình; vendor chỉ xem warranty case được giao.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** Accepted handover, asset registry, O&M/CMMS ownership and PTW rules.
- **Risk:** Stale alarms, SLA ambiguity, unsafe close or source-state confusion.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-014

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-063"></a> **AC-063** | Alarm read-only, yêu cầu khách hàng hoặc PM plan phát sinh | Dispatcher triage | Hệ thống chống trùng, gán asset/severity/SLA/warranty và tạo WO với response/resolution target |
| <a id="ac-064"></a> **AC-064** | WO cần vào khu vực/thiết bị nguy hiểm | Technician chuẩn bị làm | PTW/JSA/LOTO/competency là prerequisite; thiếu điều kiện thì không chuyển `Đang thực hiện` |
| <a id="ac-065"></a> **AC-065** | Technician hoàn thành | Gửi work log, parts, readings, ảnh, test và downtime | Authorized Operator xác nhận return-to-service, requester/customer sign-off theo SLA trước closure |
| <a id="ac-066"></a> **AC-066** | Resolution/response quá SLA | Đồng hồ SLA chạy | Escalation theo severity, breach reason bắt buộc và báo cáo customer/investor theo quyền |
| <a id="ac-067"></a> **AC-067** | Lỗi lặp/degradation vượt ngưỡng | Reliability engine phân tích | Tạo recommendation/CAPA/warranty claim; không tự thay setpoint hoặc lịch charge-discharge |

<a id="us-015"></a>
### US-015 — Workflow phê duyệt cấu hình linh hoạt

- **Source:** US-E15; source heading/priority: Workflow phê duyệt cấu hình linh hoạt (`WFL-*`) — Must/MVP, Dùng chung, Quản lý dự án.
- **Epic → Capability → Feature:** Workflow → WFL → Workflow phê duyệt cấu hình linh hoạt.
- **Persona:** Process Administrator.
- **User story:** As a Process Administrator, I want cấu hình workflow theo loại hồ sơ, dự án, phòng ban, pháp nhân và ngưỡng giá trị, so that quy trình được chuẩn hóa nhưng vẫn phù hợp thẩm quyền từng doanh nghiệp.
- **Business value:** quy trình được chuẩn hóa nhưng vẫn phù hợp thẩm quyền từng doanh nghiệp.
- **Trace:** BR-008, BR-011, BR-015, BR-026, BR-034; FR-138…FR-145; UC-015; WF-001…025 engine. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **MVP**; Must/MVP; **8 points preliminary**.
- **Normal flow:** draft template → validate/simulate → approve/publish version → trigger instance → review/return/re-submit/approve → issue/close.
- **Exception flow:** không tìm thấy approver chuyển `Configuration Error`, báo process owner, không tự chọn PM; approver bị khóa tài khoản sẽ dùng delegation/fallback hợp lệ; condition an toàn không được bypass.
- **Permission:** Process Admin cấu hình nhưng không tự publish nếu policy maker-checker; Business Owner duyệt version; participant chỉ hành động ở bước được giao; auditor đọc mọi version/instance nhưng không sửa.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** Domain owner, approved state/permission and upstream data.
- **Risk:** Unconfirmed policy, incomplete data or scope leakage.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-015

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-068"></a> **AC-068** | Admin tạo workflow version | Chọn trigger, điều kiện, bước nối tiếp/song song, SLA, escalation và outcome | Hệ thống validate không có dead-end/cycle, có fallback approver và mô phỏng đường duyệt bằng dữ liệu mẫu trước publish |
| <a id="ac-069"></a> **AC-069** | Một yêu cầu được gửi | Rule engine đánh giá loại/giá trị/currency/pháp nhân/dự án/phòng ban | Instance snapshot đúng workflow version và approver tại thời điểm gửi; thay template sau đó không đổi instance đang chạy trừ migration được duyệt |
| <a id="ac-070"></a> **AC-070** | Reviewer chọn Return/Reject/Conditional Approve | Nhập quyết định | Comment bắt buộc; Return về đúng bước có thể sửa, Reject kết thúc instance, Conditional tạo action/owner/deadline và gate phù hợp |
| <a id="ac-071"></a> **AC-071** | Bước song song có nhiều reviewer | Một reviewer phản hồi | Hệ thống áp đúng rule `all/quorum/mandatory role`, không đóng bước sớm và lưu từng quyết định riêng |
| <a id="ac-072"></a> **AC-072** | SLA quá hạn | Scheduler chạy | Nhắc và escalation theo lịch; escalation không tự biến thành approval và không đổi nội dung hồ sơ |

<a id="us-016"></a>
### US-016 — RBAC kết hợp ABAC và tenant isolation

- **Source:** US-E16; source heading/priority: RBAC kết hợp ABAC và tenant isolation (`IAM-*`) — Must/MVP + Security, Dùng chung.
- **Epic → Capability → Feature:** Identity & Access → IAM → RBAC kết hợp ABAC và tenant isolation.
- **Persona:** Security Administrator.
- **User story:** As a Security Administrator, I want quyền hành động theo vai trò và phạm vi dữ liệu theo thuộc tính, so that mỗi người chỉ truy cập đúng công ty, pháp nhân, dự án, gói thầu, phòng ban, loại và trạng thái hồ sơ được giao.
- **Business value:** mỗi người chỉ truy cập đúng công ty, pháp nhân, dự án, gói thầu, phòng ban, loại và trạng thái hồ sơ được giao.
- **Trace:** BR-001, BR-033, BR-040; FR-146…FR-155, NFR-007…NFR-013; UC-016; All WF policy. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **MVP**; Must/MVP; **13 points preliminary**.
- **Normal flow:** provision identity → gán role + data scope có thời hạn → access policy evaluation ở backend → periodic review/certification → revoke.
- **Exception flow:** user có nhiều role lấy hợp quyền cho phép nhưng explicit deny thắng; thay project/company làm access token/permission cache phải refresh; orphan scope không cấp quyền.
- **Permission:** Security Admin quản lý role/policy; Data Owner duyệt scope; Project Admin chỉ gán role cho dự án trong quyền và không cấp role cao hơn mình; auditor xem lịch sử cấp/thu hồi.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** Domain owner, approved state/permission and upstream data.
- **Risk:** Unconfirmed policy, incomplete data or scope leakage.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-016

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-073"></a> **AC-073** | User có role `Client Viewer` gắn khách hàng A | Mở danh sách hoặc truy cập trực tiếp URL/API của dự án | Chỉ dự án thuộc khách hàng A trong scope được trả; dự án khác trả kết quả không tiết lộ tồn tại theo security policy và ghi denied audit |
| <a id="ac-074"></a> **AC-074** | Subcontractor được gán package P1 | Tìm kiếm, xem dashboard, task, document hoặc export | Chỉ dữ liệu P1 được thấy; aggregate không suy ra dữ liệu package khác; không sửa record ngoài assignment |
| <a id="ac-075"></a> **AC-075** | Supplier V1 có portal access | Truy cập procurement | Chỉ RFQ/clarification/submittal/PO/delivery/payment được chia sẻ với V1; không thấy bid đối thủ, budget hoặc evaluation nội bộ |
| <a id="ac-076"></a> **AC-076** | PM có role quản lý dự án | Thao tác module trong dự án | Có quyền nghiệp vụ rộng theo policy nhưng vẫn chịu document state lock, legal hold, field restriction và SoD; không có quyền tenant/security admin mặc định |
| <a id="ac-077"></a> **AC-077** | User tenant A đoán ID tenant B | Gọi UI/API/search/export/file URL | Backend từ chối ở mọi tầng, object storage dùng scoped access ngắn hạn; sự kiện được alert như cross-tenant attempt |
| <a id="ac-078"></a> **AC-078** | Quyền được đánh giá | Có cả allow và deny/hold | Thứ tự bắt buộc là `explicit deny/SoD → legal hold/status lock → data scope → role permission → owner/external share` |

<a id="us-017"></a>
### US-017 — Phân tách nhiệm vụ và xung đột lợi ích

- **Source:** US-E17; source heading/priority: Phân tách nhiệm vụ và xung đột lợi ích (`IAM-*`, `WFL-*`, `CST-*`, `PRC-*`) — Must/MVP + Security, Dùng chung.
- **Epic → Capability → Feature:** Identity & Access → IAM, WFL, CST, PRC → Phân tách nhiệm vụ và xung đột lợi ích.
- **Persona:** Internal Controller.
- **User story:** As an Internal Controller, I want hệ thống chặn tự đề xuất–tự duyệt và các tổ hợp quyền xung đột, so that giao dịch mua sắm/thanh toán/phê duyệt có kiểm soát thực chất.
- **Business value:** giao dịch mua sắm/thanh toán/phê duyệt có kiểm soát thực chất.
- **Trace:** BR-015, BR-033, BR-034; FR-139…FR-155; UC-017; Approval workflows. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **MVP**; Must/MVP; **8 points preliminary**.
- **Normal flow:** định nghĩa conflict matrix → kiểm khi cấp quyền và khi thực hiện giao dịch → route approver độc lập → chứng nhận quyền định kỳ.
- **Exception flow:** tình huống khẩn cấp cần break-glass phải có reason, thời hạn rất ngắn, dual authorization nếu khả thi và post-review; không áp dụng để tự ký/tự thanh toán.
- **Permission:** Internal Control sở hữu rule; Security Admin triển khai; Business Owner duyệt exception; auditor độc lập xem toàn bộ violation/waiver.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** Finance rules, contract/legal entities, decimal/FX and ERP ownership.
- **Risk:** Incorrect money, cross-currency sum, duplicate/self-approved payment.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-017

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-079"></a> **AC-079** | PM tạo hoặc chứng nhận khoản chi | Workflow xác định bước duyệt | PM đó không được chọn làm approver tại bước SoD cấm dù có role/limit; hệ thống route tới người hợp lệ |
| <a id="ac-080"></a> **AC-080** | Buyer tạo PR/RFQ/award recommendation | Cùng user cố duyệt award/PO cuối | Hệ thống chặn, nêu conflict rule và ghi denied audit |
| <a id="ac-081"></a> **AC-081** | Treasury maker lập lệnh ngân hàng | Cùng user cố checker/release | Hệ thống chặn tuyệt đối; delegation không làm người đó trở thành checker của lệnh mình tạo |
| <a id="ac-082"></a> **AC-082** | Admin gán hai role xung đột | Gửi yêu cầu quyền | Hệ thống chặn hoặc yêu cầu exception workflow có thời hạn, compensating control, owner và audit theo policy |
| <a id="ac-083"></a> **AC-083** | Requester chia nhỏ giao dịch để dưới hạn mức | Hệ thống phát hiện nhiều yêu cầu liên quan theo vendor/contract/time/scope | Gắn cờ potential split, giữ quy trình và yêu cầu controller review; không tự kết luận gian lận |

<a id="us-018"></a>
### US-018 — Ủy quyền phê duyệt có kiểm soát

- **Source:** US-E18; source heading/priority: Ủy quyền phê duyệt có kiểm soát (`WFL-*`, `IAM-*`) — Must/MVP + Security, Dùng chung.
- **Epic → Capability → Feature:** Workflow → WFL, IAM → Ủy quyền phê duyệt có kiểm soát.
- **Persona:** Approver.
- **User story:** As an Approver, I want ủy quyền trong thời gian vắng mặt với phạm vi rõ, so that công việc không tắc nhưng quyền và trách nhiệm vẫn được kiểm soát.
- **Business value:** công việc không tắc nhưng quyền và trách nhiệm vẫn được kiểm soát.
- **Trace:** BR-033, BR-034; FR-141, FR-146…FR-153; UC-018; All WF delegation. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **MVP**; Must/MVP; **5 points preliminary**.
- **Normal flow:** yêu cầu delegation → manager/security approval khi policy cần → activate → task routed → expiry/revoke → review.
- **Exception flow:** overlapping delegation dùng precedence rõ; chain delegation bị cấm mặc định; tài khoản delegate bị disable làm delegation vô hiệu.
- **Permission:** người dùng chỉ ủy quyền quyền của mình; line manager/security duyệt loại nhạy cảm; admin không tạo delegation bí mật thay người dùng nếu không có break-glass audit.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** Domain owner, approved state/permission and upstream data.
- **Risk:** Unconfirmed policy, incomplete data or scope leakage.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-018

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-084"></a> **AC-084** | Approver tạo delegation | Chọn delegate, thời gian, module/project/legal entity/value limit và lý do | Hệ thống kiểm delegate có quyền nền tương thích, không vượt quyền/hạn mức của delegator và không tạo SoD conflict |
| <a id="ac-085"></a> **AC-085** | Delegation đến thời điểm hiệu lực | Workflow route task | Task ghi rõ “acting on behalf of”, lưu cả delegator/delegate và dùng hạn mức nhỏ hơn giữa hai bên |
| <a id="ac-086"></a> **AC-086** | Hết hạn hoặc bị thu hồi | Delegate cố duyệt | Hệ thống từ chối ngay cả với task đã mở; task route lại/fallback và ghi audit |
| <a id="ac-087"></a> **AC-087** | Delegator là requester của giao dịch | Delegate cố duyệt thay | SoD xét cả quan hệ ủy quyền và chặn nếu delegation có thể giúp tự duyệt gián tiếp |

<a id="us-019"></a>
### US-019 — Chia sẻ ngoài, khóa trạng thái và chữ ký điện tử

- **Source:** US-E19; source heading/priority: Chia sẻ ngoài, khóa trạng thái và chữ ký điện tử (`DOC-*`, `IAM-*`, `WFL-*`) — Must/MVP + Security, Dùng chung.
- **Epic → Capability → Feature:** Document Control → DOC, IAM, WFL → Chia sẻ ngoài, khóa trạng thái và chữ ký điện tử.
- **Persona:** Information Owner.
- **User story:** As an Information Owner, I want chia sẻ tài liệu ngoài hệ thống có thời hạn và khóa bản đã phê duyệt/ký, so that cộng tác được nhưng không làm mất kiểm soát thông tin hoặc bằng chứng.
- **Business value:** cộng tác được nhưng không làm mất kiểm soát thông tin hoặc bằng chứng.
- **Trace:** BR-011, BR-035, BR-040; FR-029…FR-035, FR-145, FR-151…FR-155, FR-164; UC-019; WF-007. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **MVP**; Must/MVP; **8 points preliminary**.
- **Normal flow:** classify → request share/sign → approve → recipient authenticate/sign/view → expire/revoke/archive.
- **Exception flow:** domain ngoài allowlist, malware, certificate invalid/revoked, signer khác expected hoặc callback replay bị chặn; legal hold ưu tiên hơn delete/retention.
- **Permission:** Owner đề nghị; Security/Legal/PM duyệt theo classification; external recipient chỉ quyền cụ thể; Document Controller phát hành; user có `view` không mặc nhiên có `download/share/sign`.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** DMS coding/ACL, object storage, malware scanner and reviewer matrix.
- **Risk:** Malware release, revision conflict or external disclosure.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-019

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-088"></a> **AC-088** | Tài liệu được phép chia sẻ ngoài | Owner nhập recipient, purpose, expiry, view/download và watermark | Hệ thống yêu cầu approval theo classification, xác minh recipient/MFA theo policy và phát link scoped có thời hạn |
| <a id="ac-089"></a> **AC-089** | Recipient mở link | Token hợp lệ | Chỉ đúng document/revision được preview/download theo policy; không duyệt thư mục hoặc đoán ID khác |
| <a id="ac-090"></a> **AC-090** | Link hết hạn/bị thu hồi hoặc recipient bị remove | Recipient mở lại | Truy cập bị chặn tức thời và audit; file đã tải trước đó được quản lý bằng watermark/policy chứ không tuyên bố thu hồi vật lý |
| <a id="ac-091"></a> **AC-091** | Tài liệu đã approved/signed/issued | Bất kỳ user nghiệp vụ yêu cầu sửa/xóa | Backend chặn; thay đổi phải tạo revision/correction/amendment; hash, signature và timestamp giữ nguyên |
| <a id="ac-092"></a> **AC-092** | Ký điện tử hoàn tất | Hệ thống nhận callback | Xác minh signer, certificate/status/timestamp, snapshot pháp nhân/người ký và chống callback trùng trước khi chuyển trạng thái |

<a id="us-020"></a>
### US-020 — SSO, MFA, session và tài khoản đặc quyền

- **Source:** US-E20; source heading/priority: SSO, MFA, session và tài khoản đặc quyền (`IAM-*`) — Must/MVP + Security, Dùng chung.
- **Epic → Capability → Feature:** Identity & Access → IAM → SSO, MFA, session và tài khoản đặc quyền.
- **Persona:** Security Administrator.
- **User story:** As a Security Administrator, I want SSO/MFA và quản lý vòng đời tài khoản/session, so that danh tính được xác thực mạnh và quyền được thu hồi kịp thời.
- **Business value:** danh tính được xác thực mạnh và quyền được thu hồi kịp thời.
- **Trace:** BR-033, BR-040; FR-146…FR-155, NFR-008…NFR-013; UC-020; Authentication flow. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **MVP**; Must/MVP; **8 points preliminary**.
- **Normal flow:** provision từ IdP → identity match → MFA/SSO → role/scope assignment → access review → disable/revoke.
- **Exception flow:** IdP outage dùng break-glass account giới hạn, MFA và alert; mất MFA theo recovery có identity proof; dormant account tự disable theo policy.
- **Permission:** Security Admin cấu hình identity; Helpdesk chỉ recovery theo runbook; tenant admin không xem secret; privileged action yêu cầu step-up và enhanced audit.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** Domain owner, approved state/permission and upstream data.
- **Risk:** Unconfirmed policy, incomplete data or scope leakage.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-020

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-093"></a> **AC-093** | Tenant cấu hình SSO | User đăng nhập | Hệ thống xác minh issuer/audience/signature, map identity ổn định và không tự cấp role từ claim chưa được allowlist |
| <a id="ac-094"></a> **AC-094** | User đặc quyền hoặc external user | Đăng nhập/thao tác nhạy cảm | MFA/step-up authentication bắt buộc theo policy; thất bại không làm lộ account existence |
| <a id="ac-095"></a> **AC-095** | HR/IdP báo user nghỉ việc hoặc Security revoke | Sự kiện được nhận | Session/token bị thu hồi trong SLA, delegation/task được route lại và ownership review được tạo |
| <a id="ac-096"></a> **AC-096** | Nhiều lần đăng nhập thất bại/rủi ro | Risk engine đánh giá | Rate limit/challenge/lock theo policy, gửi security alert; không khóa hàng loạt vì một IP dùng chung mà không có kiểm soát chống DoS |
| <a id="ac-097"></a> **AC-097** | Service account/API key được tạo | Integration gọi API | Dùng least privilege, secret rotation/expiry, IP/audience scope và audit; không dùng tài khoản người thật chia sẻ |
| <a id="ac-174"></a> **AC-174** | Tenant và local user active, password đúng | User đăng nhập | API trả access JWT 15 phút, set refresh JWT HttpOnly 7 ngày và UI chuyển vào authenticated shell; response/audit không chứa password hoặc refresh token |
| <a id="ac-175"></a> **AC-175** | Tenant/email/password sai hoặc account disabled | User đăng nhập | API trả lỗi 401 chung, không lộ account existence, không cấp token/session và rate limit 5 lần/phút theo IP+identity |
| <a id="ac-176"></a> **AC-176** | Refresh JWT và session còn hiệu lực | Access token hết hạn hoặc trang reload | API rotate refresh token một lần, thu hồi predecessor và cấp access token mới; replay predecessor thu hồi family |
| <a id="ac-177"></a> **AC-177** | User có hoặc không còn session hợp lệ | User đăng xuất | API idempotently thu hồi session nếu có, xóa refresh cookie; UI xóa auth state và protected route yêu cầu đăng nhập lại |

<a id="us-021"></a>
### US-021 — Audit log bất biến và truy vết quyết định

- **Source:** US-E21; source heading/priority: Audit log bất biến và truy vết quyết định (`IAM-*`, `WFL-*`, `DOC-*`) — Must/MVP + Security, Dùng chung.
- **Epic → Capability → Feature:** Identity & Access → IAM, WFL, DOC → Audit log bất biến và truy vết quyết định.
- **Persona:** Auditor.
- **User story:** As an Auditor, I want truy được ai đã xem, tạo, sửa, xóa, tải, chia sẻ, duyệt và ký dữ liệu nào, so that doanh nghiệp chứng minh trách nhiệm và điều tra sự cố.
- **Business value:** doanh nghiệp chứng minh trách nhiệm và điều tra sự cố.
- **Trace:** BR-011, BR-033…BR-035, BR-040; FR-143, FR-154, FR-161, NFR-022; UC-021; Audit flow. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **MVP**; Must/MVP; **8 points preliminary**.
- **Normal flow:** capture event → integrity protection → indexed search → review/export → retention/archive.
- **Exception flow:** audit sink tạm lỗi đưa event vào durable queue và cảnh báo; hành động nhạy cảm có thể fail-closed theo policy; clock skew được phát hiện.
- **Permission:** Auditor/Security xem theo nhiệm vụ; application admin không sửa; business user chỉ xem history của đối tượng nếu được phép; export nhạy cảm cần approval.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** DMS coding/ACL, object storage, malware scanner and reviewer matrix.
- **Risk:** Malware release, revision conflict or external disclosure.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-021

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-098"></a> **AC-098** | Một hành động nghiệp vụ/permission/admin diễn ra | Giao dịch thành công hoặc bị từ chối quan trọng | Audit ghi actor/effective actor, tenant, object, action, before/after phù hợp, timestamp, result, reason, correlation ID và nguồn |
| <a id="ac-099"></a> **AC-099** | Dữ liệu nhạy cảm/secret/password xuất hiện | Audit được ghi/hiển thị | Giá trị bí mật được mask/redact; audit vẫn đủ để truy vết mà không trở thành nguồn rò rỉ |
| <a id="ac-100"></a> **AC-100** | Người dùng/admin cố sửa hoặc xóa audit | Gửi request | Hệ thống từ chối; retention/legal hold chỉ theo policy được phê duyệt và có meta-audit |
| <a id="ac-101"></a> **AC-101** | Auditor xuất evidence | Chọn phạm vi/thời gian | Export có chữ ký/hash hoặc cơ chế kiểm toàn vẹn, data scope, watermark và audit cho chính hành động export |
| <a id="ac-102"></a> **AC-102** | Sự kiện high-risk xảy ra | Rule phát hiện cross-tenant attempt, permission escalation hoặc mass download | Security alert được tạo với correlation; không tự suy diễn kết luận khi chưa điều tra |

<a id="us-022"></a>
### US-022 — Notification, nhắc việc và escalation

- **Source:** US-E22; source heading/priority: Notification, nhắc việc và escalation (`WFL-*`, `PRJ-*`) — Must/MVP, Dùng chung.
- **Epic → Capability → Feature:** Workflow → WFL, PRJ → Notification, nhắc việc và escalation.
- **Persona:** Project Member.
- **User story:** As a Project Member, I want nhận thông báo đúng việc, đúng mức khẩn và có thể theo dõi đã xử lý, so that deadline không bị bỏ lỡ nhưng người dùng không bị ngập thông báo.
- **Business value:** deadline không bị bỏ lỡ nhưng người dùng không bị ngập thông báo.
- **Trace:** BR-032, BR-034, BR-038; FR-019…FR-025, FR-142…FR-145, FR-175, FR-177; UC-022; All WF notification. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **MVP**; Must/MVP; **8 points preliminary**.
- **Normal flow:** event → rule/dedup → dispatch → delivery/acknowledge → escalation/close khi source resolved.
- **Exception flow:** connector email/Zalo/SMS lỗi retry có backoff và dead-letter alert; invalid recipient route tới owner; notification storm được rate-limit nhưng P1 không bị bỏ.
- **Permission:** Admin cấu hình template/kênh bắt buộc; user chọn preference trong giới hạn; manager xem SLA/escalation, không đọc nội dung ngoài data scope.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** Project master, baseline, data freshness and PMO rules.
- **Risk:** Stale/low-confidence decision, dependency cycle or scope leakage.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-022

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-103"></a> **AC-103** | Event được cấu hình xảy ra | Notification service xử lý | Tạo notification có object link, reason, priority, owner, due date và channel theo preference/policy; không chứa dữ liệu vượt quyền trong subject/body |
| <a id="ac-104"></a> **AC-104** | Task sắp/quá hạn | Scheduler chạy | Nhắc theo lịch, sau đó escalation tới cấp cấu hình; mỗi mức chỉ gửi một lần theo dedup key trừ khi trạng thái đổi |
| <a id="ac-105"></a> **AC-105** | Recipient mất quyền sau khi nhận | Click link | Backend re-check quyền và từ chối nếu không còn scope; notification không phải access grant |
| <a id="ac-106"></a> **AC-106** | P1 safety/security event | Event phát sinh | Dùng call tree/push/SMS theo policy, yêu cầu acknowledgement và escalation liên tục; preference cá nhân không tắt kênh bắt buộc |
| <a id="ac-107"></a> **AC-107** | User mark read/snooze/digest | Thao tác | Chỉ presentation state thay đổi; không đóng task/approval/incident nguồn |

<a id="us-023"></a>
### US-023 — Report Center, saved view và export

- **Source:** US-E23; source heading/priority: Report Center, saved view và export (`PFM-*`, `PRJ-*`, `CST-*`, `DOC-*`) — Must/MVP, Dùng chung.
- **Epic → Capability → Feature:** Portfolio & Command Center → PFM, PRJ, CST, DOC → Report Center, saved view và export.
- **Persona:** Project Manager or Executive.
- **User story:** As a Project Manager or Executive, I want báo cáo chuẩn, bộ lọc lưu và export Excel/PDF nhất quán, so that tôi chia sẻ quyết định dựa trên cùng một snapshot dữ liệu.
- **Business value:** tôi chia sẻ quyết định dựa trên cùng một snapshot dữ liệu.
- **Trace:** BR-001, BR-032, BR-036, BR-038; FR-010…FR-015, FR-020…FR-025, FR-130…FR-137, FR-171…FR-177; UC-023; Report job flow. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **MVP**; Must/MVP; **8 points preliminary**.
- **Normal flow:** chọn report/view → filter/drill-down → save/schedule → export/share theo quyền.
- **Exception flow:** query quá lớn được async/paginate; stale integration được gắn cảnh báo; export có PII/financial sensitive cần field masking/approval.
- **Permission:** module owner xem report tương ứng; PM tổng hợp dự án; Executive portfolio; client/investor report riêng; export/schedule/share là quyền độc lập và audit.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** Finance rules, contract/legal entities, decimal/FX and ERP ownership.
- **Risk:** Incorrect money, cross-currency sum, duplicate/self-approved payment.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-023

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-108"></a> **AC-108** | User mở report tiến độ/chi phí/mua sắm/risk/NCR/HSE/commissioning/COD/contract | Chọn project, period, baseline và currency | Hệ thống hiển thị định nghĩa KPI, as-of timestamp, filter và drill-down; số tổng hợp cân với dữ liệu nguồn |
| <a id="ac-109"></a> **AC-109** | User lưu view | Chọn filter/column/sort/share scope | Saved view thuộc cá nhân hoặc được chia sẻ theo quyền; không thể làm tăng quyền người nhận |
| <a id="ac-110"></a> **AC-110** | User export Excel/PDF | Gửi yêu cầu | Export chạy server-side với cùng filter/data scope, có timestamp/watermark/owner; file lớn xử lý async và link hết hạn |
| <a id="ac-111"></a> **AC-111** | Dữ liệu nhiều currency | Report cần tổng hợp | Hiển thị riêng từng currency hoặc quy đổi bằng policy/snapshot được nêu; không cộng trực tiếp giá trị không đồng nhất |
| <a id="ac-112"></a> **AC-112** | Source data thay đổi sau export | Người dùng mở file cũ | File vẫn là snapshot có as-of; hệ thống không ngầm cập nhật và cho phép tái tạo theo version/filter nếu retention còn |

<a id="us-024"></a>
### US-024 — Backup, khôi phục và vận hành an toàn dịch vụ

- **Source:** US-E24; source heading/priority: Backup, khôi phục và vận hành an toàn dịch vụ (`IAM-*`, `INT-*`) — Must/Security, Dùng chung.
- **Epic → Capability → Feature:** Identity & Access → IAM, INT → Backup, khôi phục và vận hành an toàn dịch vụ.
- **Persona:** Platform Owner.
- **User story:** As a Platform Owner, I want backup, disaster recovery, monitoring và kiểm thử khôi phục theo RPO/RTO được phê duyệt, so that mất hạ tầng không làm mất hồ sơ dự án hoặc phá tính toàn vẹn audit.
- **Business value:** mất hạ tầng không làm mất hồ sơ dự án hoặc phá tính toàn vẹn audit.
- **Trace:** BR-040; NFR-004…NFR-006, NFR-021…NFR-024; UC-024; Recovery runbook. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **MVP**; Must/MVP; **5 points preliminary**.
- **Normal flow:** backup → verify → immutable/off-site retention → restore drill → close findings.
- **Exception flow:** backup fail hoặc restore mismatch tạo P1/P2 theo policy và không bị đánh dấu thành công; DR không cho phép bỏ qua audit/security controls.
- **Permission:** Platform/SRE vận hành; Security quản lý key policy; auditor xem evidence; business admin không truy cập raw backup.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** System owner, sandbox, SoR/field contract, credentials and reconciliation.
- **Risk:** Duplicate/corrupt data, schema drift, credential leak or hidden OT path.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-024

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-113"></a> **AC-113** | Dữ liệu database, object và audit được tạo | Backup policy chạy | Bản sao mã hóa, tách quyền/miền lỗi, có retention và kiểm tra completeness; secret/key quản lý riêng |
| <a id="ac-114"></a> **AC-114** | Restore test định kỳ | Operator khôi phục môi trường cô lập | Hệ thống chứng minh đạt RPO/RTO, kiểm referential integrity giữa metadata/file/audit và lưu biên bản test |
| <a id="ac-115"></a> **AC-115** | Region/service failure | DR được kích hoạt | Runbook maker-checker, status communication và failover không tạo split-brain/duplicate workflow/payment |
| <a id="ac-116"></a> **AC-116** | Monitoring phát hiện lỗi/latency/queue backlog | Alert engine chạy | On-call nhận alert có severity/runbook; SLO và post-incident action được theo dõi |

<a id="us-025"></a>
### US-025 — Tiền khả thi và so sánh phương án Solar/BESS

- **Source:** US-E25; source heading/priority: Tiền khả thi và so sánh phương án Solar/BESS (`OPP-*`, `SOL-*`, `BES-*`, `CST-*`) — Should/Differentiator, Solar/BESS, Quản lý dự án.
- **Epic → Capability → Feature:** Opportunity & Investment → OPP, SOL, BES, CST → Tiền khả thi và so sánh phương án Solar/BESS.
- **Persona:** Investment Analyst.
- **User story:** As an Investment Analyst, I want so sánh nhiều phương án Solar, BESS và hybrid trên cùng bộ phụ tải/giả định, so that hội đồng đầu tư chọn cấu hình có giá trị và rủi ro phù hợp thay vì chỉ chọn công suất lớn nhất.
- **Business value:** hội đồng đầu tư chọn cấu hình có giá trị và rủi ro phù hợp thay vì chỉ chọn công suất lớn nhất.
- **Trace:** BR-002…BR-008; FR-001…FR-009, FR-053…FR-060, FR-125…FR-137; UC-025; WF-002. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **Release 1**; Should/R1; **8 points preliminary**.
- **Normal flow:** yêu cầu dữ liệu → khảo sát/load clean-up → scenario engineering → business case → review → versioned investment approval → handover project.
- **Exception flow:** dữ liệu thiếu làm giảm confidence và hiển thị range; IRR không xác định khi dòng tiền không đổi dấu phải trả `Không xác định`, không lỗi/giá trị giả; tariff hết hiệu lực chặn phát hành proposal nếu policy yêu cầu.
- **Permission:** Customer Data Steward quản lý dữ liệu phụ tải; Engineer sửa technical assumption; Finance sửa economic assumption; Investment Committee phê duyệt revision khóa; khách hàng chỉ xem proposal được phát hành.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** BESS hierarchy/envelope, safety evidence, tag quality and engineering owner.
- **Risk:** Stale/incorrect data, constraint violation or accidental control implication.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-025

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-117"></a> **AC-117** | Có hóa đơn và load profile giờ/ngày/tháng | Analyst import/OCR | Hệ thống chuẩn hóa kỳ, tariff period, unit/timezone, kiểm gap/outlier và lưu source/confidence; không bịa dữ liệu thiếu |
| <a id="ac-118"></a> **AC-118** | Engineer tạo scenario Solar | Nhập diện tích, bức xạ/PVSyst, công suất, losses và degradation | Hệ thống tính sản lượng/self-consumption/export theo version và nêu curtailment/assumption |
| <a id="ac-119"></a> **AC-119** | Engineer tạo scenario BESS | Nhập kW, kWh, SOC min/max, efficiency, reserve, charge/discharge limit và use case | Hệ thống mô phỏng peak shaving/load shifting/backup, cấm simultaneous charge-discharge và gắn cờ interval không khả thi |
| <a id="ac-120"></a> **AC-120** | Analyst nhập CAPEX/OPEX/tariff/tax/discount/financing | Chạy business case | Hệ thống tính revenue/saving, cash flow, NPV, IRR, payback và sensitivity; công thức, unit, currency, tỷ giá và policy version truy được |
| <a id="ac-121"></a> **AC-121** | Hội đồng mở comparison | Chọn các scenario | Hệ thống trình bày kỹ thuật–tài chính–rủi ro trên cùng basis, tách measured/derived/assumed data và không so sánh tráo version |

<a id="us-026"></a>
### US-026 — Solar engineering, asset và performance traceability

- **Source:** US-E26; source heading/priority: Solar engineering, asset và performance traceability (`SOL-*`, `ENG-*`, `COM-*`, `OMM-*`) — Should/Differentiator, Solar.
- **Epic → Capability → Feature:** Solar → SOL, ENG, COM, OMM → Solar engineering, asset và performance traceability.
- **Persona:** Solar Engineer.
- **User story:** As a Solar Engineer, I want trace từ module/inverter/transformer/meter và thiết kế đến serial, test, warranty và KPI vận hành, so that sai khác thiết kế–mua hàng–lắp đặt–hiệu suất được phát hiện sớm.
- **Business value:** sai khác thiết kế–mua hàng–lắp đặt–hiệu suất được phát hiện sớm.
- **Trace:** BR-003…BR-006, BR-012…BR-014, BR-017, BR-024, BR-027; FR-045…FR-052, FR-069…FR-074, FR-106…FR-129; UC-026; WF-005/022/023. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **Release 1**; Should/R1; **5 points preliminary**.
- **Normal flow:** design/BOM → procurement/serial → install/inspect → commission → asset handover → KPI/WO/warranty.
- **Exception flow:** thay serial/model cần approved substitution và giữ lineage; meter reset/gap được đánh dấu; timezone/DST policy nhất quán dù thị trường đầu là Việt Nam.
- **Permission:** Engineering duyệt model/substitution; Logistics/QA ghi serial/receipt; O&M xem/cập nhật asset; customer thấy KPI/asset theo hợp đồng, không thấy cost nội bộ.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** Accepted handover, asset registry, O&M/CMMS ownership and PTW rules.
- **Risk:** Stale alarms, SLA ambiguity, unsafe close or source-state confusion.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-026

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-122"></a> **AC-122** | Approved BOM/design có model và quantity | PO/receipt/installation được ghi | Hệ thống đối chiếu model/quantity/serial/area; deviation tạo hold/change/NCR thay vì tự chấp nhận |
| <a id="ac-123"></a> **AC-123** | Asset được bàn giao | O&M mở asset | Thấy approved datasheet, warranty, FAT/SAT/test, as-built, WO và replacement history đúng revision |
| <a id="ac-124"></a> **AC-124** | Dữ liệu irradiance, energy và availability read-only được đồng bộ | KPI được tính | PR/yield/availability/self-consumption có formula/version, quality flag và khoảng thời gian; interval thiếu không mặc định là zero |
| <a id="ac-125"></a> **AC-125** | KPI thấp hơn guarantee/threshold | Rule chạy | Tạo alert/issue hoặc recommendation có evidence; không tự thay inverter/SCADA setpoint |

<a id="us-027"></a>
### US-027 — BESS asset hierarchy, safety và degradation

- **Source:** US-E27; source heading/priority: BESS asset hierarchy, safety và degradation (`BES-*`, `COM-*`, `OMM-*`) — Should/Differentiator + Safety, BESS.
- **Epic → Capability → Feature:** BESS → BES, COM, OMM → BESS asset hierarchy, safety và degradation.
- **Persona:** BESS Asset Manager.
- **User story:** As a BESS Asset Manager, I want quản lý hierarchy container–rack–module–cell cùng PCS/BMS/EMS/HVAC/fire system và lịch sử SOC/SOH/cycle/temperature/alarm, so that tôi đánh giá được an toàn, hiệu suất và suy giảm theo đúng cấu hình thực tế.
- **Business value:** tôi đánh giá được an toàn, hiệu suất và suy giảm theo đúng cấu hình thực tế.
- **Trace:** BR-005, BR-006, BR-014, BR-024…BR-029, BR-040; FR-045…FR-052, FR-106…FR-124, FR-130…FR-137, FR-165…FR-170; UC-027; WF-022/023/025. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **Release 1**; Should/R1; **8 points preliminary**.
- **Normal flow:** asset hierarchy → FAT/SAT/commissioning → turnover → telemetry read-only → KPI/anomaly → WO/warranty/reliability.
- **Exception flow:** mất telemetry hiển thị `Unknown/Stale`, không coi thiết bị an toàn; sensor outlier giữ raw + quality flag; replacement module không nối sai history.
- **Permission:** BESS Engineer quản lý cấu hình draft; O&M/Asset Manager duyệt hierarchy; operator OT điều khiển; PM/customer/investor chỉ read-only theo aggregation và data agreement.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** BESS hierarchy/envelope, safety evidence, tag quality and engineering owner.
- **Risk:** Stale/incorrect data, constraint violation or accidental control implication.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-027

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-126"></a> **AC-126** | Asset BESS được tạo/import | Gán container/rack/module/cell, BMS/PCS/EMS, HVAC, fire detection/suppression, gas, CCTV/access/E-Stop | Hệ thống kiểm parent-child, serial duy nhất, model/firmware và effective date; replacement giữ lineage cũ–mới |
| <a id="ac-127"></a> **AC-127** | Telemetry read-only được nhận | Lưu SOC/SOH/temperature/cell voltage/cycle/DoD/charge-discharge/alarm | Mỗi điểm có source/time/quality/unit; time-series tách khỏi transactional DB và retention/downsampling theo policy |
| <a id="ac-128"></a> **AC-128** | Temperature/cell imbalance/alarm vượt rule | Detection chạy | Gửi cảnh báo vận hành tới đúng call tree và tạo incident/WO theo policy; web PM không reset alarm hoặc gửi control command |
| <a id="ac-129"></a> **AC-129** | Capacity/RTE test được thực hiện | Kết quả được duyệt | Hệ thống lưu boundary, initial/final SOC, energy in/out, auxiliary load, ambient condition và formula version để so với guarantee |
| <a id="ac-130"></a> **AC-130** | Degradation/cycle trend vượt guarantee band | Asset review chạy | Tạo evidence package/warranty recommendation, phân biệt measured/estimated SOH và không tự kết luận lỗi cell nếu quality thấp |

<a id="us-028"></a>
### US-028 — Connector có System of Record và đối soát

- **Source:** US-E28; source heading/priority: Connector có System of Record và đối soát (`INT-*`) — Should/Differentiator, Dùng chung.
- **Epic → Capability → Feature:** Integration → INT → Connector có System of Record và đối soát.
- **Persona:** Integration Owner.
- **User story:** As an Integration Owner, I want mỗi connector có System of Record, chiều đồng bộ, mapping, idempotency, retry và reconciliation rõ, so that tích hợp không tạo bản ghi trùng hoặc xung đột trách nhiệm dữ liệu.
- **Business value:** tích hợp không tạo bản ghi trùng hoặc xung đột trách nhiệm dữ liệu.
- **Trace:** BR-037, BR-040; FR-156…FR-177, NFR-015, NFR-021, NFR-024; UC-028; Integration sync. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **Release 1**; Should/R1; **8 points preliminary**.
- **Normal flow:** define contract/SoR → authenticate → sync → validate/idempotent upsert → acknowledge → reconcile/monitor.
- **Exception flow:** schema drift quarantine payload và alert; bad record không chặn cả batch nếu policy cho phép; mass delete từ source cần safeguard/approval.
- **Permission:** Integration Admin cấu hình credential/mapping theo maker-checker; Data Owner duyệt object/field; operator xem log đã mask; business user không thấy secret/raw payload ngoài quyền.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** System owner, sandbox, SoR/field contract, credentials and reconciliation.
- **Risk:** Duplicate/corrupt data, schema drift, credential leak or hidden OT path.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-028

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-131"></a> **AC-131** | Admin cấu hình connector ERP/DMS/HR/SCADA/email/logistics | Chọn object và direction | Hệ thống bắt buộc khai SoR, inbound/outbound/bidirectional, frequency, mapping/version, conflict policy, owner và data classification |
| <a id="ac-132"></a> **AC-132** | Cùng event được gửi lặp | Consumer xử lý | Idempotency key khiến kết quả nghiệp vụ chỉ ghi một lần; mọi attempt vẫn có integration log/correlation ID |
| <a id="ac-133"></a> **AC-133** | API tạm lỗi/rate limit | Connector chạy | Retry exponential backoff, circuit breaker và dead-letter; không retry vô hạn giao dịch không idempotent |
| <a id="ac-134"></a> **AC-134** | Hai chiều có conflict | Reconciliation chạy | Áp policy theo field/SoR hoặc đưa exception cho data steward; không last-write-wins im lặng |
| <a id="ac-135"></a> **AC-135** | User xem trạng thái sync | Mở integration monitor | Hiển thị last success, lag, count, error và reconciliation gap nhưng mask secret/PII |

<a id="us-029"></a>
### US-029 — Kết nối OT read-only và phân tách IT/OT

- **Source:** US-E29; source heading/priority: Kết nối OT read-only và phân tách IT/OT (`INT-*`, `BES-*`, `SOL-*`) — Must/Safety-Security + Differentiator, Solar/BESS.
- **Epic → Capability → Feature:** Integration → INT, BES, SOL → Kết nối OT read-only và phân tách IT/OT.
- **Persona:** OT Security Owner.
- **User story:** As an OT Security Owner, I want dữ liệu SCADA/EMS/BMS/inverter/meter chỉ đi ra qua gateway/DMZ tới nền tảng quản lý, so that người dùng có visibility mà không tạo đường điều khiển ngược vào thiết bị.
- **Business value:** người dùng có visibility mà không tạo đường điều khiển ngược vào thiết bị.
- **Trace:** BR-027, BR-028, BR-037, BR-040; FR-134, FR-165…FR-170, NFR-016, NFR-024; UC-029; WF-025. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **MVP**; Must/MVP; **8 points preliminary**.
- **Normal flow:** sensor/controller → OT historian/gateway → DMZ broker → authenticated ingestion → time-series/read model → dashboard/alert.
- **Exception flow:** mất kết nối giữ last value có nhãn stale, không nội suy cho alarm safety; compromised gateway cô lập theo runbook OT; fallback vận hành tại chỗ độc lập với cloud.
- **Permission:** OT Security/Authorized Operator quản lý hệ điều khiển; Integration service chỉ ingest; PM/O&M/customer xem read-only đúng scope; AI không có credential/route điều khiển.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** System owner, sandbox, SoR/field contract, credentials and reconciliation.
- **Risk:** Duplicate/corrupt data, schema drift, credential leak or hidden OT path.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-029

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-136"></a> **AC-136** | Kiến trúc tích hợp OT được triển khai | Data flow review | Chỉ luồng `OT → gateway/DMZ → broker/API → cloud` cho telemetry/event; firewall/network zone không mở route điều khiển từ web/cloud vào PCS/BMS/EMS |
| <a id="ac-137"></a> **AC-137** | Developer/user/AI gọi API control từ nền tảng PM | Request được gửi | Không tồn tại public control API; request bị từ chối/alert; UI không có start/stop/setpoint/reset/bypass action |
| <a id="ac-138"></a> **AC-138** | WO cần switching/control | PM/technician tạo yêu cầu | Hệ thống chỉ sinh switching request/permit; Authorized Operator thực hiện trong OT bằng quy trình an toàn và gửi lại evidence/status |
| <a id="ac-139"></a> **AC-139** | Telemetry đến trễ/mất/chất lượng xấu | Dashboard/KPI hiển thị | Hiển thị timestamp/source/quality/staleness; không dùng dữ liệu stale để tuyên bố trạng thái safe/available |
| <a id="ac-140"></a> **AC-140** | Security event/config change OT được mirror | Nền tảng nhận | Ghi read-only alert/audit và route tới OT SOC/owner; không tự quarantine/disable thiết bị từ cloud |

<a id="us-030"></a>
### US-030 — Truy vết xuyên vòng đời từ cơ hội đến O&M

- **Source:** US-E30; source heading/priority: Truy vết xuyên vòng đời từ cơ hội đến O&M (`OPP-*`, `PRJ-*`, `DOC-*`, `CTR-*`, `PRC-*`, `COM-*`, `OMM-*`) — Should/Differentiator, Solar/BESS.
- **Epic → Capability → Feature:** Opportunity & Investment → OPP, PRJ, DOC, CTR, PRC, COM, OMM → Truy vết xuyên vòng đời từ cơ hội đến O&M.
- **Persona:** Project or Asset Manager.
- **User story:** As a Project or Asset Manager, I want truy từ giả định đầu tư và yêu cầu hợp đồng tới thiết kế, PO/serial, nghiệm thu, test, COD và work order, so that quyết định và sự cố không bị cô lập trong từng module.
- **Business value:** quyết định và sự cố không bị cô lập trong từng module.
- **Trace:** BR-001…BR-040; FR-001…FR-177; UC-030; WF-001. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **Release 1**; Should/R1; **5 points preliminary**.
- **Normal flow:** capture stable IDs/relationships ở từng gate → validate link → expose trace graph/read model → audit navigation/export.
- **Exception flow:** orphan object được báo data-quality issue; merge ID tạo redirect/lineage; user không có quyền thấy node nhạy cảm chỉ nhận nhãn `Restricted`, không lộ metadata.
- **Permission:** mỗi module owner tạo link trong phạm vi; Data Steward merge/correct; mọi người chỉ thấy node/edge được ABAC cho phép; auditor xem lineage theo mandate.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** Accepted handover, asset registry, O&M/CMMS ownership and PTW rules.
- **Risk:** Stale alarms, SLA ambiguity, unsafe close or source-state confusion.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-030

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-141"></a> **AC-141** | Project được tạo từ opportunity đã duyệt | PM mở source lineage | Hệ thống hiển thị proposal/business-case/survey version đã bàn giao và mọi assumption còn mở |
| <a id="ac-142"></a> **AC-142** | Requirement/design item có BOM/PO/asset/test | Người dùng mở trace view | Quan hệ hai chiều hiển thị đúng revision/effective dates; người dùng drill down chỉ trong quyền |
| <a id="ac-143"></a> **AC-143** | Design change/substitution xảy ra | Workflow hoàn tất | Trace cập nhật revision/model/serial mới nhưng giữ đường dẫn lịch sử và impact tới cost/schedule/warranty/test |
| <a id="ac-144"></a> **AC-144** | O&M failure xảy ra | Reliability Engineer mở asset | Thấy design basis, supplier/PO, FAT/SAT, commissioning, warranty, prior NCR/change/WO liên quan |

<a id="us-031"></a>
### US-031 — Nền tảng AI có nguồn, confidence và human-in-the-loop

- **Source:** US-E31; source heading/priority: Nền tảng AI có nguồn, confidence và human-in-the-loop (`AIX-*`, `IAM-*`) — Must/Safety-Security trước mọi AI, Dùng chung.
- **Epic → Capability → Feature:** AI Assistance → AIX, IAM → Nền tảng AI có nguồn, confidence và human-in-the-loop.
- **Persona:** AI Governance Owner.
- **User story:** As an AI Governance Owner, I want mọi output AI có nguồn, confidence, model/prompt version, quyền truy cập và bước xác nhận của con người, so that AI hỗ trợ quyết định mà không trở thành người phê duyệt hoặc làm lộ dữ liệu.
- **Business value:** AI hỗ trợ quyết định mà không trở thành người phê duyệt hoặc làm lộ dữ liệu.
- **Trace:** BR-039, BR-040; FR-178…FR-198, NFR-017; UC-031; AI governance review. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **MVP**; Must/MVP; **8 points preliminary**.
- **Normal flow:** authorize → retrieve scoped sources → generate → cite/confidence → human review → save draft/feedback → monitor quality.
- **Exception flow:** không có nguồn đủ tin cậy trả `Không đủ dữ liệu`; model/service lỗi không chặn workflow thủ công; sensitive project bị opt-out theo tenant/project policy.
- **Permission:** AI Governance cấu hình use case/model/policy; Data Owner cho phép corpus; user chỉ dùng AI trong quyền gốc; security/auditor xem log phù hợp nhưng prompt nhạy cảm có retention/redaction.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** AI policy/provider/corpus/citation/confidence and human review.
- **Risk:** Access leakage, hallucination, low confidence or unsafe automation.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-031

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-145"></a> **AC-145** | User gửi yêu cầu AI trên project | Retrieval chạy | Chỉ dữ liệu user có quyền tại thời điểm query được dùng; citation không lộ title/snippet của tài liệu bị cấm |
| <a id="ac-146"></a> **AC-146** | AI trả kết quả | UI hiển thị | Có source/citation, confidence hoặc uncertainty phù hợp, timestamp, model/prompt/policy version và nhãn `Đề xuất — cần xác minh` |
| <a id="ac-147"></a> **AC-147** | User accept/edit/reject | Lưu vào nghiệp vụ | Lưu output gốc, quyết định, bản sửa, người/time và audit; chỉ bản người dùng xác nhận mới tạo draft object, không tự publish |
| <a id="ac-148"></a> **AC-148** | AI đề nghị approve/sign/pay/control/close safety item | Hành động được gọi | Hệ thống chặn theo capability policy; AI không tự phê duyệt, ký, thanh toán, COD, lift stop-work, đóng NCR/incident hoặc điều khiển BESS |
| <a id="ac-149"></a> **AC-149** | Dữ liệu/prompt chứa instruction độc hại | Guardrail đánh giá | Tài liệu được coi là dữ liệu, không phải lệnh; output/tool access bị giới hạn, sự kiện high-risk được log/alert |

<a id="us-032"></a>
### US-032 — AI phân loại, đặt tên và mã tài liệu

- **Source:** US-E32; source heading/priority: AI phân loại, đặt tên và mã tài liệu (`AIX-*`, `DOC-*`) — Should/AI ưu tiên 1, Dùng chung.
- **Epic → Capability → Feature:** AI Assistance → AIX, DOC → AI phân loại, đặt tên và mã tài liệu.
- **Persona:** Document Controller.
- **User story:** As a Document Controller, I want AI đề xuất loại, metadata, tên và mã tài liệu từ nội dung, so that thời gian đăng ký giảm nhưng quy tắc mã hóa vẫn do con người kiểm soát.
- **Business value:** thời gian đăng ký giảm nhưng quy tắc mã hóa vẫn do con người kiểm soát.
- **Trace:** BR-035, BR-039; FR-178…FR-184; UC-032; WF-004. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **Release 2**; Should/Pilot; **5 points preliminary**.
- **Normal flow:** upload → OCR → AI extract/classify → preview → controller confirm → deterministic code validation → register draft.
- **Exception flow:** file scan kém, password-protected hoặc đa tài liệu trả trạng thái cần xử lý; nội dung trong file không được phép điều khiển agent.
- **Permission:** uploader xem draft mình; Document Controller xác nhận; AI service dùng service scope tối thiểu; tài liệu restricted không gửi tới model không được phê duyệt.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** AI policy/provider/corpus/citation/confidence and human review.
- **Risk:** Access leakage, hallucination, low confidence or unsafe automation.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-032

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-150"></a> **AC-150** | Tệp đã quét an toàn và OCR/parse được | AI phân tích | Trả đề xuất type/discipline/project/vendor/title/date và code component kèm source/confidence từng trường |
| <a id="ac-151"></a> **AC-151** | Confidence dưới ngưỡng hoặc nhiều project phù hợp | UI hiển thị | Bắt buộc người dùng chọn/xác minh, không tự đăng ký hoặc đoán project |
| <a id="ac-152"></a> **AC-152** | Controller chấp nhận | Gửi tạo draft | Rule engine chính thống sinh/kiểm mã duy nhất; AI không trực tiếp cấp mã cuối hoặc revision |
| <a id="ac-153"></a> **AC-153** | Controller sửa/từ chối | Feedback lưu | Bản gốc và correction được audit để đo precision/recall; không tự train trên dữ liệu tenant khác nếu chưa có thỏa thuận |

<a id="us-033"></a>
### US-033 — AI trích xuất nghĩa vụ hợp đồng

- **Source:** US-E33; source heading/priority: AI trích xuất nghĩa vụ hợp đồng (`AIX-*`, `CTR-*`) — Should/AI ưu tiên 2, Dùng chung.
- **Epic → Capability → Feature:** AI Assistance → AIX, CTR → AI trích xuất nghĩa vụ hợp đồng.
- **Persona:** Contract Manager.
- **User story:** As a Contract Manager, I want AI đề xuất nghĩa vụ, thời hạn, điều kiện thanh toán, bảo lãnh và notice từ hợp đồng/phụ lục, so that tôi lập obligation register nhanh mà vẫn kiểm tra được từng điều khoản.
- **Business value:** tôi lập obligation register nhanh mà vẫn kiểm tra được từng điều khoản.
- **Trace:** BR-009…BR-011, BR-039; FR-185…FR-188; UC-033; WF-009. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **Release 2**; Should/Pilot; **5 points preliminary**.
- **Normal flow:** select signed document → extract/cite → legal review → accept/edit → approve obligation register → monitor.
- **Exception flow:** OCR/translation mơ hồ hoặc điều khoản xung đột được gắn `Needs Legal Review`; privileged document giữ access; AI không đưa ra kết luận pháp lý cuối.
- **Permission:** Contract/Legal dùng và duyệt; PM chỉ thấy nghĩa vụ được cấp quyền; vendor/client chỉ thấy nghĩa vụ của họ; AI không truy hợp đồng ngoài scope.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** AI policy/provider/corpus/citation/confidence and human review.
- **Risk:** Access leakage, hallucination, low confidence or unsafe automation.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-033

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-154"></a> **AC-154** | Hợp đồng/revision được user có quyền chọn | AI extract | Mỗi đề xuất có clause/page citation, obligor/beneficiary, trigger/due rule, amount/currency khi có và confidence |
| <a id="ac-155"></a> **AC-155** | Nghĩa vụ phụ thuộc sự kiện như COD/notice | AI không xác định được ngày tuyệt đối | Lưu formula/trigger dạng draft và yêu cầu Contract Manager xác nhận, không bịa due date |
| <a id="ac-156"></a> **AC-156** | Phụ lục sửa điều khoản gốc | AI compare | Đề xuất supersede/modify relation có citation cả hai văn bản; không xóa obligation cũ trước human approval |
| <a id="ac-157"></a> **AC-157** | Contract Manager accept | Lưu | Tạo obligation draft; workflow review/approve chính thống quyết định hiệu lực và notification |

<a id="us-034"></a>
### US-034 — AI/OCR hóa đơn điện và dữ liệu phụ tải

- **Source:** US-E34; source heading/priority: AI/OCR hóa đơn điện và dữ liệu phụ tải (`AIX-*`, `OPP-*`, `CST-*`) — Should/AI ưu tiên 3, Solar/BESS.
- **Epic → Capability → Feature:** AI Assistance → AIX, OPP, CST → AI/OCR hóa đơn điện và dữ liệu phụ tải.
- **Persona:** Energy Analyst.
- **User story:** As an Energy Analyst, I want OCR hóa đơn điện thành dữ liệu kỳ, biểu giá, kWh, demand và tiền điện có kiểm tra số học, so that phân tích Solar/BESS nhanh nhưng không dùng số đọc sai.
- **Business value:** phân tích Solar/BESS nhanh nhưng không dùng số đọc sai.
- **Trace:** BR-003…BR-007, BR-039; FR-189…FR-191; UC-034; WF-002. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **Release 2**; Should/Pilot; **5 points preliminary**.
- **Normal flow:** upload → OCR/extract → arithmetic/duplicate check → side-by-side review → verify → load profile/business case.
- **Exception flow:** ảnh mờ, nhiều meter/currency hoặc template lạ yêu cầu nhập tay; PII được mask theo quyền; tariff name không tự map nếu thiếu chắc chắn.
- **Permission:** Customer-authorized analyst xử lý; Finance/Investment xem theo project; external AI provider chỉ theo data-processing policy; raw bill download tách quyền.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** AI policy/provider/corpus/citation/confidence and human review.
- **Risk:** Access leakage, hallucination, low confidence or unsafe automation.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-034

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-158"></a> **AC-158** | User tải hóa đơn được phép xử lý | OCR/extraction chạy | Trả customer/meter, billing period, TOU kWh, peak demand, tariff, VAT, total, unit/currency và bounding source/confidence |
| <a id="ac-159"></a> **AC-159** | Các thành phần có thể cộng kiểm tra | Validation chạy | So sánh subtotal/tax/total và kỳ liền kề; chênh lệch vượt tolerance gắn cờ, không tự sửa |
| <a id="ac-160"></a> **AC-160** | Hóa đơn trùng meter/kỳ/hash | User import | Hệ thống cảnh báo duplicate và yêu cầu replace/version/link, không double count |
| <a id="ac-161"></a> **AC-161** | Analyst xác nhận | Lưu dataset | Dữ liệu chuyển `Verified`, ghi người/time/source; chỉ verified data dùng cho proposal final trừ khi có explicit assumption |

<a id="us-035"></a>
### US-035 — AI tạo biên bản họp và action item

- **Source:** US-E35; source heading/priority: AI tạo biên bản họp và action item (`AIX-*`, `PRJ-*`, `DOC-*`) — Should/AI ưu tiên 4, Dùng chung.
- **Epic → Capability → Feature:** AI Assistance → AIX, PRJ, DOC → AI tạo biên bản họp và action item.
- **Persona:** Meeting Owner.
- **User story:** As a Meeting Owner, I want AI tạo draft biên bản, quyết định và action từ transcript/notes, so that trách nhiệm và deadline được ghi nhanh mà không gán sai cam kết cho người tham dự.
- **Business value:** trách nhiệm và deadline được ghi nhanh mà không gán sai cam kết cho người tham dự.
- **Trace:** BR-032, BR-034, BR-039; FR-192…FR-194; UC-035; Meeting review. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **Release 2**; Should/Pilot; **5 points preliminary**.
- **Normal flow:** consent/record → transcribe → draft/cite → owner review → participant confirmation khi cần → issue minutes → create actions.
- **Exception flow:** speaker không xác định, đa ngôn ngữ kém hoặc transcript thiếu được gắn uncertainty; objection được lưu và revision, không sửa biên bản đã phát hành.
- **Permission:** Meeting Owner khởi tạo/duyệt; attendee xem theo invite; external attendee chỉ bản phát hành; AI không tự gửi/assign trước xác nhận.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** AI policy/provider/corpus/citation/confidence and human review.
- **Risk:** Access leakage, hallucination, low confidence or unsafe automation.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-035

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-162"></a> **AC-162** | Người tham dự đã được thông báo/consent theo policy | AI xử lý transcript/notes | Tạo draft agenda, summary, decision, action/owner/due và citation timestamp/source |
| <a id="ac-163"></a> **AC-163** | Owner hoặc due date không được nói rõ | AI đề xuất | Đánh dấu `Chưa xác nhận`, không tự giao task hoặc gửi notification cho người đoán |
| <a id="ac-164"></a> **AC-164** | Meeting Owner review/edit | Phát hành minutes | Chỉ nội dung được xác nhận tạo task/decision log; minutes có revision/approval/distribution theo DMS |
| <a id="ac-165"></a> **AC-165** | Nội dung restricted xuất hiện | Chia sẻ minutes | Quyền/classification được re-check; bản tóm tắt không được làm lộ nội dung bị cấm |

<a id="us-036"></a>
### US-036 — AI kiểm tra thiếu hồ sơ và COD readiness

- **Source:** US-E36; source heading/priority: AI kiểm tra thiếu hồ sơ và COD readiness (`AIX-*`, `DOC-*`, `COM-*`) — Should/AI ưu tiên 5, Solar/BESS.
- **Epic → Capability → Feature:** AI Assistance → AIX, DOC, COM → AI kiểm tra thiếu hồ sơ và COD readiness.
- **Persona:** COD Coordinator.
- **User story:** As a COD Coordinator, I want AI đối chiếu checklist với document register/test package để gợi ý hồ sơ thiếu, sai revision hoặc sắp hết hạn, so that đội dự án đóng gap sớm trước gate COD.
- **Business value:** đội dự án đóng gap sớm trước gate COD.
- **Trace:** BR-023…BR-026, BR-039; FR-195…FR-197; UC-036; WF-023. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **Release 2**; Should/Pilot; **5 points preliminary**.
- **Normal flow:** index scoped evidence → deterministic checks + AI matching → coordinator triage → owner bổ sung → functional reviewer Pass → rerun.
- **Exception flow:** OCR thấp, link restricted hoặc document classification không chắc được gắn `Manual review`; hệ thống không coi “không tìm thấy” là bằng chứng tuyệt đối không tồn tại.
- **Permission:** Coordinator chạy; reviewer quyết định; AI chỉ truy evidence trong project/scope; client/lender thấy kết quả đã phát hành theo agreement.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** AI policy/provider/corpus/citation/confidence and human review.
- **Risk:** Access leakage, hallucination, low confidence or unsafe automation.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-036

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-166"></a> **AC-166** | COD checklist và evidence register tồn tại | AI/rule checker chạy | Trả danh sách missing/expired/superseded/possible match, citation/link, confidence và rule source |
| <a id="ac-167"></a> **AC-167** | AI tìm thấy tài liệu tên tương tự | Đề xuất mapping | Không tự đánh Pass; condition owner/reviewer phải xác nhận đúng loại/revision/signature/effective date |
| <a id="ac-168"></a> **AC-168** | Rule xác định critical condition fail | Command Center cập nhật | Dùng deterministic gate làm nguồn chính; AI giải thích/gợi ý action nhưng không override hoặc ký COD |
| <a id="ac-169"></a> **AC-169** | Reviewer xác nhận false positive/negative | Feedback lưu | Kết quả điều chỉnh cho lần chạy/quality metrics nhưng không sửa source document/checklist ngoài workflow |

<a id="us-037"></a>
### US-037 — AI dự báo dự án, bất thường BESS và tối ưu vận hành

- **Source:** US-E37; source heading/priority: AI dự báo dự án, bất thường BESS và tối ưu vận hành (`AIX-*`, `PRJ-*`, `BES-*`) — Future, Solar/BESS.
- **Epic → Capability → Feature:** AI Assistance → AIX, PRJ, BES → AI dự báo dự án, bất thường BESS và tối ưu vận hành.
- **Persona:** PM hoặc BESS Operator.
- **User story:** As a PM hoặc BESS Operator, I want AI dự báo trễ COD/vượt ngân sách, phát hiện bất thường và đề xuất lịch sạc–xả, so that tôi có thêm tín hiệu ra quyết định nhưng vẫn giữ vận hành trong hệ thống kiểm soát an toàn.
- **Business value:** tôi có thêm tín hiệu ra quyết định nhưng vẫn giữ vận hành trong hệ thống kiểm soát an toàn.
- **Trace:** BR-028, BR-032, BR-039, BR-040; FR-198, NFR-016, NFR-017; UC-037; Future pilot review. API/DB/SEC follow related artefacts; TEST forward reference.
- **Phase/priority/story points:** **Future**; Future; **5 points preliminary**.
- **Normal flow:** data quality gate → train/validate → shadow mode → human evaluation → recommendation → decision log → periodic monitoring.
- **Exception flow:** không đủ dữ liệu tiếp tục phương pháp thủ công/rule-based; model bias/leakage hoặc performance giảm sẽ disable; safety constraint luôn thắng economic objective.
- **Permission:** Model Owner triển khai; PM/Operator xem theo scope; Authorized Operator quyết định trong OT; AI service không có control credential.
- **Audit:** State/decision/create-update/export/AI/safety/financial actions record actor/effective actor, object/version, result and correlation; sensitive export/download/admin is audited.
- **Notification:** Committed workflow/domain events notify current authorized recipients; reminder/escalation never auto-approves or closes source state.
- **Dependencies:** AI policy/provider/corpus/citation/confidence and human review.
- **Risk:** Access leakage, hallucination, low confidence or unsafe automation.
- **Story-specific DoR:** Owner confirms state, authority, source data and calculation/evidence rules; unresolved item is explicit TBD/Open Question.
- **Story-specific DoD:** Standard DoD plus all AC below, related policy/workflow/audit/notification and trace links verified.
- **Technical Tasks:** confirm aggregate/DB constraints; finalize API/OpenAPI schema; implement policy/WF/state guards; build UX states; emit audit/outbox/notification; automate AC/negative tests; add observability/runbook.

#### Acceptance Criteria for US-037

| AC | Given | When | Then |
|---|---|---|---|
| <a id="ac-170"></a> **AC-170** | Dữ liệu lịch sử đủ chất lượng | Model dự báo | Hiển thị prediction interval, driver, training/as-of window, confidence và performance theo segment; không chỉ một ngày/số tuyệt đối |
| <a id="ac-171"></a> **AC-171** | Dữ liệu drift/stale/ngoài phạm vi model | Inference chạy | Gắn low-confidence/out-of-distribution hoặc từ chối dự báo; monitoring tạo model review |
| <a id="ac-172"></a> **AC-172** | AI đề xuất BESS dispatch | UI hiển thị | Lịch đề xuất thỏa kW/kWh, SOC min/max, reserve, efficiency, cycle/DoD, tariff và safety constraint; interval infeasible phải nêu rõ |
| <a id="ac-173"></a> **AC-173** | Operator chấp nhận đề xuất | Muốn áp dụng | Nền tảng PM chỉ xuất recommendation được duyệt/biên bản; **không** gửi setpoint/lệnh tới EMS/PCS/BMS; quy trình OT riêng chịu trách nhiệm thực thi |

## 7. Dependency sequencing

1. Platform/IAM/DMS/workflow/audit foundations.
2. Portfolio/project/schedule/risk/Command Center.
3. Contract/cost/procurement/logistics.
4. Field/QA/HSE/commissioning/COD.
5. O&M and Solar/BESS specialist capability.
6. Integration/telemetry read-only after discovery.
7. AI governance before any AI use case; advanced AI after data-quality/backtest.

## 8. Estimation notes

Points are relative, not duration. Two-squad roadmap requires capacity/skills/dependencies/review/test/environments. Split 13-point stories vertically without separating security/tenant/audit from business outcome. AC IDs stay with source story unless approved change updates changelog/trace.

## 9. Assumptions

| Assumption | Owner | Impact |
|---|---|---|
| 37 source stories/173 source AC + 4 approved base-auth AC là input hiện tại | Product Owner | Backlog baseline |
| Phase split 25/6/5/1 is working assumption | Product Owner/PMO | Release |
| Points 5/8/13 are preliminary | Delivery Teams | Planning |
| Two squads applies roadmap only | Delivery Lead | Throughput |
| MVP PM-first; no advanced telemetry/AI | Product Owner | Scope |
| Technical tasks receive no ID family | Governance/Engineering | Tooling |
| TEST IDs assigned in document 13 | QA | Trace |
| US-003 core đã Implemented/deployed nhưng full story chưa có đủ runtime/positive rebaseline evidence | Product Owner/QA | Không được báo Done/Pass sớm |

## 10. Open Questions

| Open Question | Owner | Blocks |
|---|---|---|
| Approve phase split and each story phase? | Product Owner | Release |
| Team velocity/skills/point scale? | Delivery Lead | Forecast |
| Non-waivable MVP controls? | PO/Security/HSE | DoD/release |
| Domain owner/approver/SLA/value limits? | Process Owners | DoR |
| External pilot/customer UAT stories? | Product/Commercial | Acceptance |
| Integration/OT sandbox/data dates? | System/OT Owners | US-028/029 |
| AI provider/corpus/quality/consent/kill switch? | AI Governance | US-031…037 |
| Accessibility/browser/device/offline matrix? | Product/UX/Security | UI DoD |
| UAT threshold/non-waivable test set? | PO/QA/Security/HSE | Release |
| Backlog tool/import format/owner? | Delivery Lead | Operationalization |

## 11. Changelog

| Version | Date | Author | Change | Scope impact |
|---|---|---|---|---|
| 0.1 | 2026-07-11 | Codex | Map US-E01…37 to US-001…037 and preserve 173 GWT as AC-001…173; normalize phase | Source AC unchanged; phase/points remain assumption |
| 0.2 | 2026-07-11 | Codex | Bổ sung AC-174…177 vào US-020 cho local JWT auth base/test profile | Product Owner phê duyệt trực tiếp; không thay thế yêu cầu SSO/MFA roadmap |
| 0.3 | 2026-07-11 | Codex | Duyệt US-001 làm vertical slice đầu tiên và chốt tenant/org/project lifecycle/role ban đầu | Không tự duyệt các story hoặc policy còn Open Question |
| 0.4 | 2026-07-11 | Codex | Đánh dấu US-001 Implemented sau migration/unit/integration/E2E/public deploy | Không đánh dấu US-002…037 hoàn tất |
| 0.5 | 2026-07-11 | Codex | Duyệt documentation gate US-003 và khóa calendar/CPM/weight/import/SoD/API-data-test/dependency contract | Build-ready; chưa Implemented/Done, không ghi test Pass |
| 0.6 | 2026-07-12 | Codex | Ghi core US-003 implementation/deploy và API-141 progress history | Core In Progress; chưa Done/Pass trước full runtime evidence và US-004 positive rebaseline |
| 0.7 | 2026-07-12 | Codex | Duyệt canonical gate US-004, concretize direct/dependency/API/data/config/SoD/closure/rebaseline tasks | Build-ready cho AC-014…017 EC2 test; Claim/FR-105 adapters chưa Implemented |
