# Hướng dẫn lập ExecPlan

## 1. Mục đích

ExecPlan là kế hoạch thực thi sống, tự chứa và có thể bàn giao cho một engineer/agent khác mà không phải tự quyết định lại mục tiêu, phạm vi, thiết kế hoặc cách kiểm chứng. ExecPlan không thay thế BRD, PRD, SRS, ADR hay backlog; nó liên kết và tổ chức việc thực thi các artefact đó.

Mọi ExecPlan phải tuân thủ `AGENTS.md`, dùng tài liệu trong `docs/` làm nguồn và không tạo production code khi cổng tài liệu chưa đạt.

## 2. Khi nào bắt buộc

Tạo hoặc cập nhật ExecPlan trước khi bắt đầu tác vụ có một trong các đặc điểm:

- nhiều module/domain hoặc nhiều milestone;
- thay đổi kiến trúc, security, multi-tenant, OT, API, DB hoặc migration;
- tích hợp hệ thống ngoài;
- rollout/rollback phức tạp;
- cần phối hợp nhiều vai trò hoặc nhiều phiên làm việc;
- rủi ro cao đối với phạm vi, dữ liệu, an toàn, tài chính hoặc vận hành.

Tác vụ tài liệu nhỏ, sửa lỗi chính tả hoặc thay đổi đơn lẻ có thể không cần ExecPlan, nhưng vẫn phải tuân thủ checklist sau tác vụ trong `AGENTS.md`.

## 3. Vị trí và tên file

- Lưu ExecPlan trong `.agent/execplans/`.
- Tên file: `YYYY-MM-DD-<slug-ngan-gon>.md`.
- Không đặt ExecPlan trong `docs/` vì đây là artefact thực thi nội bộ, không phải tài liệu sản phẩm được phê duyệt.
- Nếu một ExecPlan thay thế kế hoạch cũ, giữ file cũ và ghi liên kết `Superseded by`; không xóa lịch sử.

## 4. Nguyên tắc viết

- Viết bằng ngôn ngữ rõ ràng, có thể thực thi; không dùng câu mơ hồ như “xử lý phù hợp”.
- Ground mọi nhận định trong repository và tài liệu nguồn thực tế.
- Mọi requirement dùng mã chuẩn trong `AGENTS.md`; Source Feature ID cũ chỉ dùng để truy vết.
- Giá trị chưa biết phải là `TBD`, `Assumption` hoặc `Open Question` và có owner/điều kiện đóng.
- Nêu cụ thể đường dẫn, component, interface, data flow, trạng thái và expected result.
- Một milestone phải tạo ra kết quả kiểm chứng được, không chỉ là danh sách file sẽ sửa.
- Kế hoạch phải decision-complete trước implementation. Nếu quyết định quan trọng còn mở, dừng milestone bị ảnh hưởng.

## 5. Vòng đời ExecPlan

### Trước khi thực hiện

1. Đọc `AGENTS.md` và tài liệu nguồn.
2. Kiểm tra repository, manifest, scripts, schema và artefact hiện có.
3. Xác định requirement IDs và scope in/out.
4. Ghi Assumption/TBD/Open Question.
5. Chốt thiết kế, milestone, validation, migration và rollback.
6. Xác nhận cổng tài liệu trước production code.

### Trong khi thực hiện

- Cập nhật checkbox/progress sau mỗi bước có bằng chứng.
- Ghi discovery làm thay đổi kế hoạch vào Decision Log hoặc Open Questions.
- Không âm thầm đổi scope để vượt blocker.
- Ghi command đã chạy và kết quả thực tế.
- Cập nhật risk, rollback và traceability khi thiết kế thay đổi.

### Khi hoàn tất

- Đối chiếu acceptance/exit criteria.
- Chạy validation bắt buộc.
- Cập nhật changelog và tài liệu downstream.
- Liệt kê file thay đổi, Assumption/TBD/Open Question còn lại.
- Ghi outcome, khác biệt so với kế hoạch và follow-up có owner.

## 6. Cấu trúc ExecPlan bắt buộc

Sao chép template sau khi tạo kế hoạch mới và xóa các hướng dẫn không còn cần thiết, nhưng không bỏ các mục bắt buộc.

