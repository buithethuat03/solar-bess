# Open Questions and Decisions — Nền tảng Solar & BESS

> **Purpose:** Hợp nhất Assumption, Open Question, Decision, Deferred Decision, Risk, Dependency và dữ liệu cần từ các bên để đưa bộ tài liệu từ Draft sang build-ready.
> **Scope:** Các vấn đề chưa xác định hoặc quyết định xuyên artefact; gồm operational foundation/core US-003 đã deploy EC2 test, US-004 Implemented local/acceptance Partial/deployment Pending và ranh giới full story/production Proposed; không thay thế ADR, BR/FR/NFR/SEC hoặc legal/technical approval tại tài liệu owner.
> **Source:** [Traceability Matrix](./15-traceability-matrix.md), [Operational Foundation ExecPlan](../.agent/execplans/2026-07-11-operational-foundation.md), [US-003 ExecPlan](../.agent/execplans/2026-07-11-project-controls-us003.md), [US-004 ExecPlan](../.agent/execplans/2026-07-12-risk-issue-change-us004.md) và toàn bộ [Documentation Plan](./00-documentation-plan.md) đến [DevOps](./14-devops-and-deployment.md).
> **Version:** 1.0
> **Status:** Draft toàn platform; operational foundation/core US-003 Implemented/deployed; US-004 Implemented local với TEST-014…017 Partial và GitHub Actions/EC2 deployment Pending; production Proposed
> **Owner:** Product Owner / Product Operations (cá nhân: TBD)
> **Updated:** 2026-07-18
> **Approval:** Operational foundation EC2 test và US-003/US-004 local implementation profile Approved — Product Owner delegated; full story/deployment/toàn platform/production TBD/Pending — Steering/Product Owner và owner ghi trong từng dòng

## 1. Governance

- Unknown information remains explicitly Assumption, TBD or Open Question; no placeholder is silently treated as approved.
- A Decision changes canonical owner artefact first, then changelog, downstream trace and tests.
- Scope change requires Product Owner approval and docs/CHANGELOG.md; old business content is retained or superseded with reason.
- Legal/technical baseline is design input as of 2026-07-11, not legal advice or site/project acceptance.
- Status values: Confirmed by governance/user; Proposed; Deferred; Open; Closed; Rejected.

## 2. Assumptions

| Assumption | Source | Owner to confirm | Impact if false | Close evidence |
|---|---|---|---|---|
| Baseline file is immutable source input and derived docs remain Draft v0.1 | AGENTS/Plan | Product Owner | Change-control/approval basis | Written status approval |
| Vietnam first; Vietnamese default, English second | Baseline/PRD/UX | Product/Commercial | Localization/legal/report | Market/language decision |
| VND default reporting; USD supported; transactions never summed raw across currency | Baseline/Data | Finance/PO | Money/data/API/test | Currency/rounding policy |
| Cloud-first multi-tenant with optional dedicated profile | Baseline/ADR-002 | PO/Security/Commercial | Deployment/cost/isolation | Tenant tier policy |
| Around 500 active projects/tenant is capacity baseline | Baseline/NFR-001 | PO/Architecture | Sizing/performance | Approved workload model |
| Telemetry store is separate from OLTP | Baseline/ADR-007 | Architecture/OT/Data | Storage/cost/latency | Volume/architecture approval |
| OT remains autonomous and ingress is one-way/read-only | Baseline/Security | OT Owner/Security | Safety/network/API | Site topology and no-control sign-off |
| Import/sync only when explicitly enabled; no auto folder scan | Baseline/PRD | Product/Security | Consent/DMS/integration | Product setting policy |
| Company has 0..n LegalEntity; each LegalEntity belongs to one Company/tenant | Domain/Data | Confirmed by Product Owner 2026-07-11 | Migration/contract/payment | Direct approval for US-001 |
| Person is separate from UserAccount and history survives revoke | Domain/Security | IAM/Legal/Audit | Identity/audit | IAM data model |
| Equipment becomes operational Asset after accepted handover | Domain/Data | Engineering/O&M | Lifecycle/COD | Asset lifecycle approval |
| AlarmEvent is OT immutable; AlarmCase is local O&M | Domain/Security | OT/O&M | Ack/state/API | Alarm operating procedure |
| Activity and WorkOrder are separate aggregates | Domain | PM/O&M | Schedule/CMMS | Process ownership |
| PWA offline is limited to allowed drafts/checklists/photos | PRD/SRS/UX | Site/Product/Security | Mobile scope/security | Offline policy/device matrix |
| AI is advisory Draft with citation/confidence/human review | Baseline/PRD/Security | AI Governance | AI scope/data/security | AI policy |
| Release split 110/31/10/47 FR and 25/6/5/1 US is working normalization | PRD/Backlog | Product Owner | Roadmap/estimate | Feature/story phase approval |
| Two product squads is roadmap planning assumption | Baseline/Backlog | Delivery Lead | Duration/dependency | Capacity/team plan |
| Baseline RPO/RTO/retention/exercise values are proposals only | NFR/Architecture/DevOps | Business/SRE/Legal | Production promise | Signed service/data policy |
| EC2 operational foundation dùng synthetic/resettable PostgreSQL/Redis data; không có dữ liệu cần giữ | ExecPlan/Product Owner | Confirmed 2026-07-11 | Migration/failure rehearsal | Product Owner delegated approval |

