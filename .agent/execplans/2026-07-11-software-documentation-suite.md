# ExecPlan — Xây dựng bộ tài liệu phát triển Solar & BESS Project Management Web

> **Status:** Completed  
> **Owner:** Codex  
> **Created:** 2026-07-11  
> **Updated:** 2026-07-11  
> **Approval:** Yêu cầu trực tiếp của người dùng trong goal objective

## 1. Mục tiêu và kết quả người dùng

Tạo đầy đủ bộ tài liệu phát triển phần mềm từ `docs/00-documentation-plan.md` đến `docs/16-open-questions-and-decisions.md`, `docs/INDEX.md` và `docs/openapi/openapi.yaml`. Bộ tài liệu phải chuyển baseline tính năng đã phê duyệt thành chuỗi truy vết đủ để Product Owner, BA, kiến trúc sư, designer, developer, QA, security và đội Solar/BESS review trước khi cho phép viết production code.

Kết quả cuối phải chứng minh được:

- baseline nghiệp vụ không bị thay đổi;
- mỗi artefact có purpose, scope, source, version, status, assumptions, open questions và changelog;
- mã chuẩn được định nghĩa đúng một lần và tham chiếu chéo nhất quán;
- phạm vi PM Web, O&M monitoring và OT được tách rõ;
- PM Web không có write path điều khiển BESS/OT;
- MVP ưu tiên Project Manager, không chứa toàn bộ roadmap;
- OpenAPI 3.1, ERD, permission matrix, workflow Mermaid, backlog, test và traceability khớp nhau;
- chưa có production code.

## 2. Nguồn và requirement IDs

- Baseline bất biến: `docs/Đề xuất tính năng nền tảng Solar và BESS.md`, phiên bản 1.0, SHA-256 `51DBAD85FFC548AB9D95743551DE6BE745EA2723B3F237054B9C793B3A8CF55C`.
- Governance: `AGENTS.md`.
- Hướng dẫn kế hoạch: `.agent/PLANS.md`.
- Lịch sử: `docs/CHANGELOG.md`.
- Source Feature IDs: 216 định nghĩa thuộc `OPP`, `PFM`, `PRJ`, `DOC`, `CTR`, `ENG`, `CST`, `PRC`, `LOG`, `CON`, `HSE`, `QAC`, `RSK`, `COM`, `OMM`, `SOL`, `BES`, `WFL`, `IAM`, `INT`, `AIX`, `ARC`, `SEC`.
- Mã chuẩn sẽ được định nghĩa trong artefact sở hữu ở mục 6; không tạo ID giả để đủ số lượng.

### Quy tắc tránh xung đột mã

- Baseline `SEC-001…SEC-008` là **Source Feature ID**, không phải Security Requirement chính thức.
- Security Requirement mới bắt đầu từ `SEC-101` để không có hai định nghĩa cùng mã.
- Baseline `WF-01…WF-14` là Source Wireframe ID; workflow chính thức dùng ba chữ số `WF-001…`.
- Baseline `US-E01…US-E37` là Source User Story ID; backlog chính thức dùng `US-001…`.
- Mọi ánh xạ ghi rõ `Source: <ID>`.

## 3. Hiện trạng repository

- Repository chưa có source code, manifest, schema, API hoặc test runner.
- Artefact hiện có: `AGENTS.md`, `.agent/PLANS.md`, `docs/CHANGELOG.md` và baseline tính năng.
- Baseline có 216 Source Feature ID duy nhất, 14 process section (ngoài phần quy ước D.1), 37 source user story, 14 wireframe, MVP/roadmap, mô hình dữ liệu khái niệm, kiến trúc tham chiếu, nguồn pháp lý/kỹ thuật và ví dụ tính.
- Toolchain production là `TBD`; không được bịa lệnh lint/type-check/test code.

## 4. Phạm vi

### In scope

- 18 tài liệu Markdown: `00` đến `16` và `INDEX`.
- OpenAPI 3.1 ở `docs/openapi/openapi.yaml`.
- BR, FR, NFR, UC, WF, US, AC, DB, API, SEC, TEST và ADR có traceability.
- Mermaid cho context, domain, architecture, ERD, workflow/state.
- Audit toàn cục về file, link, ID, coverage, thuật ngữ và scope.
- Cập nhật changelog về việc tạo bộ tài liệu; không thay đổi scope baseline.

