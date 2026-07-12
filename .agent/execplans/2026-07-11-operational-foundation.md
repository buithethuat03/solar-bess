# ExecPlan — Operational foundation cho EC2 test profile

> **Status:** Approved  
> **Owner:** Codex / Platform Engineering  
> **Created:** 2026-07-11  
> **Updated:** 2026-07-11  
> **Approval:** Product Owner trao quyền quyết định trực tiếp ngày 2026-07-11; chỉ phê duyệt EC2 test profile, production vẫn Proposed

## 1. Mục tiêu và kết quả người dùng

Sau kế hoạch này, mọi mutation nghiệp vụ trên EC2 test có một runtime contract thống nhất: PostgreSQL commit business state, audit và `DB-102` outbox trong cùng transaction; worker riêng chuyển event qua Redis/BullMQ theo at-least-once nhưng consumer chỉ tạo side effect một lần nhờ `DB-103`; command retry trả cùng kết quả nhờ `DB-104`; login rate limit dùng Redis dùng chung giữa các API replica; và database ngăn FK xuyên tenant bằng composite constraint. API, worker và dependency có readiness/health rõ ràng, không báo healthy khi PostgreSQL/Redis bắt buộc chưa sẵn sàng.

## 2. Nguồn và requirement IDs

- Baseline: `docs/Đề xuất tính năng nền tảng Solar và BESS.md` — chỉ đọc, không thay đổi.
- Source Feature IDs: Không tạo Source Feature mới; đây là operational foundation xuyên capability.
- Business Requirements: `BR-001`, `BR-031`, `BR-033`, `BR-034`, `BR-037`, `BR-040`.
- Functional/Non-functional/Security: `NFR-006`, `NFR-007`, `NFR-012`, `NFR-020`, `NFR-021`, `NFR-023`, `NFR-024`; `SEC-103`, `SEC-105…SEC-111`, `SEC-118`, `SEC-122`, `SEC-124`, `SEC-125`.
- Use cases/stories/workflows: nền dùng chung cho `US-001`, `US-003`, `US-016`, `US-020…US-024`, `US-028`; không thay đổi AC hoặc workflow domain trong plan này.
- Acceptance/tests: `TEST-180`, `TEST-200`, `TEST-202…TEST-208`, `TEST-231`; có thể tái dùng `TEST-185`, `TEST-194`, `TEST-196` khi chạy full operational regression; không cấp TEST ID mới.
- ADR/API/Data: `ADR-001`, `ADR-002`, `ADR-004`, `ADR-006`, `API-001…API-139`; `DB-101…DB-111` với ownership chính xác ở mục 7.

## 3. Hiện trạng repository

- Monorepo npm workspaces hiện có Vue web và NestJS API; chưa có `apps/worker`.
- Docker Compose hiện chạy PostgreSQL 17, API và web; chưa có Redis hoặc worker.
- `apps/api/package.json` chưa có BullMQ/Redis dependency. Login rate limit hiện là memory-local, vì vậy không chia sẻ quota giữa replica/process.
- Project Master đã có business/audit và per-table idempotency key nhưng chưa có generic command receipt, transactional outbox hoặc consumer ledger.
- Migration `1783728000000-CreateProjectMaster` có tenant columns nhưng cần composite unique/FK hardening để database tự từ chối cross-tenant relation.
- CI commands tồn tại và đã chạy thủ công; hosted CI, SBOM, artifact signing và IaC chưa tồn tại.

## 4. Phạm vi

### In scope

- Chấp nhận implementation profile PostgreSQL + Redis + BullMQ + transactional outbox + worker riêng cho EC2 test.
- Cấp và đặc tả `DB-102`, `DB-103`, `DB-104`; reserve `DB-101`, `DB-105…DB-111` đúng owner, không triển khai nhầm.
- Refactor mutation được chọn để business row + audit + outbox commit atomically.
- Command idempotency dùng `DB-104`, request hash và key scoped theo tenant/actor/operation.
- BullMQ job ID bằng outbox event ID; consumer dedupe qua `DB-103`; retry/backoff/DLQ có quan sát.
- Redis-backed login rate limit với key không chứa raw email/IP và fail closed khi dependency bắt buộc mất.
- Composite tenant unique/FK cho mọi relation vật lý được harden trong migration mới.
- Runtime contract cho API/worker/PostgreSQL/Redis, health/readiness và shutdown/drain.
- Test failure injection, tenant/security regression, migration `up → down → up`, build và EC2 test rollout.
- Ghi CI là Planned, không tuyên bố hosted pipeline đã tồn tại.