## 3. Open Questions

| Open Question | Owner | Needed before | Impact | Close criteria |
|---|---|---|---|---|
| Is baseline approved scope or proposal requiring module sign-off? | Product Owner | Documentation approval | Governance/scope | Decision recorded/changelog |
| Approve normalized feature/story release allocation? | Product Owner/PMO | Backlog/roadmap approval | MVP scope | Per-feature/story decision |
| Which controls/tests are formally non-waivable? | PO/Security/HSE/Legal/QA | Release policy | Exit/waiver | Approved catalog |
| **Closed 2026-07-11:** Define Tenant: customer, group, contract or deployment? | Product Owner | Closed for US-001 | Tenant is customer/group isolation boundary | Reopen only by approved scope change |
| **Closed 2026-07-11:** Confirm Company–LegalEntity cardinality and legacy migration | Product Owner | Closed for US-001 | Company 0..n Legal Entity; each Legal Entity belongs to one Company | Reopen only by approved scope change |
| **Closed 2026-07-11:** Project code uniqueness and one Project–many Site/COD granularity? | Product Owner | Closed for US-001 | Code unique in tenant; Project 1..n Site; aggregate COD at Project | Reopen only by approved scope change |
| Contract number/appendix/serial uniqueness scopes? | Legal/Engineering/Data | Schema/import | Duplicate integrity | Constraint policy |
| **Closed 2026-07-11:** Final project phase and record-state enums? | Product Owner | Closed for US-001 | Approved Project type/phase/status catalogs | Reopen only by approved scope change |
| Health formula, pillar thresholds, N/A/missing/freshness/confidence and hard caps? | PMO/Product Owners | Command Center/UAT | Decision/KPI/test | Versioned score spec |
| Approval roles/order/quorum/value limits/SoD/delegation/SLA/escalation? | Process Owners/Internal Control | Workflow config | All approvals | Matrix/templates signed |
| Conditional approval/waiver allowed for which records; effective period? | Legal/Finance/QA/HSE/Commissioning | Workflow/UAT | Safety/legal | Approved taxonomy |
| Final UAT percentage, participants and waiver authority? | PO/QA | Release plan | Acceptance | UAT policy |
| Schedule System of Record per project and ownership by field? | PMO/Integration | Connector/API | Conflict/reconcile | Interface contract |
| DMS/CDE SoR by folder/document type and external-share policy? | Document Control/IT/Security | DMS implementation | Revision/ACL | DMS contract |
| ERP/platform ownership for PO, budget, invoice, payment posting/paid? | Finance/Procurement/IT | Integration/data | Financial integrity | Field-level SoR |
| External CMMS ownership of AlarmCase/WorkOrder/MaintenancePlan? | O&M/IT | O&M design | API/data/state | CMMS decision |
| RFI representation as Document+Workflow versus dedicated entity? | Engineering/Document Control/Data | Final Data/API | Trace/state/report | Domain decision |
| **Closed 2026-07-11 về ID ownership:** Dedicated persistence for AI policy/run/proposal/review? | Product Owner delegated / AI/Data/Architecture | Closed for registry; reopen at feature implementation | DB-108…111 reserved; không tạo table/feature trong foundation | Data Model/Trace reservation; retention/schema vẫn theo future slice |
| **Closed 2026-07-11 về ID ownership:** Persistence for notification/saved view/report job projections? | Product Owner delegated / Architecture/Data | Closed for registry; reopen at US-022/023 | DB-105…107 reserved; không tạo table/feature trong foundation | Data Model/Trace reservation |
| Browser/device/viewport/accessibility/offline duration/storage/MDM? | Product/UX/IT/Security | UI DoD | Client/test | Approved matrix/standard |
| File types/sizes/chunking/OCR/preview/scan SLA/quarantine retention? | DMS/Security | File/API/NFR | Capacity/security | File policy |
| IdP/protocol/claims/MFA/step-up/privileged-access specifics cho production? Base/test local JWT profile đã đóng. | IAM/Security | Production security implementation | SSO/privileged authentication | IAM design |
| Key hierarchy/provider/rotation/recovery/residency and tenant tier? | Security/Architecture | Deployment | Encryption/DR | Key management design |
| API page/filter/rate limits and deprecation/sunset window? | Product/SRE/Architecture | API production | Client/performance | API policy |
| ERP/DMS/e-sign/logistics/HR/IdP/CMMS vendors/sandboxes/callbacks? | System Owners | Integration planning | Schedule/test | Interface inventory |
| OT topology/protocol/historian/gateway/DMZ/certificate per site? | OT Owner/Security | OT Release | Network/safety | Site interface/security design |
| Tag count/frequency/unit/quality/event/retention and BESS hierarchy depth? | BESS/Solar/O&M/Data | Time-series sizing | Cost/performance | Point list/data contract |
| Meter VEE/period-close authority, CT/PT and tariff owner/version? | Energy/Finance/Legal | Billing/performance | Calculation/legal | Metering policy |
| Tax/VAT/retention/rounding/IRR/NPV/day-count/tariff assumptions? | Finance/Legal/Energy | Calculation/UAT | Money/investment | Versioned rules/examples |
| Availability/SLO/workload/RPO/RTO/retention/data residency targets? | PO/SRE/Legal/Security | Production gate | Architecture/operations | Signed NFR/service policy |
| Provider/team skills/cost/exit strategy ngoài stack đã chốt trong `tech-stack.md`? | Architecture/Engineering/Finance | Production procurement | Operations/TCO | ADR acceptance |
| Security severity/patch SLA/pentest/scan cadence and exception authority? | Security/Engineering | CI/release | Security gate | Secure SDLC policy |
| AI provider/hosting/training/retention/consent/corpus/quality/kill switch? | AI Governance/Legal/Security | AI pilot | Privacy/quality | AI governance pack |
| Product analytics provider/events/consent/retention? | Product/Legal | Instrumentation | Privacy/metrics | Analytics plan |
| Legal/technical source applicability and effective dates by project/site? | Legal/Technical Owners | Configuration/UAT | Compliance | Applicability matrix |
| Production Redis HA/persistence/eviction, BullMQ retention/concurrency/capacity và worker scaling? | SRE/Architecture/Security | Production acceptance | Availability, queue loss/cost và recovery | Capacity/failure/restore evidence; không chặn EC2 test |
| Hosted CI workflow, branch protection, registry, SBOM/signing/provenance và IaC? | Platform/Security | Production pipeline | Secure SDLC/release evidence | Workflow/artifact evidence; hiện Planned |