### Out of scope

- Production code, scaffold ứng dụng, package manifest, database migration thực thi, cloud resource hoặc CI pipeline chạy thật.
- Quyết định vendor/technology chưa đủ dữ liệu đội ngũ, ngân sách hoặc hạ tầng; ghi `TBD`/ADR Proposed.
- Điều khiển trực tiếp SCADA/EMS/BMS/PCS hoặc BESS.
- Kết luận pháp lý thay cho tư vấn pháp lý/authority/hợp đồng dự án.
- Dữ liệu thật của khách hàng, dự án, biểu giá, ngưỡng phê duyệt hoặc SLA chưa được cung cấp.

## 5. Assumption, TBD và Open Question

| Loại | Nội dung | Owner cần xác nhận | Điều kiện đóng | Tác động nếu chưa đóng |
|---|---|---|---|---|
| Assumption | Tất cả tài liệu dẫn xuất phát hành `Draft v0.1` cho đến khi review | Product Owner | PO xác nhận trạng thái/version | Không chặn soạn draft |
| Assumption | MVP dùng nhóm Must trong baseline và ưu tiên PM Command Center/project execution | Product Owner/PMO | Phê duyệt MVP scope | Backlog/roadmap có thể đổi |
| Assumption | Multi-tenant cloud-first, có tùy chọn dedicated; vendor cụ thể chưa chọn | Product Owner/Architecture | Deployment decision/ADR | NFR/DevOps ở mức kiến trúc |
| TBD | Tech stack frontend/backend/search/queue/time-series | Architecture/Engineering | ADR và benchmark | Không viết code/OpenAPI vẫn độc lập công nghệ |
| TBD | Approval thresholds, SLA, retention, RPO/RTO ràng buộc | PO/Finance/Legal/IT | Policy được phê duyệt | Dùng baseline proposal, đánh dấu TBD |
| Open Question | Pháp nhân/tenant hierarchy và data residency bắt buộc | PO/Legal/IT Security | Quyết định được ghi | Ảnh hưởng tenancy/deployment/privacy |
| Open Question | ERP/accounting/IdP/e-sign/DMS/OT vendor và API khả dụng | System Owners | Interface discovery | Connector để Draft/TBD |
| Open Question | OT protocols, tag list, sampling, historian và network topology từng site | OT Owner/Solar-BESS Engineering | Site survey/interface spec | Không thể chốt integration detail |
| Open Question | Browser/device matrix và mức offline PWA bắt buộc | Product Owner/Site | UX/NFR approval | Test matrix để TBD |
| Open Question | Team velocity và thang story point | Delivery Lead | Backlog calibration | Story point chỉ là sơ bộ |

## 6. Thiết kế quản trị tài liệu và nguồn sự thật

| Loại thông tin | Artefact sở hữu định nghĩa chuẩn | Artefact chỉ tham chiếu/mở rộng |
|---|---|---|
| Phạm vi gốc/Source Feature ID | Baseline tính năng | Tất cả tài liệu dẫn xuất |
| Vision, in/out scope, success metrics | `01-product-vision-and-scope.md` | BRD, PRD, INDEX |
| Business goal/rule/BR/stakeholder/KPI | `02-BRD.md` | PRD, SRS, backlog, traceability |
| FR/NFR/UC/release/product analytics | `03-PRD.md` | SRS, UX, backlog, test |
| System behavior/validation/error/concurrency | `04-SRS.md` | API, data, test |
| Bounded context/domain invariant | `05-domain-model.md` | Architecture, data, API |
| Architecture/ADR/deployment/data flow | `06-solution-architecture.md` | Security, DevOps, API |
| DB entity/schema/data dictionary | `07-data-model.md` | Domain, API, test |
| API ID/convention/operation semantics | `08-api-specification.md` | OpenAPI, security, test |
| Machine-readable API contract | `openapi/openapi.yaml` | API spec/test |
| SEC/permission/threat model | `09-security-and-permissions.md` | SRS, API, test, DevOps |
| Sitemap/screen/user flow/state UI | `10-ux-information-architecture.md` | PRD/backlog/test |
| WF/state transitions | `11-workflows-and-state-machines.md` | SRS/API/backlog/test |
| US/AC/release/DoR/DoD | `12-product-backlog.md` | Test/traceability |
| TEST/test strategy/quality gates | `13-test-strategy.md` | DevOps/traceability |
| Environment/CI-CD/operations | `14-devops-and-deployment.md` | Architecture/test |
| Cross-ID registry và coverage gaps | `15-traceability-matrix.md` | INDEX/audit |
| Assumption/question/decision/risk | `16-open-questions-and-decisions.md` | Tất cả tài liệu |
| Navigation/read order/status | `INDEX.md` | Không định nghĩa requirement |
| Change history | `CHANGELOG.md` | Tất cả tài liệu |