### Out of scope

- Không triển khai `US-003`, `ProjectSchedule`, WBS, activity, baseline hoặc sửa OpenAPI schedule/domain; `DB-101` chỉ reserve.
- Không triển khai notification/saved view/report job/AI; `DB-105…111` chỉ reserve.
- Không thay baseline, không thêm OT/BESS command, route, queue, credential hoặc UI.
- Không phê duyệt production HA/DR, Redis topology, KMS, hosted CI/IaC/SBOM/signing hay SLO production.

## 5. Assumption, TBD và Open Question

| Loại | Nội dung | Owner cần xác nhận | Hạn/điều kiện đóng | Tác động nếu chưa đóng |
|---|---|---|---|---|
| Decision | EC2 test dùng PostgreSQL + Redis + BullMQ + worker/outbox | Product Owner delegated / Architecture | Đã đóng cho test ngày 2026-07-11 | M1 có thể triển khai; production vẫn Proposed |
| Decision | Redis rate limit fail closed; API readiness fail khi Redis bắt buộc không sẵn sàng | Product Owner delegated / Security | Đã đóng cho test ngày 2026-07-11 | Tránh bypass quota khi Redis lỗi |
| Assumption | Test DB synthetic có thể reset/seed | Product Owner | Đã xác nhận 2026-07-11 | Cho phép rehearsal migration và failure injection |
| TBD | Production Redis HA/persistence/eviction, queue retention và capacity | SRE/Architecture | Trước production | Không chặn EC2 test; chặn production acceptance |
| TBD | Hosted CI provider, branch protection, registry, SBOM/signing/IaC | Platform/Security | Trước production pipeline | CI giữ trạng thái Planned |

Không có Open Question chặn implementation EC2 test.

## 6. Thiết kế và luồng dữ liệu

```mermaid
sequenceDiagram
  actor Client
  participant API as Nest API
  participant DB as PostgreSQL
  participant PUB as Outbox publisher
  participant REDIS as Redis/BullMQ
  participant W as Worker consumer
  Client->>API: command + Idempotency-Key
  API->>DB: BEGIN; claim DB-104
  API->>DB: tenant-scoped mutation + DB-098 audit + DB-102 event
  API->>DB: complete DB-104; COMMIT
  API-->>Client: stable response
  PUB->>DB: claim DB-102 with SKIP LOCKED
  PUB->>REDIS: add jobId = eventId
  REDIS->>W: at-least-once delivery
  W->>DB: claim DB-103 (tenant, consumer, event)
  W->>DB: side effect + mark processed atomically
  W-->>REDIS: ack
```

- API và worker dùng cùng codebase/config package nhưng chạy thành process/container riêng.
- Publisher claim batch bằng row lock/lease; crash trước enqueue để event còn pending, crash sau enqueue được BullMQ job ID dedupe.
- Consumer insert `DB-103` với unique tenant+consumer+event. Duplicate đã `PROCESSED` được ack không chạy lại; `PROCESSING` quá lease được retry; terminal failure đi DLQ và giữ correlation.
- `DB-104` scope là tenant + actor/service principal + operation + idempotency key. Cùng key khác request hash trả `409 IDEMPOTENCY_CONFLICT`; cùng hash trả response đã commit; command đang chạy trả `409 COMMAND_IN_PROGRESS`. EC2 test giữ receipt 24 giờ qua config, production retention TBD.
- Redis rate-limit key là HMAC của tenant + normalized identity + IP scope, TTL theo env; không lưu raw credential/identity. Redis unavailable làm login trả dependency error/503 và readiness fail, không fallback memory.
- API liveness chỉ chứng minh process event loop; readiness cần config hợp lệ, migration current, PostgreSQL và Redis. Worker readiness cần PostgreSQL, Redis và consumer registration; shutdown ngừng nhận job, drain trong timeout rồi requeue an toàn.

