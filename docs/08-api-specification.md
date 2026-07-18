# API Specification — Nền tảng Solar & BESS

> **Purpose:** Định nghĩa conventions, authentication/authorization, tenant context, error/idempotency/file/webhook/audit/versioning và danh mục 164 API operations, đồng bộ với OpenAPI 3.1.
> **Scope:** Business/API contract vendor-neutral cho PM Web, O&M và inbound read-only integration; schema nhỏ chưa rõ được đánh dấu TBD. Không có endpoint điều khiển BESS/OT.
> **Source:** [SRS](./04-SRS.md), [Domain Model](./05-domain-model.md), [Architecture](./06-solution-architecture.md), [Data Model](./07-data-model.md), [PRD](./03-PRD.md), [OpenAPI 3.1](./openapi/openapi.yaml).
> **Version:** 1.3
> **Status:** Draft toàn platform; US-001 và US-003 core APIs Implemented; API-008/036/038/143…164 Implemented local cho US-004; TEST-014…017 acceptance Partial và EC2 deployment Pending
> **Owner:** API Architecture / Domain Teams (cá nhân: TBD)
> **Updated:** 2026-07-18
> **Approval:** Product Owner delegated approval cho US-003/US-004 EC2 test contract và local implementation; EC2 deployment/acceptance đầy đủ cùng production authority matrix vẫn Pending/TBD

## 1. API principles

- Base path /v1; HTTPS only; JSON UTF-8; date-time RFC 3339 semantic; decimal money serialized as string.
- Every operation has unique API-* and x-api-id in OpenAPI. API ID is stable even if path/version changes.
- Tenant context is resolved from authenticated entitlement plus X-Tenant-Id; mismatch is deny, never client trust.
- Resource IDs are opaque; external IDs only via mapping.
- Command response returns resource/version or job/correlation; no ambiguous “success” before commit/queue acceptance.
- PM/O&M API has no start/stop/setpoint/reset/bypass/clear-source-alarm operation or control credential.
- Breaking change requires new API version and migration/deprecation plan; additive schema must preserve unknown-field behavior.
- US-001 operations use concrete `Company`, `LegalEntity`, `Portfolio`, `Project`, `Site` and `ProjectParty` schemas; `GenericCommand` is not permitted for this implementation slice. Create commands require `Idempotency-Key`; Project update requires numeric `If-Match` and an audit reason.
- US-003 operations API-023/024/034…037/140…142 use concrete package/calendar/WBS/activity/dependency/baseline/progress/export schemas; `GenericCommand`/untyped `Envelope` are prohibited for these operations. API-038/DB-067 remain a Risk/Change-owned dependency rather than direct schedule implementation; the approved-Change positive path is implemented locally through API-036/159.
- US-004 operations API-038/143…164 use separate concrete Risk, Issue, RiskIssueAction and ChangeRequest schemas, detail/action reads plus Project Controls-owned reverse baseline trace; API-008 is concretized as scoped assignee dependency. `GenericCommand`/untyped `Envelope` are prohibited; all mutations use DB-104 idempotency, tenant/project/package re-check, optimistic version where applicable and immutable DB-098/DB-102 facts.

## 2. Authentication, authorization và tenant context

Bearer token or approved service identity authenticates subject; MFA/step-up is policy-driven. Base/test profile dùng API-137…139 với tenantCode + email + local password, access JWT 15 phút và refresh JWT HttpOnly 7 ngày có rotation/revoke. Gateway identity uses mutual TLS plus allowlisted site/gateway scope. Every request is evaluated RBAC + ABAC + SoD/status/legal hold in the order defined by SRS. X-Tenant-Id áp dụng cho business API sau xác thực; auth API tự resolve tenant từ signed/session context và không tin tenant header do client tự khai.

## 3. Headers and concurrency

| Header | Applies | Rule |
|---|---|---|
| Authorization | Human/service API | Bearer/service identity; never in query/log |
| X-Tenant-Id | All tenant operations | Must match token/service entitlement |
| X-Correlation-Id | All | Server creates if absent; returned |
| X-Request-Id | All | Trace one attempt |
| Idempotency-Key | Command marked required | Scope tenant+client+operation; same payload replays, different payload 409 |
| If-Match | PATCH/locked mutable commands | Expected version; stale gives 409 |
| Accept-Language | UI/report | vi-VN/en; canonical values unchanged |
| X-Site-Timezone | Time-sensitive input where approved | Valid IANA timezone; server/source timestamps retained |

## 4. Pagination, filtering, sorting và search

Collection GET uses opaque cursor, limit, allowlisted filter and sort with stable ID tie-breaker. Default/max limit, query complexity and filter grammar are TBD. Search POST supports structured criteria, full-text terms, data-as-of and modules; snippets/results are ACL filtered and record open/download re-authorizes. Total count may be approximate and must say so.

## 5. Idempotency, retry and rate limiting

POST/PUT/PATCH/domain actions require Idempotency-Key unless explicitly safe-body search. Async callback/integration uses external event ID/checkpoint. 429 includes Retry-After and limit scope; limit policy is tenant/client/operation aware and must not starve safety reporting. Retryable 503/424 never claims domain success. DLQ/replay requires privileged authorization and audit.

## 6. Error response

Error envelope: code, localized safe message, correlationId, retryable, fieldErrors, currentVersion/currentState when authorized, dependencyClass and documentationRef. Common status: 400 schema; 401 auth; 403/404 anti-enumeration; 409 state/version/idempotency; 422 domain/file; 423 locked/quarantined; 424 dependency; 429 rate; 500 opaque internal.

## 7. File upload and malware gate

API-042 creates scoped upload session and constraints. Client uploads chunks to quarantine using short-lived scope. API-043 finalizes hash/MIME/size and triggers scan; only Safe result creates releasable revision. Timeout/unknown stays quarantined. Preview/OCR/index/download/share never bypass scan. Signed/issued hash is immutable.

## 8. Webhook contract

API-126 is outbound delivery to subscriber callback, signed with timestamp/event ID/key version; receiver verifies replay window/signature and responds idempotently. Payload has tenant-safe subscription scope, event type/version, object reference and correlation, not unrestricted object body. Retry/DLQ/disable/reconciliation are audited. Inbound e-sign/ERP callbacks use connector contracts and API-123 sync command/adapter; exact provider paths are TBD.

## 9. Audit and versioning

Critical command, denial, share/download/export, payment, approval, signature, safety and admin actions record actor/effective actor, API ID, request/correlation/idempotency, object/version/result. API version and schema/event version are separate. Deprecation notice/sunset policy and client support window are TBD.

## 10. API catalog

