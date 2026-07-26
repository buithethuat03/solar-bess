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

## 2026-07-26 — Stack tự hồi phục sau reboot: chuyển RUNTIME_SECRETS_DIR khỏi tmpfs

- **Loại:** DevOps; Security; Documentation
- **Người yêu cầu/phê duyệt:** Người dùng yêu cầu stack tự khởi động toàn bộ khi mở máy ảo, phê duyệt phương án 2026-07-26.
- **Mã bị ảnh hưởng:** Không cấp ID mới; liên quan vận hành `docs/14` §12.1 và runbook `docs/17`.
- **Trước thay đổi:** `RUNTIME_SECRETS_DIR=/tmp/solar-bess-secrets` nằm trên tmpfs; sau reboot 6 file Docker secret biến mất, dockerd fail mount khi restore (`failed to fulfil mount request … no such file or directory`, không retry vì start-fail không kích restart policy) nên postgres/redis/minio/worker nằm chết, api/web crash-loop; phải chạy tay `npm run secrets:materialize` + `docker compose up` (bằng chứng: journal boot 13:25 UTC 2026-07-26).
- **Sau thay đổi:** `RUNTIME_SECRETS_DIR=/var/lib/solar-bess/secrets` (ec2-user, `0700`, bền vững qua reboot); default fallback đổi đồng bộ ở `docker-compose.yml`, `scripts/deploy-ec2.sh`, `cipher.cli.ts`, `.env.example`. Stack tự hồi phục sau reboot chỉ nhờ `restart: unless-stopped` + healthcheck, không thêm systemd unit nào. Hardening kèm theo cho `deploy-ec2.sh`: preflight secrets chuyển vào sau `flock` (deploy trúng lúc secrets đang ghi lại sẽ đợi thay vì nổ đỏ oan) và check `-f && -s` (bắt trường hợp bind source bị tạo nhầm thành thư mục). `WORKER_TEST_SECRETS_DIR` giữ nguyên `/tmp` có chủ ý — stack test disposable không được sống qua reboot.
- **Lý do:** Đóng open question "stack không tự hồi phục sau EC2 reboot" (docs/14 §18). Phương án systemd oneshot chạy `compose up` lúc boot bị loại: CI deploy từ checkout của runner nên `compose up` từ cây dev là đường deploy không kiểm soát, kèm race với runner service.
- **Artefact bị ảnh hưởng:** `docker-compose.yml`, `scripts/deploy-ec2.sh`, `apps/api/src/modules/cipher/cipher.cli.ts`, `.env.example`, `docs/14-devops-and-deployment.md` (§9.1, §12.1, §18, §19), `docs/17-self-hosted-cicd-runbook.md` (§3, §5), host `.env` + thư mục `/var/lib/solar-bess/secrets`.
- **Migration/tương thích:** Một lần trên host: `sudo install -d -o ec2-user -g ec2-user -m 0700 /var/lib/solar-bess /var/lib/solar-bess/secrets`, sửa `.env`, `npm run secrets:materialize`, recreate 4 service mount secrets bằng `docker compose up -d --no-build --wait` dưới deploy lock. Resolved compose config không đổi với host đã đặt biến trong `.env`, nên deploy CI kế tiếp không recreate thừa.
- **Trạng thái:** Implemented

## 2026-07-26 — Contract & Cost US-006/US-007 (API-053…API-066, DB-028…DB-031 + DB-034…DB-040)