## 7. API, dữ liệu và bảo mật

- API: không thêm operation hoặc sửa OpenAPI domain schedule. Các mutation hiện có dùng `Idempotency-Key` theo contract đang công bố; operational error giữ error envelope hiện tại. Nếu OpenAPI hiện thiếu mô tả lỗi/idempotency cho một operation được refactor, cập nhật ở implementation plan riêng, không trong docs-only milestone này.
- `DB-101 — ProjectSchedule`: reserved cho `US-003`; không có table/migration trong operational foundation.
- `DB-102 — TransactionalOutboxEvent`: event committed cùng aggregate; tenantId, aggregate type/id/version, event type/schema version, payload, occurred/available/published timestamps, attempts, correlation và status.
- `DB-103 — EventConsumption`: consumer ledger với unique `(tenantId, consumerName, eventId)`; lease/status/attempt/error hash/processedAt; không lưu secret/raw sensitive payload.
- `DB-104 — CommandReceipt`: unique `(tenantId, actorId, operation, idempotencyKey)`; request hash, result status/reference, correlation và expiry.
- `DB-105 — Notification`, `DB-106 — SavedView`, `DB-107 — ReportJob`: reserved cho `US-022/023`, không tạo table.
- `DB-108 — AIUseCasePolicy`, `DB-109 — AIRun`, `DB-110 — AIProposal`, `DB-111 — AIReview`: reserved cho `US-031…037`, không tạo table.
- Mọi table tenant-scoped có candidate key `(tenant_id, id)`; FK vật lý dùng `(tenant_id, referenced_id) → (tenant_id, id)`. Cross-store chỉ dùng logical ref + reconciliation.
- Composite FK được thêm theo expand/validate/contract: tạo unique candidate key, tạo FK `NOT VALID` khi PostgreSQL cho phép, kiểm orphan/cross-tenant, `VALIDATE CONSTRAINT`; rollback chỉ gỡ constraint/index mới, không xóa business data.
- Security regression dùng `TEST-200`, `TEST-202…208`; rate-limit dùng `TEST-231`; secret/cipher contract giữ nguyên. Không có OT write path.

## 8. Ma trận truy vết thực thi

| Requirement/ADR | Milestone | File/component | Acceptance/Test | Trạng thái |
|---|---|---|---|---|
| ADR-004/006; NFR-007; DB-102/103 | M2 | API outbox, worker publisher/consumer, Redis/BullMQ | TEST-180 | Planned |
| NFR-012; SEC-122; DB-104 | M2 | command idempotency interceptor/service | TEST-180, TEST-185 | Planned |
| SEC-103/118 | M2 | Redis login rate limiter/runtime readiness | TEST-200, TEST-231 | Planned |
| ADR-002/004; SEC-105…111 | M2 | composite tenant FK migration | TEST-202…208 | Planned |
| NFR-021/023; ADR-001 | M3 | API/worker health, Compose/runtime contract | operational smoke, TEST-194/196 | Planned |
| DB-101/105…111 | M1 | Data/Trace reservation only | ID/link audit | Documented |

## 9. Milestone và bước thực hiện

### M1 — Documentation gate và ID registry

- [x] Chốt EC2 test profile, runtime/idempotency/tenant decisions và production boundary.
- [x] Cấp chính xác `DB-101…111` trong Data Model; reserve IDs ngoài operational slice.
- [x] Cập nhật Architecture và Data Model; Test/DevOps/Trace/Decisions/INDEX/CHANGELOG được bàn giao cho program owner cập nhật downstream theo scope điều phối.
- [x] Chạy link/ID/Markdown/YAML validation và ghi kết quả.

**Exit criteria:** tài liệu decision-complete, không còn persistence TBD cho các ID đã reserve; baseline/OpenAPI schedule/source code không đổi.

### M2 — Persistence, queue và security hardening