```markdown
# ExecPlan — <Tên kết quả cần đạt>

> **Status:** Draft | Approved | In Progress | Blocked | Completed  
> **Owner:** <Tên/role hoặc TBD>  
> **Created:** YYYY-MM-DD  
> **Updated:** YYYY-MM-DD  
> **Approval:** <Người/phương thức phê duyệt hoặc TBD>

## 1. Mục tiêu và kết quả người dùng

Mô tả kết quả quan sát được khi kế hoạch hoàn tất. Không mô tả đơn thuần hoạt động kỹ thuật.

## 2. Nguồn và requirement IDs

- Baseline: `docs/Đề xuất tính năng nền tảng Solar và BESS.md`
- Source Feature IDs: <OPP-..., PRJ-... hoặc Không áp dụng>
- Business Requirements: <BR-...>
- Functional/Non-functional/Security: <FR-..., NFR-..., SEC-...>
- Use cases/stories/workflows: <UC-..., US-..., WF-...>
- Acceptance/tests: <AC-..., TEST-...>
- ADR/API/Data: <ADR-..., API-..., DB-...>

## 3. Hiện trạng repository

Ghi file/component/schema/API/script hiện có, hành vi hiện tại và bằng chứng đã kiểm tra. Không suy đoán.

## 4. Phạm vi

### In scope

- ...

### Out of scope

- ...

## 5. Assumption, TBD và Open Question

| Loại | Nội dung | Owner cần xác nhận | Hạn/điều kiện đóng | Tác động nếu chưa đóng |
|---|---|---|---|---|
| Assumption/TBD/Open Question | ... | ... | ... | ... |

Nếu không có, ghi `Không có`.

## 6. Thiết kế và luồng dữ liệu

Mô tả component, boundary PM/O&M/OT, sequence/state, tenancy, permission, error/failure mode và observability. Dùng Mermaid khi phù hợp.

## 7. API, dữ liệu và bảo mật

- API-*: OpenAPI 3.1, auth, tenant context, idempotency, error model.
- DB-*: ERD, dictionary, PK/FK, constraint, migration/rollback.
- SEC-*: threat/abuse cases, authorization, audit, secret, privacy.
- OT: read-only hoặc các phê duyệt ngoại lệ bắt buộc.

Ghi `Không áp dụng` với lý do nếu một nhóm không liên quan.

## 8. Ma trận truy vết thực thi

| Requirement/ADR | Milestone | File/component | Acceptance/Test | Trạng thái |
|---|---|---|---|---|
| FR-... | M1 | ... | AC-... / TEST-... | Planned |

## 9. Milestone và bước thực hiện

### M1 — <Kết quả milestone>

- [ ] Bước cụ thể, đường dẫn/component bị ảnh hưởng.
- [ ] Điều kiện/decision cần có trước bước.
- [ ] Cách kiểm chứng và expected result.

**Exit criteria:** ...

Lặp lại cho M2, M3 khi cần.

## 10. Kế hoạch kiểm thử và chất lượng

| Loại | Command/quy trình | Requirement/Test IDs | Expected result |
|---|---|---|---|
| Lint | <command thực tế hoặc TBD> | NFR-... | Exit code 0 |
| Type-check | <command thực tế hoặc TBD> | NFR-... | Exit code 0 |
| Unit | <command thực tế hoặc TBD> | TEST-... | Pass |
| Integration | <command thực tế hoặc TBD> | TEST-... | Pass |

Bổ sung security, tenant isolation, migration, rollback, performance và OT test nếu áp dụng.

## 11. Migration, rollout và rollback

- Dữ liệu/schema/config cần migration.
- Thứ tự rollout, feature flag, compatibility.
- Backup/checkpoint.
- Trigger rollback và thao tác phục hồi.
- Cách xác minh sau rollback.

## 12. Rủi ro và biện pháp

| Rủi ro | Xác suất/tác động | Tín hiệu | Giảm thiểu | Owner |
|---|---|---|---|---|
| ... | ... | ... | ... | ... |

## 13. Decision Log

| Ngày | Quyết định | Lý do | ADR/Requirement liên quan | Người phê duyệt |
|---|---|---|---|---|
| YYYY-MM-DD | ... | ... | ADR-... | ... |

## 14. Progress Log

| Ngày | Hoàn thành | Bằng chứng/command | Blocker/next step |
|---|---|---|---|
| YYYY-MM-DD | ... | ... | ... |

## 15. Kết quả và bàn giao

- Outcome so với mục tiêu.
- File tạo/sửa/đổi tên/xóa.
- Test/validation đã chạy và kết quả.
- Changelog/traceability đã cập nhật.
- Assumption, TBD và Open Question còn lại.
- Follow-up, owner và mức ưu tiên.
```

## 7. Tiêu chí một ExecPlan sẵn sàng thực thi

ExecPlan chỉ được chuyển sang `Approved`/`In Progress` khi:

- mục tiêu và phạm vi in/out rõ;
- requirement IDs và nguồn truy vết tồn tại;
- thiết kế không để engineer tự quyết định điểm quan trọng;
- boundary PM/O&M/OT và multi-tenant được xem xét;
- Assumption/TBD/Open Question có owner và không chặn milestone đầu;
- milestone có exit criteria;
- validation dùng command/quy trình thực tế hoặc ghi TBD minh bạch;
- migration/rollback đủ cho mức rủi ro;
- cổng tài liệu trong `AGENTS.md` đã đạt nếu có production code.

## 8. Tiêu chí hoàn tất

Không đánh dấu ExecPlan `Completed` chỉ vì đã sửa file. Phải có bằng chứng rằng:

- requirement/acceptance đạt;
- lint, type-check, unit và integration test áp dụng được đã chạy;
- security/tenant/OT/migration test cần thiết đã đạt;
- tài liệu, traceability và changelog nhất quán;
- rollback hoặc recovery đã được kiểm tra tương xứng rủi ro;
- không còn blocker chưa báo cáo.