- **Loại:** Architecture; Data; API; Security; Frontend; Test; Documentation; không thay đổi phạm vi nghiệp vụ baseline.
- **Người yêu cầu/phê duyệt:** Người dùng/Product Owner yêu cầu hoàn thành toàn bộ yêu cầu trong story và trao toàn quyền quyết định ngày 2026-07-26.
- **Mã bị ảnh hưởng:** `BR-007`, `BR-009…BR-011`, `BR-015`, `BR-022`, `BR-026`, `BR-030`, `BR-033`, `FR-036…FR-044`, `FR-053…FR-060`, `UC-006`, `UC-007`, `US-006`, `US-007`, `WF-008/009`, `WF-014`, `AC-023…AC-032`, `TEST-023…TEST-032`, `API-053…API-066`, `DB-028…DB-031`, `DB-034…DB-040`, `DB-098`, `DB-102`, `DB-104`, `SEC-108`, `SEC-109`, `SEC-114`, `SEC-118`, `SEC-119`, `SEC-126`, `SEC-130`; **không cấp requirement/API/DB ID mới** — kể cả không bịa DB ID cho line-item của budget (header-only, xem quyết định e).
- **Trước thay đổi:** `API-053…066` chỉ tồn tại dưới dạng contract thiết kế, không controller nào; không bảng nào của `DB-028…040` tồn tại; thuật toán canonical hash nằm private trong `risk-change.service.ts`; chuỗi migration kết thúc ở `1783741000000` với `policy_version = 6` và seed dùng `rolePolicyVersion = 6`; marker implemented 74/164.
- **Sau thay đổi:** Module `contract-cost` của Nest cung cấp đủ 14 operation `API-053…066`: register/list hợp đồng, detail nhúng parties/phụ lục/giá trị hợp nhất, DRAFT-only edit, thêm party có snapshot băm, thêm phụ lục, list/tạo obligation, fulfill obligation, cost summary, budget version, commitment, payment một-transaction (invoice + components) và đọc payment. Mười một bảng mới (`DB-028` contracts, `DB-029` contract_parties, `DB-030` contract_appendices, `DB-031` obligations, `DB-034` cost_codes, `DB-035` budget_versions, `DB-036` commitments, `DB-037` invoices, `DB-038` payments, `DB-039` payment_components, `DB-040` fx_snapshots) qua migration `1783742000000-CreateContractCost.ts` + `1783743000000-GrantContractCostPermissions.ts` (`policyVersion = 7`, state-table đảo ngược được; seed nâng `rolePolicyVersion` 6→7 cùng lúc và thêm demo cost code idempotent vì catalog không có operation CRUD cost code nào). **Tính chất trung tâm là sự thật của cơ sở dữ liệu, không chỉ logic service:** mọi FK composite mang `tenant_id`; các FK mang currency `(tenant_id, id, currency)` (phụ lục/commitment/invoice → contracts, component → payments) làm `CURRENCY_MISMATCH` bất khả thi về cấu trúc; constraint trigger `DEFERRABLE INITIALLY DEFERRED` khẳng định SUM(components) = `requested_amount` bằng Postgres numeric và service ép chạy trong transaction bằng `SET CONSTRAINTS ALL IMMEDIATE` nên breakdown sai là 422 `COMPONENT_SUM_MISMATCH` có tên và cả slice payment+components+invoice rollback cùng nhau; CHECK SoD ở tầng hàng (obligation decider ≠ owner ≠ creator; payment approver ≠ requester/submitter; budget approver ≠ submitter) cài trước cho các operation approve sau này; một budget APPROVED mỗi dự án (partial unique index), commitment chống trùng theo `(tenant, source_type, source_id, source_version)`, invoice chống trùng theo `(tenant, contract, supplier_legal_entity, invoice_no)`, external posting ref partial unique; trigger bất biến cho contract history (họ signed + legal hold + cấm thoái lui), party snapshot (UPDATE không bao giờ, DELETE chỉ khi cha DRAFT), phụ lục EFFECTIVE/SUPERSEDED, quyết định obligation, budget APPROVED, commitments append-only, payments không bao giờ xóa được, components và fx_snapshots bất biến. `canonicalHash` tách từ risk-change ra `risk-change/domain/canonical-hash.ts` (byte-identical) và tái sử dụng cho party snapshot hash — không có serializer thứ hai. Server không làm phép tính tiền nào trong JS: `numeric(19,4)` là string qua TypeORM, giá trị hợp nhất và tổng thành phần tính trong SQL, DUE/OVERDUE suy diễn trong projection SQL từ `due_date`, không bao giờ lưu. Slice Vue: route `/projects/:projectId/contracts` với register, detail (parties/phụ lục/giá trị hợp nhất), obligations với chip DUE/OVERDUE, cost summary và form budget/commitment/payment. OpenAPI: đặc tả cụ thể cả 14 operation, 44 schema mới, tiền là string pattern; marker implemented 74 → 88.
- **Lý do:** `US-006`/`US-007` là năng lực hợp đồng–chi phí mà `US-004` (Claim `DB-068`), `US-008` và chuỗi thanh toán/COD phụ thuộc. Slice đóng phần có thể đóng bằng bằng chứng và dừng đúng chỗ catalog 164 operation không cấp lệnh.
- **Quyết định đã chốt theo quyền được ủy quyền:** (a) hợp đồng ship **DRAFT-only** nhưng CHECK mang đủ từ vựng 8 trạng thái — không operation nào ký/kích hoạt hợp đồng, ship sẵn từ vựng tránh một migration sau; (b) tiền đề "hợp đồng cha effective" của API-058/API-065 bất khả thi nên V1 nới thành "cha tồn tại và không CLOSED/EXPIRED" — deviation tường minh khỏi WF-008/WF-009, có ghi nhận; (c) không có operation approve budget/payment nên `AC-028`/`AC-031` không đóng được; CHECK SoD vẫn cài trước; (d) `DB-032` guarantees / `DB-033` permits **không tạo** — không operation nào ghi chúng, schema chết bị từ chối; (e) budget là header-only — line-item không có DB ID được cấp và không ID nào bị bịa; (f) cost code là master data seeded vì không có operation CRUD; (g) party snapshot chỉ giữ đúng những gì master `legal_entities` thật có (legal_name, country, registration_no, tax_id) + representative/authority client khai, **không có address** vì master không có; (h) `commitments.purchase_order_id` cố ý vắng cho tới khi Procurement materialize `DB-049`; (i) invoice không có CHECK `net = gross − vat` — quy tắc thuế TBD, lưu chưa kiểm chứng là an toàn còn enforce quy tắc sai thì không; (j) `payments.invoice_id` thêm dạng nullable composite FK dù dictionary `DB-038` không liệt kê — cần cho truy vết `AC-029`, amendment dictionary được ghi nhận là follow-up.
- **Phạm vi acceptance:** 0 AC đóng trọn, 7 Partial, 3 Not covered — các điểm dừng có chủ ý tại chỗ catalog không cấp operation. `AC-023` Partial (số hợp đồng duy nhất + ID pháp nhân ổn định + snapshot băm tại thời điểm thêm party; "tại thời điểm ký" bất khả thi — không gì ký được). `AC-024` Partial (chuỗi phụ lục và read model giá trị hợp nhất chạy; không phụ lục nào đạt EFFECTIVE). `AC-025` Partial (obligation đủ owner/beneficiary/due/evidence/consequence + CHECK bắt evidence; guarantee vắng — `DB-032` không có operation; cảnh báo vắng — allowlist notification đóng). `AC-026` Partial (từ chối sửa enforce bằng trigger, chứng minh được ở tầng DB; end-to-end cần hợp đồng ký được). `AC-027` **Not covered** (không engine đánh giá condition/COD gate). `AC-028` Partial (commitment chống trùng + drill-down; baseline approved và forecast/EAC vắng). `AC-029` Partial (đủ trường bắt buộc + trigger tổng; không có bước submit; kiểm lũy kế so văn bản hiệu lực chưa có ý nghĩa khi không gì effective). `AC-030` Partial (số gốc theo currency, FX snapshot bất biến, không cộng chéo currency ở đâu cả kể cả UI; hiển thị quy đổi cố ý vắng — chưa có quy tắc làm tròn, `NFR-013` TBD). `AC-031` **Not covered** (không bước phê duyệt nào tồn tại; `ck_payment_sod` cài trước). `AC-032` **Not covered** (không EAC/contingency/alerting). `US-006` và `US-007` do đó chưa `Done`.
- **Artefact bị ảnh hưởng:** `apps/api/src/modules/contract-cost/**`, `apps/api/src/modules/risk-change/domain/canonical-hash.ts` (mới, `risk-change.service.ts` import lại), bốn file entity contract/cost, migration `1783742000000` và `1783743000000`, `data-source.ts`, `app.module.ts`, `entities/index.ts`, `project-master.seed.ts`; slice Vue `apps/web/src/views/contracts/`, `apps/web/src/components/contracts/`, `contract.api.ts`, `contract.types.ts`, route `/projects/:projectId/contracts`; test `contract-cost.integration-spec.ts`, `contract-cost-migration.integration-spec.ts`, `cursor.unit-spec.ts`, `risk-change-migration.integration-spec.ts` (mở rộng exact-match grant), `swagger.unit-spec.ts` (marker 74→88), `auth.integration-spec.ts`, `project-structure.spec.ts`; `docs/openapi/openapi.yaml`, `docs/12`, `docs/15`, ExecPlan `2026-07-26-contract-cost-us006-us007.md`. Phát hiện spec-defect ghi làm follow-up đính chính tài liệu (không sửa trong slice này): off-by-one `FR-039/040/041` giữa `docs/03` và `docs/08` API-059/060 + hàng `DB-032/033` của `docs/07`; chuỗi `x-idempotency` trong `docs/openapi/openapi.yaml` ghi `DB-101` trong khi command receipt là `DB-104`; phần lớn chuỗi không có read endpoint (không list budget/commitment/invoice/payment).
- **Migration/tương thích:** Hai migration mới, cả hai có `down()` đối xứng và đã test up/down/up (13 test migration). `1783743000000` dùng state-table `role_grant_reconcile_1783743000000` nên `down()` chỉ lấy lại đúng 13 permission code nó thêm; chuỗi grant nay kết thúc ở `policy_version = 7` và seed nâng `rolePolicyVersion` lên 7 cùng lúc. Hai assertion role exact-match trong `risk-change-migration.integration-spec.ts` mở rộng thêm `contract.read`/`cost.read` cho `EXECUTIVE`/`TENANT_ADMIN` theo chỉ dẫn trong comment của chính test đó. Không backfill: trước slice này không có hợp đồng/chi phí nào trong hệ thống, rollback không mất dữ liệu nghiệp vụ.
- **Validation:** `npm run lint` Pass (0 warning); `npm run typecheck` Pass trên api/web/worker. Unit API 100 Pass / 19 suite, Web 178 Pass / 36 file (48 test mới), Worker 61 Pass / 12 suite. Integration **API 163 Pass / 17 suite** (+28 ròng: contract-cost 16 HTTP + 13 migration, một test helper dùng chung được hợp nhất), Worker 11 Pass / 3 suite. Mọi nhánh 4xx đều assert không ghi hàng nào; request xuyên tenant và request package-only đều assert trả `404`; negative SoD, invoice trùng, breakdown lệch tổng, cursor hỏng và `Idempotency-Key` đều được phủ. `npm run openapi:lint` Pass với 88/164 marker implemented. Build Pass (chunk `ProjectContractsView` 65.6 kB).
- **Trạng thái:** Implemented local; deploy EC2 test và bằng chứng CI/CD ghi nhận theo release kế tiếp.

