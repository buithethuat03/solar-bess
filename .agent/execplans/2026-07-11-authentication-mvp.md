# ExecPlan — Base dự án và MVP đăng nhập/đăng xuất

> **Status:** Completed  
> **Owner:** Codex / Engineering; Product Owner và IAM/Security cần xác nhận các quyết định được nêu  
> **Created:** 2026-07-11  
> **Updated:** 2026-07-11  
> **Approval:** Người dùng/Product Owner phê duyệt trực tiếp ngày 2026-07-11 cho base/auth MVP, cài toolchain và triển khai EC2 test

## 1. Mục tiêu và kết quả người dùng

Tạo monorepo npm theo `tech-stack.md` với Vue 3/Vite cho web, NestJS/TypeORM cho API và PostgreSQL; người dùng thử nghiệm có thể đăng nhập, tải lại phiên, xem identity hiện tại và đăng xuất. Kết quả phải có lint, type-check, unit, integration và Playwright E2E chạy được bằng command trong repository.

## 2. Nguồn và requirement IDs

- Baseline: `docs/Đề xuất tính năng nền tảng Solar và BESS.md`
- Source Feature IDs: `IAM-001…IAM-010`, Source `SEC-001…SEC-008`
- Business Requirements: `BR-001`, `BR-033`, `BR-040`
- Functional/Non-functional/Security: `FR-146…FR-155`, `NFR-008…NFR-013`, `SEC-101…SEC-105`, `SEC-117`, `SEC-118`
- Use cases/stories/workflows: `UC-020`, `US-020`; Authentication flow chưa có `WF-*` riêng trong artefact hiện tại
- Acceptance/tests: `AC-093…AC-097`, `TEST-093…TEST-097`, `TEST-200`
- ADR/API/Data: `ADR-001…ADR-005`, `API-001`, `DB-001`, `DB-004…DB-008`, `DB-098`

## 3. Hiện trạng repository

- Chỉ có governance và tài liệu; chưa có source code hoặc package manifest.
- `tech-stack.md` chốt npm workspaces, Vue 3, NestJS, TypeORM, PostgreSQL, JWT access/refresh token và Argon2 hoặc bcrypt.
- `docs/INDEX.md` ghi toàn bộ artefact dẫn xuất là Draft, các ADR là Proposed, approval chưa có và `Build-ready: Not yet`.
- `docs/16-open-questions-and-decisions.md` ghi IdP/protocol/claims/MFA/session là Open Question cần đóng trước Security implementation.
- API catalog/OpenAPI có `API-001 GET /v1/me`, chưa định nghĩa login, refresh hoặc logout.
- Data model có `DB-005 UserAccount` theo external issuer/subject nhưng chưa định nghĩa password credential hoặc refresh-session entity.
- Môi trường EC2 hiện chưa có `node`, `npm`, `docker` hoặc Docker Compose.
- Thư mục `.git` không phải Git repository hợp lệ; không có `git status`/history để đối chiếu thay đổi.

## 4. Phạm vi

### In scope

- Documentation delta được phê duyệt cho auth profile, API, DB, security, workflow, test và traceability trước code.
- npm workspace tối thiểu cho `apps/web`, `apps/api` và package dùng chung nếu thật sự cần.
- Màn hình login, authenticated shell, identity summary và logout.
- API login/refresh/logout/me; access JWT ngắn hạn, refresh rotation/revocation, audit không chứa secret.
- PostgreSQL migration, bootstrap user không hard-code secret, tenant isolation tối thiểu cho identity/session.
- Docker Compose tối thiểu cho phạm vi auth và command lint/type-check/unit/integration/E2E.

### Out of scope

- Các module nghiệp vụ ngoài Identity & Access.
- Redis/BullMQ, MinIO, Elasticsearch/Kibana và worker cho đến vertical slice cần chúng.
- SSO/MFA thật hoặc local email/password cho đến khi auth profile được chọn.
- Production deployment, domain/TLS/managed secret/KMS, OT/O&M integration và mọi OT write path.

## 5. Assumption, TBD và Open Question

| Loại | Nội dung | Owner cần xác nhận | Hạn/điều kiện đóng | Tác động nếu chưa đóng |
|---|---|---|---|---|
| Assumption | SSO/MFA được giữ trong roadmap nhưng local email/password là profile đã phê duyệt cho base/test MVP | Product Owner + IAM/Security | Đóng bằng yêu cầu trực tiếp 2026-07-11 | Không chặn auth MVP |
| Assumption | Build gate được phê duyệt riêng cho vertical slice auth; các module khác vẫn Draft/không build-ready | Product Owner | Đóng bằng yêu cầu trực tiếp 2026-07-11 | Không chặn auth MVP |
| Assumption | Access JWT 15 phút; refresh JWT 7 ngày, HttpOnly SameSite=Lax, rotation/revoke; rate limit 5 lần/phút theo IP+identity | IAM/Security | Review trước production thật | Không chặn test deployment |
| TBD | Cách cấp bootstrap credential và ownership của tenant/user thử nghiệm | Product Owner + Security | Trước seed/bootstrap | Không thể tạo tài khoản thử nghiệm an toàn |
| Assumption | Chỉ chạy local/EC2 development, chưa public Internet và chưa production | Product Owner | Xác nhận khi duyệt kế hoạch | Nếu sai cần deployment/security plan riêng |