- [ ] Thêm dependencies/config/entity/migration cho `DB-102…104`, Redis/BullMQ và composite FK.
- [ ] Chuyển mutation được chọn sang transaction business + audit + outbox; áp generic command receipt.
- [ ] Thay in-memory login rate limit bằng Redis atomic counter/fail-closed.
- [ ] Tạo worker publisher/consumer, retry/backoff/DLQ và consumer ledger.
- [ ] Chạy migration up/down/up, `TEST-180`, `TEST-200`, `TEST-202…208`, `TEST-231` và regression hiện có.

**Exit criteria:** zero lost committed event, zero duplicate side effect, zero cross-tenant FK, idempotent replay ổn định và rate limit không bypass khi scale/failure.

### M3 — Runtime/deploy contract và handoff

- [ ] Thêm Redis/worker healthcheck/dependency order vào Compose; API/worker liveness/readiness và graceful shutdown.
- [ ] Chạy lint/type/unit/integration/build, worker crash/restart, Redis reconnect và public smoke với timeout/poll.
- [ ] Deploy EC2 test, quan sát queue lag/DLQ/outbox pending và cập nhật exact evidence.
- [ ] Cập nhật ExecPlan/test/devops/trace/changelog; CI vẫn Planned nếu chưa có hosted workflow.

**Exit criteria:** PostgreSQL/API/Redis/worker/web runtime contract healthy trên EC2 test và mọi failure/rollback evidence được ghi chính xác.

## 10. Kế hoạch kiểm thử và chất lượng

| Loại | Command/quy trình | Requirement/Test IDs | Expected result |
|---|---|---|---|
| Lint | `timeout 120s npm run lint` | NFR-023 | Exit 0, zero warning |
| Type-check/build | `timeout 120s npm run typecheck`; `timeout 180s npm run build` | NFR-023 | Exit 0 cho API/worker/web |
| Unit | `timeout 180s npm run test:unit` | TEST-180/200/202…208/231 portions | Pass; no hidden skip |
| Integration | `timeout 240s npm run test:integration` với PostgreSQL + Redis disposable | TEST-180, TEST-200, TEST-202…208, TEST-231 | Pass |
| Migration | `migration:run → revert → run`; orphan/cross-tenant probes | DB-102…104; SEC-105/111 | Up/down/up; DB rejects mismatch |
| Failure injection | crash DB/publisher/worker, duplicate job, Redis reconnect, DLQ | TEST-180 | Zero lost committed event; zero duplicate side effect |
| Runtime smoke | Compose health/readiness, graceful restart, queue/outbox gauges | NFR-006/021/023 | Dependency status truthful |

Mọi command dài dùng timeout tối đa 60 giây mỗi lần poll; không chờ treo không giới hạn.

## 11. Migration, rollout và rollback

- Migration mới chỉ expand: candidate unique `(tenant_id,id)`, composite FK và `DB-102…104`; không sửa migration đã phát hành.
- Trước validate, query mọi orphan và cross-tenant reference; có mismatch thì dừng và ghi bằng chứng, không tự gán tenant.
- Rollout: PostgreSQL migration → Redis healthy → worker mới → API mới → web unchanged → smoke/failure regression.
- Worker/API mixed-version window chỉ nhận event schema version được hỗ trợ; publisher chưa xóa event cho tới khi enqueue thành công.
- Rollback: ngừng publisher/worker, rollback API/image; gỡ constraint/table mới chỉ khi không mất committed outbox/receipt/consumption data. Nếu đã có event, ưu tiên forward-fix và replay.
- Trigger rollback: tenant isolation, auth/session, idempotency, queue loss/duplicate side effect, readiness hoặc migration validation fail.

## 12. Rủi ro và biện pháp