## 2026-07-26 — Document control US-005/US-019 (API-039…API-052, DB-022…DB-027 + DB-114)

- **Loại:** Architecture; Data; API; Security; Frontend; DevOps; Test; Documentation; không thay đổi phạm vi nghiệp vụ baseline.
- **Người yêu cầu/phê duyệt:** Người dùng/Product Owner yêu cầu hoàn thành toàn bộ yêu cầu trong story và trao toàn quyền quyết định ngày 2026-07-26.
- **Mã bị ảnh hưởng:** `BR-003`, `BR-009`, `BR-011`, `BR-012`, `BR-019`, `BR-026`, `BR-035`, `BR-040`, `FR-026…FR-035`, `FR-145`, `FR-151…FR-155`, `FR-164`, `UC-005`, `UC-019`, `US-005`, `US-019`, `WF-004…WF-007`, `AC-018…AC-022`, `AC-088…AC-092`, `TEST-018…TEST-022`, `TEST-088…TEST-092`, `API-039…API-052`, `DB-022…DB-027`, `DB-098`, `DB-102`, `DB-104`, `SEC-109`, `SEC-112`, `SEC-113`, `SEC-118…SEC-123`, `SEC-126`, `ADR-005`; **cấp mới đúng một ID dữ liệu: `DB-114` — DocumentExternalShare**, không cấp requirement/API ID mới.
- **Trước thay đổi:** `API-039…052` chỉ tồn tại dưới dạng contract thiết kế, không có controller nào; không bảng nào của `DB-022…027` tồn tại; `ADR-005` ở trạng thái Proposed và chưa chốt provider cho object storage lẫn malware scanner; không có nơi nào lưu policy chia sẻ ngoài; Express giới hạn body ở mặc định 100 kB và `apps/web/nginx.conf` không khai báo `client_max_body_size`.
- **Sau thay đổi:** Module `document-control` của Nest cung cấp đủ 14 operation `API-039…052`: register/list, upload session vào quarantine, finalize hash+scan, đọc revision, review cycle, review comment, approve, issue, transmittal và response, external share, signature envelope. Bảy bảng mới (`DB-022…027` + `DB-114`) có khóa ngoại composite mang `tenant_id` nên tham chiếu xuyên tenant là bất khả thi ở tầng DB; `fk_document_current_revision` được thêm bằng `ALTER` sau khi `document_revisions` tồn tại vì hai bảng trỏ vào nhau. Ba trigger: review comment append-only, nội dung revision đã ISSUED bất biến (vẫn cho ISSUED → SUPERSEDED), và envelope đã COMPLETED bất biến. **Tính chất an toàn trung tâm là một sự thật của cơ sở dữ liệu, không chỉ là logic service:** `CHECK ck_document_revision_release_requires_clean` khiến `status` không thể thuộc `APPROVED/ISSUED/SUPERSEDED` nếu thiếu `scan_status = 'CLEAN'`, `content_hash` và `released_object_key`. `ADR-005` chuyển sang Accepted cho EC2 test profile với MinIO (`minio/minio:RELEASE.2025-09-07T16-13-09Z`) và ClamAV (`clamav/clamav:stable`); hai port `object-storage.port.ts`/`malware-scanner.port.ts` giữ domain không phụ thuộc vendor, adapter là `MinioObjectStorage` (AWS S3 SDK, `forcePathStyle`, SHA-256 tính phía server kèm `ChecksumSHA256` khi PUT) và `ClamAvMalwareScanner` (giao thức clamd `INSTREAM`).
- **Lý do:** `US-005` là năng lực tài liệu nền mà `BR-011`/`BR-035` phụ thuộc, và là điều kiện để `US-006`, `US-013`, `US-019`, `US-021` có nơi lưu văn bản có kiểm soát revision. Slice này đóng phần có thể đóng bằng bằng chứng và dừng đúng chỗ hợp đồng chưa cấp operation.
- **Quyết định đã chốt theo quyền được ủy quyền:** (a) **body upload mang thẳng byte** (`content` base64, tối đa 8.000.000 ký tự) và port object storage cố ý không lộ pre-signed URL — server phải là bên ghi, nếu không client có thể đặt byte chưa quét vào đúng chỗ mà finalize sau đó đọc lên như byte đã được thẩm định; `revisionCode` chuyển lên bước initiate vì `document_revisions.revision_code` là NOT NULL ngay khi tạo hàng; điểm này lệch khỏi schema thiết kế chung `UploadInitiateRequest`, và contract đã được sửa trong cùng slice — `DocumentUploadSessionRequest`/`DocumentUploadFinalizeRequest` thay thế, còn `UploadInitiateRequest` và `UploadFinalizeRequest` bị gỡ vì không operation nào tham chiếu nữa (`UploadFinalizeRequest` mô tả một luồng `uploadToken` chưa bao giờ tồn tại). (b) Review comment chỉ nhận khi revision đang `IN_REVIEW`, giữ cho `cycle_no >= 1` có nghĩa; bình luận sau khi phát hành chưa có đường nào. (c) **Không đặt quy tắc SoD giữa người tải và người phê duyệt** vì không AC nào phát biểu quy tắc đó; tách quyền duy nhất là ở guard — chỉ PMO/PROJECT_MANAGER có `documentRevision.approve`/`documentRevision.issue`. (d) `UQ tenant+provider+externalId` mà `DB-027` mô tả cố ý vắng mặt trong entity decorator và do đó vắng mặt trong DDL, để entity và schema giống nhau từng byte. (e) Giới hạn transport được nâng và khai báo tường minh để một upload hợp lệ không bao giờ bị từ chối bằng 413 trần trụi: thêm `APP_JSON_BODY_LIMIT_BYTES` (mặc định 9.000.000, sàn 100.000, trần 33.554.432) nối qua `bootstrap.ts` bằng `useBodyParser`, và `apps/web/nginx.conf` đặt mặc định 1 MB cùng ngoại lệ 10 MB cho đúng một route upload khớp regex — trần của nginx nằm **trên** trần của API để API luôn là tầng từ chối, nên request hành xử giống hệt nhau dù đi qua proxy hay không.
- **Phạm vi acceptance:** `AC-018` (upload → quét → revision đầu), `AC-019` (nội dung đã approved/issued bất biến, bắt buộc revision mới, supersede chuyển `current_revision_id` trong một transaction), `AC-020` (transmittal snapshot đúng revision, ghi recipient/action/due date và response) và `AC-022` (liên kết hiện có và current revision phân giải theo quyền) có bằng chứng test. `AC-089` **Partial** — policy share có bằng chứng (khóa vào đúng một revision đã ISSUED, `watermarkRequired = true`, `downloadAllowed = false`, token trả đúng một lần và chỉ SHA-256 được lưu, token không xuất hiện trong payload audit) nhưng **không operation nào phục vụ byte** nên phần preview/download chưa chạy được. `AC-091` **Partial** — phần chặn sửa nội dung đã ISSUED có trigger và test, phần "signature giữ nguyên" chưa kiểm chứng được vì chưa envelope nào COMPLETED. **`AC-021`/`TEST-021` Not covered** — full-text/OCR search: không có search index, không có OCR, và không có operation nào cho việc này trong catalog 164 operation. **`AC-088`/`TEST-088` Not covered** — approval theo classification và xác minh recipient/MFA; `SEC-102` vẫn không khả thi trong base auth profile. **`AC-090`/`TEST-090` Not covered** — không có redemption để chặn và không có operation revoke. **`AC-092`/`TEST-092` Not covered** — `API-052` tạo envelope DRAFT cục bộ với `artifact_hash` = content hash và không liên hệ provider nào vì chưa provider nào được contract. Đây là những điểm dừng có chủ ý, không phải thiếu sót; `US-005` và `US-019` do đó chưa `Done`.
- **Artefact bị ảnh hưởng:** `apps/api/src/modules/document-control/**`, bốn entity document, migration `1783740000000` và `1783741000000`, `data-source.ts`, `app.module.ts`, `entities/index.ts`, `project-master.seed.ts`, `bootstrap.ts`, `config/environment.ts`, `cipher.cli.ts`, `apps/api/package.json` (thêm `@aws-sdk/client-s3`); slice Vue `apps/web/src/views/documents/`, `apps/web/src/components/documents/`, `document.api.ts`, `document.types.ts`, `constants/documents.ts`, `styles/documents.css` cùng route `project-documents`; `apps/web/nginx.conf`, `docker-compose.yml`, `docker-compose.test.yml`, `.env.example`, `.github/workflows/main-cicd.yml` (thêm cổng gác cấu hình reverse proxy bằng `nginx -t`), `scripts/deploy-ec2.sh`; test `document-control.integration-spec.ts`, `document-control-migration.integration-spec.ts`, `adapter-live.integration-spec.ts`, hai unit spec adapter; `docs/06` (ADR-005), `docs/07` (DB-114), `docs/12`, `docs/14` (§9.5 hồ sơ rollout hạ tầng mới và §12.1 sáu secret file), `docs/15`, `docs/openapi/openapi.yaml` (thêm response component `Error503`), ExecPlan `2026-07-26-document-control-us005-us019.md`.
- **Migration/tương thích:** Hai migration mới, cả hai có `down()` đối xứng và đã test up/down/up. `1783741000000` dùng mẫu state-table `role_grant_reconcile_1783741000000` nên `down()` chỉ lấy lại đúng những permission code nó thêm và không đụng grant có sẵn; chuỗi grant nay kết thúc ở `policy_version` 6 và hằng `rolePolicyVersion` trong seed được nâng lên 6 cùng lúc. Hai assertion role exact-match trong `risk-change-migration.integration-spec.ts` được mở rộng thêm `document.read`/`documentRevision.read` cho `EXECUTIVE` và `TENANT_ADMIN` vì migration grant mới bổ sung vào đúng hai role đó — chính comment trong test yêu cầu làm như vậy. `apps/api/test/setup/integration-env.ts` được cấp `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` đã mã hóa vì `MinioObjectStorage` đọc chúng trong constructor và **mọi** suite integration sẽ không boot được `AppModule` nếu thiếu; không giá trị nào trong đó chạm MinIO thật. Không backfill: trước slice này không có tài liệu nào trong hệ thống. Rủi ro tương thích duy nhất ngoài API là `client_max_body_size 1m` mặc định ở nginx — không DTO nào hiện chấp nhận body lớn hơn thế ngoài route upload đã được nới riêng.
- **Validation:** `npm run lint` Pass (0 warning); `npm run typecheck` Pass trên api/web/worker. Suite document control 31 Pass = 19 integration HTTP + 12 migration. Toàn bộ integration API 124 Pass trên 14 suite, không hồi quy. Unit API 93 Pass trên 18 suite. Mọi nhánh 4xx đều assert không ghi hàng nào; request xuyên tenant và request phạm vi package đều assert trả `404`, `403` chỉ xuất hiện khi thiếu quyền thật. Bộ `adapter-live.integration-spec.ts` được thêm sau lần chạy đó: 7 test nói giao thức thật với container `minio-test`/`clamav-test`, gồm chuỗi EICAR dựng lúc chạy để kiểm chứng nhánh INFECTED và cổng cứng nhất của ADR-005 — clamd không liên hệ được thì verdict là `UNAVAILABLE` chứ không phải `CLEAN`. Đây là bộ duy nhất chứng minh **adapter**; 31 test kia chứng minh **service logic** trên fake in-memory. Chạy lại toàn bộ sau khi thêm: **integration API 135 Pass / 15 suite**, worker 11 Pass / 3 suite; unit API 94 Pass / 18 suite (thêm test canh `APP_JSON_BODY_LIMIT_BYTES` luôn cao hơn trần upload của DTO), web 128 Pass. `npm run openapi:lint` Pass với 74/164 marker implemented. CI khởi động `minio-test` và `clamav-test` ở cổng cô lập `19002`/`13311` nên bộ adapter chạy trên mọi push. Bổ sung cuối slice: `API-039` nhúng `currentRevision` và `latestRevision` vào từng hàng register bằng một `LEFT JOIN LATERAL` duy nhất (join có `tenant_id`), xóa fan-out N+1 của UI và — quan trọng hơn — làm một upload `INFECTED` chưa từng phát hành hiện ra ngay trên register, vì `current_revision_id` chỉ được ghi lúc ISSUED nên register dựa vào nó một mình sẽ không cho người vận hành thấy gì bất thường; 4 test integration mới khẳng định embed, tenant isolation của join và trường hợp document chưa có revision.
- **Trạng thái:** Implemented local; deploy EC2 test và bằng chứng CI/CD ghi nhận theo release kế tiếp.

