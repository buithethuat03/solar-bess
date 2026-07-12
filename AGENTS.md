# Quy tắc phát triển dự án Solar & BESS Project Management Web

Đọc file tech-stack.md để xem tech stack dự án

## 1. Phạm vi áp dụng và thứ tự ưu tiên

File này áp dụng cho toàn bộ repository. Mọi agent, developer, reviewer và công cụ tự động phải đọc file này trước khi tạo hoặc sửa tài liệu, kiến trúc, dữ liệu, API, backlog, test hoặc mã nguồn.

Thứ tự ưu tiên khi có xung đột:

1. Yêu cầu trực tiếp và đã được xác nhận của người dùng/Product Owner.
2. Tài liệu phạm vi gốc được chỉ định tại mục 2.
3. Quy tắc trong `AGENTS.md`.
4. ExecPlan đang được phê duyệt cho tác vụ.
5. Các tài liệu dẫn xuất như BRD, PRD, SRS, ADR và backlog.

Nếu vẫn còn xung đột, dừng phần bị ảnh hưởng và ghi `Open Question`; không tự chọn phương án làm thay đổi phạm vi.

## 2. Thư mục tài liệu và nguồn nghiệp vụ gốc

- Thư mục tài liệu chính và duy nhất là `docs/` ở repository root. Luôn dùng đúng chữ thường `docs`; không tạo lại `Docs/`, `DOCS/` hoặc thư mục tài liệu song song.
- Tài liệu đầu vào nghiệp vụ gốc hiện tại là:
  - `docs/Đề xuất tính năng nền tảng Solar và BESS.md`
- Tài liệu trên là baseline phạm vi đã được phê duyệt để tạo BRD, PRD, SRS, kiến trúc, backlog, test và prototype.
- Không đổi tên, di chuyển, xóa, ghi đè hoặc sửa nội dung nghiệp vụ của baseline nếu chưa có yêu cầu thay đổi phạm vi được xác nhận.
- Các mã nguồn hiện có trong baseline như `OPP-001`, `PFM-001`, `PRJ-001` được giữ nguyên như **Source Feature ID**. Chúng không thay thế hệ mã yêu cầu chuẩn ở mục 4; tài liệu dẫn xuất phải có ma trận ánh xạ từ Source Feature ID sang `BR-*`, `FR-*`, `NFR-*`, `UC-*`, `US-*`, `AC-*` và `TEST-*` tương ứng.
- Mọi tài liệu Markdown dùng UTF-8, tiếng Việt có dấu và đường dẫn tương đối từ repository root.

## 3. Kiểm soát phạm vi và thông tin chưa xác định

- Không tự ý mở rộng, thu hẹp, thay thế hoặc diễn giải lại phạm vi nghiệp vụ đã được phê duyệt.
- Không biến một đề xuất, ví dụ, giả định hoặc ý tưởng AI thành yêu cầu bắt buộc nếu chưa được phê duyệt.
- Không bịa tên pháp nhân, khách hàng, dự án, nhà thầu, số tiền, biểu giá, ngưỡng phê duyệt, thời hạn, SLA, endpoint, schema, hạ tầng, tiêu chuẩn áp dụng hoặc dữ liệu vận hành.
- Thông tin chưa xác định phải ghi rõ bằng một trong ba nhãn:
  - `TBD`: giá trị hoặc thiết kế bắt buộc phải xác định trước khi triển khai.
  - `Assumption`: giả định tạm thời có chủ sở hữu, lý do và điều kiện xác nhận.
  - `Open Question`: câu hỏi cần quyết định, kèm người/nhóm cần trả lời và tác động nếu chưa trả lời.
- Không dùng các từ như “mặc định”, “thông thường”, “chắc chắn” để che giấu dữ liệu chưa có nguồn.
- Assumption không được âm thầm trở thành yêu cầu. Khi được xác nhận, phải chuyển thành mã yêu cầu phù hợp và cập nhật changelog.