| Rủi ro | Xác suất/tác động | Tín hiệu | Giảm thiểu | Owner |
|---|---|---|---|---|
| Event DB commit nhưng không enqueue | Trung bình/Rất cao | outbox pending tăng | same-transaction DB-102, polling/retry, TEST-180 | Platform |
| Duplicate side effect | Trung bình/Rất cao | cùng event xử lý nhiều lần | Bull jobId + DB-103 unique + atomic side effect | Platform |
| Cross-tenant relation tồn tại trước constraint | Thấp/Rất cao | validation query có row | dừng migration, không auto-repair, TEST-202…208 | Data/Security |
| Redis lỗi làm bypass auth quota | Trung bình/Cao | API fallback memory | fail-closed + readiness fail, TEST-231 | Security |
| Redis/worker tăng áp lực EC2 | Trung bình/Trung bình | memory/lag/restart | resource limit/metrics, bounded concurrency, no Elasticsearch yet | SRE |
| CI bị ghi nhận giả là implemented | Trung bình/Trung bình | docs có pass nhưng không workflow | trạng thái Planned, chỉ ghi command evidence thật | Platform/QA |

## 13. Decision Log

| Ngày | Quyết định | Lý do | ADR/Requirement liên quan | Người phê duyệt |
|---|---|---|---|---|
| 2026-07-11 | PostgreSQL 17 + Redis + BullMQ + worker/outbox là EC2 test profile | Tech stack đã chốt; cần atomic async foundation trước domain tiếp theo | ADR-004/006, NFR-007 | Product Owner delegated |
| 2026-07-11 | Production profile/ADR vẫn Proposed | Chưa có HA/SLO/cost/security evidence | ADR-001/002/004/006 | Product Owner delegated |
| 2026-07-11 | Composite tenant FK là database invariant bắt buộc | Query predicate đơn lẻ không đủ chống reference xuyên tenant | SEC-105/111 | Product Owner delegated |
| 2026-07-11 | DB-104 là generic command receipt; per-table key không phải contract cuối | Cần replay/conflict nhất quán xuyên module | NFR-012, SEC-122 | Product Owner delegated |
| 2026-07-11 | Redis rate limit fail closed | Không cho dependency failure biến thành security bypass | SEC-103/118 | Product Owner delegated |
| 2026-07-11 | `DB-101`, `DB-105…111` chỉ reserve | Giữ ID ổn định cho các slice sau, không mở scope implementation | US-003/022/023/031…037 | Product Owner delegated |
| 2026-07-11 | Hosted CI giữ Planned | Repository chưa có workflow/registry/signing evidence | SEC-124, NFR-023 | Product Owner delegated |

## 14. Progress Log

| Ngày | Hoàn thành | Bằng chứng/command | Blocker/next step |
|---|---|---|---|
| 2026-07-11 | Audit repository, manifests, Compose, docs và program ExecPlan | Đọc `AGENTS.md`, `.agent/PLANS.md`, `tech-stack.md`, target docs/source tree | Hoàn tất M1 validation |
| 2026-07-11 | Operational decisions và DB ID ownership được chốt cho test profile | Product Owner delegated approval; plan này | M2 implementation |
| 2026-07-11 | M1 Architecture/Data owner artefacts và validation hoàn tất | DB-001…111 anchor audit: mỗi ID đúng một definition; relative links 3/3 file OK; code fences cân bằng; `npm run openapi:lint` valid | Downstream Test/DevOps/Trace/Decisions/INDEX/CHANGELOG do program owner cập nhật; M2 chưa bắt đầu |

## 15. Kết quả và bàn giao

- Outcome hiện tại: M1 owner artefacts Architecture/Data đã được cập nhật; M2/M3 chưa được đánh dấu Implemented.
- File M1 trong tác vụ này: plan này, `docs/06-solution-architecture.md` và `docs/07-data-model.md`. Downstream Test/DevOps/Trace/Decisions/INDEX/CHANGELOG đang pending theo phân công của program owner.
- Validation M1: DB-001…111 mỗi ID đúng một definition; relative links trong 3 file OK; Markdown code fences cân bằng; OpenAPI YAML hiện hữu vẫn valid. Code test không áp dụng vì plan này không sửa source.
- Assumption/TBD còn lại: production Redis HA/persistence/capacity; production SLO/RPO/RTO; hosted CI/IaC/registry/SBOM/signing. Không có Open Question chặn EC2 test implementation.
- Follow-up: implementation agent thực hiện M2/M3, cập nhật progress/test/deploy evidence, không triển khai các DB ID reserved.