| API | Method/path | Purpose | Permission / data scope | Idempotency/concurrency | Trace FR / DB / SEC |
|---|---|---|---|---|---|
| <a id="api-001"></a> **API-001** | GET /v1/me | Đọc identity, tenant context và profile hiệu lực | authenticated; current tenant/user | safe | FR-146 / DB-001, DB-005 / SEC-101, SEC-105 |
| <a id="api-002"></a> **API-002** | GET /v1/me/permissions | Đọc effective action/data scope có giải thích an toàn | permission.read.self; current user | safe | FR-147 / DB-006, DB-007, DB-008 / SEC-106, SEC-107 |
| <a id="api-003"></a> **API-003** | GET /v1/tenants/{tenantId} | Đọc tenant configuration được phép | tenant.read; tenant | safe | FR-146 / DB-001 / SEC-105 |
| <a id="api-004"></a> **API-004** | GET /v1/companies | Liệt kê Company theo scope | organization.read; tenant/company | safe | FR-037 / DB-002 / SEC-105, SEC-107 |
| <a id="api-005"></a> **API-005** | POST /v1/companies | Tạo Company master | organization.create; tenant | required | FR-037 / DB-002 / SEC-104, SEC-107 |
| <a id="api-006"></a> **API-006** | GET /v1/legal-entities | Liệt kê LegalEntity theo scope | legalEntity.read; tenant/legal entity | safe | FR-037 / DB-003 / SEC-107, SEC-114 |
| <a id="api-007"></a> **API-007** | POST /v1/legal-entities | Đăng ký LegalEntity bằng stable identity | legalEntity.create; tenant/company | required | FR-037 / DB-003 / SEC-104, SEC-114 |
| <a id="api-008"></a> **API-008** | GET /v1/users?projectId&packageId&requiredPermission | Liệt kê assignee active tối thiểu theo project/exact-package/capability | user.read; effective project/package assignment | safe; search/cursor/limit | FR-099/100/146 / DB-005/006/007 / SEC-105/107/111/130 |
| <a id="api-009"></a> **API-009** | POST /v1/role-assignments | Cấp role assignment có scope/effective period | roleAssignment.grant; tenant/data scope | required | FR-148 / DB-006, DB-007 / SEC-104, SEC-106, SEC-107 |
| <a id="api-010"></a> **API-010** | DELETE /v1/role-assignments/{roleAssignmentId} | Thu hồi role assignment, không xóa lịch sử | roleAssignment.revoke; assignment scope | safe | FR-148 / DB-007 / SEC-104, SEC-118 |
| <a id="api-011"></a> **API-011** | POST /v1/delegations | Tạo delegation bounded, không chain/vượt quyền | delegation.create; delegator scope | required | FR-150 / DB-008 / SEC-108, SEC-110 |
| <a id="api-012"></a> **API-012** | POST /v1/delegations/{delegationId}:revoke | Thu hồi delegation | delegation.revoke; delegation scope | required | FR-150 / DB-008 / SEC-110, SEC-118 |
| <a id="api-013"></a> **API-013** | GET /v1/audit-events | Tra cứu audit theo mandate | audit.read; tenant/object/field | safe | FR-154 / DB-098 / SEC-104, SEC-118 |
| <a id="api-014"></a> **API-014** | GET /v1/system/status | Đọc trạng thái dịch vụ không lộ nội bộ | systemStatus.read; tenant/service tier | safe | FR-161 / DB-097 / SEC-122, SEC-131 |
| <a id="api-015"></a> **API-015** | GET /v1/portfolios | Liệt kê portfolio và aggregate được phép | portfolio.read; tenant/portfolio | safe | FR-010 / DB-009 / SEC-107, SEC-111 |
| <a id="api-016"></a> **API-016** | POST /v1/portfolios | Tạo portfolio | portfolio.create; tenant | required | FR-010 / DB-009 / SEC-111, SEC-118 |
| <a id="api-017"></a> **API-017** | GET /v1/projects | Liệt kê project theo filter/cursor | project.read; tenant/legal entity/portfolio | safe | FR-011 / DB-010 / SEC-107, SEC-111 |
| <a id="api-018"></a> **API-018** | POST /v1/projects | Tạo project master | project.create; tenant/portfolio/legal entity | required | FR-011 / DB-010 / SEC-108, SEC-111 |
| <a id="api-019"></a> **API-019** | GET /v1/projects/{projectId} | Đọc project overview và data freshness | project.read; project | safe | FR-012 / DB-010 / SEC-111 |
| <a id="api-020"></a> **API-020** | PATCH /v1/projects/{projectId} | Cập nhật project master bằng If-Match | project.update; project/field | required + If-Match | FR-011 / DB-010 / SEC-109, SEC-111 |
| <a id="api-021"></a> **API-021** | GET /v1/projects/{projectId}/sites | Liệt kê site | site.read; project/site | safe | FR-013 / DB-011 / SEC-111 |
| <a id="api-022"></a> **API-022** | POST /v1/projects/{projectId}/sites | Tạo site | site.create; project | required | FR-013 / DB-011 / SEC-111, SEC-118 |
| <a id="api-023"></a> **API-023** | GET /v1/projects/{projectId}/packages | Liệt kê active/authorized Package theo project/package scope | package.read; project/package | safe; cursor/limit/status | FR-016 / DB-012 / SEC-105, SEC-107, SEC-111 |
| <a id="api-024"></a> **API-024** | POST /v1/projects/{projectId}/packages | Tạo Package bằng `CreatePackageRequest` | package.create; project và parent/contractor scope | DB-104 required + expected project state | FR-016 / DB-012, DB-104 / SEC-108, SEC-111, SEC-118 |
| <a id="api-025"></a> **API-025** | PUT /v1/projects/{projectId}/parties/{partyId} | Upsert project party và RACI có hiệu lực | projectParty.manage; project/package | required + If-Match | FR-014 / DB-013 / SEC-108, SEC-111 |
| <a id="api-026"></a> **API-026** | GET /v1/opportunities | Liệt kê opportunity pipeline | opportunity.read; tenant/company/site | safe | FR-001 / DB-014 / SEC-107 |
| <a id="api-027"></a> **API-027** | POST /v1/opportunities | Tạo opportunity có duplicate check | opportunity.create; tenant/company/site | required | FR-001 / DB-014 / SEC-107, SEC-118 |
| <a id="api-028"></a> **API-028** | GET /v1/opportunities/{opportunityId} | Đọc opportunity, assumptions và lineage | opportunity.read; opportunity | safe | FR-001 / DB-014, DB-015, DB-016 / SEC-107 |
| <a id="api-029"></a> **API-029** | PATCH /v1/opportunities/{opportunityId} | Cập nhật stage/owner/next action bằng version | opportunity.update; opportunity | required + If-Match | FR-001 / DB-014 / SEC-109 |
| <a id="api-030"></a> **API-030** | POST /v1/opportunities/{opportunityId}/survey-packages | Tạo survey revision có provenance | survey.create; opportunity/site | required | FR-002 / DB-015 / SEC-111, SEC-120 |
| <a id="api-031"></a> **API-031** | POST /v1/opportunities/{opportunityId}/investment-scenarios | Tạo scenario input snapshot | scenario.create; opportunity | required | FR-004 / DB-016 / SEC-107, SEC-118 |
| <a id="api-032"></a> **API-032** | POST /v1/investment-scenarios/{scenarioId}:submit | Submit scenario/decision vào workflow | scenario.submit; scenario | required | FR-008 / DB-016, DB-071 / SEC-108, SEC-109 |
| <a id="api-033"></a> **API-033** | POST /v1/opportunities/{opportunityId}:convert | Chuyển approved opportunity thành project idempotent | opportunity.convert; opportunity/target portfolio | required | FR-009 / DB-014, DB-010 / SEC-108, SEC-118 |
| <a id="api-034"></a> **API-034** | GET /v1/projects/{projectId}/schedule | Đọc `ProjectScheduleResponse` theo dataDate/lookAhead/baseline | schedule.read; project/package/authorized rows | safe; query snapshot | FR-017…019 / DB-012, DB-017…021, DB-101, DB-105 / SEC-105, SEC-107, SEC-111, SEC-119 |
| <a id="api-035"></a> **API-035** | POST /v1/projects/{projectId}/schedule:apply-draft | PREVIEW hoặc atomically COMMIT explicit calendar/WBS/activity/dependency delta | schedule.manage/import; project/package | DB-104 required; expectedVersion; PREVIEW no side effect | FR-016/017 / DB-012, DB-017…019, DB-098, DB-101…104 / SEC-109, SEC-111, SEC-118 |
| <a id="api-036"></a> **API-036** | POST /v1/projects/{projectId}/schedule-baselines | Submit INITIAL/REBASELINE immutable snapshot candidate | baseline.submit; INITIAL theo authorized project scope; REBASELINE full-project only | DB-104 required; expectedScheduleVersion | FR-018 / DB-020, DB-067 dependency, DB-098, DB-102, DB-104 / SEC-108, SEC-109, SEC-111 |
| <a id="api-037"></a> **API-037** | POST /v1/projects/{projectId}/progress-updates | Append/correct progress/actual/evidence bằng `ProgressUpdateRequest` | progress.record/correct; project/package/activity owner | DB-104 required; expectedActivityVersion | FR-019 / DB-018, DB-021, DB-098, DB-102, DB-104 / SEC-109, SEC-111, SEC-118 |
| <a id="api-038"></a> **API-038** | POST /v1/projects/{projectId}/risks | Tạo Risk cause–event–impact, probability và cost/schedule/HSE impact 1…5; server tính exposure | riskChange.create; full project hoặc exact package; `packageId=NULL` cần full-project | DB-104 required | FR-098/099 / DB-065/098/102/104 / SEC-105/107/111/118 |
| <a id="api-039"></a> **API-039** | GET /v1/projects/{projectId}/documents | Liệt kê document register | document.read; project/folder/document/field | safe | FR-026 / DB-022 / SEC-112 |
| <a id="api-040"></a> **API-040** | POST /v1/projects/{projectId}/documents | Tạo Document logical record | document.create; project/folder | required | FR-026 / DB-022 / SEC-112, SEC-118 |
| <a id="api-041"></a> **API-041** | GET /v1/documents/{documentId} | Đọc document/current-for-use/revision metadata | document.read; document | safe | FR-027 / DB-022, DB-023 / SEC-112 |
| <a id="api-042"></a> **API-042** | POST /v1/documents/{documentId}/upload-sessions | Khởi tạo upload session vào quarantine | documentRevision.upload; document | required | FR-027 / DB-023 / SEC-120, SEC-121 |
| <a id="api-043"></a> **API-043** | POST /v1/upload-sessions/{uploadSessionId}:finalize | Finalize hash/scan và tạo revision an toàn | documentRevision.upload; upload/document | required | FR-027 / DB-023 / SEC-120, SEC-121 |
| <a id="api-044"></a> **API-044** | GET /v1/document-revisions/{revisionId} | Đọc revision metadata/scan/hash/ACL | documentRevision.read; revision | safe | FR-027 / DB-023 / SEC-112, SEC-120 |
| <a id="api-045"></a> **API-045** | POST /v1/document-revisions/{revisionId}:submit-review | Submit review cycle | documentRevision.submitReview; revision | required | FR-028 / DB-023, DB-024, DB-071 / SEC-108, SEC-112 |
| <a id="api-046"></a> **API-046** | POST /v1/document-revisions/{revisionId}/comments | Ghi review comment/disposition | documentComment.create; revision/cycle | required | FR-028 / DB-024 / SEC-112 |
| <a id="api-047"></a> **API-047** | POST /v1/document-revisions/{revisionId}:approve | Approve revision theo workflow result | documentRevision.approve; revision | required | FR-029 / DB-023, DB-072 / SEC-108, SEC-109, SEC-112 |
| <a id="api-048"></a> **API-048** | POST /v1/document-revisions/{revisionId}:issue | Issue immutable revision/current-for-use | documentRevision.issue; revision | required | FR-029 / DB-023 / SEC-109, SEC-112, SEC-118 |
| <a id="api-049"></a> **API-049** | POST /v1/projects/{projectId}/transmittals | Tạo/issue transmittal snapshot | transmittal.issue; project/revisions/recipients | required | FR-031 / DB-025, DB-026 / SEC-112, SEC-113 |
| <a id="api-050"></a> **API-050** | POST /v1/transmittals/{transmittalId}/responses | Ghi response/disposition | transmittal.respond; recipient/transmittal item | required | FR-032 / DB-026 / SEC-113 |
| <a id="api-051"></a> **API-051** | POST /v1/document-revisions/{revisionId}/external-shares | Tạo share có expiry/watermark/download policy | documentShare.create; revision/recipient | required | FR-033 / DB-023 / SEC-113, SEC-119 |
| <a id="api-052"></a> **API-052** | POST /v1/document-revisions/{revisionId}/signature-envelopes | Khởi tạo e-sign với signer snapshot/hash | documentSignature.start; revision/signers | required | FR-034 / DB-027 / SEC-102, SEC-112, SEC-126 |
| <a id="api-053"></a> **API-053** | GET /v1/projects/{projectId}/contracts | Liệt kê contract register | contract.read; project/legal entity/field | safe | FR-036 / DB-028 / SEC-114 |
| <a id="api-054"></a> **API-054** | POST /v1/projects/{projectId}/contracts | Tạo contract record | contract.create; project/legal entity | required | FR-036 / DB-028 / SEC-108, SEC-114 |
| <a id="api-055"></a> **API-055** | GET /v1/contracts/{contractId} | Đọc contract consolidated view | contract.read; contract/field | safe | FR-036 / DB-028, DB-029, DB-030 / SEC-114 |
| <a id="api-056"></a> **API-056** | PATCH /v1/contracts/{contractId} | Cập nhật contract draft bằng version | contract.update; contract/field | required + If-Match | FR-036 / DB-028 / SEC-109, SEC-114 |
| <a id="api-057"></a> **API-057** | POST /v1/contracts/{contractId}/parties | Thêm ContractParty legal snapshot | contractParty.create; contract/legal entity | required | FR-037 / DB-029 / SEC-108, SEC-114 |
| <a id="api-058"></a> **API-058** | POST /v1/contracts/{contractId}/appendices | Tạo appendix bắt buộc parent | contractAppendix.create; contract | required | FR-038 / DB-030 / SEC-109, SEC-114 |
| <a id="api-059"></a> **API-059** | GET /v1/contracts/{contractId}/obligations | Liệt kê nghĩa vụ/permit/guarantee | obligation.read; contract/field | safe | FR-039 / DB-031, DB-032, DB-033 / SEC-114 |
| <a id="api-060"></a> **API-060** | POST /v1/contracts/{contractId}/obligations | Tạo obligation có clause/trigger/evidence rule | obligation.create; contract | required | FR-039 / DB-031 / SEC-114 |
| <a id="api-061"></a> **API-061** | POST /v1/obligations/{obligationId}:fulfill | Ghi fulfillment/waiver có evidence/authority | obligation.fulfill; obligation | required | FR-040 / DB-031 / SEC-108, SEC-109, SEC-114 |
| <a id="api-062"></a> **API-062** | GET /v1/projects/{projectId}/cost-summary | Đọc budget/commitment/payment grouped currency | cost.read; project/legal entity/cost code | safe | FR-053 / DB-034, DB-035, DB-036, DB-038, DB-040 / SEC-114, SEC-119 |
| <a id="api-063"></a> **API-063** | POST /v1/projects/{projectId}/budget-versions | Tạo/submit budget version | budget.submit; project/legal entity | required | FR-053 / DB-035 / SEC-108, SEC-114 |
| <a id="api-064"></a> **API-064** | POST /v1/projects/{projectId}/commitments | Ghi commitment từ contract/PO idempotent | commitment.create; project/contract/cost code | required | FR-054 / DB-036 / SEC-108, SEC-114 |
| <a id="api-065"></a> **API-065** | POST /v1/contracts/{contractId}/payments | Tạo payment có payer/payee/components/currency và invoice reference | payment.create; contract/legal entity | required | FR-056 / DB-037, DB-038, DB-039, DB-040 / SEC-108, SEC-114, SEC-118 |
| <a id="api-066"></a> **API-066** | GET /v1/payments/{paymentId} | Đọc payment/approval/posting/reconciliation | payment.read; payment/field | safe | FR-060 / DB-038, DB-039 / SEC-114, SEC-119 |
| <a id="api-067"></a> **API-067** | GET /v1/equipment-models | Liệt kê approved equipment models | equipmentModel.read; tenant/category | safe | FR-045 / DB-041 / SEC-107 |
| <a id="api-068"></a> **API-068** | POST /v1/equipment-models | Tạo equipment model version | equipmentModel.create; tenant/category | required | FR-045 / DB-041 / SEC-107, SEC-118 |
| <a id="api-069"></a> **API-069** | GET /v1/projects/{projectId}/bill-of-materials | Đọc BOM/revision/lineage | bom.read; project/design | safe | FR-046 / DB-042, DB-043 / SEC-111 |
| <a id="api-070"></a> **API-070** | POST /v1/projects/{projectId}/bill-of-materials:release | Release immutable BOM version | bom.release; project/design | required | FR-047 / DB-042, DB-043 / SEC-108, SEC-109 |
| <a id="api-071"></a> **API-071** | POST /v1/projects/{projectId}/substitutions | Submit technical substitution | substitution.submit; project/package/design | required | FR-050 / DB-041, DB-043 / SEC-108, SEC-111 |
| <a id="api-072"></a> **API-072** | GET /v1/solar-plants/{solarPlantId} | Đọc Solar hierarchy/config/KPI provenance | solarPlant.read; project/site/asset | safe | FR-125 / DB-080, DB-081, DB-093 / SEC-111, SEC-128 |
| <a id="api-073"></a> **API-073** | POST /v1/solar-plants/{solarPlantId}:release-configuration | Release Solar configuration version | solarPlant.configure; project/site | required | FR-126 / DB-079, DB-080, DB-081 / SEC-108, SEC-128 |
| <a id="api-074"></a> **API-074** | GET /v1/bess-plants/{bessPlantId} | Đọc BESS hierarchy/envelope/read-only status | bessPlant.read; project/site/asset/field | safe | FR-130 / DB-080, DB-082, DB-090 / SEC-127, SEC-128 |
| <a id="api-075"></a> **API-075** | POST /v1/bess-plants/{bessPlantId}:simulate-dispatch | Chạy mô phỏng dispatch advisory; không phát setpoint | bessSimulation.run; project/site/scenario | required | FR-133 / DB-016, DB-082 / SEC-128 |
| <a id="api-076"></a> **API-076** | GET /v1/suppliers | Liệt kê supplier/qualification | supplier.read; tenant/category | safe | FR-061 / DB-044 / SEC-107 |
| <a id="api-077"></a> **API-077** | POST /v1/projects/{projectId}/requisitions | Tạo/submit requisition | requisition.create; project/package/WBS/cost | required | FR-062 / DB-045 / SEC-108, SEC-111 |
| <a id="api-078"></a> **API-078** | POST /v1/requisitions/{requisitionId}/rfqs | Tạo/issue RFQ revision | rfq.issue; requisition/bidder scope | required | FR-063 / DB-046 / SEC-108, SEC-114 |
| <a id="api-079"></a> **API-079** | POST /v1/rfqs/{rfqId}/bids | Supplier submit sealed bid | bid.submit; supplier/RFQ | required | FR-064 / DB-047 / SEC-114, SEC-130 |
| <a id="api-080"></a> **API-080** | POST /v1/bids/{bidId}/evaluations | Ghi technical/commercial evaluation | bid.evaluate; evaluation team/field | required | FR-065 / DB-048 / SEC-108, SEC-114 |
| <a id="api-081"></a> **API-081** | POST /v1/rfqs/{rfqId}:submit-award | Submit award decision | award.submit; RFQ/project/legal entity | required | FR-066 / DB-047, DB-048, DB-071 / SEC-108, SEC-114 |
| <a id="api-082"></a> **API-082** | POST /v1/projects/{projectId}/purchase-orders | Tạo/issue PO revision | purchaseOrder.issue; project/supplier/contract | required | FR-067 / DB-049, DB-050 / SEC-108, SEC-114 |
| <a id="api-083"></a> **API-083** | POST /v1/purchase-orders/{purchaseOrderId}/shipments | Tạo shipment và committed dates | shipment.create; PO/supplier | required | FR-069 / DB-051 / SEC-114 |
| <a id="api-084"></a> **API-084** | POST /v1/shipments/{shipmentId}/milestones | Ghi ETA/actual milestone append-only | shipment.updateMilestone; shipment | required | FR-070 / DB-051 / SEC-114, SEC-125 |
| <a id="api-085"></a> **API-085** | POST /v1/purchase-orders/{purchaseOrderId}/goods-receipts | Ghi partial receipt, exception và serial | goodsReceipt.create; PO/site/package | required | FR-071 / DB-052, DB-053, DB-054 / SEC-111, SEC-118 |
| <a id="api-086"></a> **API-086** | GET /v1/projects/{projectId}/workfronts | Liệt kê workfront/readiness | workfront.read; project/site/package | safe | FR-075 / DB-055 / SEC-111 |
| <a id="api-087"></a> **API-087** | POST /v1/workfronts/{workfrontId}:release | Release workfront sau readiness gates | workfront.release; workfront/site | required | FR-078 / DB-055 / SEC-108, SEC-109 |
| <a id="api-088"></a> **API-088** | POST /v1/projects/{projectId}/daily-logs | Tạo daily log draft/offline sync | dailyLog.create; project/site/contractor | required | FR-079 / DB-056 / SEC-111, SEC-123 |
| <a id="api-089"></a> **API-089** | POST /v1/daily-logs/{dailyLogId}:submit | Submit/sign daily log revision | dailyLog.submit; daily log | required | FR-080 / DB-056 / SEC-108, SEC-109 |
| <a id="api-090"></a> **API-090** | POST /v1/workfronts/{workfrontId}/quantity-progress | Ghi quantity/evidence/certification request | progress.record; workfront/WBS | required | FR-077 / DB-057 / SEC-111 |
| <a id="api-091"></a> **API-091** | POST /v1/workfronts/{workfrontId}/permits-to-work | Yêu cầu PTW | permitToWork.request; workfront/site | required | FR-085 / DB-062 / SEC-108, SEC-114 |
| <a id="api-092"></a> **API-092** | POST /v1/permits-to-work/{permitToWorkId}:issue | Cấp/suspend PTW theo authority | permitToWork.issue; permit/site | required | FR-086 / DB-062 / SEC-102, SEC-108 |
| <a id="api-093"></a> **API-093** | POST /v1/projects/{projectId}/hse-incidents | Báo HSE incident khẩn cấp | hseIncident.report; project/site/restricted fields | required | FR-087 / DB-063 / SEC-114, SEC-130 |
| <a id="api-094"></a> **API-094** | POST /v1/projects/{projectId}/stop-work-actions | Issue hoặc lift stop-work theo action/authority | stopWork.manage; project/site/workfront | required | FR-088 / DB-062, DB-063, DB-055 / SEC-102, SEC-108 |
| <a id="api-095"></a> **API-095** | POST /v1/inspection-test-plans/{itpId}/inspections | Request/record inspection result | inspection.manage; project/package/workfront | required | FR-092 / DB-058, DB-059 / SEC-108, SEC-111 |
| <a id="api-096"></a> **API-096** | POST /v1/projects/{projectId}/ncrs | Raise/update NCR with disposition command | ncr.manage; project/package/equipment | required | FR-094 / DB-060, DB-064 / SEC-108, SEC-111 |
| <a id="api-097"></a> **API-097** | POST /v1/projects/{projectId}/punch-items | Create/update/close punch by command | punch.manage; project/system/asset | required | FR-096 / DB-061 / SEC-108, SEC-111 |
| <a id="api-098"></a> **API-098** | GET /v1/projects/{projectId}/commissioning-systems | Liệt kê system/subsystem/readiness | commissioning.read; project/system | safe | FR-106 / DB-073 / SEC-111 |
| <a id="api-099"></a> **API-099** | POST /v1/projects/{projectId}/commissioning-systems | Tạo system boundary | commissioningSystem.create; project | required | FR-106 / DB-073 / SEC-111 |
| <a id="api-100"></a> **API-100** | POST /v1/commissioning-systems/{systemId}/test-packs | Tạo/approve test pack revision | testPack.create; system | required | FR-107 / DB-074 / SEC-108, SEC-111 |
| <a id="api-101"></a> **API-101** | POST /v1/test-packs/{testPackId}/test-runs | Start test run after prerequisites | testRun.start; test pack/system | required | FR-108 / DB-075 / SEC-108, SEC-114 |
| <a id="api-102"></a> **API-102** | POST /v1/test-runs/{testRunId}:complete | Record pass/fail/abort immutable result | testRun.complete; test run | required | FR-109 / DB-075 / SEC-108, SEC-109 |
| <a id="api-103"></a> **API-103** | POST /v1/test-runs/{testRunId}:create-retest | Create retest linked to failed/aborted run | testRun.retest; test run | required | FR-110 / DB-075 / SEC-109 |
| <a id="api-104"></a> **API-104** | GET /v1/projects/{projectId}/cod-readiness | Đọc gate/evidence/expiry/confidence snapshot | cod.read; project/gate/document fields | safe | FR-112 / DB-076, DB-077 / SEC-111, SEC-112 |
| <a id="api-105"></a> **API-105** | POST /v1/projects/{projectId}/cod-transition-commands | Submit/sign COD hoặc accept handover theo command type | cod.manage; project/gate/package/recipient | required | FR-113, FR-114 / DB-076, DB-077, DB-078 / SEC-102, SEC-108, SEC-109 |
| <a id="api-106"></a> **API-106** | GET /v1/workflow-definitions | Liệt kê workflow definitions/versions | workflowDefinition.read; tenant/process | safe | FR-138 / DB-069, DB-070 / SEC-104, SEC-107 |
| <a id="api-107"></a> **API-107** | POST /v1/workflow-definitions/{definitionId}:publish | Publish immutable workflow version | workflowDefinition.publish; tenant/process | required | FR-138 / DB-070 / SEC-104, SEC-108 |
| <a id="api-108"></a> **API-108** | POST /v1/workflow-instances | Start workflow with object/version snapshot | workflow.start; object/data scope | required | FR-139 / DB-071 / SEC-108, SEC-110 |
| <a id="api-109"></a> **API-109** | GET /v1/workflow-instances/{workflowInstanceId} | Đọc workflow history và current tasks | workflow.read; instance/object | safe | FR-139 / DB-071, DB-072 / SEC-107 |
| <a id="api-110"></a> **API-110** | GET /v1/approval-tasks | Liệt kê task của effective actor | approvalTask.read; actor/delegation/data scope | safe | FR-140 / DB-071, DB-072 / SEC-107, SEC-110 |
| <a id="api-111"></a> **API-111** | POST /v1/workflow-instances/{workflowInstanceId}/decisions | Ghi approve/reject/return/conditional decision | approval.decide; instance/step | required | FR-140 / DB-072 / SEC-102, SEC-108, SEC-110 |
| <a id="api-112"></a> **API-112** | POST /v1/workflow-instances/{workflowInstanceId}:cancel | Cancel workflow theo policy | workflow.cancel; instance/object | required | FR-141 / DB-071 / SEC-108, SEC-109 |
| <a id="api-113"></a> **API-113** | POST /v1/workflow-instances/{workflowInstanceId}:escalate | Escalate/remind, không auto-approve | workflow.escalate; instance/step | required | FR-142 / DB-071 / SEC-108, SEC-118 |
| <a id="api-114"></a> **API-114** | GET /v1/sites/{siteId}/alarm-cases | Liệt kê AlarmCase local với source quality | alarmCase.read; site/asset/field | safe | FR-118 / DB-084, DB-092 / SEC-127, SEC-128 |
| <a id="api-115"></a> **API-115** | POST /v1/alarm-cases/{alarmCaseId}:acknowledge | Acknowledge local case; không clear/reset OT | alarmCase.acknowledge; alarm case | required | FR-118 / DB-084 / SEC-128 |
| <a id="api-116"></a> **API-116** | GET /v1/sites/{siteId}/service-incidents | Liệt kê ServiceIncident/SLA | serviceIncident.read; site/asset | safe | FR-119 / DB-085 / SEC-128 |
| <a id="api-117"></a> **API-117** | POST /v1/sites/{siteId}/service-incidents | Tạo ServiceIncident từ case/report | serviceIncident.create; site/asset | required | FR-119 / DB-085 / SEC-128 |
| <a id="api-118"></a> **API-118** | GET /v1/assets/{assetId}/work-orders | Liệt kê work orders cùng maintenance/warranty context | workOrder.read; asset/site | safe | FR-120 / DB-083, DB-086, DB-087 / SEC-111, SEC-128 |
| <a id="api-119"></a> **API-119** | POST /v1/assets/{assetId}/work-orders | Tạo work order với PTW/SLA, maintenance plan và warranty prerequisites | workOrder.create; asset/site | required | FR-120 / DB-083, DB-086, DB-087 / SEC-108, SEC-128 |
| <a id="api-120"></a> **API-120** | POST /v1/work-orders/{workOrderId}/actions | Dispatch/start/complete/verify/close và warranty-claim action theo state/authority | workOrder.manage; work order | required | FR-121, FR-122 / DB-086, DB-088 / SEC-108, SEC-109, SEC-128 |
| <a id="api-121"></a> **API-121** | GET /v1/assets/{assetId}/performance | Đọc Solar/BESS KPI, meter/billing provenance và read-only telemetry | performance.read; asset/site/tag fields | safe | FR-116, FR-117, FR-123, FR-124 / DB-080, DB-091, DB-093, DB-094, DB-095 / SEC-127, SEC-128 |
| <a id="api-122"></a> **API-122** | GET /v1/integrations/connectors | Đọc connector SoR/direction/health | connector.read; tenant/system | safe | FR-156 / DB-096, DB-097 / SEC-104, SEC-125 |
| <a id="api-123"></a> **API-123** | POST /v1/integrations/sync-runs | Start/replay/reconcile sync theo command type | connector.run; tenant/system/object scope | required | FR-157 / DB-096, DB-097 / SEC-104, SEC-125 |
| <a id="api-124"></a> **API-124** | GET /v1/integrations/sync-runs/{syncRunId} | Đọc checkpoint/count/error/reconciliation | connector.read; sync run | safe | FR-158 / DB-097 / SEC-125 |
| <a id="api-125"></a> **API-125** | POST /v1/integrations/telemetry-events | Nhận telemetry/alarm outbound từ gateway, read-only | telemetry.ingest; gateway/site/tag allowlist | required | FR-165 / DB-089, DB-090, DB-091, DB-092 / SEC-127, SEC-128 |
| <a id="api-126"></a> **API-126** | POST subscriber callback URL | Deliver signed domain notification webhook | webhook.receive; subscription/event scope | event-id | FR-160 / DB-097 / SEC-125, SEC-126 |
| <a id="api-127"></a> **API-127** | POST /v1/ai/runs | Start governed AI use case | ai.run; tenant/project/corpus/use case | required | FR-178 / DB-022, DB-028, DB-077 / SEC-104, SEC-107, SEC-130 |
| <a id="api-128"></a> **API-128** | GET /v1/ai/runs/{aiRunId} | Đọc proposal/citations/confidence/status | ai.read; AI run/source scope | safe | FR-180 / DB-022, DB-098 / SEC-107, SEC-130 |
| <a id="api-129"></a> **API-129** | POST /v1/ai/runs/{aiRunId}/reviews | Accept/edit/reject proposal; chỉ domain Draft | ai.review; AI run/domain draft scope | required | FR-181 / DB-098 / SEC-108, SEC-118, SEC-130 |
| <a id="api-130"></a> **API-130** | POST /v1/search | Search ACL-aware across allowed modules | search.execute; tenant/data scope/fields | safe-body | FR-171 / DB-022, DB-028, DB-010 / SEC-107, SEC-112, SEC-119 |
| <a id="api-131"></a> **API-131** | GET /v1/saved-views | Liệt kê saved views; re-evaluate permission | savedView.read; tenant/user/module | safe | FR-172 / DB-005 / SEC-107 |
| <a id="api-132"></a> **API-132** | POST /v1/saved-views | Tạo saved view không lưu quyền | savedView.create; tenant/user/module | required | FR-172 / DB-005 / SEC-107, SEC-118 |
| <a id="api-133"></a> **API-133** | POST /v1/report-jobs | Start async report/export snapshot | report.create; tenant/project/module/field | required | FR-173 / DB-097 / SEC-108, SEC-119 |
| <a id="api-134"></a> **API-134** | GET /v1/report-jobs/{reportJobId} | Đọc progress/result và re-check download scope | report.read; report job/current permission | safe | FR-173 / DB-097 / SEC-107, SEC-119 |
| <a id="api-135"></a> **API-135** | GET /v1/notifications | Liệt kê notification delivery projections | notification.read; current user/data scope | safe | FR-175 / DB-071, DB-097 / SEC-107 |
| <a id="api-136"></a> **API-136** | POST /v1/notifications/{notificationId}:acknowledge | Mark notification read/ack; không đổi source object | notification.acknowledge; current user/notification | required | FR-175 / DB-097 / SEC-118 |
| <a id="api-137"></a> **API-137** | POST /v1/auth/login | Xác thực tenant code + email + password và cấp cặp JWT | public; tenant resolved server-side | no retry key; rate limited | FR-147 / DB-001, DB-005, DB-099, DB-100 / SEC-101, SEC-103, SEC-117, SEC-118 |
| <a id="api-138"></a> **API-138** | POST /v1/auth/refresh | Rotate refresh JWT HttpOnly và cấp access JWT mới | refresh session; tenant/user từ signed token | single-use rotation | FR-147 / DB-005, DB-100 / SEC-103, SEC-117, SEC-118 |
| <a id="api-139"></a> **API-139** | POST /v1/auth/logout | Thu hồi refresh session hiện tại và xóa cookie | refresh session; tenant/user từ signed token | idempotent | FR-147 / DB-005, DB-100 / SEC-103, SEC-118 |
| <a id="api-140"></a> **API-140** | POST /v1/schedule-baselines/{baselineId}:decision | APPROVE/RETURN/REJECT baseline bằng `BaselineDecisionRequest`; APPROVE atomically lock/supersede | baseline.approve; project; independent approver | DB-104 required; expectedVersion; SoD | FR-018 / DB-020, DB-067 dependency, DB-098, DB-102, DB-104 / SEC-108, SEC-109, SEC-111, SEC-118 |
| <a id="api-141"></a> **API-141** | GET /v1/projects/{projectId}/progress-updates | Đọc progress history append-only theo activity bằng cursor để chọn stable record khi correction | schedule.read; project/package/activity | safe; activityId + cursor/limit | FR-019 / DB-018, DB-021 / SEC-105, SEC-107, SEC-109 |
| <a id="api-142"></a> **API-142** | GET /v1/projects/{projectId}/schedule-look-ahead.csv | Xuất UTF-8 CSV từ authorized look-ahead snapshot; neutralize spreadsheet formula và audit mỗi export | schedule.read; project/package/authorized activity | safe read + audit; dataDate/lookAheadDays | FR-017/019 / DB-018/019/021/098/101 / SEC-105, SEC-107, SEC-109, SEC-119 |
| <a id="api-143"></a> **API-143** | GET /v1/projects/{projectId}/risks | Liệt kê Risk safe summary có inherent/residual coordinates + scoring/threshold versions bằng opaque cursor và allowlisted filters | riskChange.read; full project hoặc authorized exact-package rows; package-only không thấy project-level/null | safe; cursor/limit/filter, `reviewBefore` | FR-098/099 / DB-065/112 / SEC-105/107/111/114 |
| <a id="api-144"></a> **API-144** | PATCH /v1/projects/{projectId}/risks/{riskId} | Cập nhật Risk/state; direct residual là authoritative reassessment; OCCURRED bắt buộc Issue cùng scope; chỉ MONITORING request closure | riskChange.manage/requestClosure; ordinary command full project/exact package, residual reassessment full-project only | DB-104 required + expectedVersion; residual cần reason/evidence | FR-098/099/104 / DB-065/066/098/102/104 / SEC-108/109/111/118 |
| <a id="api-145"></a> **API-145** | POST /v1/projects/{projectId}/issues | Tạo Issue actual-impact/root-cause riêng; optional source Risk cùng scope | riskChange.create; full project hoặc exact package; source-derived kế thừa package | DB-104 required | FR-100/104 / DB-065/066/098/102/104 / SEC-105/111/118 |
| <a id="api-146"></a> **API-146** | GET /v1/projects/{projectId}/issues | Liệt kê Issue bằng opaque cursor và status/owner/severity/target/source filters | riskChange.read; full project hoặc authorized exact-package rows | safe; cursor/limit/filter | FR-100 / DB-066/112 / SEC-105/107/111/114 |
| <a id="api-147"></a> **API-147** | PATCH /v1/projects/{projectId}/issues/{issueId} | Cập nhật Issue/state/actual impact; closure chỉ chuyển CLOSURE_PENDING | riskChange.manage/requestClosure; full project hoặc exact package theo command | DB-104 required + expectedVersion | FR-100/104 / DB-066/098/102/104 / SEC-108/109/111/118 |
| <a id="api-148"></a> **API-148** | POST /v1/projects/{projectId}/risk-issue-actions | Tạo action gắn đúng một Risk hoặc Issue và kế thừa scope parent | riskChange.manage; full project hoặc exact package của parent | DB-104 required | FR-099/100 / DB-065/066/098/102/104/112 / SEC-105/111/118 |
| <a id="api-149"></a> **API-149** | PATCH /v1/projects/{projectId}/risk-issue-actions/{actionId} | Discriminated routine/complete/verify/cancel command; terminal payload không được trộn field change; VERIFY chỉ promote proposal đã lưu | riskChange.manage; routine/DONE theo full project hoặc exact parent package; VERIFIED/CANCELLED full-project actor độc lập so với pre-command owner/completedBy | DB-104 required + expectedVersion; mixed payload/version conflict zero write | FR-099/100 / DB-065/066/098/102/104/112 / SEC-108/109/111/118 |
| <a id="api-150"></a> **API-150** | POST /v1/projects/{projectId}/change-requests | Tạo Change Request manual hoặc từ đúng một Risk/Issue; copy source/evidence snapshot | riskChange.create; full project hoặc exact package; source-derived kế thừa package | DB-104 required | FR-101/102/104 / DB-065…067/098/102/104 / SEC-105/108/111/118 |
| <a id="api-151"></a> **API-151** | GET /v1/projects/{projectId}/change-requests | Liệt kê Change bằng cursor và status/owner/source filters | riskChange.read; full project hoặc authorized exact-package rows; field masking | safe; cursor/limit/filter | FR-101/102 / DB-067 / SEC-105/107/111/114 |
| <a id="api-152"></a> **API-152** | PATCH /v1/projects/{projectId}/change-requests/{changeRequestId} | Cập nhật Draft/Assessed/Returned Change và six-dimension impact draft | riskChange.manage; full project hoặc exact package khi còn editable | DB-104 required + expectedVersion | FR-101/102 / DB-067/098/102/104 / SEC-109/111/114/118 |
| <a id="api-153"></a> **API-153** | POST /v1/projects/{projectId}/change-requests/{changeRequestId}:submit | Chốt complete scope/schedule/cost/quality/HSE/contract impact và submit | riskChange.submit; full-project only | DB-104 required + expectedVersion | FR-101/102 / DB-067/098/102/104 / SEC-108/109/111/118 |
| <a id="api-154"></a> **API-154** | POST /v1/projects/{projectId}/risks/{riskId}:closure-decision | APPROVE/RETURN/REJECT closure với evidence và approver độc lập | riskChange.close; full-project only; closeCritical bổ sung khi HIGH/CRITICAL | DB-104 required + expectedVersion + SoD | FR-098/099/104 / DB-065/098/102/104/113 / SEC-108/109/118 |
| <a id="api-155"></a> **API-155** | POST /v1/projects/{projectId}/issues/{issueId}:closure-decision | APPROVE/RETURN/REJECT closure với evidence và approver độc lập | riskChange.close; full-project only; closeCritical bổ sung khi CRITICAL | DB-104 required + expectedVersion + SoD | FR-100/104 / DB-066/098/102/104/113 / SEC-108/109/118 |
| <a id="api-156"></a> **API-156** | POST /v1/projects/{projectId}/change-requests/{changeRequestId}:decision | APPROVE/RETURN/REJECT submitted Change; requester/submitter không tự duyệt | riskChange.approve; full-project only | DB-104 required + expectedVersion + SoD | FR-101/102 / DB-020/067/098/102/104 / SEC-108/109/111/118 |
| <a id="api-157"></a> **API-157** | GET /v1/projects/{projectId}/risk-change-summary | Đọc Command Center và full-filter 5×5 inherent/residual heatmap grouped theo scoring/threshold version | riskChange.read; aggregate toàn bộ authorized filtered rows, không lấy page API-143; không suy hidden rows | safe; package/owner + Risk status/category/review/version filters | FR-098…102/104 / DB-065…067/105/112 / SEC-105/107/111/114 |
| <a id="api-158"></a> **API-158** | GET /v1/projects/{projectId}/risk-change-history | Đọc DB-098 history đã redact bằng cursor và source/event filters | riskChange.read; re-authorize source object project/exact-package scope | safe; cursor/limit/filter | FR-099…102/104 / DB-065…067/098/112 / SEC-105/107/114/118/119 |
| <a id="api-159"></a> **API-159** | GET /v1/projects/{projectId}/schedule-baselines?approvedChangeRequestId={id} | Đọc reverse trace các baseline bất biến đã dùng approved Change | schedule.read; full-project only; Change/baseline cùng tenant/project | safe; required Change filter + cursor/limit | FR-018/101/102 / DB-020/067 / SEC-105/107/111/119 |
| <a id="api-160"></a> **API-160** | GET /v1/projects/{projectId}/risks/{riskId} | Đọc Risk detail và authorized immutable closure-cycle page | riskChange.read; full project hoặc exact package | safe; opaque closureCycleCursor, limit 50/100, stable sequenceNo/id | FR-098/099/104 / DB-065/112/113 / SEC-105/107/111/114 |
| <a id="api-161"></a> **API-161** | GET /v1/projects/{projectId}/issues/{issueId} | Đọc Issue detail và authorized immutable closure-cycle page | riskChange.read; full project hoặc exact package | safe; opaque closureCycleCursor, limit 50/100, stable sequenceNo/id | FR-100/104 / DB-066/112/113 / SEC-105/107/111/114 |
| <a id="api-162"></a> **API-162** | GET /v1/projects/{projectId}/change-requests/{changeRequestId} | Đọc Change detail/impact/evidence sau record-level authorization | riskChange.read; full project hoặc exact package | safe | FR-101/102/104 / DB-020/065…067 / SEC-105/107/111/114 |
| <a id="api-163"></a> **API-163** | GET /v1/projects/{projectId}/risk-issue-actions | Liệt kê Action summary theo parent/status/owner/due và scope | riskChange.read; full project hoặc exact parent package | safe; cursor/limit/filter | FR-099/100/104 / DB-065/066/112 / SEC-105/107/111 |
| <a id="api-164"></a> **API-164** | GET /v1/projects/{projectId}/risk-issue-actions/{actionId} | Đọc Action detail/evidence/completion/verification facts | riskChange.read; full project hoặc exact parent package | safe | FR-099/100/104 / DB-065/066/112 / SEC-105/107/111 |