## 4. Confirmed decisions

| Decision | Status/authority | Rationale | Canonical artefact | Change trigger |
|---|---|---|---|---|
| docs is documentation root; baseline filename fixed and immutable | Confirmed — AGENTS/user | Governance and source preservation | AGENTS/00 | Explicit scope change |
| PM Web, O&M monitoring and OT are distinct | Confirmed — baseline/user | Safety and product boundary | 01/03/05/06 | Approved product scope |
| PM/O&M does not directly control BESS/OT | Confirmed — user/baseline | Safety/security | All API/Security/UX/Test | Separate approved safety design |
| RBAC base + ABAC scope + SoD/status/hold precedence | Confirmed — baseline | Enterprise control | 09 Security | Security/PO decision |
| US-001 Project Master là vertical slice nghiệp vụ đầu tiên và build-ready | Confirmed — Product Owner 2026-07-11 | Bắt đầu delivery theo backlog đã duyệt | 12 Backlog/ExecPlan | Approved scope change |
| Tenant là customer/group isolation boundary; Company có 0..n Legal Entity và Legal Entity thuộc đúng một Company | Confirmed — Product Owner 2026-07-11 | Đóng tenant/org constraints cho US-001 | 05/07/09 | Approved scope change |
| Project code unique trong tenant; Project có một hoặc nhiều Site; COD aggregate ở Project | Confirmed — Product Owner 2026-07-11 | Đóng unique/cardinality cho DB-010/011 | 07/11 | Approved scope change |
| Project type `SOLAR/BESS/HYBRID`; phase `INITIATION/PLANNING/EXECUTION/COMMISSIONING/COD/HANDOVER/O_AND_M`; record status `DRAFT/ACTIVE/ON_HOLD/CLOSED/CANCELLED/ARCHIVED`; không hard delete | Confirmed — Product Owner 2026-07-11 | Phase và record status là hai trục khác nhau | 07/11/12 | Approved scope change |
| Initial extensible roles: `PMO`, `PROJECT_MANAGER`, `EXECUTIVE`, `TENANT_ADMIN`; bootstrap nhận PMO + Tenant Admin | Confirmed — Product Owner 2026-07-11 | Test US-001 và giữ deny-by-default | 09/12 | Role expansion by approved catalog |
| EC2 test database không có dữ liệu cần giữ và được phép reset/seed | Confirmed — Product Owner 2026-07-11 | Cho phép migration/rollback validation | 14/ExecPlan | Production data policy |
| PM cannot approve own proposed cost/payment/award | Confirmed — baseline | Conflict control | 09/11/12/13 | Approved SoD change |
| Delegation time/scope-bounded, no chain/rights expansion | Confirmed — baseline | Prevent bypass | 09/11 | IAM policy change |
| Contract is separate, one-to-many appendices; number unique in Project | Confirmed — prototype continuity | Business continuity | 02/05/07 | PO/Legal change |
| Legal IDs stable; signed party/signer snapshot retained | Confirmed — baseline | Legal trace | 05/07 | Legal change |
| Payment is independent with required contractId and payer→payee | Confirmed — baseline | Financial integrity | 05/07/08 | Finance/PO change |
| Money fixed decimal + currency + FX snapshot; no raw cross-currency sum | Confirmed — baseline | Arithmetic integrity | 03/04/07/13 | Finance rule |
| OpenAPI 3.1 and Mermaid preferred | Confirmed — AGENTS/user | Machine/readable consistency | 06–11/API | Governance change |
| AI requires citation/confidence/human review/audit and no autonomous critical action | Confirmed — baseline | Safety/trust | 03/05/09/12 | AI scope approval |
| Formal ID ownership/ranges in plan | Confirmed — documentation governance | No duplicate definitions | 00/15 | Controlled extension |
| Local email/password + JWT access/refresh rotation cho base/test; SSO/MFA deferred | Confirmed — Product Owner direct request 2026-07-11 | Cho phép dựng và test vertical slice đầu tiên trên EC2 | 08/09/11/12/13/15 | Review lại trước production thật |
| Auth base/test vertical slice được vượt build gate; module khác vẫn Draft | Confirmed — Product Owner direct request 2026-07-11 | Giới hạn rõ quyền implementation | INDEX/ExecPlan | Phê duyệt riêng từng slice tiếp theo |
| PostgreSQL 17 + Redis + BullMQ + worker/outbox là operational foundation cho EC2 test | Confirmed — Product Owner delegated 2026-07-11 | Cần durable async/idempotency/runtime foundation trước domain tiếp theo | ExecPlan/06/07/13/14/15 | Production cần approval/HA/SLO riêng |
| Business mutation được refactor phải commit business state + DB-098 audit + DB-102 outbox cùng transaction; DB-103 ngăn duplicate side effect | Confirmed — Product Owner delegated 2026-07-11 | Zero lost committed event và at-least-once không được tạo duplicate side effect | ExecPlan/07/13/14/15 | Thay đổi event consistency phải có ADR/test mới |
| DB-104 là generic command receipt: tenant/actor/operation/key + request hash; same key khác hash trả conflict | Confirmed — Product Owner delegated 2026-07-11 | Per-table idempotency key không đủ replay/conflict nhất quán | ExecPlan/07/13/14/15 | Retention production cần SRE/Data duyệt |
| Redis login rate limit fail closed; API readiness fail khi Redis bắt buộc unavailable | Confirmed — Product Owner delegated 2026-07-11 | Dependency failure không được biến thành security bypass | ExecPlan/13/14 | Production HA/runbook cần Security/SRE duyệt |
| Composite `(tenant_id, referenced_id)` FK là database invariant cho mọi quan hệ vật lý tenant-scoped | Confirmed — Product Owner delegated 2026-07-11 | Query predicate đơn lẻ không đủ ngăn cross-tenant reference | ExecPlan/07/13/15 | Cross-store chỉ dùng logical ref + reconciliation |
| DB-101 ProjectSchedule đã materialize; DB-105 đã generalize local theo source/scope contract; DB-112/113 và forward reconcile 1783735000000/6000000 materialized/tested cho US-004; DB-106…111 tiếp tục Reserved | Confirmed — Product Owner delegated 2026-07-11/12/18 | Giữ ID ổn định và chỉ mở physical schema theo approved slice | 07/15/US-003/004 ExecPlans | Actual EC2 migration/deployment evidence; future feature ExecPlan |
| Hosted CI giữ Planned; không tuyên bố workflow/artifact evidence đã tồn tại | Confirmed — Product Owner delegated 2026-07-11 | Local command pass không tương đương CI hosted/SBOM/signing | 14/ExecPlan | Chuyển Implemented sau workflow run evidence |
| US-003 Project Controls canonical contract hoàn tất M0 và được phép bắt đầu M1/M2 | Confirmed — Product Owner delegated 2026-07-11 | Data/API/security/UX/workflow/test/trace đã cụ thể, không còn câu hỏi chặn schedule core | 07…13/15/US-003 ExecPlan | Scope/rule change phải qua changelog |
| Calendar MVP day-level, một calendar/project, IANA timezone + working week/exception explicit; không tự thêm ngày nghỉ | Confirmed — Product Owner delegated 2026-07-11 | Kết quả schedule phải deterministic, không có holiday assumption ẩn | 07/08/US-003 ExecPlan | Calendar scope change |
| Import MVP chỉ canonical JSON/CSV với PREVIEW zero-write và COMMIT atomic; P6/MS Project connector deferred | Confirmed — Product Owner delegated 2026-07-11 | Không tuyên bố fidelity khi chưa có format fixture/SoR mapping | 08/10/13/US-003 ExecPlan | Integration slice được duyệt riêng |
| Initial baseline dùng snapshot canonical/SHA-256 và independent approval; rebaseline positive path bắt buộc approved ChangeRequest cùng tenant/project | Confirmed — Product Owner delegated 2026-07-11 | Giữ lịch sử, SoD và không dùng free-text làm bằng chứng change approval | 07/09/11/US-003 ExecPlan | US-004 contract change |
| DB-105 schedule-alert projection đã generalize in-place locally thành `notifications` cho US-004 với nullable package/activity, validated polymorphic source và schedule-row compatibility; preference/digest vẫn thuộc US-022 | Confirmed/Implemented local — Product Owner delegated 2026-07-11/18 | Cho phép Risk/Issue/Action/Change alerts mà không mất schedule rows hoặc mở toàn Notification Center | 07/11/13/15/US-003/004 ExecPlans | Complete forward schema reconcile/deploy; US-022 ExecPlan cho broader lifecycle |
| US-004 direct slice dùng aggregate riêng Risk/Issue/ChangeRequest + DB-112 RiskIssueAction; Claim DB-068 chờ Contract/Legal | Confirmed — Product Owner delegated 2026-07-12 | Không trộn register hoặc bịa contract/authority/privilege chưa có | 05/07/12/15/US-004 ExecPlan | Claim/Contract ExecPlan được duyệt |
| Risk probability/impact 1…5; exposure là tích; HIGH=15, CRITICAL=20 và interval/version lấy từ env có range validation | Confirmed — Product Owner delegated 2026-07-12 | Deterministic heatmap/closure/alert nhưng vẫn cấu hình được | 04/07/09/12/US-004 ExecPlan | Approved scoring-policy revision |
| Mọi Risk/Issue closure cần evidence và approver khác requester; Change requester/submitter không tự approve | Confirmed — Product Owner delegated 2026-07-12 | Đáp ứng AC-017 và deny-by-default/SoD | 09/11/12/13 | Approved workflow-policy revision |
| Risk/Issue/Change có `packageId` nullable; package-only assignment chỉ exact package, không project-level/null hoặc package khác | Confirmed — Product Owner delegated 2026-07-12 | Đáp ứng multi-scope và ngăn cross-package privilege widening | 07/09/13 | Approved scope-model revision |
| Project Controls chỉ resolve DB-067 qua public ApprovedChangeReader trong cùng transaction; không truy private module table trực tiếp | Confirmed — Product Owner delegated 2026-07-12 | Giữ modular boundary, same-scope và rebaseline provenance | 05/06/07/US-003/004 ExecPlans | Contract version change |
| DB-065 là residual SoR; Action chỉ giữ proposal + `residualRiskVersion`, DONE không đổi score và independent VERIFY mới atomically promote | Confirmed — Product Owner delegated 2026-07-18 | Loại dual SoR/race và giữ heatmap/audit deterministic | 04/05/07/08/11/13/US-004 ExecPlan | Approved scoring/workflow revision |
| VERIFIED và authorized CANCELLED là terminal immutable; chỉ hai trạng thái này không block closure; Risk closure chỉ từ MONITORING/return MONITORING, Issue closure từ RESOLVED/return RESOLVED | Confirmed — Product Owner delegated 2026-07-18 | Không dùng audit làm operational state và không cho hậu kiểm bị sửa | 04/05/07/09/11/13 | Approved closure-policy revision |
| API-008 dùng minimal scoped `user.read`, chỉ trả id/displayName; PMO/PROJECT_MANAGER/PROJECT_CONTROLS/PACKAGE_OWNER được grant theo assignment, EXECUTIVE/TENANT_ADMIN không mặc nhiên có | Confirmed — Product Owner delegated 2026-07-18 | Owner picker dùng được mà không mở tenant directory/PII | 04/05/08/09/13/US-004 ExecPlan | IAM/security policy revision |
| DB-113 là append-only closure history SoR; mỗi request tạo sequence, decision complete đúng một lần, reopen/re-close append cycle; DB-065/066 closure scalar chỉ là latest projection | Confirmed — Product Owner delegated 2026-07-18 | Không overwrite comment/evidence của các lần đóng trước và không lạm dụng audit hash làm operational history | 04/05/07/08/11/13/15/US-004 ExecPlan | Approved closure-history revision |
| API-149 là four-command union không cho mixed payload; terminal SoD đọc owner/completedBy trước command | Confirmed — Product Owner delegated 2026-07-18 | Không cho actor vừa đổi owner/proposal vừa tự VERIFY/CANCEL trong một request | 04/05/08/09/11/13/US-004 ExecPlan | Approved action-command revision |
| API-157 heatmap tính trên toàn authorized filter, độc lập cursor API-143; trả đủ 25+25 cell cho mọi scoring/threshold-version pair và residual-missing count | Confirmed — Product Owner delegated 2026-07-18 | Dashboard không sai theo trang hoặc âm thầm trộn/truncate policy version | 04/05/08/10/13/15/US-004 ExecPlan | Approved scoring/report revision |
| DB-105 priority V1 do server derive: Schedule OVERDUE HIGH/NEAR_CRITICAL NORMAL; Risk HIGH iff effective HIGH|CRITICAL; Issue HIGH iff severity HIGH|CRITICAL; overdue Action HIGH; pending Change NORMAL | Confirmed — Product Owner delegated 2026-07-18 | Worker/test deterministic, browser/event không tự nâng priority và Change không có SLA giả | 04/05/07/09/10/11/13/15/US-004 ExecPlan | Approved notification-policy revision |
| US-004 API/data/worker/Vue slice, positive REBASELINE and full local pre-push gate are complete; implementation/pre-push marker không đồng nghĩa TEST-014…017 or deployment Pass | Confirmed — Product Owner delegated/Codex evidence 2026-07-18 | Giữ close-out bảo thủ và ngăn Build-ready/Implemented/Test/Deployed bị trộn | 08/12/13/14/15/US-004 ExecPlan | Close remaining test matrix/full E2E and current EC2 rollout |
| Test Compose ports are parameterized; self-hosted CI uses isolated PostgreSQL/Redis host ports 15433/16380, injected integration env and `sudo -n env` for `TEST_*`; exact preflight Pass | Confirmed repository/preflight evidence 2026-07-18 | Tránh xung đột local 5433/6380 và mất env qua sudo trên cùng runner | 14/US-004 ExecPlan | Actual GitHub Actions push/deploy evidence |