## 6. Thiết kế và luồng dữ liệu

Thiết kế decision-complete sẽ được bổ sung sau khi chọn auth profile. Invariant không đổi: tenant được resolve phía server, access token không tin scope do client tự khai; refresh token rotation và revoke; logout thu hồi session; secret không vào log/audit; PM Web không có kết nối hoặc lệnh OT.

## 7. API, dữ liệu và bảo mật

- API: phải cấp `API-*` mới và cập nhật `docs/08-api-specification.md` cùng `docs/openapi/openapi.yaml` trước implementation.
- DB: phải quyết định mở rộng `DB-005` hay cấp `DB-*` mới cho credential/session, rồi cập nhật ERD, dictionary, migration/rollback và traceability.
- Security: `SEC-101…SEC-104`, `SEC-117…SEC-118`; deny-by-default, generic auth failure, refresh rotation/replay/revoke, password hash nếu local auth được duyệt.
- OT: Không áp dụng cho dữ liệu auth; boundary vẫn read-only và không tồn tại route/credential điều khiển OT.

## 8. Ma trận truy vết thực thi

| Requirement/ADR | Milestone | File/component | Acceptance/Test | Trạng thái |
|---|---|---|---|---|
| FR-147 / SEC-101…103 | M1–M4 | docs + API/web auth | AC-093…096 / TEST-093…096, TEST-200 | Blocked |
| FR-146 / SEC-105 | M2–M4 | tenant/user/me | TEST cross-tenant cần cấp ID nếu bổ sung | Blocked |
| FR-154 / SEC-118 | M2–M4 | auth audit | AC-098…100 / TEST-098…100 | Blocked |
| ADR-001…005 | M1–M4 | workspace/runtime/storage | Quality gates | Blocked |

## 9. Milestone và bước thực hiện

### M0 — Đóng documentation/build gate

- [x] Product Owner xác nhận auth profile và quyền triển khai riêng vertical slice auth.
- [x] Cập nhật requirement/API/data/security/workflow/test/traceability/changelog và trạng thái approval liên quan.
- [x] Kiểm tra link, ID và OpenAPI 3.1; không còn Open Question chặn auth.

**Exit criteria:** auth slice decision-complete và được ghi build-ready trước khi tạo production source.

### M1 — Toolchain và monorepo

- [x] Cài Node.js LTS, npm, Docker Engine và Compose trên EC2 bằng nguồn chính thức phù hợp OS.
- [x] Scaffold npm workspaces/web/API đúng phiên bản lockfile thực tế; tạo scripts lint/typecheck/test/build.
- [x] Pin dependency qua `package-lock.json`; thêm `.env.example`, không ghi secret.

**Exit criteria:** fresh install, lint, type-check và build chạy được.

### M2 — Backend auth và schema

- [x] Tạo migration tenant/user/credential/session/audit tối thiểu theo artefact đã duyệt.
- [x] Implement login/refresh/logout/me, validation, token rotation/revoke, generic failure và audit redaction.
- [x] Tạo bootstrap command nhận credential từ environment; không có mật khẩu mặc định trong repo.

**Exit criteria:** migration up/down và API integration/security tests đạt.

### M3 — Frontend auth

- [x] Tạo login UI, auth store/router guard, API client refresh behavior và authenticated shell.
- [x] Không lưu refresh token trong localStorage; logout xóa client state ngay cả khi server session đã hết.
- [x] Thêm unit, label/accessibility path và error-state tests.

**Exit criteria:** login, reload, expiry/refresh và logout hoạt động qua UI.

### M4 — End-to-end và bàn giao

- [x] Chạy lint, type-check, unit, integration, build và Playwright.
- [x] Kiểm tra invalid credential, expired/replayed/revoked token, logout, direct protected route và cross-tenant denial.
- [x] Cập nhật ExecPlan, docs/CHANGELOG.md và danh sách file/kết quả thực tế.

**Exit criteria:** toàn bộ quality gate áp dụng đạt; không có secret hoặc blocker bị che giấu.

## 10. Kế hoạch kiểm thử và chất lượng