### 10.1 US-003 concrete schemas và error contract

| Schema | Required contract |
|---|---|
| `CreatePackageRequest` | code, name, packageType, optional parentPackageId/contractorCompanyId; no client tenant/project override |
| `ProjectScheduleResponse` | schedule/calendar/version/dataDate; authorized packages/WBS/activities/dependencies; current baseline; validationIssues; CPM/variance/SPI/forecast; lookAhead/alerts; calculatedAt/formulaVersion/thresholdVersion |
| `ApplyScheduleDraftRequest` | mode PREVIEW/COMMIT; expectedVersion; source/provenance; explicit calendar; WBS/activity/dependency upserts; explicit archive/unlink IDs. PREVIEW writes no business/audit/outbox/receipt |
| `SubmitScheduleBaselineRequest` | `INITIAL` nhận dataDate + reason + impactSummary; `REBASELINE` chỉ nhận dataDate + approvedChangeRequestId; cả hai có expectedScheduleVersion. Với REBASELINE, server lấy reason/schedule impact/provenance từ immutable approved Change snapshot và từ chối client free-text. |
| `ProgressUpdateRequest` | activityId, dataDate, percentComplete, remainingDurationWorkDays, optional quantity/unit/actual dates/evidenceRefs/note; correctionOfId + reason for correction |
| `ProgressHistoryResponse` | authorized append-only facts của một activity, full evidence/actual metadata cần cho correction; cursor opaque là stable progress UUID |
| `BaselineDecisionRequest` | decision APPROVE/RETURN/REJECT, comment bắt buộc cho mọi quyết định, expectedVersion; server resolves actor and enforces self/delegated SoD |