## 5. Proposed architecture decisions

ADR-001…ADR-010 vẫn Proposed cho toàn platform/production. Implementation profile PostgreSQL 17 + Redis + BullMQ + worker/outbox và composite tenant FK chỉ được Approved cho EC2 test; đây không phải acceptance của production topology, HA/DR/SLO/capacity/security controls.

## 6. Deferred decisions

| Deferred Decision | Why deferred | Default safe treatment | Owner/revisit |
|---|---|---|---|
| Frontend/backend/runtime/vendor production profile | Missing team/cost/benchmark production | EC2 profile may proceed; no production claim | Architecture before production |
| Physical DB/search/queue/time-series/cache production topology | Missing volume/SLO/skills/HA evidence | EC2 PostgreSQL/Redis/BullMQ approved; search/time-series and production topology remain Proposed | ADR/vendor/capacity evaluation |
| Cloud region/dedicated/on-prem | Missing residency/contract | Shared logical profile as Assumption, no deployment | Legal/Security/Commercial |
| DB-108…111 AI physical schema/provider/retention | IDs reserved; governance/retention/provider missing | Audit/source refs, no AI release/table in foundation | AI/Data future slice |
| DB-106…107 saved-view/report-job physical schema/retention | IDs reserved; feature design deferred | No new SoR/table before US-023; rebuildable semantics | US-023 ExecPlan |
| RFI dedicated entity | Existing Document+Workflow may suffice | Use Document type + WF-016 | Engineering/Data |
| Direct OT control | Explicitly out of scope | No endpoint/UI/message/credential | Separate future safety program |
| Exact legal/tax/tariff rules | Project/effective-date specific | Versioned config/TBD, no hard-code | Legal/Finance/Energy |
| Self-hosted CI/CD/registry/IaC/SBOM/signing | EC2 runner/first GitHub run đã Pass; production supply-chain evidence chưa có | Không suy rộng EC2 Pass thành production; registry/IaC/signing giữ Planned | Platform/Security trước production |