## 2026-07-26 — Approval workflow engine US-015 (API-106…112, DB-069…072)

- **Loại:** Architecture; Data; API; Security; Frontend; Test; Documentation; không thay đổi phạm vi nghiệp vụ baseline.
- **Người yêu cầu/phê duyệt:** Người dùng/Product Owner yêu cầu hoàn thành toàn bộ yêu cầu trong story và trao toàn quyền quyết định ngày 2026-07-26.
- **Mã bị ảnh hưởng:** `BR-008`, `BR-011`, `BR-015`, `BR-026`, `BR-034`, `FR-138…FR-141`, `UC-015`, `US-015`, `AC-068…AC-071`, `TEST-068…TEST-071`, `API-106…API-112`, `DB-069…DB-072`, `DB-098`, `SEC-106…SEC-110`, `SEC-118`; không cấp requirement/API/DB ID mới.
- **Trước thay đổi:** `API-106…112` chỉ tồn tại dưới dạng thiết kế với `GenericCommand`/`Envelope` và bốn lệnh khai báo sai `202`; `DB-069…072` chưa có bảng nào; phê duyệt duy nhất trong hệ thống là logic hard-code của Change Request trong US-004.
- **Sau thay đổi:** OpenAPI 0.9.3 đặc tả đầy đủ bảy operation với schema cụ thể, `404` cho mọi đường đọc, `x-error-codes` và status code đúng với controller (200/201, không phải 202); marker implemented tăng 53 → 60 trên tổng 164. Module `workflow` của Nest cung cấp definition list, publish có maker-checker, start instance đóng băng route, actor inbox, ghi quyết định và cancel. Bốn bảng mới có composite FK mang `tenant_id`, partial unique index cho "một version PUBLISHED" và "một instance sống trên mỗi object", trigger cấm sửa/xóa ledger quyết định và cấm ghi đè rules của version đã publish. Vue có route `/approvals` gated theo `approvalTask.read`.
- **Lý do:** Đây là năng lực nền mà mọi domain phê duyệt sau này (`US-005`, `US-006…008`, `US-012/013`) đều phụ thuộc, nên làm trước các slice có blocker bên ngoài.
- **Quyết định đã chốt theo quyền được ủy quyền:** (a) thêm cột `object_type` cho DB-069 và `project_id`/`package_id` cho DB-071 — không có thì FR-139 routing xác định và ABAC package trong SQL đều không khả thi; (b) thêm `attempt_no` cho DB-072 để RETURN → nộp lại không bị chặn bởi quy tắc "một quyết định mỗi actor mỗi bước"; (c) lệnh commit đồng bộ 200/201 thay vì 202 đã khai báo, vì trả 202 cho một ghi đã commit là hợp đồng sai; (d) `expectedVersion` trong body thay cho `If-Match`, đồng bộ với toàn bộ slice hiện hữu.
- **Phạm vi acceptance:** `AC-068…AC-071` có bằng chứng. **`AC-072`/`TEST-072` Not covered** — SLA/nhắc việc/escalation phụ thuộc quy tắc calendar/timezone/pause chưa có chủ sở hữu; cột `sla_due_at` và partial index đã đặt sẵn nên slice sau không cần migration. `CONDITIONAL_APPROVE` bị từ chối bằng `CONDITIONAL_APPROVE_NOT_ENABLED` cho tới khi có danh sách control không thể miễn trừ. `SEC-102` MFA/step-up không thể triển khai trong base auth profile đã phê duyệt; đây là cổng chặn production. Delegation `AC-085…087` thuộc US-018; `effective_actor_id` đã tách khỏi `actor_id` để không cần migration khi có delegation.
- **Artefact bị ảnh hưởng:** `apps/api/src/modules/workflow/**`, bốn entity mới, migration `1783738000000` và `1783739000000`, `data-source.ts`, `app.module.ts`, `project-master.seed.ts`; `apps/web` types/api/component/view/router/styles; `docs/openapi/openapi.yaml`, `docs/12`, `docs/15`, ExecPlan `2026-07-26-workflow-engine-us015.md`.
- **Migration/tương thích:** Hai migration mới, cả hai có `down()` đối xứng và đã test up/down/up. Chuỗi grant nay kết thúc ở `policy_version` 5; seed dùng hằng `rolePolicyVersion` thay vì literal, sửa một defect trong đó seed ghi 3 và sẽ hạ cấp role mà migration đã nâng lên 4. Assertion policy version trong hai migration spec chuyển sang ngưỡng tối thiểu để migration grant sau không làm vỡ test cũ. Engine chạy độc lập, không đụng `API-154…156`.
- **Validation:** Lint, type-check, `openapi:lint`, build Pass. Unit API 69 + Web 92 + Worker 61 = 222. Integration API 93 + Worker 11 = 104, gồm 18 test HTTP workflow và 9 test migration/constraint.
- **Trạng thái:** Implemented local; deploy EC2 test ghi nhận theo release kế tiếp.