US-003 error codes: `SCHEDULE_NOT_FOUND`, `PACKAGE_NOT_FOUND`, `WBS_NOT_FOUND`, `ACTIVITY_NOT_FOUND`, `DEPENDENCY_CYCLE`, `DEPENDENCY_SCOPE_MISMATCH`, `INVALID_CALENDAR`, `INVALID_SCHEDULE_DATE`, `WEIGHT_TOTAL_EXCEEDED`, `WEIGHT_TOTAL_INVALID`, `SCHEDULE_VALIDATION_FAILED`, `BASELINE_LOCKED`, `BASELINE_STATE_INVALID`, `BASELINE_SELF_APPROVAL_DENIED`, `CHANGE_APPROVAL_REQUIRED`, `CHANGE_SCOPE_MISMATCH`, `ACTUAL_CORRECTION_REQUIRED`, `PROGRESS_EVIDENCE_REQUIRED`, `VERSION_CONFLICT`, `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_CONFLICT`.

Direct schedule implementation trace is API-023/024/034…037/140…142 with DB-012/017…021/101 and schedule subset DB-105. API-038/DB-067 is the approved-change dependency for positive rebaseline only.

### 10.2 US-004 concrete schemas, lifecycle và error contract

| Schema | Required contract |
|---|---|
| `CreateRiskRequest` / `UpdateRiskRequest` | Risk-only category/cause/event/impact, probability và ba input cost/schedule/HSE integer 1…5, owner/reviewDate, responseStrategy/plan/trigger/contingency/evidence. Server tính max/exposure/effective band và snapshot scoring/threshold version; client không gửi derived score. DB-065 là residual SoR: direct reassessment full-project cần expectedVersion/reason/evidence; chỉ MONITORING được request closure. |
| `CreateIssueRequest` / `UpdateIssueRequest` | Issue-only title/description/occurredAt/rootCause/actualImpact/severity/owner/target/evidence and optional same-scope sourceRiskId; RESOLVED requires resolution summary/evidence. Update carries `expectedVersion`; closure request requires separate evidence/reason; CLOSED→REOPENED bắt evidence. |
| `UpdateRiskIssueActionRequest` union | `UpdateRiskIssueActionFieldsRequest`, `CompleteRiskIssueActionRequest`, `VerifyRiskIssueActionRequest`, `CancelRiskIssueActionRequest` là bốn shape loại trừ nhau. DONE mới nhận optional proposal + `residualRiskVersion`; VERIFY/CANCEL chỉ nhận expectedVersion/status/evidence (+ cancel reason), không đổi owner/due/title hoặc gửi proposal cùng quyết định; actor được so với pre-command owner/completedBy. |
| `RiskIssueClosureCycle`, `RiskDetailResponse`, `IssueDetailResponse` | DB-113 sequence có request reason/evidence/actor/time và decision facts all-or-none; request tạo cycle mới, decision chỉ complete một lần, completed cycle bất biến. Risk/Issue scalar closure fields chỉ là latest projection. API-160/161 trả authorized page tối đa 100 row theo `sequenceNo/id` và opaque `nextCursor`; theo cursor đến null để lấy đủ history, không dùng array unbounded. |
| `CreateChangeRequestRequest` / `UpdateChangeRequestRequest` | Source is MANUAL or exactly one Risk/Issue; server copies source/evidence snapshot. Draft impact is partial; options/recommendation/sourceBaseline may be completed before submit; money is decimal string + currency. |
| `SubmitChangeRequest` / `ChangeDecisionRequest` | Both carry `expectedVersion`; submit requires recommendation + all six impact dimensions and sourceBaseline when schedule requires rebaseline. Every decision requires comment; requester/submitter cannot decide. APPROVE derives `scheduleImpactApproved` from frozen schedule.requiresRebaseline and locks impact/approval hashes. |
| `ClosureDecisionRequest` | APPROVE/RETURN/REJECT, expectedVersion and evidenceRefs; comment required. Approver must differ from closure requester/effective actor. |
| `RiskListResponse`, `IssueListResponse`, `ChangeRequestListResponse`, `RiskIssueActionListResponse`, `RiskChangeHistoryResponse` | Concrete safe-summary arrays with opaque UUID cursor and bounded limit; allowlisted filters only, stable createdAt/id ordering, server-side tenant/project/field filtering. API-160…164 trả concrete record detail/action facts sau record-level authorization. |
| `RiskChangeSummaryResponse` | Authorized aggregate plus bounded queues và `riskHeatmap`: full authorized Risk filter, 25 inherent + 25 residual cells mỗi scoring/threshold version group, missing-residual count, no page truncation/cross-package inference. |