## 4. Hệ mã định danh bắt buộc

Mọi yêu cầu và artefact mới phải dùng mã chữ hoa, ba chữ số, không tái sử dụng mã đã hủy:

| Mẫu | Loại | Ví dụ |
|---|---|---|
| `BR-xxx` | Business Requirement | `BR-001` |
| `FR-xxx` | Functional Requirement | `FR-001` |
| `NFR-xxx` | Non-functional Requirement | `NFR-001` |
| `UC-xxx` | Use Case | `UC-001` |
| `US-xxx` | User Story | `US-001` |
| `AC-xxx` | Acceptance Criterion | `AC-001` |
| `WF-xxx` | Workflow | `WF-001` |
| `DB-xxx` | Data Entity | `DB-001` |
| `API-xxx` | API operation/interface | `API-001` |
| `SEC-xxx` | Security Requirement | `SEC-001` |
| `TEST-xxx` | Test Case | `TEST-001` |
| `ADR-xxx` | Architecture Decision Record | `ADR-001` |

Quy tắc cấp và dùng mã:

- Mã ổn định suốt vòng đời; không đổi mã chỉ vì đổi tên hoặc di chuyển tài liệu.
- Mỗi mã có đúng một định nghĩa chuẩn. Nơi khác chỉ tham chiếu, không tạo định nghĩa thứ hai.
- Mã bị loại phải mang trạng thái `Deprecated` hoặc `Superseded by <ID>`; không xóa khỏi lịch sử và không cấp lại số đó.
- Tiêu đề requirement phải bắt đầu bằng mã, ví dụ `### FR-014 — Quản lý revision tài liệu`.
- `FR-*` phải truy vết tới ít nhất một `BR-*`; `US-*`/`UC-*` phải truy vết tới `FR-*`; `AC-*` và `TEST-*` phải truy vết tới requirement hoặc story được kiểm chứng.
- `SEC-*`, `NFR-*`, `DB-*`, `API-*` và `ADR-*` phải tham chiếu các requirement nghiệp vụ/chức năng bị tác động.
- Khi sử dụng Source Feature ID từ tài liệu gốc, ghi rõ dạng `Source: OPP-003` và ánh xạ sang mã chuẩn; không tạo thêm họ mã tùy ý.

## 5. Tài liệu, truy vết và tham chiếu chéo

- Tài liệu dẫn xuất phải đặt trong `docs/`. Cấu trúc dự kiến khi các artefact được tạo:
  - `docs/00-documentation-plan.md`
  - `docs/01-product-vision-and-scope.md`
  - `docs/02-BRD.md`
  - `docs/03-PRD.md`
  - `docs/04-SRS.md`
  - `docs/05-domain-model.md`
  - `docs/06-solution-architecture.md`
  - `docs/07-data-model.md`
  - `docs/08-api-specification.md`
  - `docs/openapi/openapi.yaml`
  - `docs/09-security-and-permissions.md`
  - `docs/10-ux-information-architecture.md`
  - `docs/11-workflows-and-state-machines.md`
  - `docs/12-product-backlog.md`
  - `docs/13-test-strategy.md`
  - `docs/14-devops-and-deployment.md`
  - `docs/15-traceability-matrix.md`
  - `docs/16-open-questions-and-decisions.md`
  - `docs/INDEX.md`
  - `docs/CHANGELOG.md`
- Không tạo các file trên với nội dung rỗng hoặc giả; chỉ tạo khi tác vụ yêu cầu và có đủ nguồn.
- Mọi tài liệu phải có trạng thái, phiên bản, ngày cập nhật, owner, nguồn đầu vào và người/phương thức phê duyệt. Giá trị chưa biết dùng nhãn tại mục 3.
- Mọi tham chiếu chéo dùng mã định danh, không chỉ dùng tên mục hoặc số dòng.
- `docs/15-traceability-matrix.md` là ma trận đầu-cuối tối thiểu theo chuỗi:
  `Source Feature ID → BR → FR/NFR/SEC → UC/US/WF → AC → DB/API/ADR → TEST`.