### ID ownership và vùng cấp số

| ID | Artefact sở hữu | Vùng dự kiến |
|---|---|---|
| `BR-*` | BRD | `BR-001…BR-040`, ánh xạ một-một `REQ-01…REQ-40` |
| `FR-*` | PRD | `FR-001…FR-198`, ánh xạ một-một 198 Source Feature ID chức năng |
| `NFR-*` | PRD | `NFR-001…NFR-024` |
| `UC-*` | PRD | `UC-001…UC-037` |
| `ADR-*` | Solution Architecture | `ADR-001…ADR-010`, ánh xạ `ARC-001…ARC-010` |
| `DB-*` | Data Model | `DB-001…DB-098` |
| `API-*` | API Specification/OpenAPI | `API-001…API-136` |
| `SEC-*` | Security | `SEC-101…SEC-132` |
| `WF-*` | Workflow | `WF-001…WF-025` |
| `US-*`, `AC-*` | Backlog | `US-001…US-037`, `AC-001…AC-173` |
| `TEST-*` | Test Strategy | `TEST-001…TEST-229` |

## 7. API, dữ liệu và bảo mật

- OpenAPI dùng `openapi: 3.1.0`, JSON Schema 2020-12, `x-api-id` để liên kết `API-*`.
- API PM Web không có operation tạo lệnh OT/BESS.
- Data model phải có tenant scope, PK/FK/unique/index, decimal money, stable IDs, signed snapshot, versioning/audit/retention.
- Security dùng deny-by-default, RBAC+ABAC+SoD, cross-tenant negative tests, MFA/SSO và external-sharing controls.
- Luồng OT mặc định `OT → gateway/DMZ → integration/time-series → O&M/PM`, outbound/read-only.

## 8. Ma trận truy vết thực thi

| Nguồn | Milestone | Artefact | Acceptance |
|---|---|---|---|
| Baseline A–I, REQ-01…40 | M1–M6 | 00–16/INDEX/OpenAPI | Mọi nhóm nguồn được ánh xạ |
| Source Feature IDs | M2–M6 | BRD/PRD/traceability | 216/216 có downstream mapping hoặc lý do deferred |
| Baseline workflows | M5 | Workflow/backlog/test | Mỗi workflow có WF/US/AC/TEST |
| Baseline entities | M4 | Domain/Data/API | Mỗi entity có context và DB hoặc lý do conceptual-only |
| Baseline MVP | M3/M5 | PRD/backlog | Must được đưa MVP hoặc ghi quyết định loại |
| Baseline security/OT | M4/M5/M6 | Architecture/Security/Test | Không write endpoint, có negative tests |

## 9. Milestone và bước thực hiện

### M0 — Audit nguồn

- [x] Đọc `AGENTS.md`, `.agent/PLANS.md`, changelog và goal objective.
- [x] Inventory repository: không có source code.
- [x] Xác minh baseline/hash/ID counts/headings.
- [x] Hoàn tất audit của các subagent và hợp nhất discovery.

**Exit criteria:** nguồn, invariants, ID collision và open questions được ghi.

### M1 — Kế hoạch tài liệu

- [x] Tạo `docs/00-documentation-plan.md` trước mọi tài liệu sản phẩm mới.
- [x] Ghi dependency, order, DoD, assumptions, PO confirmations và SSoT matrix.
- [x] Validate metadata/link/UTF-8 và cập nhật ExecPlan.