## 7. Risks

| Risk | Probability | Impact | Warning signal | Owner | Mitigation |
|---|---|---|---|---|---|
| Scope ambiguity/proposal vs approved | High | High | Repeated feature/phase disputes | Product Owner | Baseline status and change control |
| MVP expansion | High | High | More Future/AI/telemetry moved into MVP | Product/PMO | Phase gates and PM-first value |
| Cross-document state/term drift | Medium | High | Same entity/state named differently | BA/Architecture | Canonical owner/glossary/trace audit |
| Cross-tenant/data leak | Medium | Critical | IDOR/search/export mismatch | Security | Central policy/negative tests |
| Financial calculation error | Medium | Critical | Reconciliation/rounding mismatch | Finance/Data | Decimal/rule version/examples/tests |
| Contract/signed history corruption | Low | Critical | Mutable signed artifact/snapshot | Legal/DMS | Immutable hash/version/legal hold |
| Unsafe file/external share | Medium | Critical | Scan timeout fail-open/forwarded link | DMS/Security | Quarantine/fail closed/expiry |
| Self-approval/delegation bypass | Medium | Critical | Actor/effective actor conflict | Internal Control | SoD engine/tests/audit |
| Incorrect COD readiness | Medium | Critical | Stale/missing evidence treated pass | Commissioning/PM | Gate expiry/confidence/non-waivable |
| OT reverse path/control leak | Low | Critical | Write operation/route/credential appears | OT Security | One-way zones/no-control tests |
| Telemetry volume/quality unknown | High | High | Lag/gap/stale/unknown tag | OT/Data | Site discovery/tiering/quality |
| Integration duplicate/corruption | High | High | DLQ/reconcile backlog, mismatched SoR | Integration Owners | Idempotency/checkpoint/reconciliation |
| Redis/worker tăng áp lực hoặc dependency failure làm bypass | Medium | High | memory/lag/restart/readiness sai/fallback memory | Platform/Security/SRE | Bounded concurrency, fail closed, DB-102/103, TEST-180/200/231 |
| Current feature deployment bị suy diễn từ historical hosted CI run | Medium | High | docs ghi deployed nhưng không có US-004 workflow/release/health evidence | Platform/QA | Giữ US-004 deployment Pending; chỉ ghi exact current run/release/smoke evidence |
| AI leakage/hallucination/unsafe action | Medium | Critical | Missing citation/policy/kill switch | AI Governance | Scoped gateway/human review/no action |
| Backup/DR claim without evidence | Medium | Critical | Restore never timed or ACL mismatch | SRE/BCM | Isolated restore/DR drills |
| Vendor/skill/cost mismatch | Medium | High | ADR without benchmark/TCO/owner | Architecture/Finance | Options/POC/exit strategy |
| Legal/technical applicability error | Medium | Critical | Hard-coded obsolete rule/standard | Legal/Engineers | Versioned applicability review |