US-004 stable error codes: `RISK_NOT_FOUND`, `ISSUE_NOT_FOUND`, `CHANGE_REQUEST_NOT_FOUND`, `ACTION_NOT_FOUND`, `INVALID_STATE_TRANSITION`, `REOPEN_EVIDENCE_REQUIRED`, `IMPACT_INCOMPLETE`, `CLOSE_EVIDENCE_REQUIRED`, `CLOSE_APPROVAL_SOD`, `ACTION_VERIFICATION_SOD`, `ACTION_CANCEL_REASON_REQUIRED`, `CHANGE_APPROVAL_SOD`, `CHANGE_APPROVAL_REQUIRED`, `BASELINE_MISMATCH`, `SCHEDULE_IMPACT_NOT_APPROVED`, `VERSION_CONFLICT`, `PROJECT_SCOPE_DENIED`, `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_CONFLICT`.

Direct US-004 implementation trace is API-038/143…158/160…164 with DB-065…067/112/113 and operational DB-098/102…105. API-008 with DB-005…007 is the Identity-owned scoped-assignee dependency; Project Controls owns API-036 positive rebaseline and API-159 reverse trace. DB-068 Claim/Variation and direct early-warning adapters in FR-103/105 remain explicit downstream dependencies; these APIs contain no Claim command and no O&M/OT write path.