**Exit criteria:** kế hoạch đủ để tạo tuần tự 01–16 mà không tự quyết định lại governance.

### M2 — Vision và BRD

- [x] Tạo 01 và kiểm tra scope/boundary.
- [x] Tạo 02 với BR/business rules/current-target process/KPI/risk/dependency.
- [x] Ánh xạ toàn bộ Source Feature group vào BR.

**Exit criteria:** scope và BR là nguồn chuẩn, không có feature mồ côi ở cấp business.

### M3 — PRD và SRS

- [x] Tạo 03 với FR/NFR/UC/module/journey/MVP/analytics.
- [x] Tạo 04 chuyển FR/NFR thành behavior có thể triển khai.
- [x] Ghi forward reference tới DB/API/SEC/WF/AC sẽ được đóng ở M4–M5.

**Exit criteria:** FR tham chiếu BR; SRS không sao chép PRD và không bịa kỹ thuật.

### M4 — Domain, Architecture, Data và API

- [x] Tạo 05 context map/DDD/invariant/transaction boundary.
- [x] Tạo 06 Mermaid context/container/component/deployment, ADR candidates và trade-off.
- [x] Tạo 07 ERD/data dictionary/DB IDs.
- [x] Tạo 08 và OpenAPI 3.1; validate schema cơ bản và no-OT-write invariant.

**Exit criteria:** domain/data/API/architecture nhất quán, forward references M3 được đóng hoặc TBD rõ.

### M5 — Security, UX, Workflow và Backlog

- [x] Tạo 09 với SEC IDs và permission matrix.
- [x] Tạo 10 với sitemap/14+ screens/user flow/UI states.
- [x] Tạo 11 với WF IDs/Mermaid/state/exception.
- [x] Tạo 12 với US/AC/DoR/DoD/release và PM-first MVP.

**Exit criteria:** every MVP FR có UX hoặc API/system path, permission, workflow nếu áp dụng, US và AC.

### M6 — Test, DevOps, Traceability, Decisions và INDEX

- [x] Tạo 13 với TEST IDs và coverage levels.
- [x] Tạo 14 với environment/CI-CD/observability/backup/DR, tool commands TBD.
- [x] Tạo 15 và chạy gap/contradiction detection.
- [x] Tạo 16, hợp nhất assumptions/questions/decisions/risks/dependencies.
- [x] Tạo INDEX cuối cùng.

**Exit criteria:** traceability đầu-cuối, exact counts và review order có thể kiểm chứng.

### M7 — Audit và bàn giao

- [x] Kiểm tra file thiếu, relative links, duplicate/unreferenced IDs, Mermaid fences, OpenAPI markers, terminology, BR→FR, US→AC, requirement→TEST.
- [x] Đối chiếu baseline hash và no production code.
- [x] Cập nhật changelog và ExecPlan outcome.

**Exit criteria:** không còn lỗi cấu trúc; gap thật được ghi Open Question/Deferred, không bị che giấu.

## 10. Kế hoạch kiểm thử và chất lượng

| Loại | Command/quy trình | Expected result |
|---|---|---|
| File inventory | PowerShell/`rg --files` | Đủ 00–16, INDEX, OpenAPI; không source code |
| UTF-8/Markdown | PowerShell readback/table/fence checks | Không U+FFFD; table/fence cân bằng |
| Link | Trích Markdown links tương đối và `Test-Path`/anchor check | Không link hỏng |
| ID | Regex định nghĩa/tham chiếu | Không trùng; đúng owner/range; không mã mồ côi không giải thích |
| Traceability | Parse tables 02/03/08/09/11/12/13/15 | BR→FR/NFR→UC/WF/US→AC→API/DB/SEC→TEST |
| OpenAPI | YAML structural checks: 3.1, paths, operations, components, x-api-id | Cấu trúc đầy đủ; API IDs duy nhất |
| Safety | Search operation/wording liên quan command/control | Không có PM Web write endpoint tới OT/BESS |
| Baseline | SHA-256 | Hash không đổi |
| Code quality | Lint/type-check/unit/integration | Không áp dụng: chưa có code/toolchain; không báo pass giả |