## 2026-07-26 — Sửa error mapping nuốt thông báo validation và thêm client-side guard cho login

- **Loại:** Frontend defect; Test; không thay đổi phạm vi nghiệp vụ baseline.
- **Người yêu cầu/phê duyệt:** Người dùng/Product Owner báo không đăng nhập được và chỉ thấy thông báo chung ngày 2026-07-26.
- **Mã bị ảnh hưởng:** `AC-174…AC-177`, `TEST-230`, `TEST-231`; không cấp requirement/API ID mới.
- **Trước thay đổi:** `ApiError.from` chỉ chấp nhận `message` kiểu string. Nest `ValidationPipe` trả `{"message":["email must be an email","password must be longer than or equal to 8 characters"],"error":"Bad Request"}`, tức `message` là mảng, nên mọi lỗi validation của toàn bộ ứng dụng rơi về chuỗi mặc định `Không thể hoàn thành yêu cầu` và người dùng không biết field nào sai. `LoginForm` cũng không kiểm tra gì phía client nên form rỗng vẫn round-trip rồi trả về đúng thông báo vô nghĩa đó.
- **Sau thay đổi:** `ApiError.from` đọc được cả string, mảng string và `error` của Nest, gán code `REQUEST_VALIDATION_FAILED` cho 400 dạng mảng, và chỉ dùng chuỗi mặc định khi không còn nguồn nào. `LoginForm` kiểm tra tenant/email/độ dài mật khẩu theo đúng contract server trước khi submit, ưu tiên hiển thị lỗi cục bộ để không mâu thuẫn với lỗi server, và trim tenant/email khi gửi.
- **Lý do:** Đây là defect chặn đăng nhập trên môi trường EC2 test và làm hỏng phản hồi lỗi của mọi form khác trong ứng dụng, không riêng màn hình login.
- **Artefact bị ảnh hưởng:** `apps/web/src/api/api-error.ts`, `apps/web/src/components/auth/LoginForm.vue`, hai spec mới `api-error.spec.ts` và `LoginForm.spec.ts`, `project-structure.spec.ts`.
- **Migration/tương thích:** Không có migration. Không đổi contract API; chỉ sửa cách client diễn giải payload lỗi đã tồn tại.
- **Validation:** Lint, type-check Pass; Web unit tăng 67 → 78 (thêm 4 test error mapping và 6 test login guard); unit toàn workspace API 56 + Web 78 + Worker 61 = 195. Đăng nhập trên public stack trả HTTP 200.
- **Trạng thái:** Implemented; deploy kèm release kế tiếp.