## 8. Dependencies

| Dependency | Provider/owner | Consumer | Needed outcome |
|---|---|---|---|
| Product scope/MVP/metrics | Product Owner/PMO | All teams | Approved baseline/phase/KPI |
| Process/state/authority/SLA | Domain Process Owners | Workflow/API/UX/Test | Signed process templates |
| Legal master/contract/tax/privacy | Legal | Domain/Data/Security | Entity/snapshot/rule/retention |
| Finance/ERP/bank | Finance/IT | Cost/API/Integration/Test | SoR, calculation, sandbox |
| Engineering design/BOM/equipment | Solar/BESS Engineering | Procurement/Asset/Commissioning | Catalog/hierarchy/constraints |
| Procurement/supplier/logistics | Procurement/Logistics | Workflow/Integration | Process, fields, providers |
| QA/QC/HSE standards/process | QA/HSE | Field/COD/Security/Test | Criteria/authority/non-waivable |
| Commissioning/COD/handover | Commissioning/Client/O&M | Asset/O&M | Gate/test/manifest acceptance |
| O&M/CMMS/warranty/SLA | O&M/IT | O&M/API/Data | SoR/state/closure |
| IdP/HR | IAM/HR/IT | Security/API | Identity/claims/deprovision |
| DMS/e-sign | Document Control/IT/Legal | DMS/Contract/COD | File/signature interfaces |
| OT gateway/historian/network | OT Owner/Security | Telemetry/O&M | One-way interface/site evidence |
| Cloud/platform/toolchain | Architecture/Engineering/SRE | Build/Deploy | EC2 profile Approved/Planned; production ADR/platform evidence |
| Test environments/sandboxes | QA/System Owners | Verification | Data/accounts/connectivity |
| Security/Privacy/BCM | Security/Legal/SRE | Release | Controls, incident, recovery |