## 11. Request/response examples

### 11.1 Command

    POST /v1/contracts/{contractId}/payments
    X-Tenant-Id: tenant_opaque
    Idempotency-Key: opaque-client-key

    {
      "commandType": "SubmitPayment",
      "expectedVersion": 4,
      "data": {
        "payerLegalEntityId": "le_payer",
        "payeeLegalEntityId": "le_payee",
        "amount": "1050000000.0000",
        "currency": "VND",
        "components": [
          {"type": "BASE", "amount": "1000000000.0000"},
          {"type": "VAT", "basis": "1000000000.0000", "rate": "0.10", "amount": "100000000.0000"},
          {"type": "RETENTION", "basis": "1000000000.0000", "rate": "0.05", "amount": "50000000.0000"}
        ]
      }
    }

Response is 202/201 with resourceId, version, status, correlationId and links. Tax/rounding semantics remain versioned/TBD; example is not legal rule.

### 11.2 Error

    {
      "code": "SOD_CONFLICT",
      "message": "Không thể thực hiện hành động này.",
      "correlationId": "corr_opaque",
      "retryable": false,
      "fieldErrors": []
    }

### 11.3 Telemetry inbound

API-125 accepts only allowlisted gateway/tag events containing externalEventId, sourceTimestamp, receive context, typed value/state, unit, quality and sequence. It cannot carry commandType, setpoint or control instruction; prohibited fields return 422 and security audit.