## 11. Migration, rollout và rollback

- Không migration dữ liệu/production.
- Chỉ thêm tài liệu và thư mục `docs/openapi`; baseline không sửa.
- Mỗi artefact được tạo bằng patch; nếu validation thất bại, sửa artefact dẫn xuất, không sửa baseline để làm test pass.
- Nếu một quyết định thay đổi phạm vi, dừng phần liên quan, ghi Open Question/changelog Proposed thay vì áp dụng âm thầm.

## 12. Rủi ro và biện pháp

| Rủi ro | Xác suất/tác động | Giảm thiểu | Owner |
|---|---|---|---|
| Bộ tài liệu quá rộng dẫn đến nội dung chung chung | Cao/Cao | Source-ID coverage, module owner, concrete rule/examples | Codex/Product Owner |
| Định nghĩa trùng giữa BRD/PRD/SRS | Cao/Cao | SSoT matrix; nơi khác chỉ reference/elaborate | Codex |
| ID trùng, đặc biệt SEC | Cao/Cao | SEC formal bắt đầu 101; final regex audit | Codex |
| Forward dependency do thứ tự file | Cao/Trung bình | Draft theo order rồi reconciliation pass | Codex |
| Bịa tech/legal values | Trung bình/Cao | TBD/Open Question; official baseline only | Architecture/Legal |
| MVP phình to | Cao/Cao | Baseline Must + PM-first; deferred matrix | Product Owner |
| OT write path lọt vào API | Thấp/Rất cao | no-write invariant + OpenAPI search/security test | OT Security |

## 13. Decision Log

| Ngày | Quyết định | Lý do | Liên quan | Người phê duyệt |
|---|---|---|---|---|
| 2026-07-11 | Baseline bất biến; tài liệu dẫn xuất Draft v0.1 | Bảo toàn phạm vi | AGENTS/baseline | User request |
| 2026-07-11 | Formal Security IDs bắt đầu `SEC-101` | Tránh trùng Source `SEC-001…008` | ID governance | Codex theo AGENTS |
| 2026-07-11 | Tạo theo thứ tự người dùng nhưng chạy reconciliation sau mỗi dependency ngược | SRS/API cần artefact tạo sau | Documentation process | Codex |
| 2026-07-11 | Không chọn vendor tech khi thiếu constraints | Không tự bịa | ADR/TBD | Codex |

## 14. Progress Log