## 9. Data needed from Product Owner

- Baseline approval status and scope-change authority.
- Final MVP/Release1/Release2/Future per FR/US.
- Tenant/customer/commercial model and deployment tiers.
- Primary personas, daily tasks, success metrics/targets and analytics.
- Health Score/hard-cap/freshness/confidence approval.
- Project/site/COD granularity and core state glossary.
- UAT/waiver/non-waivable policy.
- Team/schedule/budget/priorities and pilot/customer selection.

## 10. Data needed from Solar/BESS engineers

- Solar/BESS technical hierarchy, equipment models, serial/firmware lineage and naming.
- Capacity/power/energy/rating/unit/precision and effective configuration rules.
- Solar PR/yield/loss boundary, weather/irradiance/curtailment/availability sources.
- BESS SOC/SoH/RTE/degradation/cycle, power/ramp/efficiency/temperature/safety constraints.
- Peak-shaving/dispatch simulation assumptions and infeasible-case behavior.
- Commissioning procedures, instruments/calibration, criteria, safe-state and retest rules.
- Point list/tag/unit/frequency/quality/event/alarm mapping, historian/gateway/protocol.
- Cloud hierarchy depth/raw/aggregate/event retention and data volumes.
- Applicable standards/authority/site evidence; no control credential.

## 11. Data needed from functional owners