- Khi đổi một requirement, phải rà và cập nhật mọi artefact downstream được ma trận truy vết chỉ ra.
- Liên kết file dùng đường dẫn tương đối và phải được kiểm tra sau khi đổi tên/di chuyển.

## 6. Changelog và bảo toàn lịch sử nghiệp vụ

- Changelog chuẩn là `docs/CHANGELOG.md`.
- Mọi thay đổi phạm vi phải có entry trước hoặc cùng lúc với thay đổi tài liệu, gồm:
  - ngày và người yêu cầu/phê duyệt;
  - mã requirement/Source Feature ID bị ảnh hưởng;
  - nội dung trước và sau;
  - lý do;
  - tài liệu, dữ liệu, API, test và roadmap bị tác động;
  - rủi ro tương thích/migration;
  - trạng thái phê duyệt.
- Thay đổi thuần trình bày hoặc governance vẫn được ghi nhận nếu làm đổi đường dẫn, tên file, cấu trúc artefact hoặc quy tắc làm việc; ghi rõ `Không thay đổi phạm vi nghiệp vụ`.
- Không xóa hoặc ghi đè nội dung nghiệp vụ cũ mà không lưu lịch sử thay đổi. Ưu tiên thêm revision, đánh dấu `Superseded`, hoặc tạo tài liệu phiên bản mới có liên kết tới bản trước.
- Không sửa lịch sử changelog đã phát hành. Nếu entry sai, thêm entry đính chính.

## 7. Sơ đồ nghiệp vụ và kiến trúc

- Ưu tiên Mermaid cho workflow, sequence, state, context, component, deployment và ERD để sơ đồ có thể review bằng diff.
- Mỗi sơ đồ phải có tiêu đề, mục đích, phạm vi, legend nếu cần và tham chiếu mã `BR/FR/WF/DB/API/SEC/ADR` liên quan.
- Node và luồng phải dùng tên ổn định; ranh giới PM Web, O&M và OT phải hiển thị rõ khi cùng xuất hiện.
- Nếu Mermaid không đáp ứng, có thể dùng định dạng khác nhưng phải ghi lý do trong `ADR-*`, giữ file nguồn có thể chỉnh sửa và không chỉ lưu ảnh raster.

## 8. Quy tắc API

- Mọi API được mô tả theo OpenAPI **3.1.x** tại `docs/openapi/openapi.yaml` hoặc các file được file đó tham chiếu.
- Mỗi operation có mã `API-*`, mục đích, requirement liên quan, authentication/authorization, tenant context, request/response schema, error model, pagination/filtering, idempotency, rate limit và ví dụ không chứa dữ liệu nhạy cảm.
- Schema dùng component có version; breaking change phải có migration/deprecation plan và changelog.
- Không mô tả API OT command trong OpenAPI của PM Web.
- API hai chiều với hệ thống ngoài phải xác định System of Record, owner từng trường, retry, idempotency, reconciliation và audit.

## 9. Quy tắc dữ liệu và cơ sở dữ liệu

- Trước khi triển khai schema, phải có:
  - ERD ưu tiên Mermaid;
  - data dictionary;
  - mã `DB-*` cho từng entity/domain object;
  - khóa chính, khóa ngoại, unique constraint, nullability, default hợp lệ;
  - kiểu dữ liệu, đơn vị, timezone, currency/precision;
  - validation và business rule;
  - owner/System of Record;
  - phân loại dữ liệu cá nhân/nhạy cảm;
  - retention, legal hold và audit;
  - migration và rollback.