## 2026-07-26 — Notification inbox US-022 (API-135/136) và design token layer

- **Loại:** API; Security; Frontend; Test; Documentation; không thay đổi phạm vi nghiệp vụ baseline.
- **Người yêu cầu/phê duyệt:** Người dùng/Product Owner yêu cầu hoàn thiện tiếp sản phẩm và chuẩn hóa giao diện ngày 2026-07-26; Codex quyết định theo quyền đã được ủy quyền.
- **Mã bị ảnh hưởng:** `BR-032`, `BR-034`, `BR-038`, `FR-175`, `FR-177`, `UC-022`, `US-022`, `AC-105`, `AC-107`, `TEST-103…TEST-107`, `API-135`, `API-136`, `DB-098`, `DB-105`, `SEC-107`, `SEC-118`, `NFR-024`; không cấp requirement/API/DB ID mới.
- **Trước thay đổi:** DB-105 đã tổng quát hóa và được worker ghi, nhưng không có endpoint, route hay UI nào đọc được; `notification.read`/`notification.acknowledge` chưa tồn tại trong role nào. OpenAPI khai báo API-135/136 bằng `Envelope`/`GenericCommand` và truy vết sai sang `DB-071`/`DB-097`. Style layer chỉ có 7 biến, phần lớn màu là literal và nút Element Plus vẫn dùng primary xanh dương mặc định.
- **Sau thay đổi:** OpenAPI 0.9.2 đặc tả đầy đủ API-135 (cursor, filter, unread counter trong `meta`) và API-136 (body rỗng, idempotent, 404 cho ngoài scope), nâng số marker implemented từ 51 lên 53 trên tổng 164. Module `notification` của Nest re-authorize mỗi request bằng `PermissionService.accessScopeSets`, lọc scope ngay trong SQL để phân trang không trả thiếu hàng, và ghi audit DB-098 + outbox trong cùng transaction khi chuyển UNREAD→READ. Vue có route `/notifications` gated theo permission. Toàn bộ giao diện chuyển sang token layer đầy đủ và Element Plus nhận primary màu brand.
- **Lý do:** Đóng `AC-105` (notification không phải access grant) và `AC-107` (acknowledge chỉ đổi presentation state) trên dữ liệu đã có sẵn, đồng thời loại bỏ sự thiếu nhất quán thị giác mà Product Owner nêu.
- **Artefact bị ảnh hưởng:** `apps/api/src/modules/notification/**`, `permission.service.ts`, `app.module.ts`, `data-source.ts`, `project-master.seed.ts`, migration `1783737000000`, test API/migration; `apps/web` api/types/component/view/router/styles; `docs/08`, `docs/12`, `docs/13`, `docs/15`, `docs/openapi/openapi.yaml`, ExecPlan `2026-07-26-notification-inbox-us022.md`.
- **Migration/tương thích:** Không có thay đổi schema — DB-105 đã tồn tại. Migration duy nhất cấp hai permission code cho sáu role catalog và nâng `policy_version` lên 4; `down()` chỉ gỡ đúng những code nó thêm nên grant có sẵn được giữ nguyên. Vì chuỗi migration nay kết thúc ở policy 4, assertion tương ứng trong test RiskChange đã được cập nhật và fixture "operator sửa tay" đổi sang version 9 để không trùng version của bất kỳ migration nào.
- **Phạm vi acceptance:** `AC-105`/`AC-107` có bằng chứng. `AC-103` (channel/preference), `AC-104` (scheduler nhắc việc/escalation) và `AC-106` (P1 call tree) vẫn Planned vì phụ thuộc external channel provider chưa có sandbox/credential; US-022 do đó chưa `Done`.
- **Validation:** Lint, type-check, `openapi:lint` Pass. Unit API 56 + Web 67 + Worker 61 = 184. Integration API 66 + Worker 11 = 77, gồm 12 test API-135/136 và 3 test migration up/down/up. Playwright 5/5 Pass. Web image build lại và deploy EC2 test; `/notifications` trả đúng empty state có phân quyền.
- **Trạng thái:** Implemented/deployed EC2 test cho phần inbox; phần channel/scheduler/escalation Planned.