## 12. Permission and endpoint review rules

- Permission string in catalog is capability, not role name; Security matrix maps roles and scopes.
- GET/list/search/report must filter rows and fields, not fetch then hide client-side.
- Command re-checks state, scope, SoD and expected version inside transaction.
- Service/admin credentials are bounded by tenant/system/action and cannot read business body by default.
- API-075 is simulation only. API-115 acknowledges local AlarmCase only. API-125 is inbound data only. None can control OT.

## 13. OpenAPI conformance

[openapi.yaml](./openapi/openapi.yaml) version 0.9.0 declares OpenAPI 3.1.0, JSON Schema 2020-12 dialect, all 164 unique x-api-id/operationId values, security schemes, common parameters/responses/schemas and the API-126 webhook. API-008/023/024/034…038/140…164 that belong to the implemented slices carry `x-implementation-status: implemented`; API-036 includes both INITIAL and approved-Change-backed positive REBASELINE locally. Other unapproved domain schemas may remain GenericCommand/TBD. This marker is implementation evidence, not a blanket `TEST-014…017` acceptance or EC2 deployment claim.

## 14. Assumptions

| Assumption | Owner | Impact |
|---|---|---|
| REST/JSON/OpenAPI 3.1 is approved external contract style | Architecture | API shape |
| Bearer federation and mTLS gateway logical schemes | Security/IAM/OT | Security config |
| X-Tenant-Id is required and verified against identity | Security | Client contract |
| Opaque cursor and optimistic concurrency | Architecture/Data | SDK/UI |
| Generic command envelope is temporary for unclear payloads | Domain/API Owners | Schema detail |
| GenericCommand is prohibited for US-001, US-003 and US-004 approved operations | Product Owner delegated / API Owner | Contract gate |
| API-126 webhook signing mechanism/key rotation TBD | Security/Integration | Subscriber build |
| Rate/page/file limits and deprecation window TBD | Product/SRE/Security | Production readiness |