- Dữ liệu tiền dùng decimal/fixed precision và currency rõ ràng; không dùng floating-point cho số tiền.
- Entity đa tenant phải có tenant scope rõ ràng. Khóa, unique constraint và query không được cho phép dữ liệu xuyên tenant ngoài luồng quản trị đã phê duyệt.
- Không lưu signer chỉ bằng chuỗi hiển thị; dùng ID ổn định và snapshot pháp lý tại thời điểm ký.

## 10. Ranh giới PM Web, O&M và OT

Ba miền sau phải được tách rõ trong yêu cầu, kiến trúc, quyền, mạng, API và test:

1. **Web quản lý dự án:** portfolio, tiến độ, tài liệu, hợp đồng, chi phí, mua sắm, thi công, QA/QC, HSE, commissioning, COD, workflow và báo cáo quản trị.
2. **Hệ thống giám sát O&M:** telemetry, KPI, alarm, work order, SLA, bảo hành và báo cáo vận hành. Đây không mặc nhiên là hệ thống điều khiển.
3. **Hệ thống OT:** SCADA, EMS, BMS, PCS, inverter, protection, meter, PLC/gateway và thiết bị hiện trường; OT là miền vận hành/điều khiển có ràng buộc an toàn riêng.

Luồng mặc định là `OT → gateway/DMZ → integration layer → O&M/PM Web`, read-only đối với PM Web.

## 11. Cấm điều khiển BESS trực tiếp từ PM Web

- PM Web không được tạo, gửi, chuyển tiếp hoặc che giấu lệnh điều khiển tới BESS/PCS/BMS/EMS/SCADA, kể cả qua API, message broker, automation, AI hoặc tài khoản dịch vụ.
- Không tạo nút charge/discharge, start/stop, reset alarm, thay SOC limit, thay protection setting hoặc bypass interlock trong PM Web.
- Ngoại lệ chỉ được xem xét khi có phạm vi riêng được phê duyệt, tối thiểu gồm `BR-*`, `FR-*`, `NFR-*`, `SEC-*`, `ADR-*`, hazard/risk assessment, phân vùng IT/OT, allowlist lệnh, MFA step-up, dual approval, xác nhận tại hiện trường, interlock/fail-safe, signed command, immutable audit, test an toàn, rollback và phê duyệt của Product Owner, OT Security, HSE và Asset/System Owner.
- Trước khi toàn bộ điều kiện ngoại lệ được phê duyệt, mọi thiết kế phải giữ read-only và mọi trường/lệnh chưa rõ phải ghi `TBD` hoặc `Open Question`, không dựng write path “để dùng sau”.

## 12. Multi-tenant và mô hình tổ chức

- Thiết kế phải hỗ trợ nhiều tenant, nhiều công ty/pháp nhân, nhiều portfolio, nhiều dự án, nhiều gói thầu và nhiều nhà thầu/nhà cung cấp.
- Mọi requirement, entity, API, permission, event, file và audit record phải xác định scope phù hợp: tenant, legal entity, project, package, department, contractor hoặc external party.
- Áp dụng deny-by-default, tenant isolation, RBAC kết hợp ABAC và Segregation of Duties.
- PM không được tự phê duyệt khoản chi/yêu cầu do mình tạo khi policy SoD cấm. Delegation có thời hạn, không mở rộng quyền gốc và phải audit.
- Test bắt buộc gồm negative test truy cập chéo tenant/pháp nhân/dự án/gói thầu.

## 13. Cổng tài liệu trước production code

- Không viết production code trước khi các artefact sau hoàn thành, truy vết nhất quán và được kiểm tra/phê duyệt:
  - BRD;
  - PRD;
  - SRS;
  - kiến trúc tổng thể và các ADR trọng yếu;
  - mô hình dữ liệu/ERD/data dictionary;
  - OpenAPI 3.1 cho phạm vi MVP có API;
  - backlog MVP có `US-*`, `AC-*`, dependency và ưu tiên;
  - test strategy và traceability baseline.