## 2026-07-26 — Đóng E2E gate US-004 và chuẩn hóa accessible name cho select

- **Loại:** Frontend accessibility; Test; DevOps evidence; không thay đổi phạm vi nghiệp vụ baseline.
- **Người yêu cầu/phê duyệt:** Người dùng/Product Owner yêu cầu kiểm tra tiến độ và hoàn thiện sản phẩm chuẩn production ngày 2026-07-26.
- **Mã bị ảnh hưởng:** `TEST-001…004`, `TEST-010`, `TEST-014…017`, `TEST-230…233`, `NFR-024`; không cấp requirement/API/DB ID mới.
- **Trước thay đổi:** Playwright E2E chưa từng chạy xanh: `tests/e2e/risk-change.spec.ts` timeout tại `getByLabel('Probability', { exact: true })`. Mọi form trong `apps/web/src` dùng label bọc control, nên accessible name của `<select>` gồm cả text option đang chọn (`"Probability 1"`), khiến exact matcher không bao giờ khớp. Helper `selectAssignee` lại dùng substring matcher nên khớp cả input tìm kiếm `"Tìm assignee"` lẫn `<select aria-label="Assignee">`.
- **Sau thay đổi:** 25 `<select>` trong slice Risk/Issue/Action/Change nhận `aria-label` tường minh; bốn control residual dùng tên phân biệt (`Residual probability/cost/schedule/HSE`) để không đụng độ strict mode khi fieldset residual hiển thị. Helper E2E đổi sang exact matcher. Toàn bộ 5 spec E2E Pass lần đầu tiên.
- **Lý do:** Accessible name tường minh là yêu cầu a11y đúng đắn, đồng thời làm selector E2E xác định; đây là điều kiện để đóng bằng chứng acceptance UI của `TEST-014…017` mà changelog 2026-07-18 còn ghi Pending.
- **Artefact bị ảnh hưởng:** `apps/web/src/components/risk-change/{RiskForm,IssueForm,RiskIssueActionPanel,ChangeRequestPanel,ClosureDecisionPanel}.vue`; `tests/e2e/risk-change.spec.ts`; changelog này. Không đổi API, schema, migration hay logic nghiệp vụ.
- **Migration/tương thích:** Không có migration. `aria-label` chỉ bổ sung accessible name, giữ nguyên nhãn hiển thị nên không phá vỡ WCAG 2.5.3 Label in Name và không đổi hành vi người dùng.
- **Validation:** Root lint Pass sau `eslint --fix` cho `vue/attributes-order`; Web unit 20 files/55 tests Pass; unit toàn workspace API 56 + Web 55 + Worker 61 = 172 Pass; integration API 50 + Worker 11 = 61 Pass; Playwright 5/5 Pass trên stack EC2 test đã build lại image web.
- **Phát hiện vận hành:** Stack Compose không tự phục hồi sau reboot vì Docker secret bind-mount từ `/tmp/solar-bess-secrets` bị xóa; postgres/redis không khởi động và API lặp `getaddrinfo ENOTFOUND postgres`. Khôi phục bằng `npm run secrets:materialize` trước khi `docker compose up`. Cần đưa vào runbook DevOps như follow-up.
- **Trạng thái:** Implemented trên EC2 test; commit/GitHub Actions release ghi nhận riêng.

## 2026-07-18 — Deploy current/design Swagger lên EC2 test