| Loại | Command/quy trình | Requirement/Test IDs | Expected result |
|---|---|---|---|
| Install | `npm ci` | ADR/toolchain | Exit code 0 |
| Lint | `npm run lint` | NFR-020 | Exit code 0 |
| Type-check | `npm run typecheck` | NFR-020 | Exit code 0 |
| Unit | `npm run test:unit` | TEST-093…096, TEST-200 | Pass |
| Integration | `npm run test:integration` | TEST-093…096, TEST-200 | Pass với PostgreSQL thật trong Compose |
| E2E | `npm run test:e2e` | TEST-093…096 | Login/reload/logout/deny paths pass |
| Build | `npm run build` | NFR-020 | Exit code 0 |
| Migration rollback | command thực tế TBD sau scaffold | DB IDs được duyệt | Up/down/up giữ schema nhất quán |

## 11. Migration, rollout và rollback

- Migration mới chỉ cho dev DB chưa có dữ liệu thật; up/down được test.
- Compose rollout theo thứ tự PostgreSQL → API → web.
- Không tạo tài khoản mặc định; bootstrap user bằng secret ngoài repo.
- Rollback code về image/artefact trước và chạy migration down chỉ khi compatibility check cho phép; vì chưa có production/data thật, recreate dev volume là phương án recovery cuối cùng có cảnh báo rõ.

## 12. Rủi ro và biện pháp

| Rủi ro | Xác suất/tác động | Tín hiệu | Giảm thiểu | Owner |
|---|---|---|---|---|
| Triển khai local password trái SSO requirement | Cao/Cao | Không có IdP decision | Chặn M1; PO/IAM chọn profile | PO/IAM |
| Token/session yếu hoặc rò secret | Trung bình/Critical | token replay/log chứa secret | rotation/revoke/redaction/security test | Security/Engineering |
| Cross-tenant identity leak | Trung bình/Critical | tenant từ request body hoặc IDOR | server-resolved tenant, negative integration test | Engineering/Security |
| Toolchain cài trực tiếp làm EC2 khó lặp lại | Trung bình/Trung bình | version drift | pin version, lockfile, Compose, ghi command | Engineering |
| Tài liệu và code lệch API/schema | Cao/Cao | endpoint không có API/DB ID | docs-first delta và contract tests | Engineering/QA |

## 13. Decision Log

| Ngày | Quyết định | Lý do | ADR/Requirement liên quan | Người phê duyệt |
|---|---|---|---|---|
| 2026-07-11 | Chưa scaffold/cài runtime khi build gate và auth profile còn mở | INDEX ghi Not build-ready; auth/API/schema chưa decision-complete | AGENTS; FR-147; SEC-101…103 | Governance hiện hành |
| 2026-07-11 | Dùng local email/password cho base/test; SSO/MFA để milestone sau | Người dùng xác nhận rõ phạm vi base, JWT, DB và EC2 test | FR-147; SEC-101…103 | Người dùng/Product Owner |
| 2026-07-11 | Access JWT 15 phút; refresh JWT 7 ngày qua HttpOnly cookie, rotation/revoke | Profile an toàn, có thể test và không hard-code secret | SEC-103/117/118 | Product Owner ủy quyền thiết kế base |

## 14. Progress Log

| Ngày | Hoàn thành | Bằng chứng/command | Blocker/next step |
|---|---|---|---|
| 2026-07-11 | Đọc governance, docs, tech stack; inventory source/toolchain | `rg --files`; `node --version`; `npm --version`; `docker --version`; docs searches | Node/npm/Docker chưa cài; cần quyết định M0 |
| 2026-07-11 | Đối chiếu auth trace và API/data gap | FR-147, UC/US-020, SEC-101…104, API-001, DB-005, TEST-093…097/200 | Login/logout/refresh chưa có API IDs/schema |
| 2026-07-11 | Product Owner phê duyệt auth profile, toolchain và test deployment | Yêu cầu trực tiếp trong hội thoại | Cập nhật docs-first delta rồi triển khai M1–M4 |
| 2026-07-11 | Hoàn tất toolchain, source, DB, test và EC2 deploy | Full quality gate; 3 container healthy; HTTP smoke từ public IP | Bàn giao URL/tài khoản test; HTTPS là follow-up |

## 15. Kết quả và bàn giao

- Outcome: local JWT auth vertical slice hoạt động trên EC2 test qua `http://54.255.223.131`; PostgreSQL/API/web đều healthy.
- File tạo/sửa: npm workspace và lockfile; `apps/api`, `apps/web`, Docker/Playwright/ESLint/Redocly config; migration/test; auth-related docs/trace/changelog.
- Test/validation: lint/type/build pass; 4 unit, 6 integration và 2 E2E pass; migration up/down/up, OpenAPI validation và npm audit pass.
- Changelog/traceability: cập nhật `WF-026`, `DB-099…100`, `API-137…139`, `AC-174…177`, `TEST-230…233` và execution evidence.
- Assumption/TBD/Open Question: HTTP/Cookie Secure=false và local password chỉ dành cho EC2 test; HTTPS, SSO/MFA, managed secrets/KMS, hosted CI/IaC vẫn cần trước production thật.
- Follow-up: bật domain/TLS rồi đổi `COOKIE_SECURE=true`; tiếp tục vertical slice chỉ sau approval tương ứng.