### Legal/Privacy

LegalEntity/party/signer/authority snapshot; contract/appendix/obligation/claim/permit/guarantee states; legal privilege/classification; e-sign acceptance; retention/hold/residency/privacy basis and applicable sources/effective dates.

### Finance/Accounting

Cost code/CAPEX-OPEX; budget/commitment/invoice/payment/ERP ownership; VAT/retention/withholding/advance/recovery/rounding; currency/FX source; IRR/NPV rules; approval limits; bank/reconciliation fields and sandbox.

### Procurement/Logistics

Supplier qualification; requisition/RFQ/bid/evaluation/award/PO rules; bid confidentiality/SoD/direct award; Incoterm/milestones/ETA; receipt/partial/damage/quarantine/serial/storage; carrier/ERP interfaces.

### QA/QC

ITP/inspection/hold/witness/measurement criteria; NCR severity/disposition/use-as-is/closure; punch category/COD effect; evidence and independent verification.

### HSE

PTW/JSA/isolation/competency; incident/near-miss/severity/restricted facts; stop-work/lift authority; CAPA/effectiveness; critical notification/non-waivable controls.

### Commissioning/COD

Systemization/test pack/run/retest; prerequisite/safe state/witness; gate catalog/mandatory/waivable/expiry; COD signers/effective date; handover manifest/receipt/open items.

### O&M

CMMS SoR; AlarmCase/source acknowledgment; ServiceIncident/SLA/downtime; WO priority/state/assignment/Complete/Close; maintenance/warranty/spares; KPI/report/billing and OT data access.

## 12. Changelog

| Version | Date | Author | Change | Scope impact |
|---|---|---|---|---|
| 0.1 | 2026-07-11 | Codex | Consolidated assumptions, questions, decisions, risks, dependencies and requested data | No hidden decision; unresolved issues remain open |
| 0.2 | 2026-07-11 | Codex | Đóng tenant/org/project lifecycle/initial role/test-data decisions và duyệt US-001 | Chỉ US-001 build-ready; policy module sau vẫn giữ Open Question |
| 0.3 | 2026-07-11 | Codex | Chốt EC2 operational foundation, DB-101…111 ownership, composite tenant FK, Redis fail-closed và CI Planned boundary | EC2 Approved/Planned; reserved IDs không mở feature scope; production vẫn Proposed |
| 0.4 | 2026-07-12 | Codex | Ghi quyết định Project Controls M0: calendar/import/baseline/SoD/dependency và DB-105 alert boundary | US-003 Approved/Build-ready; positive rebaseline/AC-013 dependency vẫn explicit |
| 0.5 | 2026-07-12 | Codex | Ghi core Project Controls/worker deployed và API-141 stable correction history | Không đóng giả positive rebaseline/full story; production vẫn Proposed |
| 0.6 | 2026-07-12 | Codex | Ghi quyết định US-004 aggregate/scoring/closure/SoD/package scope/Claim dependency/public rebaseline contract | US-004 Build-ready cho EC2 test; không claim implementation/production acceptance |
| 0.7 | 2026-07-12 | Codex | Chốt self-hosted runner/main CI/CD profile cho EC2 test và giữ registry/signing/IaC production là Open Question | Workflow/script Implemented; runner/first GitHub run Pending, không claim production |
| 0.8 | 2026-07-18 | Codex | Chốt US-004 residual SoR/terminal closure/scoped user.read/DB-105 generalization và đính chính DB-105 khỏi nhóm Reserved | Không đổi baseline/AC; implementation/runtime evidence vẫn pending |
| 0.9 | 2026-07-18 | Codex | Chốt DB-113 closure history, API-149 command-union SoD và API-157 full-filter/version-grouped heatmap | Không đổi baseline/AC; đóng ba semantic blocker cuối trước implementation |
| 1.0 | 2026-07-18 | Codex | Ghi US-004 completed local pre-push gate/Partial acceptance/Pending deployment, materialized forward migrations và isolated CI-port/sudo-env decision | Không đổi baseline/AC; unit 168/integration 60/migration 7/build Pass; current EC2 deploy/full E2E Pending |