- **Loại:** DevOps; Test; Documentation; không thay đổi phạm vi nghiệp vụ baseline.
- **Người yêu cầu/phê duyệt:** Người dùng/Product Owner yêu cầu tách Swagger và commit để CI/CD triển khai; thực hiện ngày 2026-07-18.
- **Mã bị ảnh hưởng:** `NFR-024`, `TEST-197`; không cấp requirement/API ID mới.
- **Trước thay đổi:** Current/design split đã qua local/container/public worktree preflight nhưng commit release còn Pending.
- **Sau thay đổi:** Commit `a54f487d040f0fa5125e7a954d71c0d85f09e1b5` được GitHub Actions run `29633937535` CI và deploy thành công; API/worker/web chạy đúng immutable SHA, healthy. Public current Swagger trả 51 operations và design Swagger trả đủ 164 API IDs.
- **Lý do:** Đóng evidence release thay vì chỉ ghi nhận pre-commit worktree smoke.
- **Artefact bị ảnh hưởng:** Test Strategy, DevOps, INDEX và Changelog; không đổi runtime source/OpenAPI/schema.
- **Migration/tương thích:** Không có migration mới; deploy script chạy forward-compatible migration workflow hiện hữu. `/api/docs/` và `/api/design-docs/` giữ contract đã công bố trong commit chức năng.
- **Validation:** Workflow CI/Deploy Pass; post-deploy root/health HTTP 200; cả hai Swagger UI/CSS/init/YAML HTTP 200; OpenAPI 0.9.1; CSP/no-store Pass; current login present, planned permission/webhook excluded; design planned permission/webhook present; exact 51/164 count Pass.
- **Trạng thái:** Implemented/deployed EC2 test; production HTTPS/access policy vẫn TBD theo artefact hiện hữu.

## 2026-07-18 — Tách current API Swagger khỏi full design Swagger

- **Loại:** API metadata; DevOps; Test; Documentation; không thay đổi phạm vi nghiệp vụ baseline.
- **Người yêu cầu/phê duyệt:** Người dùng/Product Owner xác nhận current Swagger chỉ nên hiển thị API đã triển khai và đồng ý giữ full design ở view riêng ngày 2026-07-18.
- **Mã bị ảnh hưởng:** `NFR-024`, `TEST-197`; metadata implementation của `API-001`, `API-004…007`, `API-014…022`, `API-025`, `API-137…139`; không cấp API ID mới.
- **Trước thay đổi:** `/api/docs/` hiển thị toàn bộ 164 API thiết kế; OpenAPI chỉ có 33 marker implemented và thiếu 18 auth/system/project operations đã có controller.
- **Sau thay đổi:** OpenAPI 0.9.1 có đúng 51 controller-backed marker. `/api/docs/` dẫn xuất current view 51 operations; `/api/design-docs/` giữ đủ 163 path operations + API-126 webhook = 164 API IDs. Ba health probe technical không nằm trong business Swagger.
- **Lý do:** Không để người dùng Swagger hiểu nhầm API thiết kế là endpoint đã hoạt động, đồng thời vẫn bảo toàn contract tương lai để review.
- **Artefact bị ảnh hưởng:** OpenAPI/API/Test/DevOps/Trace/INDEX/Changelog; Nest Swagger filter, Nginx, deploy smoke và automated tests.
- **Migration/tương thích:** Không đổi path/schema/database; `/api/docs/` intentionally thu hẹp danh sách, full design chuyển sang additive `/api/design-docs/`. Consumer cần full contract phải đổi URL publication.
- **Validation hiện có:** Redocly, root lint/type/build Pass; marker audit 51 unique implemented/164 total; unit API 56 + Web 55 + Worker 61 = 172; isolated full integration API 50 + Worker 11 = 61 và focused dual-Swagger/Auth 9/9 Pass. Production images build thành công; Nginx/local và public EC2 worktree smoke cả hai UI/CSS/init/YAML, CSP/no-store và exact 51/164 count đều Pass. Commit CI/CD release Pending tại thời điểm ghi.
- **Trạng thái:** Local implementation/test/container/public worktree smoke Implemented; commit deployment Pending tại thời điểm ghi.

## 2026-07-18 — Publish canonical OpenAPI 3.1 qua Swagger UI

- **Loại:** API tooling; DevOps; Test; Documentation; không thay đổi phạm vi nghiệp vụ baseline.
- **Người yêu cầu/phê duyệt:** Người dùng/Product Owner yêu cầu tích hợp Swagger và commit để CI/CD deploy EC2 test ngày 2026-07-18.
- **Mã bị ảnh hưởng:** `NFR-024`, `TEST-197`; không cấp `API-*` mới vì `/api/docs/` và `/api/docs/openapi.yaml` là technical publication surface, không phải domain operation.
- **Trước thay đổi:** Canonical OpenAPI 3.1 chỉ tồn tại trong repository và được Redocly lint; runtime/Nginx không phục vụ Swagger UI hoặc machine-readable YAML.
- **Sau thay đổi:** Nest fail-fast load trực tiếp `docs/openapi/openapi.yaml`, phục vụ Swagger UI/YAML khi `SWAGGER_ENABLED=true`; API image copy canonical asset, Nginx proxy same-origin và deploy script smoke/rollback kiểm cả UI lẫn OpenAPI version. Không dùng decorator để generate contract song song.
- **Lý do:** Cho phép reviewer/consumer truy cập một contract canonical từ EC2 test mà không làm sai lệch 164 API ID hoặc trạng thái implementation từng operation.
- **Artefact bị ảnh hưởng:** `apps/api` bootstrap/OpenAPI loader/dependency/test/image, `apps/web/nginx.conf`, Compose/env/deploy script, `docs/08-api-specification.md`, `docs/13-test-strategy.md`, `docs/14-devops-and-deployment.md`, `docs/INDEX.md`, `docs/CHANGELOG.md`.
- **Migration/tương thích:** Không đổi database/schema/business API; feature flag độc lập mặc định false ngoài Compose. EC2 test Compose mặc định bật; production expose vẫn cần explicit decision, HTTPS và access policy.
- **Validation hiện có:** Root lint/type/build và canonical OpenAPI lint Pass; unit API 15 suites/55 + Web 20/55 + Worker 12/61 = 171; isolated full integration API 8/50 + Worker 3/11 = 61. Loader unit 3/3, Identity/Swagger integration 9/9, production Docker image/Nginx UI+CSS+init-JS+YAML và public EC2 worktree smoke đều Pass.
- **Trạng thái:** Local implementation/test/container smoke Implemented; commit/push GitHub Actions release Pending tại thời điểm ghi.

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