- Prototype dùng để làm rõ yêu cầu chỉ được tạo khi có yêu cầu rõ ràng, được đánh dấu non-production, không chứa secret/dữ liệu thật và không được âm thầm chuyển thành production code.
- Nếu cổng chưa đạt, tác vụ chỉ được phép hoàn thiện tài liệu, spike được phê duyệt hoặc ghi `TBD/Open Question`; không dựng khung ứng dụng production trước.

## 14. ExecPlan cho tác vụ lớn

- Trước tác vụ lớn, phải tạo hoặc cập nhật ExecPlan theo `.agent/PLANS.md`.
- Tác vụ được xem là lớn nếu có một trong các dấu hiệu:
  - ảnh hưởng nhiều hơn một module/domain;
  - kéo dài qua nhiều phiên làm việc hoặc cần nhiều milestone;
  - thay đổi kiến trúc, tenancy, security, OT, schema, API hoặc migration;
  - tạo/sửa nhiều artefact có quan hệ phụ thuộc;
  - có rollout, dữ liệu thật, external integration hoặc rollback phức tạp.
- Không bắt đầu implementation của tác vụ lớn khi ExecPlan chưa có mục tiêu, scope in/out, requirement IDs, thiết kế, milestone, test, rủi ro, migration/rollback và câu hỏi mở.
- ExecPlan là tài liệu sống: cập nhật progress, decision, discovery và kết quả kiểm chứng trong quá trình thực hiện.

## 15. Quy tắc triển khai và kiểm thử code

Khi cổng tài liệu đã đạt và tác vụ được phép viết code:

- Đọc manifest và script thực tế của repository; không tự bịa lệnh build/test.
- Cung cấp script chuẩn cho ít nhất:
  - lint;
  - type-check;
  - unit test;
  - integration test.
- Chạy các bước áp dụng được trước khi bàn giao và báo cáo chính xác command, kết quả, số test và lỗi còn lại.
- Test phải truy vết tới `TEST-*` và requirement/acceptance criterion liên quan.
- Không đánh dấu “đạt” nếu bước bị bỏ qua. Ghi `TBD` nếu toolchain chưa được chọn; ghi rõ lý do và owner để đóng TBD.
- Với thay đổi DB/API/security/OT phải có test migration/rollback, backward compatibility, authorization và negative path phù hợp.

## 16. Checklist bắt buộc sau mỗi tác vụ

Trước khi kết thúc tác vụ:

1. Kiểm tra tính nhất quán thuật ngữ, status, version, ID và phạm vi giữa các tài liệu.
2. Kiểm tra liên kết file, anchor và tham chiếu chéo bằng mã định danh.
3. Kiểm tra ma trận truy vết và cập nhật artefact downstream bị ảnh hưởng.
4. Kiểm tra changelog nếu có thay đổi phạm vi, đường dẫn, cấu trúc hoặc governance.
5. Chạy lint, type-check, unit test, integration test nếu có code và báo cáo kết quả.
6. Liệt kê chính xác file đã tạo, sửa, đổi tên hoặc xóa.
7. Liệt kê mọi `Assumption`, `TBD` và `Open Question`; nếu không có, ghi rõ “Không có”.
8. Nêu rõ nội dung không thực hiện hoặc validation không chạy được; không che giấu bằng kết luận chung chung.

## 17. Hành vi bị cấm

- Tự thay đổi scope baseline hoặc requirement đã phê duyệt.
- Xóa lịch sử nghiệp vụ, changelog, audit, ADR hoặc requirement đã superseded.
- Tạo dữ liệu giả rồi trình bày như dữ liệu thực.
- Tạo production code trước cổng tài liệu.
- Tạo API/schema không có mã và truy vết.
- Dùng đường dẫn `Docs/` thay cho `docs/`.
- Để PM Web điều khiển trực tiếp OT/BESS khi chưa có ngoại lệ được phê duyệt đầy đủ.
- Báo cáo test “đạt” khi chưa chạy hoặc khi chỉ kiểm tra thủ công một phần.