| Ngày | Hoàn thành | Bằng chứng | Next step |
|---|---|---|---|
| 2026-07-11 | Đọc objective, AGENTS, PLANS, changelog; inventory repo | Shell readback/file list | Hoàn tất baseline audit |
| 2026-07-11 | Xác minh baseline 216 IDs/14 process sections/37 stories/14 wireframes/hash | Regex/hash output | Tạo plan 00 |
| 2026-07-11 | Tạo ExecPlan và plan 00; kiểm tra UTF-8, fence và bảng | File readback/Markdown checks | Tạo tài liệu 01 |
| 2026-07-11 | Khóa deterministic ID counts và đồng bộ path governance với objective | Dependency audit | Tạo tài liệu 01–02 |
| 2026-07-11 | Tạo 01 Vision & Scope; kiểm tra metadata, boundary, UTF-8 và link | 407 dòng/3 link hợp lệ | Tạo 02 BRD |
| 2026-07-11 | Tạo 02 BRD; đúng 40 BR và 40 Source REQ mapping | 872 dòng/regex+link validation | Tạo 03 PRD |
| 2026-07-11 | Tạo 03 PRD; đúng 198 FR, 24 NFR, 37 UC; 198 Source Feature mapping; release 110/31/10/47 | Regex/range/source/release/UTF-8 validation | Tạo 04 SRS |
| 2026-07-11 | Tạo 04 SRS; exhaustive ledger 198 FR và 24 NFR quality scenarios | Regex/range/fence/UTF-8 validation | Tạo 05 Domain Model |
| 2026-07-11 | Tạo 05 Domain Model và 06 Architecture; 21 contexts, 10 ADR Proposed, Mermaid/data-flow/OT guardrail | Context/ADR/fence/UTF-8 validation | Tạo 07 Data Model |
| 2026-07-11 | Tạo 07 Data Model; DB-001…DB-098 unique, 6 ERD và data dictionary | Exact range/name/fence validation | Tạo 08 API |
| 2026-07-11 | Tạo 08 API + OpenAPI 3.1; API-001…API-136 unique trong cả hai artefact | x-api-id/range/path/no-control validation | Tạo 09 Security |
| 2026-07-11 | Tạo 09 Security; SEC-101…SEC-132, threat model và role/data-scope matrix | Exact range/fence/UTF-8 validation | Tạo 10 UX |
| 2026-07-11 | Tạo 10 UX và 11 Workflow; 18 wireframes, đủ 14 source WF, 25 formal WF/Mermaid | Screen/source/range/fence validation | Tạo 12 Backlog |
| 2026-07-11 | Tạo 12 Backlog; US-001…037 và AC-001…173 exact, AC text khớp source, phase 25/6/5/1 | Range/source/text/phase validation | Tạo 13 Test Strategy |
| 2026-07-11 | Tạo 13 Test; TEST-001…229 maps 173 AC + 24 NFR + 32 SEC | Exact range/mapping validation | Tạo 14 DevOps |
| 2026-07-11 | Tạo 14 DevOps; commands correctly TBD/not run because no code | Metadata/fence/content validation | Tạo 15 Traceability |
| 2026-07-11 | Tạo 15 Traceability; expanded BR 40/40, FR 198/198, no API/DB orphan; contradictions/deferred gaps listed | Coverage script and registry audit | Tạo 16/INDEX |
| 2026-07-11 | Tạo 16 Questions/Decisions và INDEX | Section/link/inventory validation pending final audit | Chạy M7 global audit |
| 2026-07-11 | Hoàn tất M7 global audit và changelog | 19/19 artefact; 0 broken file/anchor/table/ID/orphan; 216/216 Source IDs; OpenAPI 136; baseline hash unchanged; no code | Bàn giao Draft v0.1 để owner review |

## 15. Kết quả và bàn giao

- **Outcome:** Completed — bộ tài liệu Draft v0.1 đã được tạo và audit; chưa có nghĩa là Product/Architecture/Security owner đã phê duyệt cho production coding.
- **Artefact:** Đủ `docs/00…16`, `docs/INDEX.md`, `docs/openapi/openapi.yaml`; cập nhật `docs/CHANGELOG.md`, `AGENTS.md` path governance và ExecPlan này.
- **Catalog:** 40 BR; 198 FR; 24 NFR; 37 UC; 10 ADR; 98 DB; 136 API; 32 formal SEC; 25 WF; 37 US; 173 AC; 229 TEST.
- **Trace:** 216/216 Source Feature ID và 40/40 REQ có mapping; AC source text 173/173 khớp; range-aware audit không có canonical ID mồ côi.
- **Structural validation:** 19/19 artefact bắt buộc; 0 relative-file link hỏng; 0 anchor hỏng theo slug/explicit-anchor audit; 0 table-column mismatch; 0 duplicate/out-of-range canonical ID; 0 U+FFFD; 59 Mermaid blocks trong derived docs dùng loại diagram hỗ trợ.
- **OpenAPI:** `openapi: 3.1.0`; 136 unique `x-api-id` và `operationId`; document/YAML mapping khớp; path parameters đầy đủ; API-125 mTLS/read-only; không có dangerous control path. Formal third-party OpenAPI validator chưa chạy vì repository không có toolchain.
- **Baseline:** SHA-256 không đổi `51DBAD85FFC548AB9D95743551DE6BE745EA2723B3F237054B9C793B3A8CF55C`.
- **Code/test execution:** 0 production source file và 0 manifest; lint/type-check/unit/integration không áp dụng và không được báo pass.
- **Assumption/TBD/Open Question:** Đã hợp nhất ở `docs/16-open-questions-and-decisions.md`; các blocker chính là approval status/release scope, tenant/legal model, state/authority/SLA, system/OT interfaces, exact NFR targets, technology/operations và legal/technical applicability.
- **Follow-up:** Product Owner và owner chuyên môn review/đóng blocker, Accept ADR trọng yếu và xác nhận documentation gate trước khi cho phép production code.