## 15. Open Questions

| Open Question | Owner | Blocks |
|---|---|---|
| IdP/token claims/step-up and service identity standard? | IAM/Security | Auth implementation |
| Exact payload/enum/state remains Open for later domain commands; US-001, US-003 and US-004 schemas are closed for their approved slices | Domain Owners | Later schemas only |
| Pagination/filter/query limits? | Product/SRE | Client/performance |
| File size/type/chunk/scan SLA? | DMS/Security | Upload |
| ERP/DMS/e-sign/CMMS provider callbacks and field SoR? | Integration Owners | Connector API |
| Webhook signature algorithm/replay/key rotation? | Security | API-126 |
| Public/external portal API separation and rate tiers? | Product/Security | Exposure |
| Telemetry protocol/batch/tag limits and site certificates? | OT Owner | API-125 |
| Deprecation/sunset/client support window? | Product/Architecture | Versioning |

## 16. Changelog

| Version | Date | Author | Change | Scope impact |
|---|---|---|---|---|
| 0.1 | 2026-07-11 | Codex | Tạo API convention/catalog API-001…API-136 và OpenAPI 3.1 | Không có OT/BESS control; domain fields chưa rõ giữ TBD |
| 0.2 | 2026-07-11 | Codex | Bổ sung API-137…139 cho local JWT login/refresh/logout của base MVP | Phê duyệt riêng auth slice; không thay đổi ranh giới OT |
| 0.3 | 2026-07-11 | Codex | Duyệt concrete schemas và concurrency/idempotency contract cho US-001 | GenericCommand vẫn tạm thời ở các domain chưa duyệt |
| 0.4 | 2026-07-11 | Codex | Ghi implementation/evidence cho organization, portfolio, project, site và party APIs | US-001 API Implemented; OpenAPI 0.3.0 valid |
| 0.5 | 2026-07-11 | Codex | Cấp API-140 và concretize API-023/024/034…037 package/schedule/baseline/progress contracts | US-003 Approved/Build-ready, x-implementation-status planned; API-038/DB-067 chỉ dependency; không test-pass claim |
| 0.6 | 2026-07-12 | Codex | Cấp API-141 progress history, đồng bộ nullable correction/SoD metadata và ghi core API deployed | Không mở rộng baseline; hỗ trợ AC-011 bằng stable history ID; full TEST-010…013 chưa được claim Pass |
| 0.7 | 2026-07-12 | Codex | Cấp API-142 audited look-ahead CSV và cập nhật catalog 142 operations | Đóng direct M3 export trong US-003; không mở rộng baseline/OT hoặc claim full story Pass |
| 0.8 | 2026-07-12 | Codex | Concretize API-038 và cấp API-143…158 cho Risk/Issue/Action/Change/closure/summary/history | US-004 Approved/Build-ready; Claim/FR-103 và external source adapters FR-105 vẫn dependency; không claim implementation/test Pass |
| 0.9 | 2026-07-18 | Codex | Bổ sung API-159 vào catalog, sửa exact-package scope/DB-098 trace, đồng bộ server-derived score và status Action với canonical data/workflow; OpenAPI 0.7.1 hết warning | Không đổi phạm vi baseline; đóng consistency/validation M0 trước implementation |
| 1.0 | 2026-07-18 | Codex | Cấp API-160…164 cho stable detail/action reads, concretize API-008 assignee, partial-draft/immutable approval/rebaseline provenance và safe summary schemas; OpenAPI 0.8.0 | Không đổi feature baseline; làm contract có thể triển khai/điều hướng/kiểm closure an toàn |
| 1.1 | 2026-07-18 | Codex | Chốt residual SoR/versioned Action proposal, terminal cancel facts, reopen evidence, heatmap projection, scoped user.read và conditional REBASELINE authority; OpenAPI 0.8.1 | Không đổi requirement/AC; đóng semantic blockers trước M1 |
| 1.2 | 2026-07-18 | Codex | Tách API-149 thành four-command union, cấp DB-113 closure-cycle response và chốt API-157 full-filter/version-grouped 5×5 heatmap; OpenAPI 0.8.2 | Không đổi operation/requirement count; loại mixed-decision/history/page ambiguity |
| 1.3 | 2026-07-18 | Codex | Ghi local implementation API-008/036/038/143…164, positive rebaseline, concrete identity/baseline responses và OpenAPI 0.9.0 với 33 implemented operations | Không đổi scope/operation count; local pre-push integration/build Pass, TEST-014…017 Partial và actual EC2 deployment Pending |
