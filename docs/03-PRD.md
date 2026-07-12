# Product Requirements Document — Nền tảng quản lý dự án Solar & BESS

> **Purpose:** Chuyển Business Requirement đã được xác lập thành mục tiêu sản phẩm, persona/JTBD, module, đúng 198 Functional Requirement, 24 Non-functional Requirement và 37 Use Case làm nguồn sự thật cho SRS, UX, kiến trúc, dữ liệu, API, bảo mật, workflow, backlog và kiểm thử.  
> **Scope:** Phạm vi sản phẩm dài hạn từ cơ hội đến EPC, commissioning/COD và O&M monitoring; phân loại rõ MVP, Post-MVP, Pilot và Future; không định nghĩa API, database entity, security requirement, workflow, user story, acceptance criterion, test case hoặc architecture decision.  
> **Source:** [AGENTS.md](../AGENTS.md), [Kế hoạch tài liệu](./00-documentation-plan.md), [Tầm nhìn và phạm vi](./01-product-vision-and-scope.md), [BRD](./02-BRD.md), [Baseline đề xuất tính năng](./Đề%20xuất%20tính%20năng%20nền%20tảng%20Solar%20và%20BESS.md).  
> **Version:** 0.1  
> **Status:** Draft  
> **Owner:** Product Owner / Product Management (`TBD` cá nhân được chỉ định)  
> **Updated:** 2026-07-11  
> **Approval:** `TBD` — Product Owner; cần review bởi PMO, các Process Owner, Engineering, UX, QA, Security và IT/OT

## 1. Mục đích và cách sử dụng

Tài liệu này là nguồn định nghĩa chuẩn duy nhất của `FR-*`, `NFR-*` và `UC-*`. Mỗi mã chỉ được định nghĩa một lần tại đây; tài liệu downstream phải tham chiếu mã và bổ sung góc nhìn thuộc trách nhiệm của mình, không được đổi ý nghĩa yêu cầu sản phẩm.

- `FR-*` mô tả hành vi/giá trị sản phẩm quan sát được và ánh xạ một-một tới Source Feature ID trong baseline.
- `NFR-*` mô tả thuộc tính chất lượng có phép đo hoặc ghi rõ `TBD`, owner và điều kiện đóng.
- `UC-*` mô tả tương tác đầu-cuối ở cấp sản phẩm; backlog sẽ định nghĩa `US-*` và `AC-*` sau.
- Mọi liên kết tới artefact chưa được tạo được ghi `TBD — forward reference` và phải backfill trong reconciliation pass.
- Nội dung chưa xác định không được suy diễn thành cam kết; phải giữ nhãn `Assumption`, `TBD` hoặc `Open Question` cùng owner/tác động.

## 2. Mục tiêu sản phẩm

| Mục tiêu | Kết quả quan sát được | Business Requirement |
|---|---|---|
| Một nguồn dữ liệu điều hành | Lãnh đạo và PM drill-down từ portfolio tới record nguồn có owner, trạng thái, thời điểm dữ liệu và data scope | [BR-001](./02-BRD.md#br-001--quản-trị-portfolio-và-nhiều-tổ-chức-trên-một-nguồn-dữ-liệu), [BR-032](./02-BRD.md#br-032--điều-hành-dự-án-bằng-pm-command-center-và-health-score) |
| Thực thi EPC đầu-cuối | Opportunity, contract, design, procurement, construction, QA/HSE, commissioning và COD liên kết bằng ID ổn định | [BR-002](./02-BRD.md#br-002--quản-lý-pipeline-cơ-hội-có-owner-và-hành-động-tiếp-theo)–[BR-026](./02-BRD.md#br-026--quản-lý-cod-gate-và-bàn-giao-số-sang-om) |
| Kiểm soát doanh nghiệp | Phê duyệt, quyền, SoD, tài liệu, payment, audit và export không vượt tenant/legal entity/project/package scope | [BR-009](./02-BRD.md#br-009--quản-lý-hợp-đồng-và-chuỗi-phụ-lục-theo-dự-án), [BR-033](./02-BRD.md#br-033--kiểm-soát-quyền-đa-tenant-đa-pháp-nhân-và-xung-đột-lợi-ích)–[BR-035](./02-BRD.md#br-035--quản-lý-vòng-đời-tài-liệu-doanh-nghiệp) |
| Liên tục qua COD | Asset, serial, dossier, warranty, baseline và quyền bàn giao sang miền O&M có receipt và provenance | [BR-026](./02-BRD.md#br-026--quản-lý-cod-gate-và-bàn-giao-số-sang-om)–[BR-030](./02-BRD.md#br-030--quản-lý-billing-vận-hành-đối-soát-meter-và-report-bên-ngoài) |
| Nền tảng an toàn và mở rộng | Multi-tenant, tích hợp có SoR, khả năng phục hồi và OT read-only; AI có nguồn, confidence và human review | [BR-037](./02-BRD.md#br-037--tích-hợp-hệ-thống-theo-system-of-record-và-đối-soát)–[BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot) |

## 3. Phạm vi và ranh giới sản phẩm

| Miền | Sản phẩm chịu trách nhiệm | Ranh giới bắt buộc |
|---|---|---|
| PM Web | Portfolio, project controls, tài liệu, hợp đồng, cost, procurement, site, QA/QC, HSE, commissioning, COD, workflow và báo cáo quản trị | Không tạo/gửi/chuyển tiếp lệnh điều khiển OT/BESS |
| O&M monitoring | KPI, telemetry view, alarm triage, work order, maintenance, warranty, SLA và báo cáo vận hành | Là miền riêng; dữ liệu OT vào theo read-only; không mặc nhiên là control system |
| OT | SCADA, EMS, BMS, PCS, inverter, protection, meter, PLC/gateway và thiết bị hiện trường | Ngoài phạm vi điều khiển của PM Web; luồng mặc định `OT → gateway/DMZ → integration/time-series → O&M/PM` |

Mọi FR phải ghi rõ miền `PM`, `O&M monitoring`, `PM + O&M` hoặc `OT integration read-only`. Chức năng O&M/telemetry/Future không làm phát sinh write path “để dùng sau”.

## 4. Persona và Jobs to Be Done

| Persona/nhóm | JTBD chính | Giới hạn/data scope |
|---|---|---|
| Ban Giám đốc/Hội đồng đầu tư | Khi phân bổ vốn hoặc can thiệp, tôi cần thấy ngoại lệ portfolio, COD forecast, cash/risk và bằng chứng nguồn để quyết định có lý do | Portfolio/pháp nhân được giao; drill-down theo quyền |
| PMO/Project Manager/Project Controls | Khi điều hành hằng ngày, tôi cần ưu tiên action ảnh hưởng scope, schedule, cost, quality, safety và COD, giao owner và escalation | Dự án được giao; vẫn chịu SoD/field restriction |
| Finance/Kế toán/Treasury | Khi kiểm soát tiền, tôi cần đối chiếu budget, commitment, invoice/payment, VAT, FX và cashflow theo contract/pháp nhân | Legal entity/project/contract/cost code; không tự duyệt khoản mình tạo |
| Legal/Contract Manager | Khi quản trị cam kết, tôi cần truy vết contract–appendix, obligation, permit, guarantee, notice và claim tới bằng chứng | Legal entity/project/contract; trường privileged theo need-to-know |
| Chủ đầu tư/Khách hàng/Nhà đầu tư/Nhà tài trợ | Khi giám sát khoản đầu tư, tôi cần xem đúng tiến độ, COD, performance và nghĩa vụ đã được phê duyệt chia sẻ | Chỉ project/site/contract/report được cấp |
| Engineering/Design Manager | Khi phát hành thiết kế, tôi cần quản lý deliverable, calculation, BOM, RFI/TQ, interface, revision và trạng thái current-for-use | Discipline/project/package; tách người lập/reviewer/approver |
| Procurement/Supply Chain/Logistics | Khi sourcing/expediting, tôi cần nối nhu cầu–RFQ–evaluation–PO–FAT–shipment–delivery với need-by và recovery action | Gói mua được giao; bid/đánh giá nội bộ được cách ly |
| Site/Construction/QS | Khi làm việc hiện trường, tôi cần look-ahead, resource, quantity, nhật ký và bằng chứng ảnh/mobile kể cả offline | Zone/WBS/package được giao; signed record không sửa |
| QA/QC | Khi kiểm soát chất lượng, tôi cần thực thi ITP/inspection/hold point/NCR/punch và chỉ đóng khi có evidence | Project/package/system; independent verification khi yêu cầu |
| HSE | Khi kiểm soát công việc nguy hiểm, tôi cần PTW, inspection, toolbox, incident/near-miss, CAPA và stop-work | Site/zone; quyền dừng việc không bị workflow thương mại vô hiệu hóa |
| Commissioning | Khi đưa hệ thống vào vận hành, tôi cần systemization, prerequisite, test/retest, defect và COD package bất biến | System/subsystem; failed result không bị ghi đè |
| O&M/Asset Manager/Technician | Khi vận hành sau bàn giao, tôi cần KPI, alarm triage, WO, warranty, SLA và dossier gắn asset | Telemetry read-only; điều khiển chỉ trong hệ OT được phê duyệt |
| Nhà thầu phụ | Khi thực hiện package, tôi cần task, submittal, RFI, inspection và punch đúng phạm vi | Không xem package/register khác |
| Nhà cung cấp/OEM | Khi đáp ứng mua sắm/bảo hành, tôi cần RFQ, PO, submittal, FAT, shipment và case của mình | Không xem bid đối thủ, budget hoặc evaluation nội bộ |
| Tenant/Security/Integration Admin | Khi vận hành nền tảng, tôi cần quản lý identity, policy, connector và audit mà không mặc nhiên đọc dữ liệu kinh doanh | Privileged access có thời hạn/review/audit |
| Auditor/Internal Control | Khi kiểm tra, tôi cần bằng chứng read-only về quyền, quyết định, giao dịch, export và audit | Theo mandate; export nhạy cảm được kiểm soát |

## 5. Module và feature hierarchy

| Epic/cụm năng lực | Source module | FR sở hữu | Số FR | Ranh giới chính |
|---|---|---|---:|---|
| Portfolio, opportunity và project controls | `OPP`, `PFM`, `PRJ`, `RSK` | `FR-001…FR-025`, `FR-098…FR-105` | 33 | PM |
| Commercial, contract và cost | `CTR`, `CST` | `FR-036…FR-044`, `FR-053…FR-060` | 17 | PM + O&M theo contract/payment |
| Engineering Solar/BESS | `ENG`, `SOL`, `BES` | `FR-045…FR-052`, `FR-125…FR-137` | 21 | PM; seed bàn giao O&M |
| Document, workflow và identity governance | `DOC`, `WFL`, `IAM` | `FR-026…FR-035`, `FR-138…FR-155` | 28 | Dùng chung |
| Procurement và logistics | `PRC`, `LOG` | `FR-061…FR-074` | 14 | PM; seed asset/warranty |
| Site delivery, HSE và QA/QC | `CON`, `HSE`, `QAC` | `FR-075…FR-097` | 23 | PM + field PWA |
| Commissioning và COD | `COM` | `FR-106…FR-114` | 9 | PM → O&M handover |
| O&M monitoring | `OMM` | `FR-115…FR-124` | 10 | O&M riêng; OT read-only |
| Integration và AI có quản trị | `INT`, `AIX` | `FR-156…FR-198` | 43 | Dùng chung; AI/OT theo guardrail |

Feature hierarchy chuẩn là `Product → Epic/cụm năng lực → Source module → FR`. Epic/capability không được cấp một họ mã mới. Cross-module journey chỉ tham chiếu FR ở module sở hữu, không định nghĩa lại.

## 6. User journey cấp sản phẩm

| Journey | Trigger → kết quả | FR/module tham gia | Điểm kiểm soát |
|---|---|---|---|
| Cơ hội → dự án | Lead/survey/business case được gate duyệt → project master/baseline được tạo | OPP, PFM, PRJ, SOL/BES, CST | Assumption có version; người đề xuất không tự duyệt |
| Thiết kế → mua sắm | Design basis/deliverable/BOM được duyệt → requisition/RFQ/award/PO | ENG, DOC, PRC, CTR, CST, WFL | Current-for-use revision; SoD technical/commercial |
| Mua sắm → giao hàng | PO/manufacturing/FAT → shipment/receipt/serial/warranty seed | PRC, LOG, QAC, PRJ | Need-by/critical path; thiếu/hỏng/thay thế có exception |
| Hiện trường → nghiệm thu | Look-ahead/PTW/execution → quantity/inspection/NCR/punch/evidence | PRJ, CON, HSE, QAC, DOC | Stop-work/hold point; offline không ký/chốt trái quyền |
| Commissioning → COD | Systemization/prerequisite/test/retest → COD package và handover receipt | COM, QAC, ENG, HSE, CTR, DOC, OMM | Failed không ghi đè; mandatory gate có evidence/approval |
| COD → O&M monitoring | Asset/dossier/baseline được nhận → KPI/alarm/WO/warranty/SLA | OMM, SOL, BES, INT | OT read-only; source timestamp/quality/provenance |
| Ngoại lệ → quyết định | Risk/issue/change/claim/approval quá hạn → owner/action/decision/audit | RSK, WFL, IAM, PRJ, PFM | Deny/SoD/delegation; decision không xóa vật lý |
| AI hỗ trợ | Dữ liệu đủ quyền và use case được bật → draft/recommendation có nguồn/confidence | AIX, IAM, DOC/CTR/COM/PRJ | Human-in-the-loop; không tự duyệt/ký/pay/control |

## 7. Business rule và invariant tham chiếu

PRD áp dụng các business rule chuẩn tại [BRD mục 9](./02-BRD.md#9-business-rules-và-invariant-xuyên-domain). Các điểm bắt buộc trong mọi thiết kế sản phẩm gồm:

- tenant/legal entity/project/package scope và deny-by-default theo [BR-001](./02-BRD.md#br-001--quản-trị-portfolio-và-nhiều-tổ-chức-trên-một-nguồn-dữ-liệu), [BR-033](./02-BRD.md#br-033--kiểm-soát-quyền-đa-tenant-đa-pháp-nhân-và-xung-đột-lợi-ích);
- số hợp đồng duy nhất trong dự án, contract–appendix chain, stable legal ID/signed snapshot và `Payment.contractId` theo [BR-009](./02-BRD.md#br-009--quản-lý-hợp-đồng-và-chuỗi-phụ-lục-theo-dự-án)–[BR-011](./02-BRD.md#br-011--bảo-toàn-pháp-nhân-người-ký-và-lịch-sử-phê-duyệt-văn-bản);
- tiền dùng fixed decimal + currency + dated FX snapshot, không cộng trực tiếp khác currency theo [BR-007](./02-BRD.md#br-007--so-sánh-business-case-capexopex-và-hiệu-quả-đầu-tư), [BR-015](./02-BRD.md#br-015--kiểm-soát-sourcing-từ-nhu-cầu-đến-pohợp-đồng-mua);
- approved/signed/baseline/test result bất biến; sửa đổi tạo revision/run mới;
- PM Web không có API/nút/automation/AI tạo write path tới OT/BESS theo [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot).

Chi tiết security, state transition, persistence và wire contract thuộc tài liệu owner downstream; PRD không tự tạo `SEC-*`, `WF-*`, `DB-*` hoặc `API-*`.

## 8. Ưu tiên và chuẩn hóa release

Hai trường nguồn `MoSCoW` và `Roadmap` được giữ nguyên. Trường `Release chuẩn hóa` áp dụng thứ tự: Must/MVP → Should/Post-MVP → Could/Pilot → Future; hàng nêu cụ thể thắng dải tổng quát. Các source feature bị ma trận F.2 bỏ sót được xếp theo catalog:

- thêm `PRJ-004`, `PRJ-008`, `PRJ-009`, `CON-007…CON-010` vào MVP vì catalog ghi Must và là phần của điều hành/field/HSE/claim core;
- thêm `PRJ-007`, `PRJ-010`, `INT-021`, `AIX-007` vào Post-MVP theo catalog Should/GĐ1–2/P2;
- `PRJ-006` giữ Post-MVP vì ma trận F.2 nêu rõ dù catalog ghi Must.

| Release chuẩn hóa | Số FR | Ý nghĩa |
|---|---:|---|
| MVP | 110 | Điều kiện vận hành PM core hoặc nền tảng integrity/safety/security |
| Post-MVP | 31 | Giá trị cao, có quy trình thủ công/tích hợp thay thế có kiểm soát |
| Pilot | 10 | Non-production/pilot, human review, không chặn go-live |
| Future | 47 | Phụ thuộc OT/site data, lịch sử, model governance hoặc kiểm soát riêng |
| **Tổng** | **198** | Phải khớp danh mục FR |

Việc chuẩn hóa trên là `Assumption` cần Product Owner phê duyệt. Nó không sửa nhãn nguồn trong baseline.

## 9. Quy ước định nghĩa FR

Mỗi FR có: yêu cầu chuẩn tắc; Source ID và liên kết BR; actor/input/output; scope/boundary; permission; notification/audit/report/search-export/bulk applicability; ưu tiên nguồn/roadmap/release; owner; verification intent; trạng thái. `Verification intent` là mục tiêu kiểm chứng sản phẩm, không phải `AC-*` hoặc `TEST-*`.

## 10. Functional Requirements

### 10.1. Portfolio, opportunity và project controls

#### OPP — Opportunity

<a id="fr-001"></a>
### FR-001 — Hồ sơ lead, khách hàng, nhà máy và địa điểm; tránh mất lịch sử trao đổi và trùng cơ hội

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Hồ sơ lead, khách hàng, nhà máy và địa điểm; tránh mất lịch sử trao đổi và trùng cơ hội. Từ Khách hàng, nhà máy, vị trí, pháp nhân, nguồn lead, nhu cầu, hệ thống phải tạo Opportunity pipeline, owner, stage, next action cho BD, PMO trong đúng data scope.
- **Truy vết:** Source: `OPP-001`; Business Requirement: [BR-002](./02-BRD.md#br-002--quản-lý-pipeline-cơ-hội-có-owner-và-hành-động-tiếp-theo).
- **Phạm vi sản phẩm:** Actor/persona — BD, PMO; phạm vi — Dùng chung; boundary — PM; input — Khách hàng, nhà máy, vị trí, pháp nhân, nguồn lead, nhu cầu; output — Opportunity pipeline, owner, stage, next action.
- **Kiểm soát sản phẩm:** Permission — BD tạo/sửa; lãnh đạo xem tất cả; khách hàng chỉ xem bản chia sẻ; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R1; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — BD, PMO (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Opportunity pipeline, owner, stage, next action, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-002"></a>
### FR-002 — Khảo sát hiện trạng và điểm đấu nối có checklist; chuẩn hóa dữ liệu mái, đất, trạm điện

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Khảo sát hiện trạng và điểm đấu nối có checklist; chuẩn hóa dữ liệu mái, đất, trạm điện. Từ Hình ảnh, tọa độ, kích thước, tải mái/đất, SLD hiện hữu, transformer/RMU/meter, hệ thống phải tạo Survey pack, constraint log, điểm đấu nối đề xuất cho Survey, Engineering trong đúng data scope.
- **Truy vết:** Source: `OPP-002`; Business Requirement: [BR-003](./02-BRD.md#br-003--chuẩn-hóa-khảo-sát-site-và-điểm-đấu-nối).
- **Phạm vi sản phẩm:** Actor/persona — Survey, Engineering; phạm vi — Dùng chung; boundary — PM; input — Hình ảnh, tọa độ, kích thước, tải mái/đất, SLD hiện hữu, transformer/RMU/meter; output — Survey pack, constraint log, điểm đấu nối đề xuất.
- **Kiểm soát sản phẩm:** Permission — Survey ghi; kỹ sư kiểm tra; Design Manager duyệt; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R1; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Survey, Engineering (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Survey pack, constraint log, điểm đấu nối đề xuất, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-003"></a>
### FR-003 — Hồ sơ tiêu thụ điện và hóa đơn; loại bỏ nhập tay phân tán

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Hồ sơ tiêu thụ điện và hóa đơn; loại bỏ nhập tay phân tán. Từ Hóa đơn, biểu giá, công tơ, load 15/30/60 phút, kỳ giờ cao/bình/thấp, hệ thống phải tạo Load profile giờ/ngày/tháng, baseline mua điện, data-quality report cho BD, Energy Analyst, Finance trong đúng data scope.
- **Truy vết:** Source: `OPP-003`; Business Requirement: [BR-004](./02-BRD.md#br-004--quản-lý-hóa-đơn-điện-và-hồ-sơ-phụ-tải-có-chất-lượng-dữ-liệu).
- **Phạm vi sản phẩm:** Actor/persona — BD, Energy Analyst, Finance; phạm vi — Dùng chung; boundary — PM; input — Hóa đơn, biểu giá, công tơ, load 15/30/60 phút, kỳ giờ cao/bình/thấp; output — Load profile giờ/ngày/tháng, baseline mua điện, data-quality report.
- **Kiểm soát sản phẩm:** Permission — Analyst nhập/xác nhận; Finance phê duyệt baseline giá; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R1; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — BD, Energy Analyst, Finance (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Load profile giờ/ngày/tháng, baseline mua điện, data-quality report, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-004"></a>
### FR-004 — Quản lý bức xạ, PVSyst và dự báo sản lượng có phiên bản

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Quản lý bức xạ, PVSyst và dự báo sản lượng có phiên bản. Từ Meteo, shading, PVSyst file/result, loss assumptions, hệ thống phải tạo Yield scenario, P50/P90 nếu có, nguồn/phiên bản giả định cho Solar Engineer trong đúng data scope.
- **Truy vết:** Source: `OPP-004`; Business Requirement: [BR-005](./02-BRD.md#br-005--quản-lý-phương-án-yield-và-sizing-solar-có-version).
- **Phạm vi sản phẩm:** Actor/persona — Solar Engineer; phạm vi — Solar; boundary — PM; input — Meteo, shading, PVSyst file/result, loss assumptions; output — Yield scenario, P50/P90 nếu có, nguồn/phiên bản giả định.
- **Kiểm soát sản phẩm:** Permission — Kỹ sư tạo; reviewer xác nhận; approver phát hành; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R1; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Solar Engineer (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Yield scenario, P50/P90 nếu có, nguồn/phiên bản giả định, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-005"></a>
### FR-005 — Sizing và so sánh phương án Solar; chứng minh công suất đề xuất phù hợp tải/mặt bằng

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Sizing và so sánh phương án Solar; chứng minh công suất đề xuất phù hợp tải/mặt bằng. Từ Diện tích, load, giới hạn đấu nối, DC/AC ratio, thiết bị, yield, hệ thống phải tạo Các option kWp/MWp, self-consumption, export, CAPEX sơ bộ cho Solar Engineer, Investment trong đúng data scope.
- **Truy vết:** Source: `OPP-005`; Business Requirement: [BR-005](./02-BRD.md#br-005--quản-lý-phương-án-yield-và-sizing-solar-có-version).
- **Phạm vi sản phẩm:** Actor/persona — Solar Engineer, Investment; phạm vi — Solar; boundary — PM; input — Diện tích, load, giới hạn đấu nối, DC/AC ratio, thiết bị, yield; output — Các option kWp/MWp, self-consumption, export, CAPEX sơ bộ.
- **Kiểm soát sản phẩm:** Permission — Kỹ sư tính; Hội đồng đầu tư duyệt option; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R1; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Solar Engineer, Investment (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Các option kWp/MWp, self-consumption, export, CAPEX sơ bộ, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-006"></a>
### FR-006 — Sizing BESS theo peak shaving, load shifting, self-consumption và backup

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Sizing BESS theo peak shaving, load shifting, self-consumption và backup. Từ Load, tariff, outage, peak limit, SOC window, DoD, efficiency, degradation, hệ thống phải tạo Option MW/MWh, dispatch mô phỏng, peak cut, backup hours, cycle estimate cho BESS Engineer, Energy Analyst trong đúng data scope.
- **Truy vết:** Source: `OPP-006`; Business Requirement: [BR-006](./02-BRD.md#br-006--quản-lý-sizing-bess-theo-use-case-và-constraint).
- **Phạm vi sản phẩm:** Actor/persona — BESS Engineer, Energy Analyst; phạm vi — BESS; boundary — PM; input — Load, tariff, outage, peak limit, SOC window, DoD, efficiency, degradation; output — Option MW/MWh, dispatch mô phỏng, peak cut, backup hours, cycle estimate.
- **Kiểm soát sản phẩm:** Permission — Kỹ sư tạo; reviewer xác nhận constraint an toàn; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R1; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — BESS Engineer, Energy Analyst (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Option MW/MWh, dispatch mô phỏng, peak cut, backup hours, cycle estimate, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-007"></a>
### FR-007 — Mô hình tài chính nhiều phương án; tránh so sánh CAPEX/OPEX/doanh thu bằng file khác phiên bản

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Mô hình tài chính nhiều phương án; tránh so sánh CAPEX/OPEX/doanh thu bằng file khác phiên bản. Từ CAPEX, OPEX, tariff, sản lượng, degradation, lease/PPA, tax, discount rate, hệ thống phải tạo Cashflow, IRR, NPV, payback, sensitivity và bảng giả định cho Finance, Investment, BD trong đúng data scope.
- **Truy vết:** Source: `OPP-007`; Business Requirement: [BR-007](./02-BRD.md#br-007--so-sánh-business-case-capexopex-và-hiệu-quả-đầu-tư).
- **Phạm vi sản phẩm:** Actor/persona — Finance, Investment, BD; phạm vi — Dùng chung; boundary — PM; input — CAPEX, OPEX, tariff, sản lượng, degradation, lease/PPA, tax, discount rate; output — Cashflow, IRR, NPV, payback, sensitivity và bảng giả định.
- **Kiểm soát sản phẩm:** Permission — Finance quản lý model; approver khóa phiên bản; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R1; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Finance, Investment, BD (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Cashflow, IRR, NPV, payback, sensitivity và bảng giả định, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-008"></a>
### FR-008 — Phiên bản đề xuất kỹ thuật/thương mại và so sánh option

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Phiên bản đề xuất kỹ thuật/thương mại và so sánh option. Từ Scenario, scope, exclusions, pricing, terms, tài liệu mẫu, hệ thống phải tạo Proposal revision, comparison, approval status, bản phát hành cho BD, Engineering, Legal trong đúng data scope.
- **Truy vết:** Source: `OPP-008`; Business Requirement: [BR-008](./02-BRD.md#br-008--kiểm-soát-phiên-bản-proposal-và-investment-gate).
- **Phạm vi sản phẩm:** Actor/persona — BD, Engineering, Legal; phạm vi — Dùng chung; boundary — PM; input — Scenario, scope, exclusions, pricing, terms, tài liệu mẫu; output — Proposal revision, comparison, approval status, bản phát hành.
- **Kiểm soát sản phẩm:** Permission — Người lập/reviewer/approver tách biệt; bản phát hành bị khóa; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R1; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — BD, Engineering, Legal (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Proposal revision, comparison, approval status, bản phát hành, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-009"></a>
### FR-009 — Gate phê duyệt cơ hội/đầu tư có điều kiện; tránh chuyển EPC khi thiếu giả định trọng yếu

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Gate phê duyệt cơ hội/đầu tư có điều kiện; tránh chuyển EPC khi thiếu giả định trọng yếu. Từ Business case, risk, technical option, legal/commercial conditions, hệ thống phải tạo Go/No-Go/Hold/Conditional Go, decision log, action tiên quyết cho Sponsor, Investment Committee, PMO trong đúng data scope.
- **Truy vết:** Source: `OPP-009`; Business Requirement: [BR-008](./02-BRD.md#br-008--kiểm-soát-phiên-bản-proposal-và-investment-gate).
- **Phạm vi sản phẩm:** Actor/persona — Sponsor, Investment Committee, PMO; phạm vi — Dùng chung; boundary — PM; input — Business case, risk, technical option, legal/commercial conditions; output — Go/No-Go/Hold/Conditional Go, decision log, action tiên quyết.
- **Kiểm soát sản phẩm:** Permission — Hội đồng theo ngưỡng giá trị; người đề xuất không tự duyệt; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R1; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Sponsor, Investment Committee, PMO (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Go/No-Go/Hold/Conditional Go, decision log, action tiên quyết, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

#### PFM — Portfolio/điều hành

<a id="fr-010"></a>
### FR-010 — Project/portfolio master theo khách hàng, nhà máy, pháp nhân, model đầu tư, công nghệ và phase

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Project/portfolio master theo khách hàng, nhà máy, pháp nhân, model đầu tư, công nghệ và phase. Từ Project code, site, capacity, customer, entity, EPC/PPA/ESCO/lease model, hệ thống phải tạo Danh mục dự án duy nhất, hierarchy/filter, capacity pipeline cho PMO, Admin, lãnh đạo trong đúng data scope.
- **Truy vết:** Source: `PFM-001`; Business Requirement: [BR-001](./02-BRD.md#br-001--quản-trị-portfolio-và-nhiều-tổ-chức-trên-một-nguồn-dữ-liệu), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — PMO, Admin, lãnh đạo; phạm vi — Dùng chung; boundary — PM + O&M; input — Project code, site, capacity, customer, entity, EPC/PPA/ESCO/lease model; output — Danh mục dự án duy nhất, hierarchy/filter, capacity pipeline.
- **Kiểm soát sản phẩm:** Permission — Admin tạo master; PMO activate/archive; người dùng chỉ thấy scope được cấp; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — PMO, Admin, lãnh đạo (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Danh mục dự án duy nhất, hierarchy/filter, capacity pipeline, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-011"></a>
### FR-011 — Executive Portfolio Dashboard ưu tiên COD, vốn, cashflow và risk

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Executive Portfolio Dashboard ưu tiên COD, vốn, cashflow và risk. Từ Dữ liệu dự án đã chuẩn hóa, health, forecast, risk, hệ thống phải tạo KPI/heatmap/trend, top exception, drill-down đến nguồn cho Ban Giám đốc, PMO, Finance trong đúng data scope.
- **Truy vết:** Source: `PFM-002`; Business Requirement: [BR-001](./02-BRD.md#br-001--quản-trị-portfolio-và-nhiều-tổ-chức-trên-một-nguồn-dữ-liệu), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-036](./02-BRD.md#br-036--cung-cấp-dashboard-theo-vai-trò-và-báo-cáo-snapshot-có-kiểm-soát), [BR-039](./02-BRD.md#br-039--cung-cấp-trải-nghiệm-doanh-nghiệp-đa-vai-trò-và-responsive).
- **Phạm vi sản phẩm:** Actor/persona — Ban Giám đốc, PMO, Finance; phạm vi — Dùng chung; boundary — PM + O&M; input — Dữ liệu dự án đã chuẩn hóa, health, forecast, risk; output — KPI/heatmap/trend, top exception, drill-down đến nguồn.
- **Kiểm soát sản phẩm:** Permission — Chỉ tổng hợp từ dự án được xem; field nhạy cảm theo legal entity; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Ban Giám đốc, PMO, Finance (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được KPI/heatmap/trend, top exception, drill-down đến nguồn, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-012"></a>
### FR-012 — PM Command Center một trang cho việc phải xử lý hôm nay

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ PM Command Center một trang cho việc phải xử lý hôm nay. Từ Schedule, approval, documents, procurement, cost, risk, NCR/punch, COD, hệ thống phải tạo Action queue, health, top blocker, owner, deep-link cho PM, Deputy PM, PMO trong đúng data scope.
- **Truy vết:** Source: `PFM-003`; Business Requirement: [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-032](./02-BRD.md#br-032--điều-hành-dự-án-bằng-pm-command-center-và-health-score), [BR-036](./02-BRD.md#br-036--cung-cấp-dashboard-theo-vai-trò-và-báo-cáo-snapshot-có-kiểm-soát), [BR-039](./02-BRD.md#br-039--cung-cấp-trải-nghiệm-doanh-nghiệp-đa-vai-trò-và-responsive).
- **Phạm vi sản phẩm:** Actor/persona — PM, Deputy PM, PMO; phạm vi — Dùng chung; boundary — PM; input — Schedule, approval, documents, procurement, cost, risk, NCR/punch, COD; output — Action queue, health, top blocker, owner, deep-link.
- **Kiểm soát sản phẩm:** Permission — PM quản lý dự án nhưng approval chịu SoD; widget lọc theo scope; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — PM, Deputy PM, PMO (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Action queue, health, top blocker, owner, deep-link, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-013"></a>
### FR-013 — Project Health Score có công thức, confidence và hard-cap giải thích được

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Project Health Score có công thức, confidence và hard-cap giải thích được. Từ 8 dimension score, weight, data completeness, critical events, hệ thống phải tạo Raw/final score, màu, confidence, reason list, history cho PM, lãnh đạo, Auditor trong đúng data scope.
- **Truy vết:** Source: `PFM-004`; Business Requirement: [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-032](./02-BRD.md#br-032--điều-hành-dự-án-bằng-pm-command-center-và-health-score), [BR-036](./02-BRD.md#br-036--cung-cấp-dashboard-theo-vai-trò-và-báo-cáo-snapshot-có-kiểm-soát), [BR-039](./02-BRD.md#br-039--cung-cấp-trải-nghiệm-doanh-nghiệp-đa-vai-trò-và-responsive).
- **Phạm vi sản phẩm:** Actor/persona — PM, lãnh đạo, Auditor; phạm vi — Dùng chung; boundary — PM; input — 8 dimension score, weight, data completeness, critical events; output — Raw/final score, màu, confidence, reason list, history.
- **Kiểm soát sản phẩm:** Permission — Policy admin version hóa trọng số; người dùng không sửa điểm tay; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — PM, lãnh đạo, Auditor (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Raw/final score, màu, confidence, reason list, history, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-014"></a>
### FR-014 — Report Center với template, lịch phát hành, Excel/PDF và snapshot

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Report Center với template, lịch phát hành, Excel/PDF và snapshot. Từ Report template, scope/filter, period, recipient, approval, hệ thống phải tạo Draft/approved report, distribution log, immutable snapshot cho PMO, chức năng, customer/investor trong đúng data scope.
- **Truy vết:** Source: `PFM-005`; Business Requirement: [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-036](./02-BRD.md#br-036--cung-cấp-dashboard-theo-vai-trò-và-báo-cáo-snapshot-có-kiểm-soát), [BR-039](./02-BRD.md#br-039--cung-cấp-trải-nghiệm-doanh-nghiệp-đa-vai-trò-và-responsive).
- **Phạm vi sản phẩm:** Actor/persona — PMO, chức năng, customer/investor; phạm vi — Dùng chung; boundary — PM + O&M; input — Report template, scope/filter, period, recipient, approval; output — Draft/approved report, distribution log, immutable snapshot.
- **Kiểm soát sản phẩm:** Permission — Người lập/duyệt tách theo policy; recipient chỉ nhận scope được phép; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Có preview, validation và kiểm quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — PMO, chức năng, customer/investor (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Draft/approved report, distribution log, immutable snapshot, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-015"></a>
### FR-015 — Notification Center: inbox, digest, subscription, acknowledge và escalation

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Notification Center: inbox, digest, subscription, acknowledge và escalation. Từ Event, severity, owner, deadline, preference/channel, hệ thống phải tạo In-app alert, email/SMS/Zalo tùy policy, delivery/ack log cho Tất cả người dùng trong đúng data scope.
- **Truy vết:** Source: `PFM-006`; Business Requirement: [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-036](./02-BRD.md#br-036--cung-cấp-dashboard-theo-vai-trò-và-báo-cáo-snapshot-có-kiểm-soát), [BR-039](./02-BRD.md#br-039--cung-cấp-trải-nghiệm-doanh-nghiệp-đa-vai-trò-và-responsive).
- **Phạm vi sản phẩm:** Actor/persona — Tất cả người dùng; phạm vi — Dùng chung; boundary — PM + O&M; input — Event, severity, owner, deadline, preference/channel; output — In-app alert, email/SMS/Zalo tùy policy, delivery/ack log.
- **Kiểm soát sản phẩm:** Permission — Không cho mute cảnh báo critical bắt buộc; dữ liệu thông báo theo scope; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Tất cả người dùng (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được In-app alert, email/SMS/Zalo tùy policy, delivery/ack log, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

#### PRJ — Project controls

<a id="fr-016"></a>
### FR-016 — Project charter, phạm vi, stage/gate và owner; tạo “xương sống” thống nhất từ NTP đến COD

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Project charter, phạm vi, stage/gate và owner; tạo “xương sống” thống nhất từ NTP đến COD. Từ Contract scope, mục tiêu, organization, dates, gate criteria, hệ thống phải tạo Project master, charter, phase/gate status, RACI seed cho PM, Sponsor, PMO trong đúng data scope.
- **Truy vết:** Source: `PRJ-001`; Business Requirement: [BR-001](./02-BRD.md#br-001--quản-trị-portfolio-và-nhiều-tổ-chức-trên-một-nguồn-dữ-liệu), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — PM, Sponsor, PMO; phạm vi — Dùng chung; boundary — PM; input — Contract scope, mục tiêu, organization, dates, gate criteria; output — Project master, charter, phase/gate status, RACI seed.
- **Kiểm soát sản phẩm:** Permission — PM quản lý; Sponsor duyệt gate; tenant admin không tự sửa dữ liệu dự án; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — PM, Sponsor, PMO (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Project master, charter, phase/gate status, RACI seed, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-017"></a>
### FR-017 — WBS, milestone, dependency, Gantt và baseline; thay thế lịch rời rạc

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ WBS, milestone, dependency, Gantt và baseline; thay thế lịch rời rạc. Từ Scope/WBS, activity, duration, predecessor, resource, calendar, hệ thống phải tạo Baseline/current schedule, critical path, milestone variance, SPI cho PM, Scheduler, workstream lead trong đúng data scope.
- **Truy vết:** Source: `PRJ-002`; Business Requirement: [BR-018](./02-BRD.md#br-018--quản-lý-wbs-baseline-look-ahead-và-khối-lượng), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-039](./02-BRD.md#br-039--cung-cấp-trải-nghiệm-doanh-nghiệp-đa-vai-trò-và-responsive).
- **Phạm vi sản phẩm:** Actor/persona — PM, Scheduler, workstream lead; phạm vi — Dùng chung; boundary — PM; input — Scope/WBS, activity, duration, predecessor, resource, calendar; output — Baseline/current schedule, critical path, milestone variance, SPI.
- **Kiểm soát sản phẩm:** Permission — Scheduler cập nhật; PM phê duyệt baseline; rebaseline cần workflow; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — PM, Scheduler, workstream lead (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Baseline/current schedule, critical path, milestone variance, SPI, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-018"></a>
### FR-018 — Task, kế hoạch ngày/tuần/look-ahead và phần trăm hoàn thành

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Task, kế hoạch ngày/tuần/look-ahead và phần trăm hoàn thành. Từ Task, owner, planned date, quantity, constraint, evidence, hệ thống phải tạo Board/list/calendar, daily/weekly plan, overdue/blocked action cho Site, PM, các workstream trong đúng data scope.
- **Truy vết:** Source: `PRJ-003`; Business Requirement: [BR-018](./02-BRD.md#br-018--quản-lý-wbs-baseline-look-ahead-và-khối-lượng), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-039](./02-BRD.md#br-039--cung-cấp-trải-nghiệm-doanh-nghiệp-đa-vai-trò-và-responsive).
- **Phạm vi sản phẩm:** Actor/persona — Site, PM, các workstream; phạm vi — Dùng chung; boundary — PM; input — Task, owner, planned date, quantity, constraint, evidence; output — Board/list/calendar, daily/weekly plan, overdue/blocked action.
- **Kiểm soát sản phẩm:** Permission — Owner cập nhật; lead xác nhận progress; PM bulk assign trong dự án; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Site, PM, các workstream (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Board/list/calendar, daily/weekly plan, overdue/blocked action, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-019"></a>
### FR-019 — Project Overview, dependency và decision log; tránh quyết định trong email không truy vết

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Project Overview, dependency và decision log; tránh quyết định trong email không truy vết. Từ Milestone, KPI, dependency, decision request/evidence, hệ thống phải tạo Tổng quan dự án, dependency map, quyết định có người/ngày/lý do cho PM, lãnh đạo, workstream trong đúng data scope.
- **Truy vết:** Source: `PRJ-004`; Business Requirement: [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-039](./02-BRD.md#br-039--cung-cấp-trải-nghiệm-doanh-nghiệp-đa-vai-trò-và-responsive).
- **Phạm vi sản phẩm:** Actor/persona — PM, lãnh đạo, workstream; phạm vi — Dùng chung; boundary — PM; input — Milestone, KPI, dependency, decision request/evidence; output — Tổng quan dự án, dependency map, quyết định có người/ngày/lý do.
- **Kiểm soát sản phẩm:** Permission — PM tạo; approver ghi quyết định; bản quyết định không bị xóa vật lý; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — PM, lãnh đạo, workstream (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Tổng quan dự án, dependency map, quyết định có người/ngày/lý do, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-020"></a>
### FR-020 — Meeting, biên bản, quyết định và action item liên kết task/issue

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Meeting, biên bản, quyết định và action item liên kết task/issue. Từ Agenda, attendee, note, recording/transcript nếu cho phép, hệ thống phải tạo Minutes revision, decision, action owner/deadline, distribution cho PM, các bên họp trong đúng data scope.
- **Truy vết:** Source: `PRJ-005`; Business Requirement: [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — PM, các bên họp; phạm vi — Dùng chung; boundary — PM + O&M; input — Agenda, attendee, note, recording/transcript nếu cho phép; output — Minutes revision, decision, action owner/deadline, distribution.
- **Kiểm soát sản phẩm:** Permission — Organizer lập; chair duyệt; bên ngoài chỉ thấy minutes được phát hành; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R1; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — PM, các bên họp (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Minutes revision, decision, action owner/deadline, distribution, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-021"></a>
### FR-021 — Contact, stakeholder, company role và RACI theo dự án/gói thầu

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Contact, stakeholder, company role và RACI theo dự án/gói thầu. Từ Company/contact, department, project role, package, availability, hệ thống phải tạo Stakeholder directory, RACI, notification routing cho PM, Legal, Procurement, Admin trong đúng data scope.
- **Truy vết:** Source: `PRJ-006`; Business Requirement: [BR-002](./02-BRD.md#br-002--quản-lý-pipeline-cơ-hội-có-owner-và-hành-động-tiếp-theo), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — PM, Legal, Procurement, Admin; phạm vi — Dùng chung; boundary — PM + O&M; input — Company/contact, department, project role, package, availability; output — Stakeholder directory, RACI, notification routing.
- **Kiểm soát sản phẩm:** Permission — Vai trò công ty chọn từ catalog; không nhập tự do khi catalog đã có; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — PM, Legal, Procurement, Admin (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Stakeholder directory, RACI, notification routing, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-022"></a>
### FR-022 — Correspondence register cho thư chính thức, site memo và phản hồi

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Correspondence register cho thư chính thức, site memo và phản hồi. Từ Sender/recipient, subject, reference, due date, document, hệ thống phải tạo Correspondence log, response SLA, linked obligation/issue cho PM, Document Controller, Legal trong đúng data scope.
- **Truy vết:** Source: `PRJ-007`; Business Requirement: [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — PM, Document Controller, Legal; phạm vi — Dùng chung; boundary — PM; input — Sender/recipient, subject, reference, due date, document; output — Correspondence log, response SLA, linked obligation/issue.
- **Kiểm soát sản phẩm:** Permission — Document Controller phát hành; người nhận phản hồi trong scope; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R1; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — PM, Document Controller, Legal (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Correspondence log, response SLA, linked obligation/issue, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-023"></a>
### FR-023 — PWA hiện trường với offline queue, camera, QR và chống ghi trùng

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ PWA hiện trường với offline queue, camera, QR và chống ghi trùng. Từ Form/cache được cấp quyền, ảnh, QR, geotag, client timestamp, hệ thống phải tạo Draft offline, sync receipt, conflict record, audit cho Site, HSE, QA/QC, commissioning trong đúng data scope.
- **Truy vết:** Source: `PRJ-008`; Business Requirement: [BR-019](./02-BRD.md#br-019--ghi-nhận-nhật-ký-nguồn-lực-vật-tư-và-bằng-chứng-hiện-trường), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-039](./02-BRD.md#br-039--cung-cấp-trải-nghiệm-doanh-nghiệp-đa-vai-trò-và-responsive).
- **Phạm vi sản phẩm:** Actor/persona — Site, HSE, QA/QC, commissioning; phạm vi — Dùng chung; boundary — PM + O&M; input — Form/cache được cấp quyền, ảnh, QR, geotag, client timestamp; output — Draft offline, sync receipt, conflict record, audit.
- **Kiểm soát sản phẩm:** Permission — Chỉ cache dữ liệu tối thiểu; revoke xóa cache lần kết nối sau; xung đột không ghi đè im lặng; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Site, HSE, QA/QC, commissioning (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Draft offline, sync receipt, conflict record, audit, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-024"></a>
### FR-024 — Tìm kiếm toàn hệ thống, bộ lọc nâng cao, saved view và deep-link

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Tìm kiếm toàn hệ thống, bộ lọc nâng cao, saved view và deep-link. Từ Search text, metadata, module, project, status, date, owner, hệ thống phải tạo Kết quả theo quyền, saved view cá nhân/nhóm, URL chia sẻ nội bộ cho Tất cả người dùng trong đúng data scope.
- **Truy vết:** Source: `PRJ-009`; Business Requirement: [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Tất cả người dùng; phạm vi — Dùng chung; boundary — PM + O&M; input — Search text, metadata, module, project, status, date, owner; output — Kết quả theo quyền, saved view cá nhân/nhóm, URL chia sẻ nội bộ.
- **Kiểm soát sản phẩm:** Permission — Search áp permission trước khi trả kết quả/snippet; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Tất cả người dùng (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Kết quả theo quyền, saved view cá nhân/nhóm, URL chia sẻ nội bộ, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-025"></a>
### FR-025 — Template dự án và thao tác bulk có preview/validation

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Template dự án và thao tác bulk có preview/validation. Từ Project type, WBS/folder/workflow/report templates, selected rows, hệ thống phải tạo Project setup chuẩn, bulk assignment/status update, error report cho PMO, PM, admin chức năng trong đúng data scope.
- **Truy vết:** Source: `PRJ-010`; Business Requirement: [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — PMO, PM, admin chức năng; phạm vi — Dùng chung; boundary — PM + O&M; input — Project type, WBS/folder/workflow/report templates, selected rows; output — Project setup chuẩn, bulk assignment/status update, error report.
- **Kiểm soát sản phẩm:** Permission — Template publish cần admin; bulk action không vượt quyền từng bản ghi; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Có preview, validation và kiểm quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R1; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — PMO, PM, admin chức năng (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Project setup chuẩn, bulk assignment/status update, error report, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

#### RSK — Risk/issue/change

<a id="fr-098"></a>
### FR-098 — Risk register với cause–event–impact, xác suất, tác động và owner

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Risk register với cause–event–impact, xác suất, tác động và owner. Từ Category, cause/event/impact, probability, cost/schedule/HSE impact, hệ thống phải tạo Inherent score, heatmap, priority, risk owner cho PM, risk owner, lãnh đạo trong đúng data scope.
- **Truy vết:** Source: `RSK-001`; Business Requirement: [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — PM, risk owner, lãnh đạo; phạm vi — Dùng chung; boundary — PM + O&M; input — Category, cause/event/impact, probability, cost/schedule/HSE impact; output — Inherent score, heatmap, priority, risk owner.
- **Kiểm soát sản phẩm:** Permission — Mọi lead đề xuất; PM/risk manager chuẩn hóa; owner cập nhật; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — PM, risk owner, lãnh đạo (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Inherent score, heatmap, priority, risk owner, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-099"></a>
### FR-099 — Response plan, trigger, contingency và residual risk

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Response plan, trigger, contingency và residual risk. Từ Avoid/mitigate/transfer/accept action, trigger, budget, due date, hệ thống phải tạo Response actions, residual score, contingency usage cho Risk owner, PM, Finance trong đúng data scope.
- **Truy vết:** Source: `RSK-002`; Business Requirement: [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Risk owner, PM, Finance; phạm vi — Dùng chung; boundary — PM + O&M; input — Avoid/mitigate/transfer/accept action, trigger, budget, due date; output — Response actions, residual score, contingency usage.
- **Kiểm soát sản phẩm:** Permission — Accept high risk cần đúng authority; action owner không tự đóng nếu cần verify; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Risk owner, PM, Finance (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Response actions, residual score, contingency usage, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-100"></a>
### FR-100 — Issue register cho sự kiện đã xảy ra, root cause, decision và escalation

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Issue register cho sự kiện đã xảy ra, root cause, decision và escalation. Từ Issue, severity, impact, owner, target, linked risk, hệ thống phải tạo Aging, action/decision log, resolved/closed evidence cho PM, workstream lead trong đúng data scope.
- **Truy vết:** Source: `RSK-003`; Business Requirement: [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — PM, workstream lead; phạm vi — Dùng chung; boundary — PM + O&M; input — Issue, severity, impact, owner, target, linked risk; output — Aging, action/decision log, resolved/closed evidence.
- **Kiểm soát sản phẩm:** Permission — PM phân loại; owner resolve; verifier đóng; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — PM, workstream lead (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Aging, action/decision log, resolved/closed evidence, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-101"></a>
### FR-101 — Change request và đánh giá ảnh hưởng scope–schedule–cost–quality–HSE–contract

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Change request và đánh giá ảnh hưởng scope–schedule–cost–quality–HSE–contract. Từ Baseline reference, reason, options, quantified impact, hệ thống phải tạo Impact assessment, recommendation, approval package cho Requester, PM, Engineering, Cost, Legal trong đúng data scope.
- **Truy vết:** Source: `RSK-004`; Business Requirement: [BR-022](./02-BRD.md#br-022--quản-lý-rfi-site-instruction-variation-và-claim-có-thời-hạn), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Requester, PM, Engineering, Cost, Legal; phạm vi — Dùng chung; boundary — PM; input — Baseline reference, reason, options, quantified impact; output — Impact assessment, recommendation, approval package.
- **Kiểm soát sản phẩm:** Permission — Requester không tự duyệt; reviewer liên ngành bắt buộc theo impact; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Requester, PM, Engineering, Cost, Legal (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Impact assessment, recommendation, approval package, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-102"></a>
### FR-102 — Variation Order và baseline update sau phê duyệt

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Variation Order và baseline update sau phê duyệt. Từ Approved change, contract clause, value, time extension, hệ thống phải tạo VO/amendment, revised budget/schedule/scope, traceability cho PM, Legal, Cost, Scheduler trong đúng data scope.
- **Truy vết:** Source: `RSK-005`; Business Requirement: [BR-022](./02-BRD.md#br-022--quản-lý-rfi-site-instruction-variation-và-claim-có-thời-hạn), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — PM, Legal, Cost, Scheduler; phạm vi — Dùng chung; boundary — PM; input — Approved change, contract clause, value, time extension; output — VO/amendment, revised budget/schedule/scope, traceability.
- **Kiểm soát sản phẩm:** Permission — Chỉ authorized signatory commit; baseline chỉ đổi sau effective approval; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — PM, Legal, Cost, Scheduler (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được VO/amendment, revised budget/schedule/scope, traceability, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-103"></a>
### FR-103 — Claim/notice deadline, quantum, evidence và negotiation status

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Claim/notice deadline, quantum, evidence và negotiation status. Từ Event notice, clause, contemporary record, cost/time analysis, hệ thống phải tạo Notice, claim dossier, response, settlement/decision cho Legal, PM, Cost, Site trong đúng data scope.
- **Truy vết:** Source: `RSK-006`; Business Requirement: [BR-022](./02-BRD.md#br-022--quản-lý-rfi-site-instruction-variation-và-claim-có-thời-hạn), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Legal, PM, Cost, Site; phạm vi — Dùng chung; boundary — PM; input — Event notice, clause, contemporary record, cost/time analysis; output — Notice, claim dossier, response, settlement/decision.
- **Kiểm soát sản phẩm:** Permission — Legal phát hành claim; package access; legal privilege classification; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Legal, PM, Cost, Site (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Notice, claim dossier, response, settlement/decision, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-104"></a>
### FR-104 — Dashboard risk–issue–change–claim và liên kết COD/Health Score

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Dashboard risk–issue–change–claim và liên kết COD/Health Score. Từ Register/action/impact data, hệ thống phải tạo Top exposure, aging, trend, COD impact, decision queue cho PM, lãnh đạo trong đúng data scope.
- **Truy vết:** Source: `RSK-007`; Business Requirement: [BR-022](./02-BRD.md#br-022--quản-lý-rfi-site-instruction-variation-và-claim-có-thời-hạn), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — PM, lãnh đạo; phạm vi — Dùng chung; boundary — PM + O&M; input — Register/action/impact data; output — Top exposure, aging, trend, COD impact, decision queue.
- **Kiểm soát sản phẩm:** Permission — Theo project/legal entity; claimant-sensitive fields hạn chế; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — PM, lãnh đạo (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Top exposure, aging, trend, COD impact, decision queue, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-105"></a>
### FR-105 — Dependency và early-warning rule từ milestone, delivery, obligation, NCR/punch

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Dependency và early-warning rule từ milestone, delivery, obligation, NCR/punch. Từ Entity links, threshold, due dates, criticality, hệ thống phải tạo Predicted impact chain, alert, recommended escalation cho PM, Scheduler, module owner trong đúng data scope.
- **Truy vết:** Source: `RSK-008`; Business Requirement: [BR-022](./02-BRD.md#br-022--quản-lý-rfi-site-instruction-variation-và-claim-có-thời-hạn), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — PM, Scheduler, module owner; phạm vi — Dùng chung; boundary — PM; input — Entity links, threshold, due dates, criticality; output — Predicted impact chain, alert, recommended escalation.
- **Kiểm soát sản phẩm:** Permission — Rule admin cấu hình; owner acknowledge; cảnh báo không tự đóng dữ liệu gốc; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — PM, Scheduler, module owner (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Predicted impact chain, alert, recommended escalation, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

### 10.2. Document, commercial, engineering và cost

#### DOC — Document control

<a id="fr-026"></a>
### FR-026 — Template thư mục dự án Solar/BESS chuẩn và có version

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Template thư mục dự án Solar/BESS chuẩn và có version. Từ Project type, folder taxonomy, retention/access defaults, hệ thống phải tạo Cây thư mục dự án được khởi tạo, template version cho Document Controller, PMO trong đúng data scope.
- **Truy vết:** Source: `DOC-001`; Business Requirement: [BR-003](./02-BRD.md#br-003--chuẩn-hóa-khảo-sát-site-và-điểm-đấu-nối), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-035](./02-BRD.md#br-035--quản-lý-vòng-đời-tài-liệu-doanh-nghiệp).
- **Phạm vi sản phẩm:** Actor/persona — Document Controller, PMO; phạm vi — Dùng chung; boundary — PM + O&M; input — Project type, folder taxonomy, retention/access defaults; output — Cây thư mục dự án được khởi tạo, template version.
- **Kiểm soát sản phẩm:** Permission — PMO publish; Project Admin chỉ bật/tắt nhánh được cho phép; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Có preview, validation và kiểm quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Document Controller, PMO (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Cây thư mục dự án được khởi tạo, template version, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-027"></a>
### FR-027 — Mã tài liệu và metadata bắt buộc theo project/discipline/type/sequence

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Mã tài liệu và metadata bắt buộc theo project/discipline/type/sequence. Từ Project, originator, discipline, type, sequence, title, language, hệ thống phải tạo Document code duy nhất, metadata quality status cho Document Controller, Engineering trong đúng data scope.
- **Truy vết:** Source: `DOC-002`; Business Requirement: [BR-003](./02-BRD.md#br-003--chuẩn-hóa-khảo-sát-site-và-điểm-đấu-nối), [BR-009](./02-BRD.md#br-009--quản-lý-hợp-đồng-và-chuỗi-phụ-lục-theo-dự-án), [BR-012](./02-BRD.md#br-012--quản-lý-deliverable-thiết-kế-bom-review-revision-và-rfitq), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-035](./02-BRD.md#br-035--quản-lý-vòng-đời-tài-liệu-doanh-nghiệp).
- **Phạm vi sản phẩm:** Actor/persona — Document Controller, Engineering; phạm vi — Dùng chung; boundary — PM + O&M; input — Project, originator, discipline, type, sequence, title, language; output — Document code duy nhất, metadata quality status.
- **Kiểm soát sản phẩm:** Permission — Document Controller cấp/đổi code; duplicate bị chặn; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Document Controller, Engineering (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Document code duy nhất, metadata quality status, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-028"></a>
### FR-028 — File, version làm việc và revision phát hành tách biệt

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ File, version làm việc và revision phát hành tách biệt. Từ File, version comment, revision, change note, hệ thống phải tạo Version history, revision chain, current/superseded state cho Tất cả người lập tài liệu trong đúng data scope.
- **Truy vết:** Source: `DOC-003`; Business Requirement: [BR-003](./02-BRD.md#br-003--chuẩn-hóa-khảo-sát-site-và-điểm-đấu-nối), [BR-009](./02-BRD.md#br-009--quản-lý-hợp-đồng-và-chuỗi-phụ-lục-theo-dự-án), [BR-011](./02-BRD.md#br-011--bảo-toàn-pháp-nhân-người-ký-và-lịch-sử-phê-duyệt-văn-bản), [BR-012](./02-BRD.md#br-012--quản-lý-deliverable-thiết-kế-bom-review-revision-và-rfitq), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-035](./02-BRD.md#br-035--quản-lý-vòng-đời-tài-liệu-doanh-nghiệp).
- **Phạm vi sản phẩm:** Actor/persona — Tất cả người lập tài liệu; phạm vi — Dùng chung; boundary — PM + O&M; input — File, version comment, revision, change note; output — Version history, revision chain, current/superseded state.
- **Kiểm soát sản phẩm:** Permission — Người lập sửa draft; không ghi đè revision đã phát hành; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Tất cả người lập tài liệu (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Version history, revision chain, current/superseded state, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-029"></a>
### FR-029 — Submit–review–comment–revise–approve và status control

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Submit–review–comment–revise–approve và status control. Từ Revision, workflow, comments, due date, hệ thống phải tạo Review package, comment resolution, approved/returned status cho Engineering, Legal, QA/QC, approver trong đúng data scope.
- **Truy vết:** Source: `DOC-004`; Business Requirement: [BR-009](./02-BRD.md#br-009--quản-lý-hợp-đồng-và-chuỗi-phụ-lục-theo-dự-án), [BR-012](./02-BRD.md#br-012--quản-lý-deliverable-thiết-kế-bom-review-revision-và-rfitq), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-035](./02-BRD.md#br-035--quản-lý-vòng-đời-tài-liệu-doanh-nghiệp).
- **Phạm vi sản phẩm:** Actor/persona — Engineering, Legal, QA/QC, approver; phạm vi — Dùng chung; boundary — PM + O&M; input — Revision, workflow, comments, due date; output — Review package, comment resolution, approved/returned status.
- **Kiểm soát sản phẩm:** Permission — Quyền theo loại/trạng thái; approver khác người lập khi policy yêu cầu; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Engineering, Legal, QA/QC, approver (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Review package, comment resolution, approved/returned status, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-030"></a>
### FR-030 — Transmittal phát hành/nhận hồ sơ và theo dõi phản hồi

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Transmittal phát hành/nhận hồ sơ và theo dõi phản hồi. Từ Recipient, purpose/status code, document revision list, due date, hệ thống phải tạo Transmittal number, receipt, response tracking, overdue alert cho Document Controller, đối tác trong đúng data scope.
- **Truy vết:** Source: `DOC-005`; Business Requirement: [BR-009](./02-BRD.md#br-009--quản-lý-hợp-đồng-và-chuỗi-phụ-lục-theo-dự-án), [BR-012](./02-BRD.md#br-012--quản-lý-deliverable-thiết-kế-bom-review-revision-và-rfitq), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-035](./02-BRD.md#br-035--quản-lý-vòng-đời-tài-liệu-doanh-nghiệp).
- **Phạm vi sản phẩm:** Actor/persona — Document Controller, đối tác; phạm vi — Dùng chung; boundary — PM + O&M; input — Recipient, purpose/status code, document revision list, due date; output — Transmittal number, receipt, response tracking, overdue alert.
- **Kiểm soát sản phẩm:** Permission — Chỉ Document Controller phát hành chính thức; recipient portal theo package; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Document Controller, đối tác (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Transmittal number, receipt, response tracking, overdue alert, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-031"></a>
### FR-031 — Liên kết tài liệu với task, milestone, contract, equipment, vendor, RFI, inspection và test

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Liên kết tài liệu với task, milestone, contract, equipment, vendor, RFI, inspection và test. Từ Document ID/revision và entity ID, hệ thống phải tạo Relationship graph, context panel, impact/search trace cho Tất cả chức năng trong đúng data scope.
- **Truy vết:** Source: `DOC-006`; Business Requirement: [BR-012](./02-BRD.md#br-012--quản-lý-deliverable-thiết-kế-bom-review-revision-và-rfitq), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-035](./02-BRD.md#br-035--quản-lý-vòng-đời-tài-liệu-doanh-nghiệp).
- **Phạm vi sản phẩm:** Actor/persona — Tất cả chức năng; phạm vi — Dùng chung; boundary — PM + O&M; input — Document ID/revision và entity ID; output — Relationship graph, context panel, impact/search trace.
- **Kiểm soát sản phẩm:** Permission — Người dùng cần quyền cả hai đối tượng để tạo link; không lộ metadata bị cấm; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Tất cả chức năng (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Relationship graph, context panel, impact/search trace, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-032"></a>
### FR-032 — Full-text search, OCR và preview PDF/Word/Excel/hình ảnh

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Full-text search, OCR và preview PDF/Word/Excel/hình ảnh. Từ File, OCR language, indexing metadata, hệ thống phải tạo Searchable text, page preview, OCR confidence cho Tất cả người dùng trong đúng data scope.
- **Truy vết:** Source: `DOC-007`; Business Requirement: [BR-012](./02-BRD.md#br-012--quản-lý-deliverable-thiết-kế-bom-review-revision-và-rfitq), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-035](./02-BRD.md#br-035--quản-lý-vòng-đời-tài-liệu-doanh-nghiệp).
- **Phạm vi sản phẩm:** Actor/persona — Tất cả người dùng; phạm vi — Dùng chung; boundary — PM + O&M; input — File, OCR language, indexing metadata; output — Searchable text, page preview, OCR confidence.
- **Kiểm soát sản phẩm:** Permission — Search/preview/download là quyền riêng; OCR không làm thay đổi bản gốc; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Tất cả người dùng (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Searchable text, page preview, OCR confidence, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-033"></a>
### FR-033 — So sánh revision: metadata, text và overlay bản vẽ

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ So sánh revision: metadata, text và overlay bản vẽ. Từ Revision A/B, page/layer alignment, hệ thống phải tạo Change summary, visual diff, reviewer annotation cho Engineering, Legal, Document Controller trong đúng data scope.
- **Truy vết:** Source: `DOC-008`; Business Requirement: [BR-012](./02-BRD.md#br-012--quản-lý-deliverable-thiết-kế-bom-review-revision-và-rfitq), [BR-026](./02-BRD.md#br-026--quản-lý-cod-gate-và-bàn-giao-số-sang-om), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-035](./02-BRD.md#br-035--quản-lý-vòng-đời-tài-liệu-doanh-nghiệp).
- **Phạm vi sản phẩm:** Actor/persona — Engineering, Legal, Document Controller; phạm vi — Dùng chung; boundary — PM; input — Revision A/B, page/layer alignment; output — Change summary, visual diff, reviewer annotation.
- **Kiểm soát sản phẩm:** Permission — Chỉ người được xem cả hai revision; kết quả diff lưu audit; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Engineering, Legal, Document Controller (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Change summary, visual diff, reviewer annotation, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-034"></a>
### FR-034 — Khóa sau duyệt, watermark, download policy và chữ ký điện tử

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Khóa sau duyệt, watermark, download policy và chữ ký điện tử. Từ Approved revision, classification, recipient, signature authority, hệ thống phải tạo Locked/signed artifact, watermark, download/signature audit cho Legal, Document Controller, approver trong đúng data scope.
- **Truy vết:** Source: `DOC-009`; Business Requirement: [BR-026](./02-BRD.md#br-026--quản-lý-cod-gate-và-bàn-giao-số-sang-om), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-035](./02-BRD.md#br-035--quản-lý-vòng-đời-tài-liệu-doanh-nghiệp).
- **Phạm vi sản phẩm:** Actor/persona — Legal, Document Controller, approver; phạm vi — Dùng chung; boundary — PM + O&M; input — Approved revision, classification, recipient, signature authority; output — Locked/signed artifact, watermark, download/signature audit.
- **Kiểm soát sản phẩm:** Permission — Không xóa khóa qua UI; download/share/sign là quyền độc lập; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Legal, Document Controller, approver (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Locked/signed artifact, watermark, download/signature audit, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-035"></a>
### FR-035 — Retention/legal hold và nhập/sync ngoài hệ thống có chủ đích

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Retention/legal hold và nhập/sync ngoài hệ thống có chủ đích. Từ Retention class, hold, connector/folder selection, owner consent, hệ thống phải tạo Retention schedule, hold state, sync manifest/error log cho Legal, Records Admin, IT trong đúng data scope.
- **Truy vết:** Source: `DOC-010`; Business Requirement: [BR-026](./02-BRD.md#br-026--quản-lý-cod-gate-và-bàn-giao-số-sang-om), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-035](./02-BRD.md#br-035--quản-lý-vòng-đời-tài-liệu-doanh-nghiệp).
- **Phạm vi sản phẩm:** Actor/persona — Legal, Records Admin, IT; phạm vi — Dùng chung; boundary — PM + O&M; input — Retention class, hold, connector/folder selection, owner consent; output — Retention schedule, hold state, sync manifest/error log.
- **Kiểm soát sản phẩm:** Permission — Legal hold chặn delete; không tự quét; admin phải cấu hình và owner kích hoạt; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Legal, Records Admin, IT (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Retention schedule, hold state, sync manifest/error log, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

#### CTR — Contract/legal

<a id="fr-036"></a>
### FR-036 — Sổ đăng ký hợp đồng theo loại EPC, thuê thiết bị, PPA/ESCO, thầu phụ và mua thiết bị

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Sổ đăng ký hợp đồng theo loại EPC, thuê thiết bị, PPA/ESCO, thầu phụ và mua thiết bị. Từ Loại, số, dự án, gói thầu, giá trị, currency, ngày, trạng thái, hệ thống phải tạo Contract register, timeline, dashboard hiệu lực cho Legal, PM, Finance trong đúng data scope.
- **Truy vết:** Source: `CTR-001`; Business Requirement: [BR-009](./02-BRD.md#br-009--quản-lý-hợp-đồng-và-chuỗi-phụ-lục-theo-dự-án), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Legal, PM, Finance; phạm vi — Dùng chung; boundary — PM + O&M; input — Loại, số, dự án, gói thầu, giá trị, currency, ngày, trạng thái; output — Contract register, timeline, dashboard hiệu lực.
- **Kiểm soát sản phẩm:** Permission — Legal tạo; PM quản lý dự án; Finance chỉ sửa trường tài chính được giao; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Legal, PM, Finance (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Contract register, timeline, dashboard hiệu lực, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-037"></a>
### FR-037 — Quản lý nhiều pháp nhân, bên hợp đồng, đại diện và snapshot người ký

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Quản lý nhiều pháp nhân, bên hợp đồng, đại diện và snapshot người ký. Từ Legal entity ID, mã số thuế, địa chỉ, representative, power of attorney, hệ thống phải tạo Party/role graph và snapshot pháp lý tại thời điểm ký cho Legal, Admin trong đúng data scope.
- **Truy vết:** Source: `CTR-002`; Business Requirement: [BR-009](./02-BRD.md#br-009--quản-lý-hợp-đồng-và-chuỗi-phụ-lục-theo-dự-án), [BR-011](./02-BRD.md#br-011--bảo-toàn-pháp-nhân-người-ký-và-lịch-sử-phê-duyệt-văn-bản), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Legal, Admin; phạm vi — Dùng chung; boundary — PM + O&M; input — Legal entity ID, mã số thuế, địa chỉ, representative, power of attorney; output — Party/role graph và snapshot pháp lý tại thời điểm ký.
- **Kiểm soát sản phẩm:** Permission — Admin quản lý master; Legal xác nhận; bản ký không sửa ngược; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Legal, Admin (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Party/role graph và snapshot pháp lý tại thời điểm ký, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-038"></a>
### FR-038 — Hợp đồng gốc, biên bản thương thảo và nhiều phụ lục; tránh mất chuỗi sửa đổi

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Hợp đồng gốc, biên bản thương thảo và nhiều phụ lục; tránh mất chuỗi sửa đổi. Từ Root contract, appendix, amendment terms, minutes, effective date, hệ thống phải tạo Cây hợp đồng–phụ lục, consolidated terms, revision/history cho Legal, PM trong đúng data scope.
- **Truy vết:** Source: `CTR-003`; Business Requirement: [BR-009](./02-BRD.md#br-009--quản-lý-hợp-đồng-và-chuỗi-phụ-lục-theo-dự-án), [BR-011](./02-BRD.md#br-011--bảo-toàn-pháp-nhân-người-ký-và-lịch-sử-phê-duyệt-văn-bản), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Legal, PM; phạm vi — Dùng chung; boundary — PM + O&M; input — Root contract, appendix, amendment terms, minutes, effective date; output — Cây hợp đồng–phụ lục, consolidated terms, revision/history.
- **Kiểm soát sản phẩm:** Permission — Số hợp đồng duy nhất trong dự án; chỉ Legal phát hành; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Legal, PM (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Cây hợp đồng–phụ lục, consolidated terms, revision/history, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-039"></a>
### FR-039 — Theo dõi bảo lãnh thực hiện, thanh toán và tạm ứng

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Theo dõi bảo lãnh thực hiện, thanh toán và tạm ứng. Từ Loại bảo lãnh, ngân hàng, giá trị, ngày hiệu lực/hết hạn, bản scan, hệ thống phải tạo Guarantee register, cảnh báo gia hạn/giải tỏa, exposure cho Legal, Finance, PM trong đúng data scope.
- **Truy vết:** Source: `CTR-004`; Business Requirement: [BR-010](./02-BRD.md#br-010--quản-lý-nghĩa-vụ-bảo-lãnh-điều-kiện-tiên-quyết-và-permit), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Legal, Finance, PM; phạm vi — Dùng chung; boundary — PM; input — Loại bảo lãnh, ngân hàng, giá trị, ngày hiệu lực/hết hạn, bản scan; output — Guarantee register, cảnh báo gia hạn/giải tỏa, exposure.
- **Kiểm soát sản phẩm:** Permission — Finance/Legal đồng kiểm tra; giải tỏa cần approval; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Legal, Finance, PM (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Guarantee register, cảnh báo gia hạn/giải tỏa, exposure, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-040"></a>
### FR-040 — Nghĩa vụ, điều kiện tiên quyết và deadline có owner; tránh điều khoản “nằm trong PDF”

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Nghĩa vụ, điều kiện tiên quyết và deadline có owner; tránh điều khoản “nằm trong PDF”. Từ Clause, obligation, responsible party, evidence, due date, dependency, hệ thống phải tạo Obligation calendar, overdue alert, completion evidence cho Legal, PM, các phòng ban trong đúng data scope.
- **Truy vết:** Source: `CTR-005`; Business Requirement: [BR-010](./02-BRD.md#br-010--quản-lý-nghĩa-vụ-bảo-lãnh-điều-kiện-tiên-quyết-và-permit), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Legal, PM, các phòng ban; phạm vi — Dùng chung; boundary — PM + O&M; input — Clause, obligation, responsible party, evidence, due date, dependency; output — Obligation calendar, overdue alert, completion evidence.
- **Kiểm soát sản phẩm:** Permission — Legal xác nhận điều khoản; owner cập nhật bằng chứng; approver đóng; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Legal, PM, các phòng ban (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Obligation calendar, overdue alert, completion evidence, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-041"></a>
### FR-041 — Giấy phép/thủ tục điện lực, xây dựng, PCCC, môi trường và đấu nối

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Giấy phép/thủ tục điện lực, xây dựng, PCCC, môi trường và đấu nối. Từ Cơ quan, loại hồ sơ, submission, expiry, dependency, document link, hệ thống phải tạo Permit matrix, trạng thái, ngày hết hạn, COD blocker cho Legal, Engineering, HSE, PM trong đúng data scope.
- **Truy vết:** Source: `CTR-006`; Business Requirement: [BR-010](./02-BRD.md#br-010--quản-lý-nghĩa-vụ-bảo-lãnh-điều-kiện-tiên-quyết-và-permit), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Legal, Engineering, HSE, PM; phạm vi — Dùng chung/BESS; boundary — PM; input — Cơ quan, loại hồ sơ, submission, expiry, dependency, document link; output — Permit matrix, trạng thái, ngày hết hạn, COD blocker.
- **Kiểm soát sản phẩm:** Permission — Owner cập nhật; Legal/PM xác nhận; hồ sơ hết hạn bị cảnh báo critical; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Legal, Engineering, HSE, PM (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Permit matrix, trạng thái, ngày hết hạn, COD blocker, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-042"></a>
### FR-042 — Mốc thanh toán và điều kiện xuất hóa đơn theo hợp đồng

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Mốc thanh toán và điều kiện xuất hóa đơn theo hợp đồng. Từ Payment stage, tỷ lệ/số tiền, VAT, retention, prerequisite, due date, hệ thống phải tạo Lịch thanh toán, hồ sơ cần nộp, forecast cashflow cho Finance, Legal, PM trong đúng data scope.
- **Truy vết:** Source: `CTR-007`; Business Requirement: [BR-015](./02-BRD.md#br-015--kiểm-soát-sourcing-từ-nhu-cầu-đến-pohợp-đồng-mua), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Finance, Legal, PM; phạm vi — Dùng chung; boundary — PM + O&M; input — Payment stage, tỷ lệ/số tiền, VAT, retention, prerequisite, due date; output — Lịch thanh toán, hồ sơ cần nộp, forecast cashflow.
- **Kiểm soát sản phẩm:** Permission — Finance tạo payment; Legal xác nhận điều kiện; approver theo SoD; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Finance, Legal, PM (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Lịch thanh toán, hồ sơ cần nộp, forecast cashflow, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-043"></a>
### FR-043 — Liên kết hợp đồng–payment và hiển thị dòng tiền payer → payee

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Liên kết hợp đồng–payment và hiển thị dòng tiền payer → payee. Từ contractId, payer legalEntityId, payee legalEntityId, payment records, hệ thống phải tạo Cashflow graph, filter theo payer/payee, contract balance cho Finance, PM, lãnh đạo trong đúng data scope.
- **Truy vết:** Source: `CTR-008`; Business Requirement: [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Finance, PM, lãnh đạo; phạm vi — Dùng chung; boundary — PM + O&M; input — contractId, payer legalEntityId, payee legalEntityId, payment records; output — Cashflow graph, filter theo payer/payee, contract balance.
- **Kiểm soát sản phẩm:** Permission — Payment bắt buộc contractId; payer/payee không suy diễn từ nhãn Bên A/B; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Finance, PM, lãnh đạo (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Cashflow graph, filter theo payer/payee, contract balance, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-044"></a>
### FR-044 — Báo cáo hiệu lực, nghĩa vụ, bảo lãnh, thay đổi và claim

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Báo cáo hiệu lực, nghĩa vụ, bảo lãnh, thay đổi và claim. Từ Contract/obligation/guarantee/change data, hệ thống phải tạo Contract dashboard, obligation report, expiry digest cho Legal, PM, lãnh đạo trong đúng data scope.
- **Truy vết:** Source: `CTR-009`; Business Requirement: [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Legal, PM, lãnh đạo; phạm vi — Dùng chung; boundary — PM + O&M; input — Contract/obligation/guarantee/change data; output — Contract dashboard, obligation report, expiry digest.
- **Kiểm soát sản phẩm:** Permission — Theo project/legal entity/package; dữ liệu nhạy cảm hạn chế download; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Legal, PM, lãnh đạo (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Contract dashboard, obligation report, expiry digest, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

#### ENG — Engineering

<a id="fr-045"></a>
### FR-045 — Design basis và survey register; khóa giả định đầu vào đã duyệt

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Design basis và survey register; khóa giả định đầu vào đã duyệt. Từ Survey pack, codes/standards, utility requirements, client criteria, hệ thống phải tạo Design basis revision, assumption/constraint register cho Design Manager, Survey, PM trong đúng data scope.
- **Truy vết:** Source: `ENG-001`; Business Requirement: [BR-003](./02-BRD.md#br-003--chuẩn-hóa-khảo-sát-site-và-điểm-đấu-nối), [BR-012](./02-BRD.md#br-012--quản-lý-deliverable-thiết-kế-bom-review-revision-và-rfitq).
- **Phạm vi sản phẩm:** Actor/persona — Design Manager, Survey, PM; phạm vi — Dùng chung; boundary — PM; input — Survey pack, codes/standards, utility requirements, client criteria; output — Design basis revision, assumption/constraint register.
- **Kiểm soát sản phẩm:** Permission — Kỹ sư lập; discipline lead kiểm tra; Design Manager duyệt; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R1; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Design Manager, Survey, PM (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Design basis revision, assumption/constraint register, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-046"></a>
### FR-046 — Design deliverable register theo discipline: layout, SLD, kết cấu, điện, tiếp địa, chống sét, SCADA/EMS/communication

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Design deliverable register theo discipline: layout, SLD, kết cấu, điện, tiếp địa, chống sét, SCADA/EMS/communication. Từ Deliverable code, discipline, planned dates, reviewer/approver, hệ thống phải tạo MDR, deliverable schedule, status IFC/Approved/As-built cho Design Manager, kỹ sư trong đúng data scope.
- **Truy vết:** Source: `ENG-002`; Business Requirement: [BR-012](./02-BRD.md#br-012--quản-lý-deliverable-thiết-kế-bom-review-revision-và-rfitq).
- **Phạm vi sản phẩm:** Actor/persona — Design Manager, kỹ sư; phạm vi — Dùng chung; boundary — PM; input — Deliverable code, discipline, planned dates, reviewer/approver; output — MDR, deliverable schedule, status IFC/Approved/As-built.
- **Kiểm soát sản phẩm:** Permission — Discipline tạo; reviewer comment; approver phát hành; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Design Manager, kỹ sư (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được MDR, deliverable schedule, status IFC/Approved/As-built, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-047"></a>
### FR-047 — Chu trình submit–review–comment–revise–approve có comment sheet

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Chu trình submit–review–comment–revise–approve có comment sheet. Từ Document revision, reviewer list, comment, response, due date, hệ thống phải tạo Review cycle, comment closure, approved/returned revision cho Engineering, Owner, QA/QC trong đúng data scope.
- **Truy vết:** Source: `ENG-003`; Business Requirement: [BR-012](./02-BRD.md#br-012--quản-lý-deliverable-thiết-kế-bom-review-revision-và-rfitq).
- **Phạm vi sản phẩm:** Actor/persona — Engineering, Owner, QA/QC; phạm vi — Dùng chung; boundary — PM; input — Document revision, reviewer list, comment, response, due date; output — Review cycle, comment closure, approved/returned revision.
- **Kiểm soát sản phẩm:** Permission — Không sửa bản đang review; approver không đồng thời là người lập khi policy yêu cầu; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Engineering, Owner, QA/QC (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Review cycle, comment closure, approved/returned revision, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-048"></a>
### FR-048 — Calculation sheet, BOM và model/hãng thiết bị liên kết thiết kế

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Calculation sheet, BOM và model/hãng thiết bị liên kết thiết kế. Từ Calculation, design quantity, equipment model, approved vendor, hệ thống phải tạo Baseline BOM, design quantity, technical data sheet, change impact cho Engineering, Procurement, Cost trong đúng data scope.
- **Truy vết:** Source: `ENG-004`; Business Requirement: [BR-012](./02-BRD.md#br-012--quản-lý-deliverable-thiết-kế-bom-review-revision-và-rfitq).
- **Phạm vi sản phẩm:** Actor/persona — Engineering, Procurement, Cost; phạm vi — Dùng chung; boundary — PM; input — Calculation, design quantity, equipment model, approved vendor; output — Baseline BOM, design quantity, technical data sheet, change impact.
- **Kiểm soát sản phẩm:** Permission — Engineering sở hữu BOM; Procurement dùng bản phát hành, không sửa thiết kế; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R1; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Engineering, Procurement, Cost (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Baseline BOM, design quantity, technical data sheet, change impact, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-049"></a>
### FR-049 — RFI và Technical Query có response deadline và ảnh hưởng

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ RFI và Technical Query có response deadline và ảnh hưởng. Từ Câu hỏi, drawing/location, requested-by date, priority, hệ thống phải tạo Clarification, decision, linked change/task/document cho Site, Engineering, Vendor, Owner trong đúng data scope.
- **Truy vết:** Source: `ENG-005`; Business Requirement: [BR-012](./02-BRD.md#br-012--quản-lý-deliverable-thiết-kế-bom-review-revision-và-rfitq), [BR-022](./02-BRD.md#br-022--quản-lý-rfi-site-instruction-variation-và-claim-có-thời-hạn).
- **Phạm vi sản phẩm:** Actor/persona — Site, Engineering, Vendor, Owner; phạm vi — Dùng chung; boundary — PM; input — Câu hỏi, drawing/location, requested-by date, priority; output — Clarification, decision, linked change/task/document.
- **Kiểm soát sản phẩm:** Permission — Bên hỏi tạo trong package; người có thẩm quyền trả lời; PM escalation; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Site, Engineering, Vendor, Owner (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Clarification, decision, linked change/task/document, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-050"></a>
### FR-050 — Design change với impact schedule–cost–BOM–PO–commissioning trước phê duyệt

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Design change với impact schedule–cost–BOM–PO–commissioning trước phê duyệt. Từ Change reason, redline, affected items, estimate, schedule impact, hệ thống phải tạo Change package, approval, revision/BOM/baseline update cho Engineering, PM, Cost, Procurement trong đúng data scope.
- **Truy vết:** Source: `ENG-006`; Business Requirement: [BR-012](./02-BRD.md#br-012--quản-lý-deliverable-thiết-kế-bom-review-revision-và-rfitq), [BR-022](./02-BRD.md#br-022--quản-lý-rfi-site-instruction-variation-và-claim-có-thời-hạn).
- **Phạm vi sản phẩm:** Actor/persona — Engineering, PM, Cost, Procurement; phạm vi — Dùng chung; boundary — PM; input — Change reason, redline, affected items, estimate, schedule impact; output — Change package, approval, revision/BOM/baseline update.
- **Kiểm soát sản phẩm:** Permission — Không phát hành IFC mới trước approval trừ emergency path có audit; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Engineering, PM, Cost, Procurement (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Change package, approval, revision/BOM/baseline update, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-051"></a>
### FR-051 — So sánh revision và trạng thái IFC/Approved/As-built; ngăn thi công nhầm bản

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ So sánh revision và trạng thái IFC/Approved/As-built; ngăn thi công nhầm bản. Từ Hai revision, metadata, markup, hệ thống phải tạo Diff/overlay, superseded warning, current-for-use badge cho Engineering, Site, QA/QC trong đúng data scope.
- **Truy vết:** Source: `ENG-007`; Business Requirement: [BR-012](./02-BRD.md#br-012--quản-lý-deliverable-thiết-kế-bom-review-revision-và-rfitq).
- **Phạm vi sản phẩm:** Actor/persona — Engineering, Site, QA/QC; phạm vi — Dùng chung; boundary — PM; input — Hai revision, metadata, markup; output — Diff/overlay, superseded warning, current-for-use badge.
- **Kiểm soát sản phẩm:** Permission — Người xem theo tài liệu; chỉ Document Controller đổi trạng thái phát hành; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Engineering, Site, QA/QC (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Diff/overlay, superseded warning, current-for-use badge, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-052"></a>
### FR-052 — Interface register giữa Solar, BESS, trạm, SCADA, PCCC và nhà cung cấp

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Interface register giữa Solar, BESS, trạm, SCADA, PCCC và nhà cung cấp. Từ Interface point, owner đôi bên, input/output, due date, evidence, hệ thống phải tạo Interface matrix, unresolved interface alert, test linkage cho Design Manager, vendors, commissioning trong đúng data scope.
- **Truy vết:** Source: `ENG-008`; Business Requirement: [BR-012](./02-BRD.md#br-012--quản-lý-deliverable-thiết-kế-bom-review-revision-và-rfitq).
- **Phạm vi sản phẩm:** Actor/persona — Design Manager, vendors, commissioning; phạm vi — Dùng chung/Solar/BESS; boundary — PM; input — Interface point, owner đôi bên, input/output, due date, evidence; output — Interface matrix, unresolved interface alert, test linkage.
- **Kiểm soát sản phẩm:** Permission — Mỗi bên sửa phần được giao; Design Manager đóng interface; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R2; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Design Manager, vendors, commissioning (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Interface matrix, unresolved interface alert, test linkage, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

#### CST — Cost/payment

<a id="fr-053"></a>
### FR-053 — Ngân sách baseline/BAC theo WBS, cost code, pháp nhân, CAPEX/OPEX và currency

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Ngân sách baseline/BAC theo WBS, cost code, pháp nhân, CAPEX/OPEX và currency. Từ Approved estimate, WBS, cost category, entity, currency, hệ thống phải tạo Time-phased budget, BAC version, contingency cho Finance, Cost Controller, PM trong đúng data scope.
- **Truy vết:** Source: `CST-001`; Business Requirement: [BR-007](./02-BRD.md#br-007--so-sánh-business-case-capexopex-và-hiệu-quả-đầu-tư), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Finance, Cost Controller, PM; phạm vi — Dùng chung; boundary — PM + O&M; input — Approved estimate, WBS, cost category, entity, currency; output — Time-phased budget, BAC version, contingency.
- **Kiểm soát sản phẩm:** Permission — Cost Controller lập; Sponsor/Finance duyệt; baseline bị khóa; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Finance, Cost Controller, PM (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Time-phased budget, BAC version, contingency, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-054"></a>
### FR-054 — Commitment, actual, accrual, forecast và EAC; nhìn vượt ngân sách trước khi thanh toán

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Commitment, actual, accrual, forecast và EAC; nhìn vượt ngân sách trước khi thanh toán. Từ PO/contract, invoice/payment, accrual, ETC, schedule progress, hệ thống phải tạo Committed/paid/accrued/ETC/EAC, variance at completion cho Cost Controller, PM, Finance trong đúng data scope.
- **Truy vết:** Source: `CST-002`; Business Requirement: [BR-007](./02-BRD.md#br-007--so-sánh-business-case-capexopex-và-hiệu-quả-đầu-tư), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Cost Controller, PM, Finance; phạm vi — Dùng chung; boundary — PM + O&M; input — PO/contract, invoice/payment, accrual, ETC, schedule progress; output — Committed/paid/accrued/ETC/EAC, variance at completion.
- **Kiểm soát sản phẩm:** Permission — Nguồn contract/PO không sửa ở Cost; forecast override cần reason/audit; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Cost Controller, PM, Finance (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Committed/paid/accrued/ETC/EAC, variance at completion, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-055"></a>
### FR-055 — Payment độc lập bắt buộc contractId, đợt thanh toán và chứng từ điều kiện

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Payment độc lập bắt buộc contractId, đợt thanh toán và chứng từ điều kiện. Từ Contract/payment stage, amount, currency, payer/payee, evidence, bank ref, hệ thống phải tạo Payment request/status/transaction, remaining amount, contract ledger cho Finance, PM, approver trong đúng data scope.
- **Truy vết:** Source: `CST-003`; Business Requirement: [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Finance, PM, approver; phạm vi — Dùng chung; boundary — PM + O&M; input — Contract/payment stage, amount, currency, payer/payee, evidence, bank ref; output — Payment request/status/transaction, remaining amount, contract ledger.
- **Kiểm soát sản phẩm:** Permission — Người đề nghị không tự duyệt; Finance post; không payment “không hợp đồng”; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Finance, PM, approver (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Payment request/status/transaction, remaining amount, contract ledger, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-056"></a>
### FR-056 — Hóa đơn, VAT, retention, withholding và đối chiếu payment

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Hóa đơn, VAT, retention, withholding và đối chiếu payment. Từ Invoice lines, tax rate, retention/withholding rule, contract, receipt, hệ thống phải tạo Gross/net/tax/retained amount, exception, payable date cho AP/AR, Finance, Legal trong đúng data scope.
- **Truy vết:** Source: `CST-004`; Business Requirement: [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — AP/AR, Finance, Legal; phạm vi — Dùng chung; boundary — PM + O&M; input — Invoice lines, tax rate, retention/withholding rule, contract, receipt; output — Gross/net/tax/retained amount, exception, payable date.
- **Kiểm soát sản phẩm:** Permission — Công thức theo rule version; adjustment cần credit/debit note, không sửa lịch sử; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — AP/AR, Finance, Legal (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Gross/net/tax/retained amount, exception, payable date, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-057"></a>
### FR-057 — Multi-currency và snapshot tỷ giá; tránh cộng trực tiếp VND/USD

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Multi-currency và snapshot tỷ giá; tránh cộng trực tiếp VND/USD. Từ Transaction currency/amount, rate source/date, reporting currency, hệ thống phải tạo Native ledger, converted reporting view, FX variance cho Finance, PM, lãnh đạo trong đúng data scope.
- **Truy vết:** Source: `CST-005`; Business Requirement: [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Finance, PM, lãnh đạo; phạm vi — Dùng chung; boundary — PM + O&M; input — Transaction currency/amount, rate source/date, reporting currency; output — Native ledger, converted reporting view, FX variance.
- **Kiểm soát sản phẩm:** Permission — Finance quản lý rate; báo cáo luôn nêu currency/rate date; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Finance, PM, lãnh đạo (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Native ledger, converted reporting view, FX variance, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-058"></a>
### FR-058 — Cashflow plan/actual theo payer → payee, pháp nhân và kỳ

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Cashflow plan/actual theo payer → payee, pháp nhân và kỳ. Từ Contract milestones, invoices, payments, forecast dates, hệ thống phải tạo Inflow/outflow curve, funding gap, overdue receivable/payable cho Finance, PM, Treasury trong đúng data scope.
- **Truy vết:** Source: `CST-006`; Business Requirement: [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Finance, PM, Treasury; phạm vi — Dùng chung; boundary — PM + O&M; input — Contract milestones, invoices, payments, forecast dates; output — Inflow/outflow curve, funding gap, overdue receivable/payable.
- **Kiểm soát sản phẩm:** Permission — Theo legal entity; dữ liệu bank hạn chế; direction lấy từ payer/payee; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Finance, PM, Treasury (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Inflow/outflow curve, funding gap, overdue receivable/payable, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-059"></a>
### FR-059 — Approval chi phí theo giá trị và kiểm soát xung đột

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Approval chi phí theo giá trị và kiểm soát xung đột. Từ Requester, amount, category, budget availability, conflict attributes, hệ thống phải tạo Approved/rejected/conditional transaction và audit cho PM, Finance, Sponsor trong đúng data scope.
- **Truy vết:** Source: `CST-007`; Business Requirement: [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — PM, Finance, Sponsor; phạm vi — Dùng chung; boundary — PM + O&M; input — Requester, amount, category, budget availability, conflict attributes; output — Approved/rejected/conditional transaction và audit.
- **Kiểm soát sản phẩm:** Permission — PM không tự duyệt chi phí mình đề xuất; approver theo threshold/SoD; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — PM, Finance, Sponsor (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Approved/rejected/conditional transaction và audit, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-060"></a>
### FR-060 — Dashboard/báo cáo ngân sách, commitment, payment, EAC, CAPEX/OPEX và cashflow

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Dashboard/báo cáo ngân sách, commitment, payment, EAC, CAPEX/OPEX và cashflow. Từ Cost ledger, contract, schedule, forecast, hệ thống phải tạo Cost report, forecast variance, drill-through transaction cho PM, Finance, lãnh đạo trong đúng data scope.
- **Truy vết:** Source: `CST-008`; Business Requirement: [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — PM, Finance, lãnh đạo; phạm vi — Dùng chung; boundary — PM + O&M; input — Cost ledger, contract, schedule, forecast; output — Cost report, forecast variance, drill-through transaction.
- **Kiểm soát sản phẩm:** Permission — Tổng hợp theo scope; export tài chính cần download permission; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — PM, Finance, lãnh đạo (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Cost report, forecast variance, drill-through transaction, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

### 10.3. Procurement, logistics, construction, HSE và QA/QC

#### PRC — Procurement

<a id="fr-061"></a>
### FR-061 — Danh mục vật tư/thiết bị và yêu cầu mua liên kết BOM/WBS

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Danh mục vật tư/thiết bị và yêu cầu mua liên kết BOM/WBS. Từ Item code, spec, quantity, need-by, BOM/WBS, approved equal, hệ thống phải tạo Purchase requisition, procurement package, demand baseline cho Engineering, Procurement, Site trong đúng data scope.
- **Truy vết:** Source: `PRC-001`; Business Requirement: [BR-013](./02-BRD.md#br-013--truy-vết-danh-mục-thiết-bị-solar), [BR-015](./02-BRD.md#br-015--kiểm-soát-sourcing-từ-nhu-cầu-đến-pohợp-đồng-mua), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Engineering, Procurement, Site; phạm vi — Dùng chung; boundary — PM; input — Item code, spec, quantity, need-by, BOM/WBS, approved equal; output — Purchase requisition, procurement package, demand baseline.
- **Kiểm soát sản phẩm:** Permission — Engineering xác nhận spec; PM duyệt nhu cầu; Procurement phát hành RFQ; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Engineering, Procurement, Site (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Purchase requisition, procurement package, demand baseline, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-062"></a>
### FR-062 — RFQ và quản lý clarifications/báo giá trên cùng phiên bản

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ RFQ và quản lý clarifications/báo giá trên cùng phiên bản. Từ Vendor list, RFQ pack, due date, quote, deviation, hệ thống phải tạo Bid receipt log, clarification log, compliance matrix cho Procurement, Vendor, Engineering trong đúng data scope.
- **Truy vết:** Source: `PRC-002`; Business Requirement: [BR-015](./02-BRD.md#br-015--kiểm-soát-sourcing-từ-nhu-cầu-đến-pohợp-đồng-mua), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Procurement, Vendor, Engineering; phạm vi — Dùng chung; boundary — PM; input — Vendor list, RFQ pack, due date, quote, deviation; output — Bid receipt log, clarification log, compliance matrix.
- **Kiểm soát sản phẩm:** Permission — Vendor chỉ thấy RFQ của mình; bid kín đến thời điểm mở nếu cấu hình; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Procurement, Vendor, Engineering (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Bid receipt log, clarification log, compliance matrix, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-063"></a>
### FR-063 — Đánh giá kỹ thuật và thương mại tách biệt

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Đánh giá kỹ thuật và thương mại tách biệt. Từ Quote, deviation, TBE/CBE criteria, landed cost, lead time, hệ thống phải tạo TBE, CBE, normalized comparison, recommendation cho Engineering, Procurement, Finance trong đúng data scope.
- **Truy vết:** Source: `PRC-003`; Business Requirement: [BR-015](./02-BRD.md#br-015--kiểm-soát-sourcing-từ-nhu-cầu-đến-pohợp-đồng-mua), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Engineering, Procurement, Finance; phạm vi — Dùng chung; boundary — PM; input — Quote, deviation, TBE/CBE criteria, landed cost, lead time; output — TBE, CBE, normalized comparison, recommendation.
- **Kiểm soát sản phẩm:** Permission — Engineering chấm kỹ thuật; Procurement/Finance chấm thương mại; SoD audit; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Engineering, Procurement, Finance (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được TBE, CBE, normalized comparison, recommendation, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-064"></a>
### FR-064 — Phê duyệt nhà cung cấp và due diligence

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Phê duyệt nhà cung cấp và due diligence. Từ Hồ sơ pháp lý, năng lực, reference, quality/HSE/financial assessment, hệ thống phải tạo Approved vendor list có expiry, condition và risk rating cho Procurement, QA/QC, Legal, Finance trong đúng data scope.
- **Truy vết:** Source: `PRC-004`; Business Requirement: [BR-015](./02-BRD.md#br-015--kiểm-soát-sourcing-từ-nhu-cầu-đến-pohợp-đồng-mua), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Procurement, QA/QC, Legal, Finance; phạm vi — Dùng chung; boundary — PM; input — Hồ sơ pháp lý, năng lực, reference, quality/HSE/financial assessment; output — Approved vendor list có expiry, condition và risk rating.
- **Kiểm soát sản phẩm:** Permission — Approver độc lập người đề cử; vendor không tự sửa kết quả; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Procurement, QA/QC, Legal, Finance (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Approved vendor list có expiry, condition và risk rating, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-065"></a>
### FR-065 — PO/hợp đồng mua bán, revision và approval theo giá trị

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ PO/hợp đồng mua bán, revision và approval theo giá trị. Từ Recommendation, scope, price, Incoterm, milestone, contract terms, hệ thống phải tạo Approved PO/purchase contract, commitment và delivery schedule cho Procurement, Legal, Finance, PM trong đúng data scope.
- **Truy vết:** Source: `PRC-005`; Business Requirement: [BR-015](./02-BRD.md#br-015--kiểm-soát-sourcing-từ-nhu-cầu-đến-pohợp-đồng-mua), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Procurement, Legal, Finance, PM; phạm vi — Dùng chung; boundary — PM; input — Recommendation, scope, price, Incoterm, milestone, contract terms; output — Approved PO/purchase contract, commitment và delivery schedule.
- **Kiểm soát sản phẩm:** Permission — Threshold approval; người tạo không tự duyệt; amendment tạo revision; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Procurement, Legal, Finance, PM (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Approved PO/purchase contract, commitment và delivery schedule, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-066"></a>
### FR-066 — Expediting sản xuất, mốc thanh toán và FAT

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Expediting sản xuất, mốc thanh toán và FAT. Từ Manufacturing plan, hold point, FAT procedure/result, payment milestone, hệ thống phải tạo Progress, FAT release/NCR, payment eligibility, revised ETA cho Procurement, QA/QC, Engineering, Vendor trong đúng data scope.
- **Truy vết:** Source: `PRC-006`; Business Requirement: [BR-016](./02-BRD.md#br-016--theo-dõi-sản-xuất-fat-và-bộ-chứng-từ-logistics), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Procurement, QA/QC, Engineering, Vendor; phạm vi — Dùng chung/Solar/BESS; boundary — PM; input — Manufacturing plan, hold point, FAT procedure/result, payment milestone; output — Progress, FAT release/NCR, payment eligibility, revised ETA.
- **Kiểm soát sản phẩm:** Permission — Vendor cập nhật; inspector xác nhận; payment cần evidence approved; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Procurement, QA/QC, Engineering, Vendor (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Progress, FAT release/NCR, payment eligibility, revised ETA, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-067"></a>
### FR-067 — Procurement tracker và cảnh báo thiết bị giao chậm ảnh hưởng đường găng

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Procurement tracker và cảnh báo thiết bị giao chậm ảnh hưởng đường găng. Từ Need-by, promised/forecast date, schedule link, logistics ETA, hệ thống phải tạo Status heatmap, delay days, critical-path alert, recovery action cho Procurement, PM, Scheduler trong đúng data scope.
- **Truy vết:** Source: `PRC-007`; Business Requirement: [BR-017](./02-BRD.md#br-017--quản-lý-vận-chuyển-giao-nhận-serial-warranty-và-rủi-ro-chậm), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Procurement, PM, Scheduler; phạm vi — Dùng chung; boundary — PM; input — Need-by, promised/forecast date, schedule link, logistics ETA; output — Status heatmap, delay days, critical-path alert, recovery action.
- **Kiểm soát sản phẩm:** Permission — PM xem toàn dự án; vendor chỉ package; override cần lý do/audit; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Procurement, PM, Scheduler (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Status heatmap, delay days, critical-path alert, recovery action, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-068"></a>
### FR-068 — Đối chiếu BOM–requisition–PO–hàng nhận để phát hiện thiếu/thừa/sai model

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Đối chiếu BOM–requisition–PO–hàng nhận để phát hiện thiếu/thừa/sai model. Từ Baseline BOM, PO lines, GRN, serial, substitution, hệ thống phải tạo Variance report, exception workflow, quantity/price reconciliation cho Engineering, Procurement, Site, Finance trong đúng data scope.
- **Truy vết:** Source: `PRC-008`; Business Requirement: [BR-017](./02-BRD.md#br-017--quản-lý-vận-chuyển-giao-nhận-serial-warranty-và-rủi-ro-chậm), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Engineering, Procurement, Site, Finance; phạm vi — Dùng chung/Solar/BESS; boundary — PM; input — Baseline BOM, PO lines, GRN, serial, substitution; output — Variance report, exception workflow, quantity/price reconciliation.
- **Kiểm soát sản phẩm:** Permission — Substitution cần Engineering approval; receipt do Site xác nhận; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Engineering, Procurement, Site, Finance (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Variance report, exception workflow, quantity/price reconciliation, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

#### LOG — Logistics

<a id="fr-069"></a>
### FR-069 — Bộ chứng từ CO/CQ, packing list, invoice, Bill of Lading và tờ khai hải quan

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Bộ chứng từ CO/CQ, packing list, invoice, Bill of Lading và tờ khai hải quan. Từ Shipment, document type/revision, customs data, hệ thống phải tạo Shipment dossier completeness, missing-document alert cho Logistics, Procurement, Finance trong đúng data scope.
- **Truy vết:** Source: `LOG-001`; Business Requirement: [BR-016](./02-BRD.md#br-016--theo-dõi-sản-xuất-fat-và-bộ-chứng-từ-logistics).
- **Phạm vi sản phẩm:** Actor/persona — Logistics, Procurement, Finance; phạm vi — Dùng chung; boundary — PM; input — Shipment, document type/revision, customs data; output — Shipment dossier completeness, missing-document alert.
- **Kiểm soát sản phẩm:** Permission — Logistics tải lên; Finance/QA xác nhận tài liệu thuộc quyền; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Logistics, Procurement, Finance (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Shipment dossier completeness, missing-document alert, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-070"></a>
### FR-070 — Theo dõi shipment, mã vận đơn, carrier, ETD/ETA và milestone

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Theo dõi shipment, mã vận đơn, carrier, ETD/ETA và milestone. Từ Booking, tracking number, route, milestone event, hệ thống phải tạo Timeline, current location/status, revised ETA cho Logistics, Vendor, PM trong đúng data scope.
- **Truy vết:** Source: `LOG-002`; Business Requirement: [BR-017](./02-BRD.md#br-017--quản-lý-vận-chuyển-giao-nhận-serial-warranty-và-rủi-ro-chậm).
- **Phạm vi sản phẩm:** Actor/persona — Logistics, Vendor, PM; phạm vi — Dùng chung; boundary — PM; input — Booking, tracking number, route, milestone event; output — Timeline, current location/status, revised ETA.
- **Kiểm soát sản phẩm:** Permission — Vendor/carrier cập nhật qua portal/API; Logistics xác nhận exception; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Logistics, Vendor, PM (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Timeline, current location/status, revised ETA, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-071"></a>
### FR-071 — Giao hàng công trường và xử lý hàng thiếu/lỗi/thay thế

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Giao hàng công trường và xử lý hàng thiếu/lỗi/thay thế. Từ Delivery note, quantity, condition, photo, serial, hệ thống phải tạo GRN, shortage/damage report, replacement action cho Site, QA/QC, Logistics, Vendor trong đúng data scope.
- **Truy vết:** Source: `LOG-003`; Business Requirement: [BR-017](./02-BRD.md#br-017--quản-lý-vận-chuyển-giao-nhận-serial-warranty-và-rủi-ro-chậm).
- **Phạm vi sản phẩm:** Actor/persona — Site, QA/QC, Logistics, Vendor; phạm vi — Dùng chung; boundary — PM; input — Delivery note, quantity, condition, photo, serial; output — GRN, shortage/damage report, replacement action.
- **Kiểm soát sản phẩm:** Permission — Site ghi nhận; QA xác nhận lỗi; vendor chỉ xử lý package; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Site, QA/QC, Logistics, Vendor (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được GRN, shortage/damage report, replacement action, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-072"></a>
### FR-072 — Serial number, asset tag và warranty seed từ lúc nhận hàng

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Serial number, asset tag và warranty seed từ lúc nhận hàng. Từ PO line, manufacturer serial, model, manufacture/warranty date, hệ thống phải tạo Asset record, QR label, warranty start rule, traceability cho Site, QA/QC, O&M trong đúng data scope.
- **Truy vết:** Source: `LOG-004`; Business Requirement: [BR-017](./02-BRD.md#br-017--quản-lý-vận-chuyển-giao-nhận-serial-warranty-và-rủi-ro-chậm).
- **Phạm vi sản phẩm:** Actor/persona — Site, QA/QC, O&M; phạm vi — Dùng chung/Solar/BESS; boundary — PM + O&M; input — PO line, manufacturer serial, model, manufacture/warranty date; output — Asset record, QR label, warranty start rule, traceability.
- **Kiểm soát sản phẩm:** Permission — Site scan; QA xác nhận; O&M nhận khi handover; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R2; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Site, QA/QC, O&M (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Asset record, QR label, warranty start rule, traceability, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-073"></a>
### FR-073 — Cảnh báo ETA/thiếu chứng từ/hàng thay thế ảnh hưởng thi công và COD

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Cảnh báo ETA/thiếu chứng từ/hàng thay thế ảnh hưởng thi công và COD. Từ Forecast ETA, need-by, critical activity, open exception, hệ thống phải tạo Alert severity, impacted milestone, mitigation owner cho Logistics, PM, Procurement trong đúng data scope.
- **Truy vết:** Source: `LOG-005`; Business Requirement: [BR-017](./02-BRD.md#br-017--quản-lý-vận-chuyển-giao-nhận-serial-warranty-và-rủi-ro-chậm).
- **Phạm vi sản phẩm:** Actor/persona — Logistics, PM, Procurement; phạm vi — Dùng chung; boundary — PM; input — Forecast ETA, need-by, critical activity, open exception; output — Alert severity, impacted milestone, mitigation owner.
- **Kiểm soát sản phẩm:** Permission — Hệ thống tạo; PM acknowledge/escalate; không cho vendor đóng alert nội bộ; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Logistics, PM, Procurement (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Alert severity, impacted milestone, mitigation owner, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-074"></a>
### FR-074 — Theo dõi vật tư tại kho/công trường theo location và reservation

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Theo dõi vật tư tại kho/công trường theo location và reservation. Từ Receipt, issue, return, transfer, storage condition, hệ thống phải tạo Stock ledger, reserved/available quantity, shortage forecast cho Site Storekeeper, Construction, Procurement trong đúng data scope.
- **Truy vết:** Source: `LOG-006`; Business Requirement: [BR-017](./02-BRD.md#br-017--quản-lý-vận-chuyển-giao-nhận-serial-warranty-và-rủi-ro-chậm).
- **Phạm vi sản phẩm:** Actor/persona — Site Storekeeper, Construction, Procurement; phạm vi — Dùng chung; boundary — PM; input — Receipt, issue, return, transfer, storage condition; output — Stock ledger, reserved/available quantity, shortage forecast.
- **Kiểm soát sản phẩm:** Permission — Kho ghi transaction; Site Manager phê duyệt điều chỉnh tồn; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R2; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Site Storekeeper, Construction, Procurement (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Stock ledger, reserved/available quantity, shortage forecast, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

#### CON — Construction

<a id="fr-075"></a>
### FR-075 — Mobilization, khu vực thi công và resource plan

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Mobilization, khu vực thi công và resource plan. Từ Site zone, workfront, contractor, manpower/equipment plan, hệ thống phải tạo Mobilization checklist, zone readiness, resource demand cho Site Manager, PM, nhà thầu trong đúng data scope.
- **Truy vết:** Source: `CON-001`; Business Requirement: [BR-019](./02-BRD.md#br-019--ghi-nhận-nhật-ký-nguồn-lực-vật-tư-và-bằng-chứng-hiện-trường), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Site Manager, PM, nhà thầu; phạm vi — Dùng chung; boundary — PM; input — Site zone, workfront, contractor, manpower/equipment plan; output — Mobilization checklist, zone readiness, resource demand.
- **Kiểm soát sản phẩm:** Permission — Nhà thầu cập nhật package; Site Manager duyệt workfront; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Site Manager, PM, nhà thầu (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Mobilization checklist, zone readiness, resource demand, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-076"></a>
### FR-076 — Daily/weekly/look-ahead plan có constraint và cam kết

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Daily/weekly/look-ahead plan có constraint và cam kết. Từ WBS activity, planned quantity, crew, material, permit, predecessor, hệ thống phải tạo 2–6 week look-ahead, weekly commitment, constraint log cho Site, Scheduler, subcontractor trong đúng data scope.
- **Truy vết:** Source: `CON-002`; Business Requirement: [BR-018](./02-BRD.md#br-018--quản-lý-wbs-baseline-look-ahead-và-khối-lượng), [BR-019](./02-BRD.md#br-019--ghi-nhận-nhật-ký-nguồn-lực-vật-tư-và-bằng-chứng-hiện-trường), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Site, Scheduler, subcontractor; phạm vi — Dùng chung; boundary — PM; input — WBS activity, planned quantity, crew, material, permit, predecessor; output — 2–6 week look-ahead, weekly commitment, constraint log.
- **Kiểm soát sản phẩm:** Permission — Nhà thầu đề xuất; Site Manager chốt; Scheduler đồng bộ tiến độ; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Site, Scheduler, subcontractor (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được 2–6 week look-ahead, weekly commitment, constraint log, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-077"></a>
### FR-077 — Theo dõi khối lượng và percent complete có quy tắc đo

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Theo dõi khối lượng và percent complete có quy tắc đo. Từ BOQ, installed quantity, measurement sheet, photo/inspection, hệ thống phải tạo Earned quantity, progress %, payment/forecast evidence cho Site, QS, PM, Finance trong đúng data scope.
- **Truy vết:** Source: `CON-003`; Business Requirement: [BR-018](./02-BRD.md#br-018--quản-lý-wbs-baseline-look-ahead-và-khối-lượng), [BR-019](./02-BRD.md#br-019--ghi-nhận-nhật-ký-nguồn-lực-vật-tư-và-bằng-chứng-hiện-trường), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Site, QS, PM, Finance; phạm vi — Dùng chung; boundary — PM; input — BOQ, installed quantity, measurement sheet, photo/inspection; output — Earned quantity, progress %, payment/forecast evidence.
- **Kiểm soát sản phẩm:** Permission — Nhà thầu khai; QS/QA xác nhận; PM duyệt kỳ báo cáo; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Site, QS, PM, Finance (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Earned quantity, progress %, payment/forecast evidence, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-078"></a>
### FR-078 — Nhật ký và báo cáo ngày/tuần/tháng; giữ bằng chứng thời tiết, công việc và trở ngại

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Nhật ký và báo cáo ngày/tuần/tháng; giữ bằng chứng thời tiết, công việc và trở ngại. Từ Weather, activity, labor, equipment, delivery, event, photo, hệ thống phải tạo Daily log, weekly/monthly report, delay/event evidence cho Site, PM, contractor trong đúng data scope.
- **Truy vết:** Source: `CON-004`; Business Requirement: [BR-019](./02-BRD.md#br-019--ghi-nhận-nhật-ký-nguồn-lực-vật-tư-và-bằng-chứng-hiện-trường), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Site, PM, contractor; phạm vi — Dùng chung; boundary — PM; input — Weather, activity, labor, equipment, delivery, event, photo; output — Daily log, weekly/monthly report, delay/event evidence.
- **Kiểm soát sản phẩm:** Permission — Site lập; Site Manager ký xác nhận; sửa sau ký tạo amendment; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Site, PM, contractor (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Daily log, weekly/monthly report, delay/event evidence, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-079"></a>
### FR-079 — Quản lý nhân lực và máy móc theo nhà thầu/khu vực/ca

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Quản lý nhân lực và máy móc theo nhà thầu/khu vực/ca. Từ Person/skill, induction, machine/certification, check-in, shift, hệ thống phải tạo Headcount, utilization, competency/certificate expiry cho Site, HSE, contractor trong đúng data scope.
- **Truy vết:** Source: `CON-005`; Business Requirement: [BR-019](./02-BRD.md#br-019--ghi-nhận-nhật-ký-nguồn-lực-vật-tư-và-bằng-chứng-hiện-trường), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Site, HSE, contractor; phạm vi — Dùng chung; boundary — PM; input — Person/skill, induction, machine/certification, check-in, shift; output — Headcount, utilization, competency/certificate expiry.
- **Kiểm soát sản phẩm:** Permission — Nhà thầu chỉ nhân sự mình; HSE khóa người/thiết bị không đủ điều kiện; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Site, HSE, contractor (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Headcount, utilization, competency/certificate expiry, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-080"></a>
### FR-080 — Vật tư công trường, cấp phát và điều kiện bảo quản

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Vật tư công trường, cấp phát và điều kiện bảo quản. Từ Stock, storage location, reservation, issue/return, inspection status, hệ thống phải tạo Site inventory, material availability, traceability đến hạng mục cho Storekeeper, Site, QA/QC trong đúng data scope.
- **Truy vết:** Source: `CON-006`; Business Requirement: [BR-019](./02-BRD.md#br-019--ghi-nhận-nhật-ký-nguồn-lực-vật-tư-và-bằng-chứng-hiện-trường), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Storekeeper, Site, QA/QC; phạm vi — Dùng chung/Solar/BESS; boundary — PM; input — Stock, storage location, reservation, issue/return, inspection status; output — Site inventory, material availability, traceability đến hạng mục.
- **Kiểm soát sản phẩm:** Permission — Chỉ vật tư QA-released được cấp cho thi công; điều chỉnh cần phê duyệt; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Storekeeper, Site, QA/QC (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Site inventory, material availability, traceability đến hạng mục, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-081"></a>
### FR-081 — Permit to Work theo khu vực/công việc/thời gian và hazard control

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Permit to Work theo khu vực/công việc/thời gian và hazard control. Từ Work method, hazard/JSA, isolation, competent person, validity, hệ thống phải tạo PTW issued/suspended/closed, field verification cho HSE, Site, contractor trong đúng data scope.
- **Truy vết:** Source: `CON-007`; Business Requirement: [BR-020](./02-BRD.md#br-020--kiểm-soát-ptw-hse-inspection-toolbox-và-incident), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — HSE, Site, contractor; phạm vi — Dùng chung/BESS; boundary — PM + O&M; input — Work method, hazard/JSA, isolation, competent person, validity; output — PTW issued/suspended/closed, field verification.
- **Kiểm soát sản phẩm:** Permission — Người yêu cầu không tự cấp permit; HSE/Site có quyền suspend/stop-work; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — HSE, Site, contractor (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được PTW issued/suspended/closed, field verification, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-082"></a>
### FR-082 — Site instruction, RFI, variation và claim notice có mốc thời gian hợp đồng

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Site instruction, RFI, variation và claim notice có mốc thời gian hợp đồng. Từ Event, instruction, affected scope, notice deadline, evidence, hệ thống phải tạo Instruction log, potential variation/claim, response/escalation cho Site, PM, Legal, Cost trong đúng data scope.
- **Truy vết:** Source: `CON-008`; Business Requirement: [BR-022](./02-BRD.md#br-022--quản-lý-rfi-site-instruction-variation-và-claim-có-thời-hạn), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Site, PM, Legal, Cost; phạm vi — Dùng chung; boundary — PM; input — Event, instruction, affected scope, notice deadline, evidence; output — Instruction log, potential variation/claim, response/escalation.
- **Kiểm soát sản phẩm:** Permission — Chỉ người có delegated authority phát hành instruction ràng buộc; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Site, PM, Legal, Cost (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Instruction log, potential variation/claim, response/escalation, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-083"></a>
### FR-083 — Ảnh hiện trường gắn zone, hạng mục, ngày, task và GPS tùy policy

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Ảnh hiện trường gắn zone, hạng mục, ngày, task và GPS tùy policy. Từ Ảnh/video, metadata, caption, entity links, hệ thống phải tạo Photo register, before/after evidence, report attachment cho Site, QA/QC, HSE, PM trong đúng data scope.
- **Truy vết:** Source: `CON-009`; Business Requirement: [BR-019](./02-BRD.md#br-019--ghi-nhận-nhật-ký-nguồn-lực-vật-tư-và-bằng-chứng-hiện-trường), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Site, QA/QC, HSE, PM; phạm vi — Dùng chung; boundary — PM; input — Ảnh/video, metadata, caption, entity links; output — Photo register, before/after evidence, report attachment.
- **Kiểm soát sản phẩm:** Permission — Theo project/package; ảnh nhạy cảm có hạn chế download/share; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Site, QA/QC, HSE, PM (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Photo register, before/after evidence, report attachment, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-084"></a>
### FR-084 — Xác nhận hoàn thành trên mobile/tablet và ký xác nhận điện tử

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Xác nhận hoàn thành trên mobile/tablet và ký xác nhận điện tử. Từ Checklist, quantity, evidence, signer/authority, hệ thống phải tạo Signed completion record, timestamp, certificate trail cho Site, contractor, owner/consultant trong đúng data scope.
- **Truy vết:** Source: `CON-010`; Business Requirement: [BR-019](./02-BRD.md#br-019--ghi-nhận-nhật-ký-nguồn-lực-vật-tư-và-bằng-chứng-hiện-trường), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — Site, contractor, owner/consultant; phạm vi — Dùng chung; boundary — PM; input — Checklist, quantity, evidence, signer/authority; output — Signed completion record, timestamp, certificate trail.
- **Kiểm soát sản phẩm:** Permission — Chữ ký chỉ hợp lệ khi signer có authority; offline chỉ lưu draft chưa ký; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Site, contractor, owner/consultant (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Signed completion record, timestamp, certificate trail, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

#### HSE — Health, Safety and Environment

<a id="fr-085"></a>
### FR-085 — HSE plan, inspection và compliance calendar

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ HSE plan, inspection và compliance calendar. Từ Plan, checklist, regulation/project rule, inspection schedule, hệ thống phải tạo Inspection findings, compliance score, corrective actions cho HSE, Site, contractor trong đúng data scope.
- **Truy vết:** Source: `HSE-001`; Business Requirement: [BR-020](./02-BRD.md#br-020--kiểm-soát-ptw-hse-inspection-toolbox-và-incident), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — HSE, Site, contractor; phạm vi — Dùng chung/BESS; boundary — PM + O&M; input — Plan, checklist, regulation/project rule, inspection schedule; output — Inspection findings, compliance score, corrective actions.
- **Kiểm soát sản phẩm:** Permission — HSE lập/duyệt; contractor phản hồi phần được giao; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — HSE, Site, contractor (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Inspection findings, compliance score, corrective actions, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-086"></a>
### FR-086 — Toolbox meeting và competency attendance

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Toolbox meeting và competency attendance. Từ Topic, hazard, attendee, language, acknowledgement, hệ thống phải tạo Toolbox record, attendance gap, evidence cho HSE, supervisor, worker trong đúng data scope.
- **Truy vết:** Source: `HSE-002`; Business Requirement: [BR-020](./02-BRD.md#br-020--kiểm-soát-ptw-hse-inspection-toolbox-và-incident), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — HSE, supervisor, worker; phạm vi — Dùng chung; boundary — PM + O&M; input — Topic, hazard, attendee, language, acknowledgement; output — Toolbox record, attendance gap, evidence.
- **Kiểm soát sản phẩm:** Permission — Supervisor ghi; HSE audit; worker chỉ xác nhận bản thân; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — HSE, supervisor, worker (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Toolbox record, attendance gap, evidence, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-087"></a>
### FR-087 — Incident và near-miss report với phân loại mức độ

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Incident và near-miss report với phân loại mức độ. Từ Event, time/location, people, photo, immediate action, hệ thống phải tạo Incident record, notification, investigation trigger cho HSE, mọi người dùng hiện trường trong đúng data scope.
- **Truy vết:** Source: `HSE-003`; Business Requirement: [BR-020](./02-BRD.md#br-020--kiểm-soát-ptw-hse-inspection-toolbox-và-incident), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — HSE, mọi người dùng hiện trường; phạm vi — Dùng chung/BESS; boundary — PM + O&M; input — Event, time/location, people, photo, immediate action; output — Incident record, notification, investigation trigger.
- **Kiểm soát sản phẩm:** Permission — Ai cũng được report; chỉ HSE phân loại/đóng; dữ liệu cá nhân hạn chế; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — HSE, mọi người dùng hiện trường (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Incident record, notification, investigation trigger, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-088"></a>
### FR-088 — Điều tra nguyên nhân và corrective/preventive action

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Điều tra nguyên nhân và corrective/preventive action. Từ Incident/finding, root cause, action, owner, due date, hệ thống phải tạo CAPA, effectiveness review, lessons learned cho HSE, PM, contractor trong đúng data scope.
- **Truy vết:** Source: `HSE-004`; Business Requirement: [BR-020](./02-BRD.md#br-020--kiểm-soát-ptw-hse-inspection-toolbox-và-incident), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — HSE, PM, contractor; phạm vi — Dùng chung; boundary — PM + O&M; input — Incident/finding, root cause, action, owner, due date; output — CAPA, effectiveness review, lessons learned.
- **Kiểm soát sản phẩm:** Permission — Investigator và approver tách biệt với owner action khi severity cao; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — HSE, PM, contractor (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được CAPA, effectiveness review, lessons learned, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-089"></a>
### FR-089 — Stop-work, isolation và escalation an toàn

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Stop-work, isolation và escalation an toàn. Từ Unsafe condition, area/system, authority, evidence, hệ thống phải tạo Stop-work state, affected tasks, release approval cho HSE, Site, authorized persons trong đúng data scope.
- **Truy vết:** Source: `HSE-005`; Business Requirement: [BR-020](./02-BRD.md#br-020--kiểm-soát-ptw-hse-inspection-toolbox-và-incident), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — HSE, Site, authorized persons; phạm vi — Dùng chung/BESS; boundary — PM + O&M; input — Unsafe condition, area/system, authority, evidence; output — Stop-work state, affected tasks, release approval.
- **Kiểm soát sản phẩm:** Permission — Quyền stop-work rộng; chỉ designated authority release; hard-cap Health Score; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — HSE, Site, authorized persons (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Stop-work state, affected tasks, release approval, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-090"></a>
### FR-090 — Dashboard/báo cáo leading và lagging indicators

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Dashboard/báo cáo leading và lagging indicators. Từ Inspection, PTW, toolbox, incident, CAPA hours, hệ thống phải tạo TRIR/LTI nếu áp dụng, overdue action, trend, heatmap cho HSE, PM, lãnh đạo trong đúng data scope.
- **Truy vết:** Source: `HSE-006`; Business Requirement: [BR-020](./02-BRD.md#br-020--kiểm-soát-ptw-hse-inspection-toolbox-và-incident), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-036](./02-BRD.md#br-036--cung-cấp-dashboard-theo-vai-trò-và-báo-cáo-snapshot-có-kiểm-soát).
- **Phạm vi sản phẩm:** Actor/persona — HSE, PM, lãnh đạo; phạm vi — Dùng chung; boundary — PM + O&M; input — Inspection, PTW, toolbox, incident, CAPA hours; output — TRIR/LTI nếu áp dụng, overdue action, trend, heatmap.
- **Kiểm soát sản phẩm:** Permission — Lãnh đạo xem tổng hợp; PII ẩn theo quyền; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — HSE, PM, lãnh đạo (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được TRIR/LTI nếu áp dụng, overdue action, trend, heatmap, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

#### QAC — Quality assurance/control

<a id="fr-091"></a>
### FR-091 — Inspection and Test Plan với hold/witness/review point

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Inspection and Test Plan với hold/witness/review point. Từ Scope, method, acceptance criteria, party/point, record template, hệ thống phải tạo Approved ITP, inspection schedule, witness notice cho QA/QC, Engineering, contractor, owner trong đúng data scope.
- **Truy vết:** Source: `QAC-001`; Business Requirement: [BR-021](./02-BRD.md#br-021--kiểm-soát-itp-inspection-ncr-và-punch), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — QA/QC, Engineering, contractor, owner; phạm vi — Dùng chung/Solar/BESS; boundary — PM; input — Scope, method, acceptance criteria, party/point, record template; output — Approved ITP, inspection schedule, witness notice.
- **Kiểm soát sản phẩm:** Permission — QA/QC lập; owner/consultant duyệt; không bỏ qua hold point; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — QA/QC, Engineering, contractor, owner (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Approved ITP, inspection schedule, witness notice, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-092"></a>
### FR-092 — Inspection/checklist nghiệm thu gắn WBS, asset, drawing và ITP

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Inspection/checklist nghiệm thu gắn WBS, asset, drawing và ITP. Từ Work item, approved drawing, checklist, measurement, evidence, hệ thống phải tạo Inspection result, accepted/rejected, signed record cho QA/QC, Site, contractor trong đúng data scope.
- **Truy vết:** Source: `QAC-002`; Business Requirement: [BR-021](./02-BRD.md#br-021--kiểm-soát-itp-inspection-ncr-và-punch), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — QA/QC, Site, contractor; phạm vi — Dùng chung; boundary — PM; input — Work item, approved drawing, checklist, measurement, evidence; output — Inspection result, accepted/rejected, signed record.
- **Kiểm soát sản phẩm:** Permission — Contractor request; QA/owner inspect; signer theo authority; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — QA/QC, Site, contractor (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Inspection result, accepted/rejected, signed record, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-093"></a>
### FR-093 — NCR từ phát hiện đến root cause, disposition và verification

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ NCR từ phát hiện đến root cause, disposition và verification. Từ Nonconformity, severity, affected asset/work, evidence, hệ thống phải tạo NCR, repair/rework/use-as-is decision, closure evidence cho QA/QC, contractor, Engineering trong đúng data scope.
- **Truy vết:** Source: `QAC-003`; Business Requirement: [BR-021](./02-BRD.md#br-021--kiểm-soát-itp-inspection-ncr-và-punch), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — QA/QC, contractor, Engineering; phạm vi — Dùng chung/Solar/BESS; boundary — PM + O&M; input — Nonconformity, severity, affected asset/work, evidence; output — NCR, repair/rework/use-as-is decision, closure evidence.
- **Kiểm soát sản phẩm:** Permission — Use-as-is cần Engineering/owner approval; contractor không tự đóng; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — QA/QC, contractor, Engineering (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được NCR, repair/rework/use-as-is decision, closure evidence, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-094"></a>
### FR-094 — Punch list theo system/area/category với criticality và due date

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Punch list theo system/area/category với criticality và due date. Từ Punch, category A/B/C, location/asset, owner, evidence, hệ thống phải tạo Open/closed punch, retest link, COD blocking status cho QA/QC, Commissioning, contractor trong đúng data scope.
- **Truy vết:** Source: `QAC-004`; Business Requirement: [BR-021](./02-BRD.md#br-021--kiểm-soát-itp-inspection-ncr-và-punch), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — QA/QC, Commissioning, contractor; phạm vi — Dùng chung/Solar/BESS; boundary — PM + O&M; input — Punch, category A/B/C, location/asset, owner, evidence; output — Open/closed punch, retest link, COD blocking status.
- **Kiểm soát sản phẩm:** Permission — Category/closure do authorized QA/Commissioning xác nhận; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — QA/QC, Commissioning, contractor (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Open/closed punch, retest link, COD blocking status, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-095"></a>
### FR-095 — Material/equipment inspection và traceability serial–certificate–installation

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Material/equipment inspection và traceability serial–certificate–installation. Từ PO, CO/CQ, serial, FAT/receipt inspection, installation record, hệ thống phải tạo Traceability chain, quarantine/release status cho QA/QC, Procurement, Site trong đúng data scope.
- **Truy vết:** Source: `QAC-005`; Business Requirement: [BR-013](./02-BRD.md#br-013--truy-vết-danh-mục-thiết-bị-solar), [BR-021](./02-BRD.md#br-021--kiểm-soát-itp-inspection-ncr-và-punch), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — QA/QC, Procurement, Site; phạm vi — Dùng chung/Solar/BESS; boundary — PM; input — PO, CO/CQ, serial, FAT/receipt inspection, installation record; output — Traceability chain, quarantine/release status.
- **Kiểm soát sản phẩm:** Permission — Chỉ QA release vật tư; Site không dùng item quarantine; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — QA/QC, Procurement, Site (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Traceability chain, quarantine/release status, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-096"></a>
### FR-096 — Hồ sơ nghiệm thu và dossier completeness

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Hồ sơ nghiệm thu và dossier completeness. Từ ITP records, checklists, test report, drawing, signature, hệ thống phải tạo Acceptance dossier, completeness %, missing list cho QA/QC, Document Controller, PM trong đúng data scope.
- **Truy vết:** Source: `QAC-006`; Business Requirement: [BR-021](./02-BRD.md#br-021--kiểm-soát-itp-inspection-ncr-và-punch), [BR-023](./02-BRD.md#br-023--quản-lý-pre-commissioning-commissioning-và-test-package), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời).
- **Phạm vi sản phẩm:** Actor/persona — QA/QC, Document Controller, PM; phạm vi — Dùng chung; boundary — PM; input — ITP records, checklists, test report, drawing, signature; output — Acceptance dossier, completeness %, missing list.
- **Kiểm soát sản phẩm:** Permission — Document Controller lập; QA xác nhận; owner phê duyệt; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — QA/QC, Document Controller, PM (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Acceptance dossier, completeness %, missing list, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-097"></a>
### FR-097 — Dashboard NCR/punch/inspection và trend nguyên nhân

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Dashboard NCR/punch/inspection và trend nguyên nhân. Từ Inspection/NCR/punch/CAPA data, hệ thống phải tạo Aging, recurrence, open severity, first-pass yield cho QA/QC, PM, lãnh đạo trong đúng data scope.
- **Truy vết:** Source: `QAC-007`; Business Requirement: [BR-021](./02-BRD.md#br-021--kiểm-soát-itp-inspection-ncr-và-punch), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-036](./02-BRD.md#br-036--cung-cấp-dashboard-theo-vai-trò-và-báo-cáo-snapshot-có-kiểm-soát).
- **Phạm vi sản phẩm:** Actor/persona — QA/QC, PM, lãnh đạo; phạm vi — Dùng chung; boundary — PM + O&M; input — Inspection/NCR/punch/CAPA data; output — Aging, recurrence, open severity, first-pass yield.
- **Kiểm soát sản phẩm:** Permission — Theo project/package; vendor chỉ dữ liệu của mình; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — QA/QC, PM, lãnh đạo (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Aging, recurrence, open severity, first-pass yield, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

### 10.4. Commissioning, COD, O&M và chuyên ngành Solar/BESS

#### COM — Commissioning/COD

<a id="fr-106"></a>
### FR-106 — Systemization và commissioning plan theo system/subsystem/tag

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Systemization và commissioning plan theo system/subsystem/tag. Từ Asset hierarchy, boundaries, dependency, test pack, responsible party, hệ thống phải tạo System/subsystem register, sequence, readiness plan cho Commissioning, Engineering, QA/QC, O&M trong đúng data scope.
- **Truy vết:** Source: `COM-001`; Business Requirement: [BR-023](./02-BRD.md#br-023--quản-lý-pre-commissioning-commissioning-và-test-package).
- **Phạm vi sản phẩm:** Actor/persona — Commissioning, Engineering, QA/QC, O&M; phạm vi — Dùng chung/Solar/BESS; boundary — PM + O&M; input — Asset hierarchy, boundaries, dependency, test pack, responsible party; output — System/subsystem register, sequence, readiness plan.
- **Kiểm soát sản phẩm:** Permission — Commissioning Manager quản lý boundary; thay đổi cần review liên ngành; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R3; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Commissioning, Engineering, QA/QC, O&M (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được System/subsystem register, sequence, readiness plan, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-107"></a>
### FR-107 — Pre-commissioning checklist và mechanical completion

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Pre-commissioning checklist và mechanical completion. Từ Installation/inspection records, cleaning, torque, continuity, punch, hệ thống phải tạo MC certificate, pre-commissioning release, open punch cho Commissioning, QA/QC, contractor trong đúng data scope.
- **Truy vết:** Source: `COM-002`; Business Requirement: [BR-023](./02-BRD.md#br-023--quản-lý-pre-commissioning-commissioning-và-test-package).
- **Phạm vi sản phẩm:** Actor/persona — Commissioning, QA/QC, contractor; phạm vi — Dùng chung/Solar/BESS; boundary — PM; input — Installation/inspection records, cleaning, torque, continuity, punch; output — MC certificate, pre-commissioning release, open punch.
- **Kiểm soát sản phẩm:** Permission — Contractor đề nghị; QA/Commissioning xác nhận; Category A chặn release; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R3; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Commissioning, QA/QC, contractor (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được MC certificate, pre-commissioning release, open punch, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-108"></a>
### FR-108 — Test điện: insulation resistance, relay protection, transformer, inverter và PCS

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Test điện: insulation resistance, relay protection, transformer, inverter và PCS. Từ Approved procedure, instrument/calibration, setting, measurement, hệ thống phải tạo Test report, pass/fail, defect/retest, signed evidence cho Commissioning, Electrical Engineer, owner trong đúng data scope.
- **Truy vết:** Source: `COM-003`; Business Requirement: [BR-023](./02-BRD.md#br-023--quản-lý-pre-commissioning-commissioning-và-test-package), [BR-024](./02-BRD.md#br-024--quản-lý-test-và-performance-acceptance-solar), [BR-025](./02-BRD.md#br-025--quản-lý-test-an-toàn-chức-năng-và-hiệu-suất-bess).
- **Phạm vi sản phẩm:** Actor/persona — Commissioning, Electrical Engineer, owner; phạm vi — Dùng chung/Solar/BESS; boundary — PM; input — Approved procedure, instrument/calibration, setting, measurement; output — Test report, pass/fail, defect/retest, signed evidence.
- **Kiểm soát sản phẩm:** Permission — Người test đủ competency; witness/approver theo ITP; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R3; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Commissioning, Electrical Engineer, owner (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Test report, pass/fail, defect/retest, signed evidence, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-109"></a>
### FR-109 — Test điều khiển/an toàn: BMS, EMS, SCADA, fire alarm/suppression, gas, E-Stop và cause-and-effect

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Test điều khiển/an toàn: BMS, EMS, SCADA, fire alarm/suppression, gas, E-Stop và cause-and-effect. Từ Point list, cause-effect, procedure, simulated condition, hệ thống phải tạo Functional test, alarm/interlock evidence, defect/retest cho Commissioning, BESS/SCADA Engineer, HSE, Fire authority trong đúng data scope.
- **Truy vết:** Source: `COM-004`; Business Requirement: [BR-025](./02-BRD.md#br-025--quản-lý-test-an-toàn-chức-năng-và-hiệu-suất-bess).
- **Phạm vi sản phẩm:** Actor/persona — Commissioning, BESS/SCADA Engineer, HSE, Fire authority; phạm vi — BESS; boundary — PM + O&M; input — Point list, cause-effect, procedure, simulated condition; output — Functional test, alarm/interlock evidence, defect/retest.
- **Kiểm soát sản phẩm:** Permission — Test an toàn cần witness bắt buộc; failed critical test hard-cap Health Score; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R3; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Commissioning, BESS/SCADA Engineer, HSE, Fire authority (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Functional test, alarm/interlock evidence, defect/retest, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-110"></a>
### FR-110 — Capacity/performance test: Solar yield/PR; BESS charge-discharge, SOC/SOH và round-trip efficiency

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Capacity/performance test: Solar yield/PR; BESS charge-discharge, SOC/SOH và round-trip efficiency. Từ Meter data, meteo/load, test window, guarantee/baseline, exclusions, hệ thống phải tạo Normalized result, guarantee comparison, pass/fail, exception cho Commissioning, Performance Engineer, owner trong đúng data scope.
- **Truy vết:** Source: `COM-005`; Business Requirement: [BR-024](./02-BRD.md#br-024--quản-lý-test-và-performance-acceptance-solar), [BR-025](./02-BRD.md#br-025--quản-lý-test-an-toàn-chức-năng-và-hiệu-suất-bess).
- **Phạm vi sản phẩm:** Actor/persona — Commissioning, Performance Engineer, owner; phạm vi — Solar/BESS; boundary — PM + O&M; input — Meter data, meteo/load, test window, guarantee/baseline, exclusions; output — Normalized result, guarantee comparison, pass/fail, exception.
- **Kiểm soát sản phẩm:** Permission — Method/data window duyệt trước; raw data/adjustment bị khóa sau phát hành; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R3; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Commissioning, Performance Engineer, owner (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Normalized result, guarantee comparison, pass/fail, exception, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-111"></a>
### FR-111 — Test report, defect và retest có traceability

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Test report, defect và retest có traceability. Từ Test execution, observation, failure, corrective action, hệ thống phải tạo Signed test report, defect log, retest chain cho Commissioning, QA/QC, contractor/vendor trong đúng data scope.
- **Truy vết:** Source: `COM-006`; Business Requirement: [BR-023](./02-BRD.md#br-023--quản-lý-pre-commissioning-commissioning-và-test-package), [BR-025](./02-BRD.md#br-025--quản-lý-test-an-toàn-chức-năng-và-hiệu-suất-bess).
- **Phạm vi sản phẩm:** Actor/persona — Commissioning, QA/QC, contractor/vendor; phạm vi — Dùng chung/Solar/BESS; boundary — PM + O&M; input — Test execution, observation, failure, corrective action; output — Signed test report, defect log, retest chain.
- **Kiểm soát sản phẩm:** Permission — Không sửa kết quả cũ; retest là lần chạy mới; approver độc lập; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R3; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Commissioning, QA/QC, contractor/vendor (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Signed test report, defect log, retest chain, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-112"></a>
### FR-112 — Ma trận COD readiness: pháp lý, hợp đồng, kỹ thuật, chất lượng, an toàn, tài liệu và thương mại

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Ma trận COD readiness: pháp lý, hợp đồng, kỹ thuật, chất lượng, an toàn, tài liệu và thương mại. Từ Gate criteria, evidence, owner, due date, waiver/condition, hệ thống phải tạo Readiness %, blocker list, forecast COD, evidence pack cho PM, Commissioning, Legal, Finance, owner trong đúng data scope.
- **Truy vết:** Source: `COM-007`; Business Requirement: [BR-026](./02-BRD.md#br-026--quản-lý-cod-gate-và-bàn-giao-số-sang-om).
- **Phạm vi sản phẩm:** Actor/persona — PM, Commissioning, Legal, Finance, owner; phạm vi — Dùng chung/Solar/BESS; boundary — PM; input — Gate criteria, evidence, owner, due date, waiver/condition; output — Readiness %, blocker list, forecast COD, evidence pack.
- **Kiểm soát sản phẩm:** Permission — Owner cập nhật; function lead xác nhận; PM không tự waive điều kiện ngoài thẩm quyền; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R3; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — PM, Commissioning, Legal, Finance, owner (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Readiness %, blocker list, forecast COD, evidence pack, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-113"></a>
### FR-113 — Workflow phê duyệt COD và biên bản COD

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Workflow phê duyệt COD và biên bản COD. Từ COD matrix, signed tests, acceptance, outstanding conditions, hệ thống phải tạo Approved/rejected/conditional COD, certificate, effective timestamp cho Sponsor/Owner, PM, Commissioning, Legal, Finance trong đúng data scope.
- **Truy vết:** Source: `COM-008`; Business Requirement: [BR-026](./02-BRD.md#br-026--quản-lý-cod-gate-và-bàn-giao-số-sang-om).
- **Phạm vi sản phẩm:** Actor/persona — Sponsor/Owner, PM, Commissioning, Legal, Finance; phạm vi — Dùng chung/Solar/BESS; boundary — PM + O&M; input — COD matrix, signed tests, acceptance, outstanding conditions; output — Approved/rejected/conditional COD, certificate, effective timestamp.
- **Kiểm soát sản phẩm:** Permission — Chỉ authorized signatory ký; điều kiện chưa đóng ghi rõ owner/date; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R3; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Sponsor/Owner, PM, Commissioning, Legal, Finance (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Approved/rejected/conditional COD, certificate, effective timestamp, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-114"></a>
### FR-114 — Bàn giao asset, As-built, O&M manual, warranty, spare và tài khoản giám sát

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Bàn giao asset, As-built, O&M manual, warranty, spare và tài khoản giám sát. Từ Asset/serial, dossier, credential transfer record, training, spare, hệ thống phải tạo Digital handover package, acceptance, open-item transition cho PM, Document Controller, O&M, owner trong đúng data scope.
- **Truy vết:** Source: `COM-009`; Business Requirement: [BR-026](./02-BRD.md#br-026--quản-lý-cod-gate-và-bàn-giao-số-sang-om).
- **Phạm vi sản phẩm:** Actor/persona — PM, Document Controller, O&M, owner; phạm vi — Dùng chung/Solar/BESS; boundary — PM + O&M; input — Asset/serial, dossier, credential transfer record, training, spare; output — Digital handover package, acceptance, open-item transition.
- **Kiểm soát sản phẩm:** Permission — Mật khẩu không lưu trong biên bản rõ; transfer qua secret channel; O&M accept; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R3; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — PM, Document Controller, O&M, owner (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Digital handover package, acceptance, open-item transition, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

#### OMM — O&M monitoring

<a id="fr-115"></a>
### FR-115 — Dashboard công suất tức thời và trạng thái fleet/site đọc từ telemetry

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Dashboard công suất tức thời và trạng thái fleet/site đọc từ telemetry. Từ Meter/inverter/SCADA/EMS/BMS tags, data quality, timestamp, hệ thống phải tạo Power/energy/status tiles, last-seen, stale-data badge cho O&M, Asset Manager, khách hàng trong đúng data scope.
- **Truy vết:** Source: `OMM-001`; Business Requirement: [BR-027](./02-BRD.md#br-027--giám-sát-kpi-vận-hành-solar-có-provenance).
- **Phạm vi sản phẩm:** Actor/persona — O&M, Asset Manager, khách hàng; phạm vi — Dùng chung/Solar/BESS; boundary — O&M; input — Meter/inverter/SCADA/EMS/BMS tags, data quality, timestamp; output — Power/energy/status tiles, last-seen, stale-data badge.
- **Kiểm soát sản phẩm:** Permission — Read-only; khách hàng chỉ site của mình; không có control command; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R4; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — O&M, Asset Manager, khách hàng (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Power/energy/status tiles, last-seen, stale-data badge, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-116"></a>
### FR-116 — KPI Solar: sản lượng, PR, availability, self-consumption, EVN avoided energy và savings

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ KPI Solar: sản lượng, PR, availability, self-consumption, EVN avoided energy và savings. Từ AC/DC energy, irradiance, temperature, load/import/export, tariff, hệ thống phải tạo Daily/monthly KPI, baseline variance, savings report cho O&M, khách hàng, investor trong đúng data scope.
- **Truy vết:** Source: `OMM-002`; Business Requirement: [BR-027](./02-BRD.md#br-027--giám-sát-kpi-vận-hành-solar-có-provenance).
- **Phạm vi sản phẩm:** Actor/persona — O&M, khách hàng, investor; phạm vi — Solar; boundary — O&M; input — AC/DC energy, irradiance, temperature, load/import/export, tariff; output — Daily/monthly KPI, baseline variance, savings report.
- **Kiểm soát sản phẩm:** Permission — Formula/baseline version hóa; Finance xác nhận tariff; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R4; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — O&M, khách hàng, investor (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Daily/monthly KPI, baseline variance, savings report, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-117"></a>
### FR-117 — KPI BESS: charge/discharge energy, SOC, SOH, RTE, availability, peak cut và cycle

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ KPI BESS: charge/discharge energy, SOC, SOH, RTE, availability, peak cut và cycle. Từ PCS/BMS/meter tags, schedule, baseline, warranty envelope, hệ thống phải tạo KPI/trend, peak shaving result, operating-envelope exception cho O&M, Asset Manager, investor trong đúng data scope.
- **Truy vết:** Source: `OMM-003`; Business Requirement: [BR-028](./02-BRD.md#br-028--giám-sát-bess-kpi-degradation-và-operating-history).
- **Phạm vi sản phẩm:** Actor/persona — O&M, Asset Manager, investor; phạm vi — BESS; boundary — O&M; input — PCS/BMS/meter tags, schedule, baseline, warranty envelope; output — KPI/trend, peak shaving result, operating-envelope exception.
- **Kiểm soát sản phẩm:** Permission — Read-only; không phát lệnh; dữ liệu cell giới hạn người có nhiệm vụ; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R4; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — O&M, Asset Manager, investor (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được KPI/trend, peak shaving result, operating-envelope exception, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-118"></a>
### FR-118 — Alarm và sự cố với deduplication, severity, acknowledgement và event timeline

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Alarm và sự cố với deduplication, severity, acknowledgement và event timeline. Từ Alarm/event stream, equipment, state, timestamp, hệ thống phải tạo Incident candidate, priority, notification, correlated timeline cho O&M, vendor support, customer trong đúng data scope.
- **Truy vết:** Source: `OMM-004`; Business Requirement: [BR-029](./02-BRD.md#br-029--quản-lý-alarm-work-order-maintenance-spare-warranty-và-sla).
- **Phạm vi sản phẩm:** Actor/persona — O&M, vendor support, customer; phạm vi — Dùng chung/Solar/BESS; boundary — O&M; input — Alarm/event stream, equipment, state, timestamp; output — Incident candidate, priority, notification, correlated timeline.
- **Kiểm soát sản phẩm:** Permission — Ack không phải close; vendor chỉ alarm thiết bị được giao; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R4; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — O&M, vendor support, customer (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Incident candidate, priority, notification, correlated timeline, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-119"></a>
### FR-119 — Work order từ alarm/inspection/yêu cầu khách hàng

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Work order từ alarm/inspection/yêu cầu khách hàng. Từ Fault/request, asset, priority, skill, spare, SLA, hệ thống phải tạo Assigned WO, job steps, field evidence, downtime/cost cho Planner, Technician, vendor trong đúng data scope.
- **Truy vết:** Source: `OMM-005`; Business Requirement: [BR-029](./02-BRD.md#br-029--quản-lý-alarm-work-order-maintenance-spare-warranty-và-sla).
- **Phạm vi sản phẩm:** Actor/persona — Planner, Technician, vendor; phạm vi — Dùng chung/Solar/BESS; boundary — O&M; input — Fault/request, asset, priority, skill, spare, SLA; output — Assigned WO, job steps, field evidence, downtime/cost.
- **Kiểm soát sản phẩm:** Permission — Planner dispatch; technician update; verifier đóng; critical isolation theo PTW; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R4; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Planner, Technician, vendor (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Assigned WO, job steps, field evidence, downtime/cost, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-120"></a>
### FR-120 — Bảo trì định kỳ và đột xuất theo thời gian/cycle/condition

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Bảo trì định kỳ và đột xuất theo thời gian/cycle/condition. Từ Maintenance plan, meter/cycle, OEM task, condition trigger, hệ thống phải tạo Calendar, due/overdue PM, generated WO, compliance cho O&M Planner, Technician trong đúng data scope.
- **Truy vết:** Source: `OMM-006`; Business Requirement: [BR-029](./02-BRD.md#br-029--quản-lý-alarm-work-order-maintenance-spare-warranty-và-sla).
- **Phạm vi sản phẩm:** Actor/persona — O&M Planner, Technician; phạm vi — Dùng chung/Solar/BESS; boundary — O&M; input — Maintenance plan, meter/cycle, OEM task, condition trigger; output — Calendar, due/overdue PM, generated WO, compliance.
- **Kiểm soát sản phẩm:** Permission — Planner quản lý plan; OEM content version hóa; skip cần approval; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R4; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — O&M Planner, Technician (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Calendar, due/overdue PM, generated WO, compliance, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-121"></a>
### FR-121 — Phụ tùng, bảo hành và SLA phản hồi/xử lý

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Phụ tùng, bảo hành và SLA phản hồi/xử lý. Từ Spare stock, warranty terms, case, response/restore target, hệ thống phải tạo Reservation, warranty claim, SLA clock, breach alert cho O&M, Warehouse, Procurement, vendor trong đúng data scope.
- **Truy vết:** Source: `OMM-007`; Business Requirement: [BR-029](./02-BRD.md#br-029--quản-lý-alarm-work-order-maintenance-spare-warranty-và-sla).
- **Phạm vi sản phẩm:** Actor/persona — O&M, Warehouse, Procurement, vendor; phạm vi — Dùng chung/Solar/BESS; boundary — O&M; input — Spare stock, warranty terms, case, response/restore target; output — Reservation, warranty claim, SLA clock, breach alert.
- **Kiểm soát sản phẩm:** Permission — Vendor chỉ case của mình; warranty approval theo contract authority; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R4; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — O&M, Warehouse, Procurement, vendor (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Reservation, warranty claim, SLA clock, breach alert, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-122"></a>
### FR-122 — BESS degradation, cycle count, DoD, nhiệt độ cell, cell imbalance và lịch charge-discharge

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ BESS degradation, cycle count, DoD, nhiệt độ cell, cell imbalance và lịch charge-discharge. Từ Cell/rack tags, cycle definition, warranty curve, event history, hệ thống phải tạo Degradation trend, imbalance/hot-cell alert, warranty evidence cho BESS O&M, Asset Manager, OEM trong đúng data scope.
- **Truy vết:** Source: `OMM-008`; Business Requirement: [BR-028](./02-BRD.md#br-028--giám-sát-bess-kpi-degradation-và-operating-history).
- **Phạm vi sản phẩm:** Actor/persona — BESS O&M, Asset Manager, OEM; phạm vi — BESS; boundary — O&M; input — Cell/rack tags, cycle definition, warranty curve, event history; output — Degradation trend, imbalance/hot-cell alert, warranty evidence.
- **Kiểm soát sản phẩm:** Permission — Quyền hạn chế; dữ liệu gốc immutable; không tự đổi setpoint; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R4; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — BESS O&M, Asset Manager, OEM (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Degradation trend, imbalance/hot-cell alert, warranty evidence, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-123"></a>
### FR-123 — Doanh thu/phí thuê, hóa đơn định kỳ và đối soát công tơ

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Doanh thu/phí thuê, hóa đơn định kỳ và đối soát công tơ. Từ PPA/lease terms, meter reading, tariff, availability, adjustment, hệ thống phải tạo Billing statement, invoice basis, reconciliation exception cho Finance, Asset Manager, customer trong đúng data scope.
- **Truy vết:** Source: `OMM-009`; Business Requirement: [BR-030](./02-BRD.md#br-030--quản-lý-billing-vận-hành-đối-soát-meter-và-report-bên-ngoài).
- **Phạm vi sản phẩm:** Actor/persona — Finance, Asset Manager, customer; phạm vi — Dùng chung/Solar/BESS; boundary — O&M; input — PPA/lease terms, meter reading, tariff, availability, adjustment; output — Billing statement, invoice basis, reconciliation exception.
- **Kiểm soát sản phẩm:** Permission — Finance lập; người khác phê duyệt; customer xem/đối soát site mình; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R4; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Finance, Asset Manager, customer (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Billing statement, invoice basis, reconciliation exception, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-124"></a>
### FR-124 — Báo cáo tháng cho khách hàng/nhà đầu tư

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Báo cáo tháng cho khách hàng/nhà đầu tư. Từ KPI, downtime, WO, SLA, warranty, billing, commentary, hệ thống phải tạo Approved monthly report PDF/Excel, distribution/archive cho O&M, Asset Manager, customer, investor trong đúng data scope.
- **Truy vết:** Source: `OMM-010`; Business Requirement: [BR-030](./02-BRD.md#br-030--quản-lý-billing-vận-hành-đối-soát-meter-và-report-bên-ngoài), [BR-036](./02-BRD.md#br-036--cung-cấp-dashboard-theo-vai-trò-và-báo-cáo-snapshot-có-kiểm-soát).
- **Phạm vi sản phẩm:** Actor/persona — O&M, Asset Manager, customer, investor; phạm vi — Dùng chung/Solar/BESS; boundary — O&M; input — KPI, downtime, WO, SLA, warranty, billing, commentary; output — Approved monthly report PDF/Excel, distribution/archive.
- **Kiểm soát sản phẩm:** Permission — O&M lập; Asset Manager duyệt; từng recipient theo scope; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R4; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — O&M, Asset Manager, customer, investor (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Approved monthly report PDF/Excel, distribution/archive, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

#### SOL — Solar

<a id="fr-125"></a>
### FR-125 — Cấu trúc thiết bị Solar: module, inverter, mounting, DC/AC cabinet, transformer, RMU/MV switchgear, cable, meter, SCADA, cleaning, lightning/earthing

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Cấu trúc thiết bị Solar: module, inverter, mounting, DC/AC cabinet, transformer, RMU/MV switchgear, cable, meter, SCADA, cleaning, lightning/earthing. Từ Model, rating, quantity, string/layout, datasheet, hệ thống phải tạo Equipment hierarchy, technical compliance, asset handover seed cho Solar Engineer, Procurement, O&M trong đúng data scope.
- **Truy vết:** Source: `SOL-001`; Business Requirement: [BR-013](./02-BRD.md#br-013--truy-vết-danh-mục-thiết-bị-solar).
- **Phạm vi sản phẩm:** Actor/persona — Solar Engineer, Procurement, O&M; phạm vi — Solar; boundary — PM + O&M; input — Model, rating, quantity, string/layout, datasheet; output — Equipment hierarchy, technical compliance, asset handover seed.
- **Kiểm soát sản phẩm:** Permission — Engineering quản lý spec; Procurement bổ sung vendor/serial; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R2; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Solar Engineer, Procurement, O&M (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Equipment hierarchy, technical compliance, asset handover seed, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-126"></a>
### FR-126 — Kiểm tra thiết kế DC/AC ratio, string, cable, voltage drop, protection, roof/land constraint

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Kiểm tra thiết kế DC/AC ratio, string, cable, voltage drop, protection, roof/land constraint. Từ Layout, module/inverter data, ambient, cable route, code criteria, hệ thống phải tạo Calculation result, exception list, design approval evidence cho Solar Engineer, reviewer trong đúng data scope.
- **Truy vết:** Source: `SOL-002`; Business Requirement: [BR-013](./02-BRD.md#br-013--truy-vết-danh-mục-thiết-bị-solar).
- **Phạm vi sản phẩm:** Actor/persona — Solar Engineer, reviewer; phạm vi — Solar; boundary — PM; input — Layout, module/inverter data, ambient, cable route, code criteria; output — Calculation result, exception list, design approval evidence.
- **Kiểm soát sản phẩm:** Permission — Kỹ sư chạy; checker độc lập xác nhận; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R2; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Solar Engineer, reviewer (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Calculation result, exception list, design approval evidence, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-127"></a>
### FR-127 — Baseline PVSyst/sản lượng, self-consumption và Performance Ratio làm chuẩn nghiệm thu/O&M

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Baseline PVSyst/sản lượng, self-consumption và Performance Ratio làm chuẩn nghiệm thu/O&M. Từ PVSyst, meteo, load, losses, curtailment assumptions, hệ thống phải tạo Monthly yield baseline, PR target, guarantee values cho Solar Engineer, Energy Analyst trong đúng data scope.
- **Truy vết:** Source: `SOL-003`; Business Requirement: [BR-005](./02-BRD.md#br-005--quản-lý-phương-án-yield-và-sizing-solar-có-version), [BR-024](./02-BRD.md#br-024--quản-lý-test-và-performance-acceptance-solar).
- **Phạm vi sản phẩm:** Actor/persona — Solar Engineer, Energy Analyst; phạm vi — Solar; boundary — PM + O&M; input — PVSyst, meteo, load, losses, curtailment assumptions; output — Monthly yield baseline, PR target, guarantee values.
- **Kiểm soát sản phẩm:** Permission — Bản baseline cần approval và bị version-lock; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R2; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Solar Engineer, Energy Analyst (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Monthly yield baseline, PR target, guarantee values, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-128"></a>
### FR-128 — Kiểm tra hiệu suất/sản lượng Solar sau COD theo baseline PVSyst

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Kiểm tra hiệu suất/sản lượng Solar sau COD theo baseline PVSyst. Từ Meteo, measured energy, curtailment/outage, baseline, hệ thống phải tạo Expected vs actual, loss waterfall, underperformance case cho Solar O&M, Performance Engineer trong đúng data scope.
- **Truy vết:** Source: `SOL-004`; Business Requirement: [BR-024](./02-BRD.md#br-024--quản-lý-test-và-performance-acceptance-solar), [BR-027](./02-BRD.md#br-027--giám-sát-kpi-vận-hành-solar-có-provenance).
- **Phạm vi sản phẩm:** Actor/persona — Solar O&M, Performance Engineer; phạm vi — Solar; boundary — O&M; input — Meteo, measured energy, curtailment/outage, baseline; output — Expected vs actual, loss waterfall, underperformance case.
- **Kiểm soát sản phẩm:** Permission — Analyst tính; approver khóa báo cáo kỳ; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R4; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Solar O&M, Performance Engineer (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Expected vs actual, loss waterfall, underperformance case, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-129"></a>
### FR-129 — Theo dõi inverter/string/module/BOS và lịch vệ sinh tấm pin

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Theo dõi inverter/string/module/BOS và lịch vệ sinh tấm pin. Từ Alarm, string current, soiling, inspection, cleaning event, hệ thống phải tạo Fault localization, cleaning plan, recovered yield estimate cho Solar O&M, Technician trong đúng data scope.
- **Truy vết:** Source: `SOL-005`; Business Requirement: [BR-027](./02-BRD.md#br-027--giám-sát-kpi-vận-hành-solar-có-provenance).
- **Phạm vi sản phẩm:** Actor/persona — Solar O&M, Technician; phạm vi — Solar; boundary — O&M; input — Alarm, string current, soiling, inspection, cleaning event; output — Fault localization, cleaning plan, recovered yield estimate.
- **Kiểm soát sản phẩm:** Permission — Technician cập nhật; planner duyệt kế hoạch; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Could; source roadmap — R4; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Solar O&M, Technician (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Fault localization, cleaning plan, recovered yield estimate, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

#### BES — BESS

<a id="fr-130"></a>
### FR-130 — Cấu trúc BESS: container, rack, module, BMS, PCS, transformer, RMU/MV feeder, EMS/SCADA

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Cấu trúc BESS: container, rack, module, BMS, PCS, transformer, RMU/MV feeder, EMS/SCADA. Từ Architecture, ratings, vendor models, communication map, hệ thống phải tạo Equipment hierarchy, interface/data-point list, handover seed cho BESS Engineer, Procurement, O&M trong đúng data scope.
- **Truy vết:** Source: `BES-001`; Business Requirement: [BR-014](./02-BRD.md#br-014--quản-lý-cấu-trúc-auxiliary-safety-và-point-list-bess).
- **Phạm vi sản phẩm:** Actor/persona — BESS Engineer, Procurement, O&M; phạm vi — BESS; boundary — PM + O&M; input — Architecture, ratings, vendor models, communication map; output — Equipment hierarchy, interface/data-point list, handover seed.
- **Kiểm soát sản phẩm:** Permission — Engineering quản lý spec; vendor cập nhật hồ sơ package; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R2; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — BESS Engineer, Procurement, O&M (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Equipment hierarchy, interface/data-point list, handover seed, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-131"></a>
### FR-131 — Design constraint MW/MWh, SOC window, DoD, C-rate, efficiency, cycle/degradation và use case

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Design constraint MW/MWh, SOC window, DoD, C-rate, efficiency, cycle/degradation và use case. Từ Load/use case, warranty curves, ambient, grid limits, hệ thống phải tạo Design operating envelope và guaranteed performance baseline cho BESS Engineer, Investment, O&M trong đúng data scope.
- **Truy vết:** Source: `BES-002`; Business Requirement: [BR-006](./02-BRD.md#br-006--quản-lý-sizing-bess-theo-use-case-và-constraint), [BR-014](./02-BRD.md#br-014--quản-lý-cấu-trúc-auxiliary-safety-và-point-list-bess).
- **Phạm vi sản phẩm:** Actor/persona — BESS Engineer, Investment, O&M; phạm vi — BESS; boundary — PM + O&M; input — Load/use case, warranty curves, ambient, grid limits; output — Design operating envelope và guaranteed performance baseline.
- **Kiểm soát sản phẩm:** Permission — Thay đổi envelope cần Engineering/O&M/Legal review; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R2; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — BESS Engineer, Investment, O&M (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Design operating envelope và guaranteed performance baseline, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-132"></a>
### FR-132 — Thiết kế PCCC: detection, gas detection, suppression, zoning, ventilation và emergency response

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Thiết kế PCCC: detection, gas detection, suppression, zoning, ventilation và emergency response. Từ Hazard analysis, vendor design, code/authority criteria, hệ thống phải tạo Fire design pack, cause-and-effect, approval/permit evidence cho BESS Engineer, HSE, Fire Consultant trong đúng data scope.
- **Truy vết:** Source: `BES-003`; Business Requirement: [BR-014](./02-BRD.md#br-014--quản-lý-cấu-trúc-auxiliary-safety-và-point-list-bess), [BR-025](./02-BRD.md#br-025--quản-lý-test-an-toàn-chức-năng-và-hiệu-suất-bess).
- **Phạm vi sản phẩm:** Actor/persona — BESS Engineer, HSE, Fire Consultant; phạm vi — BESS; boundary — PM; input — Hazard analysis, vendor design, code/authority criteria; output — Fire design pack, cause-and-effect, approval/permit evidence.
- **Kiểm soát sản phẩm:** Permission — HSE/Fire reviewer bắt buộc; chỉ bản approved dùng thi công; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R2; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — BESS Engineer, HSE, Fire Consultant (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Fire design pack, cause-and-effect, approval/permit evidence, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-133"></a>
### FR-133 — Thiết kế auxiliary/HVAC/CCTV/access control/earthing/aux power/E-Stop

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Thiết kế auxiliary/HVAC/CCTV/access control/earthing/aux power/E-Stop. Từ Load list, environmental limit, layout, interface, hệ thống phải tạo Auxiliary design, single-line/control logic, test requirement cho BESS Engineer, Security, HSE trong đúng data scope.
- **Truy vết:** Source: `BES-004`; Business Requirement: [BR-014](./02-BRD.md#br-014--quản-lý-cấu-trúc-auxiliary-safety-và-point-list-bess), [BR-025](./02-BRD.md#br-025--quản-lý-test-an-toàn-chức-năng-và-hiệu-suất-bess).
- **Phạm vi sản phẩm:** Actor/persona — BESS Engineer, Security, HSE; phạm vi — BESS; boundary — PM; input — Load list, environmental limit, layout, interface; output — Auxiliary design, single-line/control logic, test requirement.
- **Kiểm soát sản phẩm:** Permission — Discipline review; E-Stop/cause-effect cần independent approval; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R2; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — BESS Engineer, Security, HSE (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Auxiliary design, single-line/control logic, test requirement, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-134"></a>
### FR-134 — Point list SOC, SOH, temperature, cell voltage, alarm và data-quality mapping

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Point list SOC, SOH, temperature, cell voltage, alarm và data-quality mapping. Từ Vendor point list, protocol, unit, frequency, alarm class, hệ thống phải tạo Canonical tag mapping, acceptance checklist, data lineage cho BESS/SCADA Engineer, IT/OT, O&M trong đúng data scope.
- **Truy vết:** Source: `BES-005`; Business Requirement: [BR-014](./02-BRD.md#br-014--quản-lý-cấu-trúc-auxiliary-safety-và-point-list-bess), [BR-025](./02-BRD.md#br-025--quản-lý-test-an-toàn-chức-năng-và-hiệu-suất-bess).
- **Phạm vi sản phẩm:** Actor/persona — BESS/SCADA Engineer, IT/OT, O&M; phạm vi — BESS; boundary — PM + O&M; input — Vendor point list, protocol, unit, frequency, alarm class; output — Canonical tag mapping, acceptance checklist, data lineage.
- **Kiểm soát sản phẩm:** Permission — OT cung cấp read-only; mapping được version hóa; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R3; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — BESS/SCADA Engineer, IT/OT, O&M (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Canonical tag mapping, acceptance checklist, data lineage, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-135"></a>
### FR-135 — Test định kỳ capacity/RTE/SOC/SOH và so với warranty

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Test định kỳ capacity/RTE/SOC/SOH và so với warranty. Từ Approved test plan, meter/BMS data, ambient, warranty curve, hệ thống phải tạo Test report, warranty variance, corrective action cho BESS O&M, OEM, Asset Manager trong đúng data scope.
- **Truy vết:** Source: `BES-006`; Business Requirement: [BR-025](./02-BRD.md#br-025--quản-lý-test-an-toàn-chức-năng-và-hiệu-suất-bess), [BR-028](./02-BRD.md#br-028--giám-sát-bess-kpi-degradation-và-operating-history).
- **Phạm vi sản phẩm:** Actor/persona — BESS O&M, OEM, Asset Manager; phạm vi — BESS; boundary — O&M; input — Approved test plan, meter/BMS data, ambient, warranty curve; output — Test report, warranty variance, corrective action.
- **Kiểm soát sản phẩm:** Permission — OEM cung cấp; Asset Manager/independent engineer xác nhận; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Có; search/filter/export giữ nguyên quyền và snapshot; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Should; source roadmap — R4; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — BESS O&M, OEM, Asset Manager (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Test report, warranty variance, corrective action, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-136"></a>
### FR-136 — Chẩn đoán anomaly nhiệt độ/cell voltage/SOC/SOH/alarm có bằng chứng

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Chẩn đoán anomaly nhiệt độ/cell voltage/SOC/SOH/alarm có bằng chứng. Từ Time-series, event, topology, maintenance history, hệ thống phải tạo Ranked anomaly, affected hierarchy, evidence window cho BESS O&M, OEM trong đúng data scope.
- **Truy vết:** Source: `BES-007`; Business Requirement: [BR-028](./02-BRD.md#br-028--giám-sát-bess-kpi-degradation-và-operating-history).
- **Phạm vi sản phẩm:** Actor/persona — BESS O&M, OEM; phạm vi — BESS; boundary — O&M; input — Time-series, event, topology, maintenance history; output — Ranked anomaly, affected hierarchy, evidence window.
- **Kiểm soát sản phẩm:** Permission — Chỉ khuyến nghị điều tra; không phát lệnh; access theo asset; Notification — Có theo due date/state/exception; routing theo data scope; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Future; source roadmap — R5; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — BESS O&M, OEM (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Ranked anomaly, affected hierarchy, evidence window, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

<a id="fr-137"></a>
### FR-137 — Khuyến nghị lịch sạc-xả theo giá điện và constraint, tách biệt khỏi điều khiển

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Khuyến nghị lịch sạc-xả theo giá điện và constraint, tách biệt khỏi điều khiển. Từ Tariff/forecast, load/PV, SOC, DoD, C-rate, warranty, reserve, hệ thống phải tạo Advisory schedule, value estimate, constraint explanation cho Asset Optimizer, O&M, Energy Trader trong đúng data scope.
- **Truy vết:** Source: `BES-008`; Business Requirement: [BR-028](./02-BRD.md#br-028--giám-sát-bess-kpi-degradation-và-operating-history).
- **Phạm vi sản phẩm:** Actor/persona — Asset Optimizer, O&M, Energy Trader; phạm vi — BESS; boundary — O&M; input — Tariff/forecast, load/PV, SOC, DoD, C-rate, warranty, reserve; output — Advisory schedule, value estimate, constraint explanation.
- **Kiểm soát sản phẩm:** Permission — Human review; export sang EMS qua quy trình riêng nếu tương lai phê duyệt; Notification — Không trực tiếp; dùng notification của workflow/bản ghi liên quan nếu được cấu hình; Audit — bắt buộc cho create/update/state/approval/export; Report/Search/Export — Dữ liệu nguồn cho báo cáo liên quan; search/export chỉ khi có view được cấp quyền; Bulk — Không mặc định; nếu bổ sung phải preview/validate và không vượt quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Future; source roadmap — R5; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Asset Optimizer, O&M, Energy Trader (`TBD` cá nhân chịu trách nhiệm); verification intent — người dùng có quyền tạo/đọc được Advisory schedule, value estimate, constraint explanation, người ngoài scope bị từ chối, trạng thái/audit truy được từ dữ liệu nguồn; chi tiết AC/TEST là forward reference. **Status:** Draft.

### 10.5. Workflow và identity governance

#### WFL — Workflow

<a id="fr-138"></a>
### FR-138 — Trình thiết kế workflow tuần tự/song song và quorum

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Trình thiết kế workflow tuần tự/song song và quorum. Từ Step, role/user group, order, quorum, SLA, hệ thống phải tạo Versioned workflow definition, validation result cho Process Owner, Admin trong đúng tenant/legal entity/project/package/document scope.
- **Truy vết:** Source: `WFL-001`; Business Requirement: [BR-008](./02-BRD.md#br-008--kiểm-soát-phiên-bản-proposal-và-investment-gate), [BR-011](./02-BRD.md#br-011--bảo-toàn-pháp-nhân-người-ký-và-lịch-sử-phê-duyệt-văn-bản), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-034](./02-BRD.md#br-034--tự-động-hóa-workflow-phê-duyệt-có-version-và-audit).
- **Phạm vi sản phẩm:** Actor/persona — Process Owner, Admin; phạm vi — Dùng chung; boundary — PM + O&M; input — Step, role/user group, order, quorum, SLA; output — Versioned workflow definition, validation result.
- **Kiểm soát sản phẩm:** Permission — Chỉ Process Admin publish; draft không tác động case đang chạy; deny/SoD/status lock luôn được đánh giá trước allow; Notification — Có theo SLA/state/exception và routing được version hóa; Audit — bắt buộc, gồm actor/delegation/time/decision/object/correlation; Report/Search/Export — Workflow inbox/SLA/audit report theo data scope; Bulk — Không mặc định; không bulk approve nếu policy không cho phép.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Process Owner, Admin (`TBD` cá nhân chịu trách nhiệm); verification intent — normal/deny/SoD/delegation/cross-scope paths cho kết quả xác định, không mở rộng quyền gốc và có audit; chi tiết SEC/WF/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-139"></a>
### FR-139 — Rule routing theo giá trị, loại tài liệu, dự án, phòng ban, pháp nhân và rủi ro

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Rule routing theo giá trị, loại tài liệu, dự án, phòng ban, pháp nhân và rủi ro. Từ Attribute/threshold/expression, fallback, hệ thống phải tạo Deterministic route, matched-rule explanation cho Process Owner, Finance, Legal trong đúng tenant/legal entity/project/package/document scope.
- **Truy vết:** Source: `WFL-002`; Business Requirement: [BR-008](./02-BRD.md#br-008--kiểm-soát-phiên-bản-proposal-và-investment-gate), [BR-015](./02-BRD.md#br-015--kiểm-soát-sourcing-từ-nhu-cầu-đến-pohợp-đồng-mua), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-034](./02-BRD.md#br-034--tự-động-hóa-workflow-phê-duyệt-có-version-và-audit).
- **Phạm vi sản phẩm:** Actor/persona — Process Owner, Finance, Legal; phạm vi — Dùng chung; boundary — PM + O&M; input — Attribute/threshold/expression, fallback; output — Deterministic route, matched-rule explanation.
- **Kiểm soát sản phẩm:** Permission — Rule change cần approval; không cho requester chọn đường thấp hơn; deny/SoD/status lock luôn được đánh giá trước allow; Notification — Không trực tiếp; chỉ phát khi policy/workflow liên quan yêu cầu; Audit — bắt buộc, gồm actor/delegation/time/decision/object/correlation; Report/Search/Export — Workflow inbox/SLA/audit report theo data scope; Bulk — Không mặc định; không bulk approve nếu policy không cho phép.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Process Owner, Finance, Legal (`TBD` cá nhân chịu trách nhiệm); verification intent — normal/deny/SoD/delegation/cross-scope paths cho kết quả xác định, không mở rộng quyền gốc và có audit; chi tiết SEC/WF/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-140"></a>
### FR-140 — Return for revision, reject và conditional approval

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Return for revision, reject và conditional approval. Từ Decision, reason, required condition, due date, hệ thống phải tạo Revision cycle/rejected/conditionally approved state cho Requester, reviewer, approver trong đúng tenant/legal entity/project/package/document scope.
- **Truy vết:** Source: `WFL-003`; Business Requirement: [BR-008](./02-BRD.md#br-008--kiểm-soát-phiên-bản-proposal-và-investment-gate), [BR-015](./02-BRD.md#br-015--kiểm-soát-sourcing-từ-nhu-cầu-đến-pohợp-đồng-mua), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-034](./02-BRD.md#br-034--tự-động-hóa-workflow-phê-duyệt-có-version-và-audit).
- **Phạm vi sản phẩm:** Actor/persona — Requester, reviewer, approver; phạm vi — Dùng chung; boundary — PM + O&M; input — Decision, reason, required condition, due date; output — Revision cycle/rejected/conditionally approved state.
- **Kiểm soát sản phẩm:** Permission — Lý do bắt buộc; điều kiện có owner/evidence; reject không xóa hồ sơ; deny/SoD/status lock luôn được đánh giá trước allow; Notification — Có theo SLA/state/exception và routing được version hóa; Audit — bắt buộc, gồm actor/delegation/time/decision/object/correlation; Report/Search/Export — Workflow inbox/SLA/audit report theo data scope; Bulk — Không mặc định; không bulk approve nếu policy không cho phép.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Requester, reviewer, approver (`TBD` cá nhân chịu trách nhiệm); verification intent — normal/deny/SoD/delegation/cross-scope paths cho kết quả xác định, không mở rộng quyền gốc và có audit; chi tiết SEC/WF/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-141"></a>
### FR-141 — Ủy quyền phê duyệt có thời hạn và không mở rộng quyền gốc

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Ủy quyền phê duyệt có thời hạn và không mở rộng quyền gốc. Từ Delegator/delegate, scope, start/end, reason, hệ thống phải tạo Active delegation, routed task, delegation audit cho Approver, manager, Security Admin trong đúng tenant/legal entity/project/package/document scope.
- **Truy vết:** Source: `WFL-004`; Business Requirement: [BR-008](./02-BRD.md#br-008--kiểm-soát-phiên-bản-proposal-và-investment-gate), [BR-015](./02-BRD.md#br-015--kiểm-soát-sourcing-từ-nhu-cầu-đến-pohợp-đồng-mua), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-034](./02-BRD.md#br-034--tự-động-hóa-workflow-phê-duyệt-có-version-và-audit).
- **Phạm vi sản phẩm:** Actor/persona — Approver, manager, Security Admin; phạm vi — Dùng chung; boundary — PM + O&M; input — Delegator/delegate, scope, start/end, reason; output — Active delegation, routed task, delegation audit.
- **Kiểm soát sản phẩm:** Permission — Delegate phải có quyền nền tương đương; không tự ủy quyền tiếp; deny/SoD/status lock luôn được đánh giá trước allow; Notification — Có theo SLA/state/exception và routing được version hóa; Audit — bắt buộc, gồm actor/delegation/time/decision/object/correlation; Report/Search/Export — Workflow inbox/SLA/audit report theo data scope; Bulk — Không mặc định; không bulk approve nếu policy không cho phép.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Approver, manager, Security Admin (`TBD` cá nhân chịu trách nhiệm); verification intent — normal/deny/SoD/delegation/cross-scope paths cho kết quả xác định, không mở rộng quyền gốc và có audit; chi tiết SEC/WF/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-142"></a>
### FR-142 — Reminder và escalation khi quá hạn theo SLA/lịch làm việc

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Reminder và escalation khi quá hạn theo SLA/lịch làm việc. Từ Due date, calendar, reminder/escalation ladder, hệ thống phải tạo Notification, reassignment/escalation, overdue metric cho Approver, Process Owner trong đúng tenant/legal entity/project/package/document scope.
- **Truy vết:** Source: `WFL-005`; Business Requirement: [BR-008](./02-BRD.md#br-008--kiểm-soát-phiên-bản-proposal-và-investment-gate), [BR-015](./02-BRD.md#br-015--kiểm-soát-sourcing-từ-nhu-cầu-đến-pohợp-đồng-mua), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-034](./02-BRD.md#br-034--tự-động-hóa-workflow-phê-duyệt-có-version-và-audit).
- **Phạm vi sản phẩm:** Actor/persona — Approver, Process Owner; phạm vi — Dùng chung; boundary — PM + O&M; input — Due date, calendar, reminder/escalation ladder; output — Notification, reassignment/escalation, overdue metric.
- **Kiểm soát sản phẩm:** Permission — Escalation không tự “approve”; critical path không được mute; deny/SoD/status lock luôn được đánh giá trước allow; Notification — Có theo SLA/state/exception và routing được version hóa; Audit — bắt buộc, gồm actor/delegation/time/decision/object/correlation; Report/Search/Export — Workflow inbox/SLA/audit report theo data scope; Bulk — Không mặc định; không bulk approve nếu policy không cho phép.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Approver, Process Owner (`TBD` cá nhân chịu trách nhiệm); verification intent — normal/deny/SoD/delegation/cross-scope paths cho kết quả xác định, không mở rộng quyền gốc và có audit; chi tiết SEC/WF/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-143"></a>
### FR-143 — Audit trail đầy đủ cho request, route, decision, comment và signature

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Audit trail đầy đủ cho request, route, decision, comment và signature. Từ Actor, effective identity/delegation, timestamp, before/after, evidence, hệ thống phải tạo Immutable workflow timeline/export cho Auditor, Legal, Security trong đúng tenant/legal entity/project/package/document scope.
- **Truy vết:** Source: `WFL-006`; Business Requirement: [BR-008](./02-BRD.md#br-008--kiểm-soát-phiên-bản-proposal-và-investment-gate), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-034](./02-BRD.md#br-034--tự-động-hóa-workflow-phê-duyệt-có-version-và-audit).
- **Phạm vi sản phẩm:** Actor/persona — Auditor, Legal, Security; phạm vi — Dùng chung; boundary — PM + O&M; input — Actor, effective identity/delegation, timestamp, before/after, evidence; output — Immutable workflow timeline/export.
- **Kiểm soát sản phẩm:** Permission — Chỉ Auditor xem toàn tenant; không sửa/xóa event; deny/SoD/status lock luôn được đánh giá trước allow; Notification — Có theo SLA/state/exception và routing được version hóa; Audit — bắt buộc, gồm actor/delegation/time/decision/object/correlation; Report/Search/Export — Workflow inbox/SLA/audit report theo data scope; Bulk — Không mặc định; không bulk approve nếu policy không cho phép.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Auditor, Legal, Security (`TBD` cá nhân chịu trách nhiệm); verification intent — normal/deny/SoD/delegation/cross-scope paths cho kết quả xác định, không mở rộng quyền gốc và có audit; chi tiết SEC/WF/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-144"></a>
### FR-144 — Thư viện template cho tám quy trình phê duyệt bắt buộc

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Thư viện template cho tám quy trình phê duyệt bắt buộc. Từ Design/vendor/purchase/payment/design change/variation/acceptance/COD template, hệ thống phải tạo Reusable, versioned workflow templates cho Process Owner, PMO trong đúng tenant/legal entity/project/package/document scope.
- **Truy vết:** Source: `WFL-007`; Business Requirement: [BR-008](./02-BRD.md#br-008--kiểm-soát-phiên-bản-proposal-và-investment-gate), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-034](./02-BRD.md#br-034--tự-động-hóa-workflow-phê-duyệt-có-version-và-audit).
- **Phạm vi sản phẩm:** Actor/persona — Process Owner, PMO; phạm vi — Dùng chung; boundary — PM; input — Design/vendor/purchase/payment/design change/variation/acceptance/COD template; output — Reusable, versioned workflow templates.
- **Kiểm soát sản phẩm:** Permission — Tenant template publish bởi Process Owner; project override trong giới hạn; deny/SoD/status lock luôn được đánh giá trước allow; Notification — Có theo SLA/state/exception và routing được version hóa; Audit — bắt buộc, gồm actor/delegation/time/decision/object/correlation; Report/Search/Export — Workflow inbox/SLA/audit report theo data scope; Bulk — Có preview, validation, SoD và kiểm quyền từng bản ghi.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Process Owner, PMO (`TBD` cá nhân chịu trách nhiệm); verification intent — normal/deny/SoD/delegation/cross-scope paths cho kết quả xác định, không mở rộng quyền gốc và có audit; chi tiết SEC/WF/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-145"></a>
### FR-145 — Chữ ký điện tử/số, kiểm tra thẩm quyền và khóa artifact sau ký

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Chữ ký điện tử/số, kiểm tra thẩm quyền và khóa artifact sau ký. Từ Approved artifact hash, signer, certificate/provider, authority, hệ thống phải tạo Signed artifact, validation evidence, lock/status transition cho Legal, authorized signatory trong đúng tenant/legal entity/project/package/document scope.
- **Truy vết:** Source: `WFL-008`; Business Requirement: [BR-008](./02-BRD.md#br-008--kiểm-soát-phiên-bản-proposal-và-investment-gate), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-034](./02-BRD.md#br-034--tự-động-hóa-workflow-phê-duyệt-có-version-và-audit).
- **Phạm vi sản phẩm:** Actor/persona — Legal, authorized signatory; phạm vi — Dùng chung; boundary — PM + O&M; input — Approved artifact hash, signer, certificate/provider, authority; output — Signed artifact, validation evidence, lock/status transition.
- **Kiểm soát sản phẩm:** Permission — Sign là quyền riêng; không dùng delegation nếu policy chữ ký cấm; deny/SoD/status lock luôn được đánh giá trước allow; Notification — Không trực tiếp; chỉ phát khi policy/workflow liên quan yêu cầu; Audit — bắt buộc, gồm actor/delegation/time/decision/object/correlation; Report/Search/Export — Workflow inbox/SLA/audit report theo data scope; Bulk — Không mặc định; không bulk approve nếu policy không cho phép.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Legal, authorized signatory (`TBD` cá nhân chịu trách nhiệm); verification intent — normal/deny/SoD/delegation/cross-scope paths cho kết quả xác định, không mở rộng quyền gốc và có audit; chi tiết SEC/WF/AC/TEST là forward reference. **Status:** Draft.

#### IAM — Identity/access/audit

<a id="fr-146"></a>
### FR-146 — Tenant, công ty, pháp nhân, phòng ban và membership

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Tenant, công ty, pháp nhân, phòng ban và membership. Từ Organization hierarchy, legal entity, employment/partner relation, hệ thống phải tạo Stable IDs, membership effective dates, org scope cho Tenant Admin, HR/Admin, Security trong đúng tenant/legal entity/project/package/document scope.
- **Truy vết:** Source: `IAM-001`; Business Requirement: [BR-001](./02-BRD.md#br-001--quản-trị-portfolio-và-nhiều-tổ-chức-trên-một-nguồn-dữ-liệu), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-033](./02-BRD.md#br-033--kiểm-soát-quyền-đa-tenant-đa-pháp-nhân-và-xung-đột-lợi-ích), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot).
- **Phạm vi sản phẩm:** Actor/persona — Tenant Admin, HR/Admin, Security; phạm vi — Dùng chung; boundary — PM + O&M; input — Organization hierarchy, legal entity, employment/partner relation; output — Stable IDs, membership effective dates, org scope.
- **Kiểm soát sản phẩm:** Permission — Tenant Admin quản trị trong tenant; cross-tenant bị cấm mặc định; deny/SoD/status lock luôn được đánh giá trước allow; Notification — Không trực tiếp; chỉ phát khi policy/workflow liên quan yêu cầu; Audit — bắt buộc, gồm actor/delegation/time/decision/object/correlation; Report/Search/Export — Access/audit report theo mandate; search/export đặc quyền bị audit; Bulk — Không mặc định; không bulk approve nếu policy không cho phép.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Tenant Admin, HR/Admin, Security (`TBD` cá nhân chịu trách nhiệm); verification intent — normal/deny/SoD/delegation/cross-scope paths cho kết quả xác định, không mở rộng quyền gốc và có audit; chi tiết SEC/WF/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-147"></a>
### FR-147 — Identity lifecycle, SSO và MFA

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Identity lifecycle, SSO và MFA. Từ Identity provider, email/domain, MFA policy, joiner/mover/leaver event, hệ thống phải tạo Authenticated identity, session, deprovisioning record cho Security Admin, IT trong đúng tenant/legal entity/project/package/document scope.
- **Truy vết:** Source: `IAM-002`; Business Requirement: [BR-001](./02-BRD.md#br-001--quản-trị-portfolio-và-nhiều-tổ-chức-trên-một-nguồn-dữ-liệu), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-033](./02-BRD.md#br-033--kiểm-soát-quyền-đa-tenant-đa-pháp-nhân-và-xung-đột-lợi-ích), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot).
- **Phạm vi sản phẩm:** Actor/persona — Security Admin, IT; phạm vi — Dùng chung; boundary — PM + O&M; input — Identity provider, email/domain, MFA policy, joiner/mover/leaver event; output — Authenticated identity, session, deprovisioning record.
- **Kiểm soát sản phẩm:** Permission — SSO/MFA bắt buộc theo risk; account shared bị cấm; deny/SoD/status lock luôn được đánh giá trước allow; Notification — Không trực tiếp; chỉ phát khi policy/workflow liên quan yêu cầu; Audit — bắt buộc, gồm actor/delegation/time/decision/object/correlation; Report/Search/Export — Access/audit report theo mandate; search/export đặc quyền bị audit; Bulk — Không mặc định; không bulk approve nếu policy không cho phép.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Security Admin, IT (`TBD` cá nhân chịu trách nhiệm); verification intent — normal/deny/SoD/delegation/cross-scope paths cho kết quả xác định, không mở rộng quyền gốc và có audit; chi tiết SEC/WF/AC/TEST là forward reference. **Status:** Draft.

**Approved base/test implementation profile (2026-07-11):** Local tenantCode + email + password được phép cho vertical slice đầu tiên; access/refresh JWT theo `SEC-103`, `WF-026`, `API-137…139`, `DB-099…100`, `AC-174…177`. Đây là phase implementation của FR-147, không hủy SSO/MFA; SSO/MFA vẫn cần trước production thật/privileged workflows.

<a id="fr-148"></a>
### FR-148 — RBAC xác định hành động cơ sở theo vai trò

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ RBAC xác định hành động cơ sở theo vai trò. Từ Role, action, module, environment, hệ thống phải tạo Role permission set, policy version cho Security Admin, Process Owner trong đúng tenant/legal entity/project/package/document scope.
- **Truy vết:** Source: `IAM-003`; Business Requirement: [BR-001](./02-BRD.md#br-001--quản-trị-portfolio-và-nhiều-tổ-chức-trên-một-nguồn-dữ-liệu), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-033](./02-BRD.md#br-033--kiểm-soát-quyền-đa-tenant-đa-pháp-nhân-và-xung-đột-lợi-ích), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot).
- **Phạm vi sản phẩm:** Actor/persona — Security Admin, Process Owner; phạm vi — Dùng chung; boundary — PM + O&M; input — Role, action, module, environment; output — Role permission set, policy version.
- **Kiểm soát sản phẩm:** Permission — Least privilege; role publish cần review; không tự cấp quyền; deny/SoD/status lock luôn được đánh giá trước allow; Notification — Không trực tiếp; chỉ phát khi policy/workflow liên quan yêu cầu; Audit — bắt buộc, gồm actor/delegation/time/decision/object/correlation; Report/Search/Export — Access/audit report theo mandate; search/export đặc quyền bị audit; Bulk — Không mặc định; không bulk approve nếu policy không cho phép.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Security Admin, Process Owner (`TBD` cá nhân chịu trách nhiệm); verification intent — normal/deny/SoD/delegation/cross-scope paths cho kết quả xác định, không mở rộng quyền gốc và có audit; chi tiết SEC/WF/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-149"></a>
### FR-149 — ABAC giới hạn theo công ty, pháp nhân, dự án, gói thầu, phòng ban và quan hệ

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ ABAC giới hạn theo công ty, pháp nhân, dự án, gói thầu, phòng ban và quan hệ. Từ Subject/resource/context attributes, hệ thống phải tạo Record/field/action decision có reason code cho Security Admin, Data Owner trong đúng tenant/legal entity/project/package/document scope.
- **Truy vết:** Source: `IAM-004`; Business Requirement: [BR-001](./02-BRD.md#br-001--quản-trị-portfolio-và-nhiều-tổ-chức-trên-một-nguồn-dữ-liệu), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-033](./02-BRD.md#br-033--kiểm-soát-quyền-đa-tenant-đa-pháp-nhân-và-xung-đột-lợi-ích), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot).
- **Phạm vi sản phẩm:** Actor/persona — Security Admin, Data Owner; phạm vi — Dùng chung; boundary — PM + O&M; input — Subject/resource/context attributes; output — Record/field/action decision có reason code.
- **Kiểm soát sản phẩm:** Permission — Deny mặc định khi thiếu attribute bắt buộc; deny/SoD/status lock luôn được đánh giá trước allow; Notification — Không trực tiếp; chỉ phát khi policy/workflow liên quan yêu cầu; Audit — bắt buộc, gồm actor/delegation/time/decision/object/correlation; Report/Search/Export — Access/audit report theo mandate; search/export đặc quyền bị audit; Bulk — Không mặc định; không bulk approve nếu policy không cho phép.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Security Admin, Data Owner (`TBD` cá nhân chịu trách nhiệm); verification intent — normal/deny/SoD/delegation/cross-scope paths cho kết quả xác định, không mở rộng quyền gốc và có audit; chi tiết SEC/WF/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-150"></a>
### FR-150 — Quyền tài liệu theo loại/trạng thái: xem, tạo, sửa, xóa, download, approve, sign, external share

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Quyền tài liệu theo loại/trạng thái: xem, tạo, sửa, xóa, download, approve, sign, external share. Từ Classification, type, status, role, project/package, hệ thống phải tạo Fine-grained decision, masked/disabled actions cho Document Controller, Security trong đúng tenant/legal entity/project/package/document scope.
- **Truy vết:** Source: `IAM-005`; Business Requirement: [BR-001](./02-BRD.md#br-001--quản-trị-portfolio-và-nhiều-tổ-chức-trên-một-nguồn-dữ-liệu), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-033](./02-BRD.md#br-033--kiểm-soát-quyền-đa-tenant-đa-pháp-nhân-và-xung-đột-lợi-ích), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot).
- **Phạm vi sản phẩm:** Actor/persona — Document Controller, Security; phạm vi — Dùng chung; boundary — PM + O&M; input — Classification, type, status, role, project/package; output — Fine-grained decision, masked/disabled actions.
- **Kiểm soát sản phẩm:** Permission — Download/share/sign không suy ra từ quyền xem; bản approved không sửa; deny/SoD/status lock luôn được đánh giá trước allow; Notification — Không trực tiếp; chỉ phát khi policy/workflow liên quan yêu cầu; Audit — bắt buộc, gồm actor/delegation/time/decision/object/correlation; Report/Search/Export — Access/audit report theo mandate; search/export đặc quyền bị audit; Bulk — Không mặc định; không bulk approve nếu policy không cho phép.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Document Controller, Security (`TBD` cá nhân chịu trách nhiệm); verification intent — normal/deny/SoD/delegation/cross-scope paths cho kết quả xác định, không mở rộng quyền gốc và có audit; chi tiết SEC/WF/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-151"></a>
### FR-151 — Workspace bên ngoài cho owner, subcontractor và supplier

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Workspace bên ngoài cho owner, subcontractor và supplier. Từ Partner company, project/package/order, expiration, hệ thống phải tạo Scoped portal access, sponsor, access expiry cho Partner Admin, PM, Procurement trong đúng tenant/legal entity/project/package/document scope.
- **Truy vết:** Source: `IAM-006`; Business Requirement: [BR-001](./02-BRD.md#br-001--quản-trị-portfolio-và-nhiều-tổ-chức-trên-một-nguồn-dữ-liệu), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-033](./02-BRD.md#br-033--kiểm-soát-quyền-đa-tenant-đa-pháp-nhân-và-xung-đột-lợi-ích), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot).
- **Phạm vi sản phẩm:** Actor/persona — Partner Admin, PM, Procurement; phạm vi — Dùng chung; boundary — PM + O&M; input — Partner company, project/package/order, expiration; output — Scoped portal access, sponsor, access expiry.
- **Kiểm soát sản phẩm:** Permission — Owner chỉ dự án mình; subcontractor chỉ package; supplier chỉ hồ sơ mua hàng liên quan; deny/SoD/status lock luôn được đánh giá trước allow; Notification — Không trực tiếp; chỉ phát khi policy/workflow liên quan yêu cầu; Audit — bắt buộc, gồm actor/delegation/time/decision/object/correlation; Report/Search/Export — Access/audit report theo mandate; search/export đặc quyền bị audit; Bulk — Không mặc định; không bulk approve nếu policy không cho phép.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Partner Admin, PM, Procurement (`TBD` cá nhân chịu trách nhiệm); verification intent — normal/deny/SoD/delegation/cross-scope paths cho kết quả xác định, không mở rộng quyền gốc và có audit; chi tiết SEC/WF/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-152"></a>
### FR-152 — Segregation of Duties và kiểm tra xung đột trước phê duyệt

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Segregation of Duties và kiểm tra xung đột trước phê duyệt. Từ Requester/creator/beneficiary/vendor relationship, role conflict rules, hệ thống phải tạo Block/challenge, alternate approver, conflict audit cho Security, Finance, Legal, approver trong đúng tenant/legal entity/project/package/document scope.
- **Truy vết:** Source: `IAM-007`; Business Requirement: [BR-001](./02-BRD.md#br-001--quản-trị-portfolio-và-nhiều-tổ-chức-trên-một-nguồn-dữ-liệu), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-033](./02-BRD.md#br-033--kiểm-soát-quyền-đa-tenant-đa-pháp-nhân-và-xung-đột-lợi-ích), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot).
- **Phạm vi sản phẩm:** Actor/persona — Security, Finance, Legal, approver; phạm vi — Dùng chung; boundary — PM + O&M; input — Requester/creator/beneficiary/vendor relationship, role conflict rules; output — Block/challenge, alternate approver, conflict audit.
- **Kiểm soát sản phẩm:** Permission — Explicit deny/SoD thắng role allow; emergency override có dual approval; deny/SoD/status lock luôn được đánh giá trước allow; Notification — Có theo SLA/state/exception và routing được version hóa; Audit — bắt buộc, gồm actor/delegation/time/decision/object/correlation; Report/Search/Export — Access/audit report theo mandate; search/export đặc quyền bị audit; Bulk — Không mặc định; không bulk approve nếu policy không cho phép.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Security, Finance, Legal, approver (`TBD` cá nhân chịu trách nhiệm); verification intent — normal/deny/SoD/delegation/cross-scope paths cho kết quả xác định, không mở rộng quyền gốc và có audit; chi tiết SEC/WF/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-153"></a>
### FR-153 — Delegation quyền thao tác và access review định kỳ

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Delegation quyền thao tác và access review định kỳ. Từ Scope, effective period, reason, reviewer, hệ thống phải tạo Delegated access, certification/revocation, orphan access report cho Manager, Security, Data Owner trong đúng tenant/legal entity/project/package/document scope.
- **Truy vết:** Source: `IAM-008`; Business Requirement: [BR-001](./02-BRD.md#br-001--quản-trị-portfolio-và-nhiều-tổ-chức-trên-một-nguồn-dữ-liệu), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-033](./02-BRD.md#br-033--kiểm-soát-quyền-đa-tenant-đa-pháp-nhân-và-xung-đột-lợi-ích), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot).
- **Phạm vi sản phẩm:** Actor/persona — Manager, Security, Data Owner; phạm vi — Dùng chung; boundary — PM + O&M; input — Scope, effective period, reason, reviewer; output — Delegated access, certification/revocation, orphan access report.
- **Kiểm soát sản phẩm:** Permission — Không vượt quyền gốc; hết hạn tự thu hồi; privileged access review thường xuyên; deny/SoD/status lock luôn được đánh giá trước allow; Notification — Có theo SLA/state/exception và routing được version hóa; Audit — bắt buộc, gồm actor/delegation/time/decision/object/correlation; Report/Search/Export — Access/audit report theo mandate; search/export đặc quyền bị audit; Bulk — Không mặc định; không bulk approve nếu policy không cho phép.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Manager, Security, Data Owner (`TBD` cá nhân chịu trách nhiệm); verification intent — normal/deny/SoD/delegation/cross-scope paths cho kết quả xác định, không mở rộng quyền gốc và có audit; chi tiết SEC/WF/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-154"></a>
### FR-154 — Audit log bất biến cho login, view/download/share, CRUD, approval, export và policy change

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Audit log bất biến cho login, view/download/share, CRUD, approval, export và policy change. Từ Actor, tenant, resource, action, timestamp, IP/device, before/after, hệ thống phải tạo Search/export audit trail, anomaly/retention status cho Auditor, Security, Legal trong đúng tenant/legal entity/project/package/document scope.
- **Truy vết:** Source: `IAM-009`; Business Requirement: [BR-001](./02-BRD.md#br-001--quản-trị-portfolio-và-nhiều-tổ-chức-trên-một-nguồn-dữ-liệu), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-033](./02-BRD.md#br-033--kiểm-soát-quyền-đa-tenant-đa-pháp-nhân-và-xung-đột-lợi-ích), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot).
- **Phạm vi sản phẩm:** Actor/persona — Auditor, Security, Legal; phạm vi — Dùng chung; boundary — PM + O&M; input — Actor, tenant, resource, action, timestamp, IP/device, before/after; output — Search/export audit trail, anomaly/retention status.
- **Kiểm soát sản phẩm:** Permission — Không cho ứng dụng sửa; quyền xem audit tách biệt quản trị dữ liệu; deny/SoD/status lock luôn được đánh giá trước allow; Notification — Có theo SLA/state/exception và routing được version hóa; Audit — bắt buộc, gồm actor/delegation/time/decision/object/correlation; Report/Search/Export — Access/audit report theo mandate; search/export đặc quyền bị audit; Bulk — Không mặc định; không bulk approve nếu policy không cho phép.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Auditor, Security, Legal (`TBD` cá nhân chịu trách nhiệm); verification intent — normal/deny/SoD/delegation/cross-scope paths cho kết quả xác định, không mở rộng quyền gốc và có audit; chi tiết SEC/WF/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-155"></a>
### FR-155 — Data classification, legal hold và privileged-action monitoring

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ Data classification, legal hold và privileged-action monitoring. Từ Classification, retention, hold, privileged event rule, hệ thống phải tạo Policy enforcement, high-risk alert, evidence package cho Security, Legal, Data Owner trong đúng tenant/legal entity/project/package/document scope.
- **Truy vết:** Source: `IAM-010`; Business Requirement: [BR-001](./02-BRD.md#br-001--quản-trị-portfolio-và-nhiều-tổ-chức-trên-một-nguồn-dữ-liệu), [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-033](./02-BRD.md#br-033--kiểm-soát-quyền-đa-tenant-đa-pháp-nhân-và-xung-đột-lợi-ích), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot).
- **Phạm vi sản phẩm:** Actor/persona — Security, Legal, Data Owner; phạm vi — Dùng chung; boundary — PM + O&M; input — Classification, retention, hold, privileged event rule; output — Policy enforcement, high-risk alert, evidence package.
- **Kiểm soát sản phẩm:** Permission — Legal hold/status lock ưu tiên trước quyền sửa/xóa; deny/SoD/status lock luôn được đánh giá trước allow; Notification — Không trực tiếp; chỉ phát khi policy/workflow liên quan yêu cầu; Audit — bắt buộc, gồm actor/delegation/time/decision/object/correlation; Report/Search/Export — Access/audit report theo mandate; search/export đặc quyền bị audit; Bulk — Không mặc định; không bulk approve nếu policy không cho phép.
- **Ưu tiên và phát hành:** Source priority — Must; source roadmap — R1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner nghiệp vụ — Security, Legal, Data Owner (`TBD` cá nhân chịu trách nhiệm); verification intent — normal/deny/SoD/delegation/cross-scope paths cho kết quả xác định, không mở rộng quyền gốc và có audit; chi tiết SEC/WF/AC/TEST là forward reference. **Status:** Draft.

### 10.6. Tích hợp hệ thống

#### INT — Connector và System of Record

<a id="fr-156"></a>
### FR-156 — Tích hợp Microsoft 365 (Entra ID, Outlook, Teams, Calendar)

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ connector Microsoft 365 (Entra ID, Outlook, Teams, Calendar) cho Người dùng/nhóm, lịch họp, sự kiện milestone, liên kết email/Teams, tệp đính kèm được chọn, theo cơ chế Hai chiều theo webhook; đối soát đêm. System of Record phải được giữ đúng như sau: Entra ID là SoR danh tính doanh nghiệp; nền tảng là SoR task/milestone; lịch sở hữu từng event theo nơi tạo. Connector phải khai báo owner trường, retry, idempotency, reconciliation và audit.
- **Truy vết:** Source: `INT-001`; Business Requirement: [BR-037](./02-BRD.md#br-037--tích-hợp-hệ-thống-theo-system-of-record-và-đối-soát).
- **Phạm vi sản phẩm:** Actor/persona — Integration Admin, System Owner và người dùng module được cấp quyền; phạm vi/boundary — Dùng chung; PM/O&M business integration; input/output — Người dùng/nhóm, lịch họp, sự kiện milestone, liên kết email/Teams, tệp đính kèm được chọn cùng sync status, external mapping và reconciliation evidence.
- **Kiểm soát sản phẩm:** Permission — chỉ admin được ủy quyền cấu hình connector; người dùng chỉ thấy dữ liệu trong scope; control nguồn — Consent theo tenant, mapping user ổn định, không tự đọc toàn bộ mailbox, thu hồi token khi offboard; Notification — sync failure/stale/reconciliation exception có owner; Audit — bắt buộc cho consent/config/token/mapping/sync/replay/export; Report/Search/Export — theo ACL nguồn và nền tảng; Bulk — không phải đường tắt vượt approval/SoD.
- **Ưu tiên và phát hành:** Source priority — connector không có MoSCoW riêng, dùng F.2/REQ-037; source roadmap — GĐ1; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner — Integration Owner + Source System Owner (`TBD` cá nhân); verification intent — normal/retry/duplicate/out-of-order/permission/reconciliation paths giữ đúng SoR và không mất/lặp giao dịch; chi tiết API/SEC/DB/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-157"></a>
### FR-157 — Tích hợp Google Workspace (Cloud Identity, Gmail, Calendar)

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ connector Google Workspace (Cloud Identity, Gmail, Calendar) cho Người dùng/nhóm, lịch, email được người dùng gắn vào dự án, tệp đính kèm được chọn, theo cơ chế Hai chiều theo webhook; đối soát đêm. System of Record phải được giữ đúng như sau: Cloud Identity là SoR danh tính khi được chọn; nền tảng là SoR task/milestone. Connector phải khai báo owner trường, retry, idempotency, reconciliation và audit.
- **Truy vết:** Source: `INT-002`; Business Requirement: [BR-037](./02-BRD.md#br-037--tích-hợp-hệ-thống-theo-system-of-record-và-đối-soát).
- **Phạm vi sản phẩm:** Actor/persona — Integration Admin, System Owner và người dùng module được cấp quyền; phạm vi/boundary — Dùng chung; PM/O&M business integration; input/output — Người dùng/nhóm, lịch, email được người dùng gắn vào dự án, tệp đính kèm được chọn cùng sync status, external mapping và reconciliation evidence.
- **Kiểm soát sản phẩm:** Permission — chỉ admin được ủy quyền cấu hình connector; người dùng chỉ thấy dữ liệu trong scope; control nguồn — Domain-wide delegation chỉ khi được phê duyệt; scope tối thiểu; journal consent; Notification — sync failure/stale/reconciliation exception có owner; Audit — bắt buộc cho consent/config/token/mapping/sync/replay/export; Report/Search/Export — theo ACL nguồn và nền tảng; Bulk — không phải đường tắt vượt approval/SoD.
- **Ưu tiên và phát hành:** Source priority — connector không có MoSCoW riêng, dùng F.2/REQ-037; source roadmap — GĐ1–2; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner — Integration Owner + Source System Owner (`TBD` cá nhân); verification intent — normal/retry/duplicate/out-of-order/permission/reconciliation paths giữ đúng SoR và không mất/lặp giao dịch; chi tiết API/SEC/DB/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-158"></a>
### FR-158 — Tích hợp Email chuẩn (Microsoft/Google/IMAP/SMTP/API)

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ connector Email chuẩn (Microsoft/Google/IMAP/SMTP/API) cho Email gửi/nhận, thread, tệp đính kèm, mã dự án/tài liệu, delivery status, theo cơ chế Vào theo rule hoặc địa chỉ dự án; ra theo sự kiện/nhắc việc. System of Record phải được giữ đúng như sau: Mail server là SoR thư gốc; nền tảng là SoR liên kết nghiệp vụ và action item. Connector phải khai báo owner trường, retry, idempotency, reconciliation và audit.
- **Truy vết:** Source: `INT-003`; Business Requirement: [BR-037](./02-BRD.md#br-037--tích-hợp-hệ-thống-theo-system-of-record-và-đối-soát).
- **Phạm vi sản phẩm:** Actor/persona — Integration Admin, System Owner và người dùng module được cấp quyền; phạm vi/boundary — Dùng chung; PM/O&M business integration; input/output — Email gửi/nhận, thread, tệp đính kèm, mã dự án/tài liệu, delivery status cùng sync status, external mapping và reconciliation evidence.
- **Kiểm soát sản phẩm:** Permission — chỉ admin được ủy quyền cấu hình connector; người dùng chỉ thấy dữ liệu trong scope; control nguồn — Allowlist mailbox, chống malware/phishing, loại trùng theo Message-ID, retention theo chính sách; Notification — sync failure/stale/reconciliation exception có owner; Audit — bắt buộc cho consent/config/token/mapping/sync/replay/export; Report/Search/Export — theo ACL nguồn và nền tảng; Bulk — không phải đường tắt vượt approval/SoD.
- **Ưu tiên và phát hành:** Source priority — connector không có MoSCoW riêng, dùng F.2/REQ-037; source roadmap — GĐ1; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner — Integration Owner + Source System Owner (`TBD` cá nhân); verification intent — normal/retry/duplicate/out-of-order/permission/reconciliation paths giữ đúng SoR và không mất/lặp giao dịch; chi tiết API/SEC/DB/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-159"></a>
### FR-159 — Tích hợp Google Drive

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ connector Google Drive cho Tệp, metadata, phiên bản, quyền chia sẻ đối với thư mục đã kết nối, theo cơ chế Hai chiều theo event; scan đối soát theo lịch chỉ trong phạm vi được chọn. System of Record phải được giữ đúng như sau: Theo thư mục: Drive hoặc DMS nền tảng được chỉ định làm SoR trước khi bật. Connector phải khai báo owner trường, retry, idempotency, reconciliation và audit.
- **Truy vết:** Source: `INT-004`; Business Requirement: [BR-037](./02-BRD.md#br-037--tích-hợp-hệ-thống-theo-system-of-record-và-đối-soát).
- **Phạm vi sản phẩm:** Actor/persona — Integration Admin, System Owner và người dùng module được cấp quyền; phạm vi/boundary — Dùng chung; PM/O&M business integration; input/output — Tệp, metadata, phiên bản, quyền chia sẻ đối với thư mục đã kết nối cùng sync status, external mapping và reconciliation evidence.
- **Kiểm soát sản phẩm:** Permission — chỉ admin được ủy quyền cấu hình connector; người dùng chỉ thấy dữ liệu trong scope; control nguồn — Không tự quét; conflict queue; checksum; giữ external link và revision; chặn public link trái chính sách; Notification — sync failure/stale/reconciliation exception có owner; Audit — bắt buộc cho consent/config/token/mapping/sync/replay/export; Report/Search/Export — theo ACL nguồn và nền tảng; Bulk — không phải đường tắt vượt approval/SoD.
- **Ưu tiên và phát hành:** Source priority — connector không có MoSCoW riêng, dùng F.2/REQ-037; source roadmap — GĐ1–2; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner — Integration Owner + Source System Owner (`TBD` cá nhân); verification intent — normal/retry/duplicate/out-of-order/permission/reconciliation paths giữ đúng SoR và không mất/lặp giao dịch; chi tiết API/SEC/DB/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-160"></a>
### FR-160 — Tích hợp OneDrive/SharePoint

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ connector OneDrive/SharePoint cho Tệp, metadata, version, site/library, quyền truy cập, theo cơ chế Hai chiều theo Microsoft Graph; đối soát theo lịch. System of Record phải được giữ đúng như sau: Theo library/folder được cấu hình. Connector phải khai báo owner trường, retry, idempotency, reconciliation và audit.
- **Truy vết:** Source: `INT-005`; Business Requirement: [BR-037](./02-BRD.md#br-037--tích-hợp-hệ-thống-theo-system-of-record-và-đối-soát).
- **Phạm vi sản phẩm:** Actor/persona — Integration Admin, System Owner và người dùng module được cấp quyền; phạm vi/boundary — Dùng chung; PM/O&M business integration; input/output — Tệp, metadata, version, site/library, quyền truy cập cùng sync status, external mapping và reconciliation evidence.
- **Kiểm soát sản phẩm:** Permission — chỉ admin được ủy quyền cấu hình connector; người dùng chỉ thấy dữ liệu trong scope; control nguồn — Sensitivity label, DLP, checksum, mapping permission không được mở rộng quyền nguồn; Notification — sync failure/stale/reconciliation exception có owner; Audit — bắt buộc cho consent/config/token/mapping/sync/replay/export; Report/Search/Export — theo ACL nguồn và nền tảng; Bulk — không phải đường tắt vượt approval/SoD.
- **Ưu tiên và phát hành:** Source priority — connector không có MoSCoW riêng, dùng F.2/REQ-037; source roadmap — GĐ1–2; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner — Integration Owner + Source System Owner (`TBD` cá nhân); verification intent — normal/retry/duplicate/out-of-order/permission/reconciliation paths giữ đúng SoR và không mất/lặp giao dịch; chi tiết API/SEC/DB/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-161"></a>
### FR-161 — Tích hợp ERP

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ connector ERP cho Pháp nhân, vendor, mã chi phí, budget, PO, commitment, asset, payment status, theo cơ chế Hai chiều có chủ quyền trường; near-real-time cho trạng thái, batch cho master. System of Record phải được giữ đúng như sau: ERP là SoR sổ cái, vendor/account code và posting; nền tảng là SoR yêu cầu/luồng phê duyệt dự án. Connector phải khai báo owner trường, retry, idempotency, reconciliation và audit.
- **Truy vết:** Source: `INT-006`; Business Requirement: [BR-037](./02-BRD.md#br-037--tích-hợp-hệ-thống-theo-system-of-record-và-đối-soát).
- **Phạm vi sản phẩm:** Actor/persona — Integration Admin, System Owner và người dùng module được cấp quyền; phạm vi/boundary — Dùng chung; PM/O&M business integration; input/output — Pháp nhân, vendor, mã chi phí, budget, PO, commitment, asset, payment status cùng sync status, external mapping và reconciliation evidence.
- **Kiểm soát sản phẩm:** Permission — chỉ admin được ủy quyền cấu hình connector; người dùng chỉ thấy dữ liệu trong scope; control nguồn — Mapping mã, kỳ kế toán khóa, idempotency, tổng kiểm soát debit/credit, reconciliation hằng ngày; Notification — sync failure/stale/reconciliation exception có owner; Audit — bắt buộc cho consent/config/token/mapping/sync/replay/export; Report/Search/Export — theo ACL nguồn và nền tảng; Bulk — không phải đường tắt vượt approval/SoD.
- **Ưu tiên và phát hành:** Source priority — connector không có MoSCoW riêng, dùng F.2/REQ-037; source roadmap — GĐ2; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner — Integration Owner + Source System Owner (`TBD` cá nhân); verification intent — normal/retry/duplicate/out-of-order/permission/reconciliation paths giữ đúng SoR và không mất/lặp giao dịch; chi tiết API/SEC/DB/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-162"></a>
### FR-162 — Tích hợp Phần mềm kế toán

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ connector Phần mềm kế toán cho Hóa đơn, VAT, đề nghị thanh toán đã duyệt, chứng từ, số phiếu, ngày hạch toán, trạng thái chi, theo cơ chế Ra đề nghị đã duyệt; vào số chứng từ/trạng thái; batch hoặc webhook. System of Record phải được giữ đúng như sau: Kế toán là SoR hạch toán và đã chi; nền tảng là SoR hồ sơ đề nghị/phê duyệt. Connector phải khai báo owner trường, retry, idempotency, reconciliation và audit.
- **Truy vết:** Source: `INT-007`; Business Requirement: [BR-037](./02-BRD.md#br-037--tích-hợp-hệ-thống-theo-system-of-record-và-đối-soát).
- **Phạm vi sản phẩm:** Actor/persona — Integration Admin, System Owner và người dùng module được cấp quyền; phạm vi/boundary — Dùng chung; PM/O&M business integration; input/output — Hóa đơn, VAT, đề nghị thanh toán đã duyệt, chứng từ, số phiếu, ngày hạch toán, trạng thái chi cùng sync status, external mapping và reconciliation evidence.
- **Kiểm soát sản phẩm:** Permission — chỉ admin được ủy quyền cấu hình connector; người dùng chỉ thấy dữ liệu trong scope; control nguồn — Không tạo bút toán trực tiếp nếu chưa qua staging; đối soát currency/VAT/contractId; khóa kỳ; Notification — sync failure/stale/reconciliation exception có owner; Audit — bắt buộc cho consent/config/token/mapping/sync/replay/export; Report/Search/Export — theo ACL nguồn và nền tảng; Bulk — không phải đường tắt vượt approval/SoD.
- **Ưu tiên và phát hành:** Source priority — connector không có MoSCoW riêng, dùng F.2/REQ-037; source roadmap — GĐ2; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner — Integration Owner + Source System Owner (`TBD` cá nhân); verification intent — normal/retry/duplicate/out-of-order/permission/reconciliation paths giữ đúng SoR và không mất/lặp giao dịch; chi tiết API/SEC/DB/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-163"></a>
### FR-163 — Tích hợp HR/HRIS

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ connector HR/HRIS cho Nhân sự, phòng ban, chức danh, quản lý trực tiếp, trạng thái làm việc, chứng chỉ, theo cơ chế Một chiều vào hằng ngày và event offboarding. System of Record phải được giữ đúng như sau: HRIS là SoR hồ sơ nhân sự; IAM là SoR quyền ứng dụng. Connector phải khai báo owner trường, retry, idempotency, reconciliation và audit.
- **Truy vết:** Source: `INT-008`; Business Requirement: [BR-037](./02-BRD.md#br-037--tích-hợp-hệ-thống-theo-system-of-record-và-đối-soát).
- **Phạm vi sản phẩm:** Actor/persona — Integration Admin, System Owner và người dùng module được cấp quyền; phạm vi/boundary — Dùng chung; PM/O&M business integration; input/output — Nhân sự, phòng ban, chức danh, quản lý trực tiếp, trạng thái làm việc, chứng chỉ cùng sync status, external mapping và reconciliation evidence.
- **Kiểm soát sản phẩm:** Permission — chỉ admin được ủy quyền cấu hình connector; người dùng chỉ thấy dữ liệu trong scope; control nguồn — Tự khóa tài khoản khi nghỉ việc; không nhập dữ liệu lương không cần thiết; kiểm tra chứng chỉ hết hạn; Notification — sync failure/stale/reconciliation exception có owner; Audit — bắt buộc cho consent/config/token/mapping/sync/replay/export; Report/Search/Export — theo ACL nguồn và nền tảng; Bulk — không phải đường tắt vượt approval/SoD.
- **Ưu tiên và phát hành:** Source priority — connector không có MoSCoW riêng, dùng F.2/REQ-037; source roadmap — GĐ1–2; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner — Integration Owner + Source System Owner (`TBD` cá nhân); verification intent — normal/retry/duplicate/out-of-order/permission/reconciliation paths giữ đúng SoR và không mất/lặp giao dịch; chi tiết API/SEC/DB/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-164"></a>
### FR-164 — Tích hợp Chữ ký số/dịch vụ tin cậy

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ connector Chữ ký số/dịch vụ tin cậy cho Gói ký, người ký, thứ tự ký, chứng thư, timestamp, tài liệu đã ký, trạng thái/từ chối, theo cơ chế Ra yêu cầu ký; vào trạng thái và bản ký; webhook. System of Record phải được giữ đúng như sau: Nhà cung cấp là SoR giao dịch ký; DMS giữ bản hoàn tất bất biến và bằng chứng. Connector phải khai báo owner trường, retry, idempotency, reconciliation và audit.
- **Truy vết:** Source: `INT-009`; Business Requirement: [BR-019](./02-BRD.md#br-019--ghi-nhận-nhật-ký-nguồn-lực-vật-tư-và-bằng-chứng-hiện-trường), [BR-035](./02-BRD.md#br-035--quản-lý-vòng-đời-tài-liệu-doanh-nghiệp), [BR-037](./02-BRD.md#br-037--tích-hợp-hệ-thống-theo-system-of-record-và-đối-soát).
- **Phạm vi sản phẩm:** Actor/persona — Integration Admin, System Owner và người dùng module được cấp quyền; phạm vi/boundary — Dùng chung; PM/O&M business integration; input/output — Gói ký, người ký, thứ tự ký, chứng thư, timestamp, tài liệu đã ký, trạng thái/từ chối cùng sync status, external mapping và reconciliation evidence.
- **Kiểm soát sản phẩm:** Permission — chỉ admin được ủy quyền cấu hình connector; người dùng chỉ thấy dữ liệu trong scope; control nguồn — Xác minh hash, chứng thư, timestamp, danh tính và thẩm quyền; không thay file sau ký; audit đầy đủ; Notification — sync failure/stale/reconciliation exception có owner; Audit — bắt buộc cho consent/config/token/mapping/sync/replay/export; Report/Search/Export — theo ACL nguồn và nền tảng; Bulk — không phải đường tắt vượt approval/SoD.
- **Ưu tiên và phát hành:** Source priority — connector không có MoSCoW riêng, dùng F.2/REQ-037; source roadmap — GĐ1–3; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner — Integration Owner + Source System Owner (`TBD` cá nhân); verification intent — normal/retry/duplicate/out-of-order/permission/reconciliation paths giữ đúng SoR và không mất/lặp giao dịch; chi tiết API/SEC/DB/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-165"></a>
### FR-165 — Tích hợp SCADA

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ connector SCADA cho Công suất, năng lượng, trạng thái thiết bị, alarm và quality flag, theo cơ chế Một chiều vào qua DMZ/broker; 1–60 giây tùy tag; store-and-forward. System of Record phải được giữ đúng như sau: SCADA/historian hiện trường là SoR raw tag; time-series platform là bản sao phân tích. PM Web chỉ nhận dữ liệu; không có endpoint/setpoint/start-stop/reset/command hoặc route ngược tới controller.
- **Truy vết:** Source: `INT-010`; Business Requirement: [BR-027](./02-BRD.md#br-027--giám-sát-kpi-vận-hành-solar-có-provenance), [BR-037](./02-BRD.md#br-037--tích-hợp-hệ-thống-theo-system-of-record-và-đối-soát), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot).
- **Phạm vi sản phẩm:** Actor/persona — Integration Admin, System Owner và người dùng module được cấp quyền; phạm vi/boundary — Dùng chung/Solar/BESS; OT integration read-only (SCADA); input/output — Công suất, năng lượng, trạng thái thiết bị, alarm và quality flag cùng sync status, external mapping và reconciliation evidence.
- **Kiểm soát sản phẩm:** Permission — chỉ admin được ủy quyền cấu hình connector; người dùng chỉ thấy dữ liệu trong scope; control nguồn — Read-only, allowlist tag, mTLS, không route ngược, đồng bộ thời gian, gắn quality code; Notification — sync failure/stale/reconciliation exception có owner; Audit — bắt buộc cho consent/config/token/mapping/sync/replay/export; Report/Search/Export — theo ACL nguồn và nền tảng; Bulk — không phải đường tắt vượt approval/SoD.
- **Ưu tiên và phát hành:** Source priority — connector không có MoSCoW riêng, dùng F.2/REQ-037; source roadmap — GĐ4; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner — Integration Owner + Source System Owner (`TBD` cá nhân); verification intent — normal/retry/duplicate/out-of-order/permission/reconciliation paths giữ đúng SoR và không mất/lặp giao dịch; chi tiết API/SEC/DB/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-166"></a>
### FR-166 — Tích hợp EMS

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ connector EMS cho Setpoint thực tế, chế độ vận hành, lịch dispatch đã thực thi, SOC mục tiêu, alarm, theo cơ chế Một chiều vào; 1–15 giây cho vận hành, 1–15 phút cho tổng hợp. System of Record phải được giữ đúng như sau: EMS là SoR vận hành/dispatch thực tế. PM Web chỉ nhận dữ liệu; không có endpoint/setpoint/start-stop/reset/command hoặc route ngược tới controller.
- **Truy vết:** Source: `INT-011`; Business Requirement: [BR-028](./02-BRD.md#br-028--giám-sát-bess-kpi-degradation-và-operating-history), [BR-037](./02-BRD.md#br-037--tích-hợp-hệ-thống-theo-system-of-record-và-đối-soát), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot).
- **Phạm vi sản phẩm:** Actor/persona — Integration Admin, System Owner và người dùng module được cấp quyền; phạm vi/boundary — BESS; OT integration read-only (EMS); input/output — Setpoint thực tế, chế độ vận hành, lịch dispatch đã thực thi, SOC mục tiêu, alarm cùng sync status, external mapping và reconciliation evidence.
- **Kiểm soát sản phẩm:** Permission — chỉ admin được ủy quyền cấu hình connector; người dùng chỉ thấy dữ liệu trong scope; control nguồn — Nền tảng chỉ đọc; đề xuất AI không tự ghi setpoint; DMZ và broker tách biệt; Notification — sync failure/stale/reconciliation exception có owner; Audit — bắt buộc cho consent/config/token/mapping/sync/replay/export; Report/Search/Export — theo ACL nguồn và nền tảng; Bulk — không phải đường tắt vượt approval/SoD.
- **Ưu tiên và phát hành:** Source priority — connector không có MoSCoW riêng, dùng F.2/REQ-037; source roadmap — GĐ4–5; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner — Integration Owner + Source System Owner (`TBD` cá nhân); verification intent — normal/retry/duplicate/out-of-order/permission/reconciliation paths giữ đúng SoR và không mất/lặp giao dịch; chi tiết API/SEC/DB/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-167"></a>
### FR-167 — Tích hợp BMS

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ connector BMS cho SOC, SOH, cell/module voltage, nhiệt độ, current, cycle, alarm, contactor state, theo cơ chế Một chiều vào; 1–10 giây cho alarm/KPI nhanh, raw tốc độ cao lưu tại edge khi cần. System of Record phải được giữ đúng như sau: BMS/historian là SoR tín hiệu pin. PM Web chỉ nhận dữ liệu; không có endpoint/setpoint/start-stop/reset/command hoặc route ngược tới controller.
- **Truy vết:** Source: `INT-012`; Business Requirement: [BR-028](./02-BRD.md#br-028--giám-sát-bess-kpi-degradation-và-operating-history), [BR-037](./02-BRD.md#br-037--tích-hợp-hệ-thống-theo-system-of-record-và-đối-soát), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot).
- **Phạm vi sản phẩm:** Actor/persona — Integration Admin, System Owner và người dùng module được cấp quyền; phạm vi/boundary — BESS; OT integration read-only (BMS); input/output — SOC, SOH, cell/module voltage, nhiệt độ, current, cycle, alarm, contactor state cùng sync status, external mapping và reconciliation evidence.
- **Kiểm soát sản phẩm:** Permission — chỉ admin được ủy quyền cấu hình connector; người dùng chỉ thấy dữ liệu trong scope; control nguồn — Không truy vấn trực tiếp BMS từ Internet; allowlist; quality flag; giới hạn tần suất; đồng hồ chuẩn; Notification — sync failure/stale/reconciliation exception có owner; Audit — bắt buộc cho consent/config/token/mapping/sync/replay/export; Report/Search/Export — theo ACL nguồn và nền tảng; Bulk — không phải đường tắt vượt approval/SoD.
- **Ưu tiên và phát hành:** Source priority — connector không có MoSCoW riêng, dùng F.2/REQ-037; source roadmap — GĐ4; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner — Integration Owner + Source System Owner (`TBD` cá nhân); verification intent — normal/retry/duplicate/out-of-order/permission/reconciliation paths giữ đúng SoR và không mất/lặp giao dịch; chi tiết API/SEC/DB/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-168"></a>
### FR-168 — Tích hợp Nền tảng giám sát inverter

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ connector Nền tảng giám sát inverter cho Công suất DC/AC, yield, alarm, trạng thái inverter/string, theo cơ chế Một chiều vào qua API; 1–5 phút, alarm theo webhook nếu có. System of Record phải được giữ đúng như sau: Nền tảng OEM là SoR raw; kho time-series là SoR báo cáo hợp nhất. PM Web chỉ nhận dữ liệu; không có endpoint/setpoint/start-stop/reset/command hoặc route ngược tới controller.
- **Truy vết:** Source: `INT-013`; Business Requirement: [BR-027](./02-BRD.md#br-027--giám-sát-kpi-vận-hành-solar-có-provenance), [BR-037](./02-BRD.md#br-037--tích-hợp-hệ-thống-theo-system-of-record-và-đối-soát), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot).
- **Phạm vi sản phẩm:** Actor/persona — Integration Admin, System Owner và người dùng module được cấp quyền; phạm vi/boundary — Solar; O&M/OT telemetry read-only; input/output — Công suất DC/AC, yield, alarm, trạng thái inverter/string cùng sync status, external mapping và reconciliation evidence.
- **Kiểm soát sản phẩm:** Permission — chỉ admin được ủy quyền cấu hình connector; người dùng chỉ thấy dữ liệu trong scope; control nguồn — Rate limit, chuẩn hóa timezone/đơn vị, phát hiện mất dữ liệu và duplicate; Notification — sync failure/stale/reconciliation exception có owner; Audit — bắt buộc cho consent/config/token/mapping/sync/replay/export; Report/Search/Export — theo ACL nguồn và nền tảng; Bulk — không phải đường tắt vượt approval/SoD.
- **Ưu tiên và phát hành:** Source priority — connector không có MoSCoW riêng, dùng F.2/REQ-037; source roadmap — GĐ4; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner — Integration Owner + Source System Owner (`TBD` cá nhân); verification intent — normal/retry/duplicate/out-of-order/permission/reconciliation paths giữ đúng SoR và không mất/lặp giao dịch; chi tiết API/SEC/DB/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-169"></a>
### FR-169 — Tích hợp Smart meter/MDMS

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ connector Smart meter/MDMS cho Import/export energy, demand, power quality, interval data, meter event, theo cơ chế Một chiều vào; chu kỳ 15/30 phút và event. System of Record phải được giữ đúng như sau: Công tơ/MDMS đã kiểm định là SoR đo đếm; bản chốt kỳ được bất biến. PM Web chỉ nhận dữ liệu; không có endpoint/setpoint/start-stop/reset/command hoặc route ngược tới controller.
- **Truy vết:** Source: `INT-014`; Business Requirement: [BR-027](./02-BRD.md#br-027--giám-sát-kpi-vận-hành-solar-có-provenance), [BR-030](./02-BRD.md#br-030--quản-lý-billing-vận-hành-đối-soát-meter-và-report-bên-ngoài), [BR-037](./02-BRD.md#br-037--tích-hợp-hệ-thống-theo-system-of-record-và-đối-soát), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot).
- **Phạm vi sản phẩm:** Actor/persona — Integration Admin, System Owner và người dùng module được cấp quyền; phạm vi/boundary — Solar/BESS; metering read-only; input/output — Import/export energy, demand, power quality, interval data, meter event cùng sync status, external mapping và reconciliation evidence.
- **Kiểm soát sản phẩm:** Permission — chỉ admin được ủy quyền cấu hình connector; người dùng chỉ thấy dữ liệu trong scope; control nguồn — VEE (validation, estimation, editing), hệ số CT/PT, timezone, version bản chốt và truy vết ước tính; Notification — sync failure/stale/reconciliation exception có owner; Audit — bắt buộc cho consent/config/token/mapping/sync/replay/export; Report/Search/Export — theo ACL nguồn và nền tảng; Bulk — không phải đường tắt vượt approval/SoD.
- **Ưu tiên và phát hành:** Source priority — connector không có MoSCoW riêng, dùng F.2/REQ-037; source roadmap — GĐ4; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner — Integration Owner + Source System Owner (`TBD` cá nhân); verification intent — normal/retry/duplicate/out-of-order/permission/reconciliation paths giữ đúng SoR và không mất/lặp giao dịch; chi tiết API/SEC/DB/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-170"></a>
### FR-170 — Tích hợp EVN/API hoặc dữ liệu hóa đơn điện

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ connector EVN/API hoặc dữ liệu hóa đơn điện cho Hóa đơn, biểu giá, chỉ số, kỳ, công suất cực đại, file PDF/ảnh, theo cơ chế Một chiều vào qua API/file do người dùng cung cấp; theo kỳ. System of Record phải được giữ đúng như sau: Nguồn EVN/hóa đơn được xác minh là SoR; dữ liệu OCR là bản nháp. Connector phải khai báo owner trường, retry, idempotency, reconciliation và audit.
- **Truy vết:** Source: `INT-015`; Business Requirement: [BR-004](./02-BRD.md#br-004--quản-lý-hóa-đơn-điện-và-hồ-sơ-phụ-tải-có-chất-lượng-dữ-liệu), [BR-027](./02-BRD.md#br-027--giám-sát-kpi-vận-hành-solar-có-provenance), [BR-037](./02-BRD.md#br-037--tích-hợp-hệ-thống-theo-system-of-record-và-đối-soát).
- **Phạm vi sản phẩm:** Actor/persona — Integration Admin, System Owner và người dùng module được cấp quyền; phạm vi/boundary — Solar/BESS; PM/pre-feasibility và O&M billing; input/output — Hóa đơn, biểu giá, chỉ số, kỳ, công suất cực đại, file PDF/ảnh cùng sync status, external mapping và reconciliation evidence.
- **Kiểm soát sản phẩm:** Permission — chỉ admin được ủy quyền cấu hình connector; người dùng chỉ thấy dữ liệu trong scope; control nguồn — Version hóa biểu giá/quy tắc; OCR confidence; người dùng xác nhận trước tính toán; Notification — sync failure/stale/reconciliation exception có owner; Audit — bắt buộc cho consent/config/token/mapping/sync/replay/export; Report/Search/Export — theo ACL nguồn và nền tảng; Bulk — không phải đường tắt vượt approval/SoD.
- **Ưu tiên và phát hành:** Source priority — connector không có MoSCoW riêng, dùng F.2/REQ-037; source roadmap — GĐ1–4; release chuẩn hóa — **Pilot**.
- **Owner và kiểm chứng:** Owner — Integration Owner + Source System Owner (`TBD` cá nhân); verification intent — normal/retry/duplicate/out-of-order/permission/reconciliation paths giữ đúng SoR và không mất/lặp giao dịch; chi tiết API/SEC/DB/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-171"></a>
### FR-171 — Tích hợp PVSyst

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ connector PVSyst cho Project/variant, loss diagram, hourly yield, PR giả định, file report, theo cơ chế Một chiều vào theo file/API nếu có; theo revision phương án. System of Record phải được giữ đúng như sau: PVSyst là SoR kết quả mô phỏng; nền tảng là SoR version đề xuất đã duyệt. Connector phải khai báo owner trường, retry, idempotency, reconciliation và audit.
- **Truy vết:** Source: `INT-016`; Business Requirement: [BR-005](./02-BRD.md#br-005--quản-lý-phương-án-yield-và-sizing-solar-có-version), [BR-037](./02-BRD.md#br-037--tích-hợp-hệ-thống-theo-system-of-record-và-đối-soát).
- **Phạm vi sản phẩm:** Actor/persona — Integration Admin, System Owner và người dùng module được cấp quyền; phạm vi/boundary — Solar; PM engineering; input/output — Project/variant, loss diagram, hourly yield, PR giả định, file report cùng sync status, external mapping và reconciliation evidence.
- **Kiểm soát sản phẩm:** Permission — chỉ admin được ủy quyền cấu hình connector; người dùng chỉ thấy dữ liệu trong scope; control nguồn — Hash file, unit mapping, scenario/version, không ghi đè phương án đã phê duyệt; Notification — sync failure/stale/reconciliation exception có owner; Audit — bắt buộc cho consent/config/token/mapping/sync/replay/export; Report/Search/Export — theo ACL nguồn và nền tảng; Bulk — không phải đường tắt vượt approval/SoD.
- **Ưu tiên và phát hành:** Source priority — connector không có MoSCoW riêng, dùng F.2/REQ-037; source roadmap — GĐ4; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner — Integration Owner + Source System Owner (`TBD` cá nhân); verification intent — normal/retry/duplicate/out-of-order/permission/reconciliation paths giữ đúng SoR và không mất/lặp giao dịch; chi tiết API/SEC/DB/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-172"></a>
### FR-172 — Tích hợp AutoCAD/CDE thiết kế

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ connector AutoCAD/CDE thiết kế cho Metadata bản vẽ, mã, revision, PDF/DWG phát hành, comment/RFI link, theo cơ chế Vào khi publish; phản hồi trạng thái/comment có thể ra. System of Record phải được giữ đúng như sau: CDE/DMS được chỉ định là SoR file; nền tảng là SoR workflow dự án. Connector phải khai báo owner trường, retry, idempotency, reconciliation và audit.
- **Truy vết:** Source: `INT-017`; Business Requirement: [BR-037](./02-BRD.md#br-037--tích-hợp-hệ-thống-theo-system-of-record-và-đối-soát).
- **Phạm vi sản phẩm:** Actor/persona — Integration Admin, System Owner và người dùng module được cấp quyền; phạm vi/boundary — Dùng chung; PM engineering/DMS; input/output — Metadata bản vẽ, mã, revision, PDF/DWG phát hành, comment/RFI link cùng sync status, external mapping và reconciliation evidence.
- **Kiểm soát sản phẩm:** Permission — chỉ admin được ủy quyền cấu hình connector; người dùng chỉ thấy dữ liệu trong scope; control nguồn — Plugin ký số, mapping document code, virus scan, không preview DWG bằng dịch vụ không được phép; Notification — sync failure/stale/reconciliation exception có owner; Audit — bắt buộc cho consent/config/token/mapping/sync/replay/export; Report/Search/Export — theo ACL nguồn và nền tảng; Bulk — không phải đường tắt vượt approval/SoD.
- **Ưu tiên và phát hành:** Source priority — connector không có MoSCoW riêng, dùng F.2/REQ-037; source roadmap — GĐ2–3; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner — Integration Owner + Source System Owner (`TBD` cá nhân); verification intent — normal/retry/duplicate/out-of-order/permission/reconciliation paths giữ đúng SoR và không mất/lặp giao dịch; chi tiết API/SEC/DB/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-173"></a>
### FR-173 — Tích hợp Primavera P6/Microsoft Project

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ connector Primavera P6/Microsoft Project cho WBS, activity, calendar, dependency, baseline, actual, resource summary, theo cơ chế Hai chiều có chủ quyền trường; import theo phiên bản/on-demand. System of Record phải được giữ đúng như sau: Một lịch được chọn làm schedule master; hệ thống còn lại chỉ nhận bản publish. Connector phải khai báo owner trường, retry, idempotency, reconciliation và audit.
- **Truy vết:** Source: `INT-018`; Business Requirement: [BR-018](./02-BRD.md#br-018--quản-lý-wbs-baseline-look-ahead-và-khối-lượng), [BR-037](./02-BRD.md#br-037--tích-hợp-hệ-thống-theo-system-of-record-và-đối-soát).
- **Phạm vi sản phẩm:** Actor/persona — Integration Admin, System Owner và người dùng module được cấp quyền; phạm vi/boundary — Dùng chung; PM schedule; input/output — WBS, activity, calendar, dependency, baseline, actual, resource summary cùng sync status, external mapping và reconciliation evidence.
- **Kiểm soát sản phẩm:** Permission — chỉ admin được ủy quyền cấu hình connector; người dùng chỉ thấy dữ liệu trong scope; control nguồn — Baseline immutable, mapping activity ID, phát hiện vòng dependency, conflict preview trước commit; Notification — sync failure/stale/reconciliation exception có owner; Audit — bắt buộc cho consent/config/token/mapping/sync/replay/export; Report/Search/Export — theo ACL nguồn và nền tảng; Bulk — không phải đường tắt vượt approval/SoD.
- **Ưu tiên và phát hành:** Source priority — connector không có MoSCoW riêng, dùng F.2/REQ-037; source roadmap — GĐ1–2; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner — Integration Owner + Source System Owner (`TBD` cá nhân); verification intent — normal/retry/duplicate/out-of-order/permission/reconciliation paths giữ đúng SoR và không mất/lặp giao dịch; chi tiết API/SEC/DB/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-174"></a>
### FR-174 — Tích hợp Power BI

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ connector Power BI cho Dataset portfolio, tiến độ, cost, procurement, quality, HSE, O&M aggregate, theo cơ chế Một chiều ra qua semantic model/API; refresh theo SLA. System of Record phải được giữ đúng như sau: Nền tảng là SoR nghiệp vụ; Power BI là lớp phân tích. Connector phải khai báo owner trường, retry, idempotency, reconciliation và audit.
- **Truy vết:** Source: `INT-019`; Business Requirement: [BR-030](./02-BRD.md#br-030--quản-lý-billing-vận-hành-đối-soát-meter-và-report-bên-ngoài), [BR-036](./02-BRD.md#br-036--cung-cấp-dashboard-theo-vai-trò-và-báo-cáo-snapshot-có-kiểm-soát), [BR-037](./02-BRD.md#br-037--tích-hợp-hệ-thống-theo-system-of-record-và-đối-soát).
- **Phạm vi sản phẩm:** Actor/persona — Integration Admin, System Owner và người dùng module được cấp quyền; phạm vi/boundary — Dùng chung; PM/O&M business integration; input/output — Dataset portfolio, tiến độ, cost, procurement, quality, HSE, O&M aggregate cùng sync status, external mapping và reconciliation evidence.
- **Kiểm soát sản phẩm:** Permission — chỉ admin được ủy quyền cấu hình connector; người dùng chỉ thấy dữ liệu trong scope; control nguồn — Row-level security theo tenant/project, dữ liệu ẩn danh khi cần, certified dataset, lineage; Notification — sync failure/stale/reconciliation exception có owner; Audit — bắt buộc cho consent/config/token/mapping/sync/replay/export; Report/Search/Export — theo ACL nguồn và nền tảng; Bulk — không phải đường tắt vượt approval/SoD.
- **Ưu tiên và phát hành:** Source priority — connector không có MoSCoW riêng, dùng F.2/REQ-037; source roadmap — GĐ1–4; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner — Integration Owner + Source System Owner (`TBD` cá nhân); verification intent — normal/retry/duplicate/out-of-order/permission/reconciliation paths giữ đúng SoR và không mất/lặp giao dịch; chi tiết API/SEC/DB/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-175"></a>
### FR-175 — Tích hợp Zalo OA/SMS

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ connector Zalo OA/SMS cho Nhắc việc, escalation, cảnh báo khẩn, OTP khi được phép; delivery receipt, theo cơ chế Ra theo rule; receipt vào. System of Record phải được giữ đúng như sau: Nền tảng là SoR notification; nhà mạng/OA là SoR delivery. Connector phải khai báo owner trường, retry, idempotency, reconciliation và audit.
- **Truy vết:** Source: `INT-020`; Business Requirement: [BR-037](./02-BRD.md#br-037--tích-hợp-hệ-thống-theo-system-of-record-và-đối-soát).
- **Phạm vi sản phẩm:** Actor/persona — Integration Admin, System Owner và người dùng module được cấp quyền; phạm vi/boundary — Dùng chung; PM/O&M business integration; input/output — Nhắc việc, escalation, cảnh báo khẩn, OTP khi được phép; delivery receipt cùng sync status, external mapping và reconciliation evidence.
- **Kiểm soát sản phẩm:** Permission — chỉ admin được ủy quyền cấu hình connector; người dùng chỉ thấy dữ liệu trong scope; control nguồn — Opt-in, template được duyệt, quiet hours, không gửi nội dung nhạy cảm, rate limit và cost cap; Notification — sync failure/stale/reconciliation exception có owner; Audit — bắt buộc cho consent/config/token/mapping/sync/replay/export; Report/Search/Export — theo ACL nguồn và nền tảng; Bulk — không phải đường tắt vượt approval/SoD.
- **Ưu tiên và phát hành:** Source priority — connector không có MoSCoW riêng, dùng F.2/REQ-037; source roadmap — GĐ1–2; release chuẩn hóa — **MVP**.
- **Owner và kiểm chứng:** Owner — Integration Owner + Source System Owner (`TBD` cá nhân); verification intent — normal/retry/duplicate/out-of-order/permission/reconciliation paths giữ đúng SoR và không mất/lặp giao dịch; chi tiết API/SEC/DB/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-176"></a>
### FR-176 — Tích hợp Hệ thống vận chuyển/carrier

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ connector Hệ thống vận chuyển/carrier cho Booking, container, vận đơn, ETA, milestone cảng/hải quan, POD, theo cơ chế Một chiều vào qua webhook/API; 15–60 phút. System of Record phải được giữ đúng như sau: Carrier/forwarder là SoR sự kiện vận chuyển; procurement là SoR need-by date. Connector phải khai báo owner trường, retry, idempotency, reconciliation và audit.
- **Truy vết:** Source: `INT-021`; Business Requirement: [BR-017](./02-BRD.md#br-017--quản-lý-vận-chuyển-giao-nhận-serial-warranty-và-rủi-ro-chậm), [BR-037](./02-BRD.md#br-037--tích-hợp-hệ-thống-theo-system-of-record-và-đối-soát).
- **Phạm vi sản phẩm:** Actor/persona — Integration Admin, System Owner và người dùng module được cấp quyền; phạm vi/boundary — Dùng chung; PM procurement/logistics; input/output — Booking, container, vận đơn, ETA, milestone cảng/hải quan, POD cùng sync status, external mapping và reconciliation evidence.
- **Kiểm soát sản phẩm:** Permission — chỉ admin được ủy quyền cấu hình connector; người dùng chỉ thấy dữ liệu trong scope; control nguồn — Chuẩn hóa timezone/location, confidence ETA, cảnh báo stale feed, đối soát B/L/container; Notification — sync failure/stale/reconciliation exception có owner; Audit — bắt buộc cho consent/config/token/mapping/sync/replay/export; Report/Search/Export — theo ACL nguồn và nền tảng; Bulk — không phải đường tắt vượt approval/SoD.
- **Ưu tiên và phát hành:** Source priority — connector không có MoSCoW riêng, dùng F.2/REQ-037; source roadmap — GĐ2; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner — Integration Owner + Source System Owner (`TBD` cá nhân); verification intent — normal/retry/duplicate/out-of-order/permission/reconciliation paths giữ đúng SoR và không mất/lặp giao dịch; chi tiết API/SEC/DB/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-177"></a>
### FR-177 — Tích hợp API ngân hàng (nếu pháp lý và kiểm soát cho phép)

- **Yêu cầu chuẩn tắc:** Hệ thống phải hỗ trợ connector API ngân hàng (nếu pháp lý và kiểm soát cho phép) cho Số dư/biến động, trạng thái giao dịch, bank reference; payment batch tùy chọn ở giai đoạn sau, theo cơ chế Vào đối soát; chỉ ra lệnh thanh toán khi có phê duyệt riêng ngoài MVP. System of Record phải được giữ đúng như sau: Ngân hàng là SoR đã giao dịch; kế toán là SoR hạch toán. MVP chỉ nhận dữ liệu đối soát; mọi payment initiation là Future và cần maker–checker/phê duyệt riêng.
- **Truy vết:** Source: `INT-022`; Business Requirement: [BR-037](./02-BRD.md#br-037--tích-hợp-hệ-thống-theo-system-of-record-và-đối-soát).
- **Phạm vi sản phẩm:** Actor/persona — Integration Admin, System Owner và người dùng module được cấp quyền; phạm vi/boundary — Dùng chung; Finance; payment initiation ngoài MVP; input/output — Số dư/biến động, trạng thái giao dịch, bank reference; payment batch tùy chọn ở giai đoạn sau cùng sync status, external mapping và reconciliation evidence.
- **Kiểm soát sản phẩm:** Permission — chỉ admin được ủy quyền cấu hình connector; người dùng chỉ thấy dữ liệu trong scope; control nguồn — mTLS/HSM, maker–checker, hạn mức, beneficiary whitelist, ký giao dịch, không cho PM/AI tự chi tiền; Notification — sync failure/stale/reconciliation exception có owner; Audit — bắt buộc cho consent/config/token/mapping/sync/replay/export; Report/Search/Export — theo ACL nguồn và nền tảng; Bulk — không phải đường tắt vượt approval/SoD.
- **Ưu tiên và phát hành:** Source priority — connector không có MoSCoW riêng, dùng F.2/REQ-037; source roadmap — GĐ2/Future; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner — Integration Owner + Source System Owner (`TBD` cá nhân); verification intent — normal/retry/duplicate/out-of-order/permission/reconciliation paths giữ đúng SoR và không mất/lặp giao dịch; chi tiết API/SEC/DB/AC/TEST là forward reference. **Status:** Draft.

### 10.7. AI có quản trị

#### AIX — AI-assisted capabilities

<a id="fr-178"></a>
### FR-178 — AI: Phân loại tài liệu

- **Yêu cầu chuẩn tắc:** Khi use case được bật và người dùng có quyền, hệ thống phải dùng File, OCR text, metadata, taxonomy tài liệu, ví dụ đã gán nhãn để tạo Phân loại tài liệu nhằm Giảm thời gian đăng ký hồ sơ, đưa đúng thư mục/workflow. Mỗi output phải có nguồn/citation phù hợp, confidence, model/rule version, timestamp và trạng thái human review. Output là draft/recommendation; không tự phê duyệt, ký, thanh toán, thay requirement hoặc thay đổi bản ghi chính thức.
- **Truy vết:** Source: `AIX-001`; Business Requirement: [BR-035](./02-BRD.md#br-035--quản-lý-vòng-đời-tài-liệu-doanh-nghiệp), [BR-038](./02-BRD.md#br-038--quản-trị-và-triển-khai-ai-hỗ-trợ-có-kiểm-soát).
- **Phạm vi sản phẩm:** Actor/persona — người dùng nghiệp vụ được cấp quyền, reviewer nghiệp vụ và AI/Product Owner; phạm vi/boundary — Dùng chung; PM Web; input — File, OCR text, metadata, taxonomy tài liệu, ví dụ đã gán nhãn; output — draft/recommendation cùng provenance/confidence/review decision.
- **Kiểm soát sản phẩm:** Permission — pre-filter ACL/tenant scope và không mở rộng quyền từ dữ liệu nguồn; guardrail nguồn — Gán sai làm lộ/đi sai luồng; chỉ đề xuất, confidence thấp đưa vào inbox kiểm tra; Notification — chỉ gửi sau policy/reviewer hoặc khi quality gate thất bại; Audit — prompt/context references/model/output/reviewer/decision bắt buộc; Report/Search/Export — output kế thừa ACL và sensitivity; Bulk — cấm tự ghi hàng loạt, chỉ proposal queue có human confirmation.
- **Ưu tiên và phát hành:** Độ khó nguồn — Trung bình; source priority — P1; baseline MVP note — Có, pilot không chặn go-live; release chuẩn hóa — **Pilot**.
- **Owner và kiểm chứng:** Owner — Product Owner + functional/data/model owner (`TBD` cá nhân); verification intent — bộ dữ liệu đánh giá versioned đo quality/safety/leakage, reviewer chấp nhận/từ chối được, kill switch hoạt động và output không vượt quyền; chi tiết SEC/DB/API/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-179"></a>
### FR-179 — AI: Đề xuất tên và mã tài liệu

- **Yêu cầu chuẩn tắc:** Khi use case được bật và người dùng có quyền, hệ thống phải dùng Quy tắc mã hóa, dự án, discipline, loại, originator, sequence, revision để tạo Đề xuất tên và mã tài liệu nhằm Chuẩn hóa document register, giảm trùng mã. Mỗi output phải có nguồn/citation phù hợp, confidence, model/rule version, timestamp và trạng thái human review. Output là draft/recommendation; không tự phê duyệt, ký, thanh toán, thay requirement hoặc thay đổi bản ghi chính thức.
- **Truy vết:** Source: `AIX-002`; Business Requirement: [BR-035](./02-BRD.md#br-035--quản-lý-vòng-đời-tài-liệu-doanh-nghiệp), [BR-038](./02-BRD.md#br-038--quản-trị-và-triển-khai-ai-hỗ-trợ-có-kiểm-soát).
- **Phạm vi sản phẩm:** Actor/persona — người dùng nghiệp vụ được cấp quyền, reviewer nghiệp vụ và AI/Product Owner; phạm vi/boundary — Dùng chung; PM Web; input — Quy tắc mã hóa, dự án, discipline, loại, originator, sequence, revision; output — draft/recommendation cùng provenance/confidence/review decision.
- **Kiểm soát sản phẩm:** Permission — pre-filter ACL/tenant scope và không mở rộng quyền từ dữ liệu nguồn; guardrail nguồn — Trùng mã hoặc sai revision; server cấp sequence và kiểm tra uniqueness, người dùng xác nhận; Notification — chỉ gửi sau policy/reviewer hoặc khi quality gate thất bại; Audit — prompt/context references/model/output/reviewer/decision bắt buộc; Report/Search/Export — output kế thừa ACL và sensitivity; Bulk — cấm tự ghi hàng loạt, chỉ proposal queue có human confirmation.
- **Ưu tiên và phát hành:** Độ khó nguồn — Trung bình; source priority — P1; baseline MVP note — Có, pilot không chặn go-live; release chuẩn hóa — **Pilot**.
- **Owner và kiểm chứng:** Owner — Product Owner + functional/data/model owner (`TBD` cá nhân); verification intent — bộ dữ liệu đánh giá versioned đo quality/safety/leakage, reviewer chấp nhận/từ chối được, kill switch hoạt động và output không vượt quyền; chi tiết SEC/DB/API/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-180"></a>
### FR-180 — AI: OCR hóa đơn điện

- **Yêu cầu chuẩn tắc:** Khi use case được bật và người dùng có quyền, hệ thống phải dùng PDF/ảnh, mẫu hóa đơn, kỳ, meter, biểu giá versioned để tạo OCR hóa đơn điện nhằm Rút ngắn nhập liệu tiền khả thi/đối soát và giảm lỗi gõ. Mỗi output phải có nguồn/citation phù hợp, confidence, model/rule version, timestamp và trạng thái human review. Output là draft/recommendation; không tự phê duyệt, ký, thanh toán, thay requirement hoặc thay đổi bản ghi chính thức.
- **Truy vết:** Source: `AIX-003`; Business Requirement: [BR-004](./02-BRD.md#br-004--quản-lý-hóa-đơn-điện-và-hồ-sơ-phụ-tải-có-chất-lượng-dữ-liệu), [BR-038](./02-BRD.md#br-038--quản-trị-và-triển-khai-ai-hỗ-trợ-có-kiểm-soát).
- **Phạm vi sản phẩm:** Actor/persona — người dùng nghiệp vụ được cấp quyền, reviewer nghiệp vụ và AI/Product Owner; phạm vi/boundary — Dùng chung/Solar/BESS theo dữ liệu được cấp quyền; input — PDF/ảnh, mẫu hóa đơn, kỳ, meter, biểu giá versioned; output — draft/recommendation cùng provenance/confidence/review decision.
- **Kiểm soát sản phẩm:** Permission — pre-filter ACL/tenant scope và không mở rộng quyền từ dữ liệu nguồn; guardrail nguồn — Sai dấu thập phân/kỳ/đơn vị; confidence theo trường, đối chiếu tổng tiền, bắt buộc xác nhận; Notification — chỉ gửi sau policy/reviewer hoặc khi quality gate thất bại; Audit — prompt/context references/model/output/reviewer/decision bắt buộc; Report/Search/Export — output kế thừa ACL và sensitivity; Bulk — cấm tự ghi hàng loạt, chỉ proposal queue có human confirmation.
- **Ưu tiên và phát hành:** Độ khó nguồn — Trung bình; source priority — P1; baseline MVP note — Có, pilot không chặn go-live; release chuẩn hóa — **Pilot**.
- **Owner và kiểm chứng:** Owner — Product Owner + functional/data/model owner (`TBD` cá nhân); verification intent — bộ dữ liệu đánh giá versioned đo quality/safety/leakage, reviewer chấp nhận/từ chối được, kill switch hoạt động và output không vượt quyền; chi tiết SEC/DB/API/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-181"></a>
### FR-181 — AI: Trích xuất dữ liệu hợp đồng

- **Yêu cầu chuẩn tắc:** Khi use case được bật và người dùng có quyền, hệ thống phải dùng PDF/DOCX, OCR, loại hợp đồng, schema giá trị/thời hạn/các bên để tạo Trích xuất dữ liệu hợp đồng nhằm Tạo nhanh contract register từ hợp đồng/phụ lục. Mỗi output phải có nguồn/citation phù hợp, confidence, model/rule version, timestamp và trạng thái human review. Output là draft/recommendation; không tự phê duyệt, ký, thanh toán, thay requirement hoặc thay đổi bản ghi chính thức.
- **Truy vết:** Source: `AIX-004`; Business Requirement: [BR-038](./02-BRD.md#br-038--quản-trị-và-triển-khai-ai-hỗ-trợ-có-kiểm-soát).
- **Phạm vi sản phẩm:** Actor/persona — người dùng nghiệp vụ được cấp quyền, reviewer nghiệp vụ và AI/Product Owner; phạm vi/boundary — Dùng chung; PM Web; input — PDF/DOCX, OCR, loại hợp đồng, schema giá trị/thời hạn/các bên; output — draft/recommendation cùng provenance/confidence/review decision.
- **Kiểm soát sản phẩm:** Permission — pre-filter ACL/tenant scope và không mở rộng quyền từ dữ liệu nguồn; guardrail nguồn — Sai pháp nhân/giá trị; dẫn trang/đoạn, không ghi chính thức trước review pháp chế; Notification — chỉ gửi sau policy/reviewer hoặc khi quality gate thất bại; Audit — prompt/context references/model/output/reviewer/decision bắt buộc; Report/Search/Export — output kế thừa ACL và sensitivity; Bulk — cấm tự ghi hàng loạt, chỉ proposal queue có human confirmation.
- **Ưu tiên và phát hành:** Độ khó nguồn — Trung bình–Cao; source priority — P2; baseline MVP note — Should sau MVP core; release chuẩn hóa — **Pilot**.
- **Owner và kiểm chứng:** Owner — Product Owner + functional/data/model owner (`TBD` cá nhân); verification intent — bộ dữ liệu đánh giá versioned đo quality/safety/leakage, reviewer chấp nhận/từ chối được, kill switch hoạt động và output không vượt quyền; chi tiết SEC/DB/API/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-182"></a>
### FR-182 — AI: Nhận diện nghĩa vụ, thời hạn, điều kiện thanh toán

- **Yêu cầu chuẩn tắc:** Khi use case được bật và người dùng có quyền, hệ thống phải dùng Hợp đồng/phụ lục, clause, milestone, payment schedule, bảo lãnh để tạo Nhận diện nghĩa vụ, thời hạn, điều kiện thanh toán nhằm Cảnh báo sớm nghĩa vụ và cash-flow trigger. Mỗi output phải có nguồn/citation phù hợp, confidence, model/rule version, timestamp và trạng thái human review. Output là draft/recommendation; không tự phê duyệt, ký, thanh toán, thay requirement hoặc thay đổi bản ghi chính thức.
- **Truy vết:** Source: `AIX-005`; Business Requirement: [BR-038](./02-BRD.md#br-038--quản-trị-và-triển-khai-ai-hỗ-trợ-có-kiểm-soát).
- **Phạm vi sản phẩm:** Actor/persona — người dùng nghiệp vụ được cấp quyền, reviewer nghiệp vụ và AI/Product Owner; phạm vi/boundary — Dùng chung; PM Web; input — Hợp đồng/phụ lục, clause, milestone, payment schedule, bảo lãnh; output — draft/recommendation cùng provenance/confidence/review decision.
- **Kiểm soát sản phẩm:** Permission — pre-filter ACL/tenant scope và không mở rộng quyền từ dữ liệu nguồn; guardrail nguồn — Bỏ sót/diễn giải pháp lý sai; citation bắt buộc, dual review với khoản trọng yếu; Notification — chỉ gửi sau policy/reviewer hoặc khi quality gate thất bại; Audit — prompt/context references/model/output/reviewer/decision bắt buộc; Report/Search/Export — output kế thừa ACL và sensitivity; Bulk — cấm tự ghi hàng loạt, chỉ proposal queue có human confirmation.
- **Ưu tiên và phát hành:** Độ khó nguồn — Cao; source priority — P1; baseline MVP note — Có, pilot không chặn go-live; release chuẩn hóa — **Pilot**.
- **Owner và kiểm chứng:** Owner — Product Owner + functional/data/model owner (`TBD` cá nhân); verification intent — bộ dữ liệu đánh giá versioned đo quality/safety/leakage, reviewer chấp nhận/từ chối được, kill switch hoạt động và output không vượt quyền; chi tiết SEC/DB/API/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-183"></a>
### FR-183 — AI: Biên bản họp và action item

- **Yêu cầu chuẩn tắc:** Khi use case được bật và người dùng có quyền, hệ thống phải dùng Transcript/audio được đồng ý, agenda, attendee, project context để tạo Biên bản họp và action item nhằm Chuyển cuộc họp thành trách nhiệm/deadline có thể theo dõi. Mỗi output phải có nguồn/citation phù hợp, confidence, model/rule version, timestamp và trạng thái human review. Output là draft/recommendation; không tự phê duyệt, ký, thanh toán, thay requirement hoặc thay đổi bản ghi chính thức.
- **Truy vết:** Source: `AIX-006`; Business Requirement: [BR-038](./02-BRD.md#br-038--quản-trị-và-triển-khai-ai-hỗ-trợ-có-kiểm-soát).
- **Phạm vi sản phẩm:** Actor/persona — người dùng nghiệp vụ được cấp quyền, reviewer nghiệp vụ và AI/Product Owner; phạm vi/boundary — Dùng chung; PM Web; input — Transcript/audio được đồng ý, agenda, attendee, project context; output — draft/recommendation cùng provenance/confidence/review decision.
- **Kiểm soát sản phẩm:** Permission — pre-filter ACL/tenant scope và không mở rộng quyền từ dữ liệu nguồn; guardrail nguồn — Nhận sai người/cam kết; hiển thị draft, người chủ trì duyệt trước phát hành; Notification — chỉ gửi sau policy/reviewer hoặc khi quality gate thất bại; Audit — prompt/context references/model/output/reviewer/decision bắt buộc; Report/Search/Export — output kế thừa ACL và sensitivity; Bulk — cấm tự ghi hàng loạt, chỉ proposal queue có human confirmation.
- **Ưu tiên và phát hành:** Độ khó nguồn — Trung bình; source priority — P1; baseline MVP note — Có, pilot không chặn go-live; release chuẩn hóa — **Pilot**.
- **Owner và kiểm chứng:** Owner — Product Owner + functional/data/model owner (`TBD` cá nhân); verification intent — bộ dữ liệu đánh giá versioned đo quality/safety/leakage, reviewer chấp nhận/từ chối được, kill switch hoạt động và output không vượt quyền; chi tiết SEC/DB/API/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-184"></a>
### FR-184 — AI: Tóm tắt email và văn bản

- **Yêu cầu chuẩn tắc:** Khi use case được bật và người dùng có quyền, hệ thống phải dùng Email/thread, văn bản, attachment, context liên quan để tạo Tóm tắt email và văn bản nhằm Giảm thời gian đọc, làm rõ quyết định/vấn đề mở. Mỗi output phải có nguồn/citation phù hợp, confidence, model/rule version, timestamp và trạng thái human review. Output là draft/recommendation; không tự phê duyệt, ký, thanh toán, thay requirement hoặc thay đổi bản ghi chính thức.
- **Truy vết:** Source: `AIX-007`; Business Requirement: [BR-038](./02-BRD.md#br-038--quản-trị-và-triển-khai-ai-hỗ-trợ-có-kiểm-soát).
- **Phạm vi sản phẩm:** Actor/persona — người dùng nghiệp vụ được cấp quyền, reviewer nghiệp vụ và AI/Product Owner; phạm vi/boundary — Dùng chung; PM Web; input — Email/thread, văn bản, attachment, context liên quan; output — draft/recommendation cùng provenance/confidence/review decision.
- **Kiểm soát sản phẩm:** Permission — pre-filter ACL/tenant scope và không mở rộng quyền từ dữ liệu nguồn; guardrail nguồn — Mất ngoại lệ hoặc ngữ cảnh; nguồn bấm mở được, cảnh báo khi thread chưa đủ; Notification — chỉ gửi sau policy/reviewer hoặc khi quality gate thất bại; Audit — prompt/context references/model/output/reviewer/decision bắt buộc; Report/Search/Export — output kế thừa ACL và sensitivity; Bulk — cấm tự ghi hàng loạt, chỉ proposal queue có human confirmation.
- **Ưu tiên và phát hành:** Độ khó nguồn — Trung bình; source priority — P2; baseline MVP note — Should; release chuẩn hóa — **Post-MVP**.
- **Owner và kiểm chứng:** Owner — Product Owner + functional/data/model owner (`TBD` cá nhân); verification intent — bộ dữ liệu đánh giá versioned đo quality/safety/leakage, reviewer chấp nhận/từ chối được, kill switch hoạt động và output không vượt quyền; chi tiết SEC/DB/API/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-185"></a>
### FR-185 — AI: Phát hiện công việc có nguy cơ trễ

- **Yêu cầu chuẩn tắc:** Khi use case được bật và người dùng có quyền, hệ thống phải dùng Baseline, actual, dependency, resource, lịch sử cập nhật, procurement để tạo Phát hiện công việc có nguy cơ trễ nhằm PM xử lý trước khi quá hạn. Mỗi output phải có nguồn/citation phù hợp, confidence, model/rule version, timestamp và trạng thái human review. Output là draft/recommendation; không tự phê duyệt, ký, thanh toán, thay requirement hoặc thay đổi bản ghi chính thức.
- **Truy vết:** Source: `AIX-008`; Business Requirement: [BR-038](./02-BRD.md#br-038--quản-trị-và-triển-khai-ai-hỗ-trợ-có-kiểm-soát).
- **Phạm vi sản phẩm:** Actor/persona — người dùng nghiệp vụ được cấp quyền, reviewer nghiệp vụ và AI/Product Owner; phạm vi/boundary — Dùng chung; PM Web; input — Baseline, actual, dependency, resource, lịch sử cập nhật, procurement; output — draft/recommendation cùng provenance/confidence/review decision.
- **Kiểm soát sản phẩm:** Permission — pre-filter ACL/tenant scope và không mở rộng quyền từ dữ liệu nguồn; guardrail nguồn — Thiên lệch từ dữ liệu kém; giải thích driver, không tự đổi lịch, theo dõi precision/recall; Notification — chỉ gửi sau policy/reviewer hoặc khi quality gate thất bại; Audit — prompt/context references/model/output/reviewer/decision bắt buộc; Report/Search/Export — output kế thừa ACL và sensitivity; Bulk — cấm tự ghi hàng loạt, chỉ proposal queue có human confirmation.
- **Ưu tiên và phát hành:** Độ khó nguồn — Cao; source priority — P2; baseline MVP note — Không; GĐ5; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner — Product Owner + functional/data/model owner (`TBD` cá nhân); verification intent — bộ dữ liệu đánh giá versioned đo quality/safety/leakage, reviewer chấp nhận/từ chối được, kill switch hoạt động và output không vượt quyền; chi tiết SEC/DB/API/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-186"></a>
### FR-186 — AI: Dự báo ngày COD

- **Yêu cầu chuẩn tắc:** Khi use case được bật và người dùng có quyền, hệ thống phải dùng Critical path, permit, procurement ETA, commissioning/punch, lịch sử dự án để tạo Dự báo ngày COD nhằm Cung cấp forecast có dải tin cậy và nguyên nhân. Mỗi output phải có nguồn/citation phù hợp, confidence, model/rule version, timestamp và trạng thái human review. Output là draft/recommendation; không tự phê duyệt, ký, thanh toán, thay requirement hoặc thay đổi bản ghi chính thức.
- **Truy vết:** Source: `AIX-009`; Business Requirement: [BR-038](./02-BRD.md#br-038--quản-trị-và-triển-khai-ai-hỗ-trợ-có-kiểm-soát).
- **Phạm vi sản phẩm:** Actor/persona — người dùng nghiệp vụ được cấp quyền, reviewer nghiệp vụ và AI/Product Owner; phạm vi/boundary — Dùng chung/Solar/BESS theo dữ liệu được cấp quyền; input — Critical path, permit, procurement ETA, commissioning/punch, lịch sử dự án; output — draft/recommendation cùng provenance/confidence/review decision.
- **Kiểm soát sản phẩm:** Permission — pre-filter ACL/tenant scope và không mở rộng quyền từ dữ liệu nguồn; guardrail nguồn — “Độ chính xác giả”; hiển thị P50/P80, confidence, giả định và back-test; Notification — chỉ gửi sau policy/reviewer hoặc khi quality gate thất bại; Audit — prompt/context references/model/output/reviewer/decision bắt buộc; Report/Search/Export — output kế thừa ACL và sensitivity; Bulk — cấm tự ghi hàng loạt, chỉ proposal queue có human confirmation.
- **Ưu tiên và phát hành:** Độ khó nguồn — Cao; source priority — P2; baseline MVP note — Không; GĐ5; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner — Product Owner + functional/data/model owner (`TBD` cá nhân); verification intent — bộ dữ liệu đánh giá versioned đo quality/safety/leakage, reviewer chấp nhận/từ chối được, kill switch hoạt động và output không vượt quyền; chi tiết SEC/DB/API/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-187"></a>
### FR-187 — AI: Dự báo vượt ngân sách

- **Yêu cầu chuẩn tắc:** Khi use case được bật và người dùng có quyền, hệ thống phải dùng Budget, commitment, actual, change/claim, tiến độ, FX snapshot để tạo Dự báo vượt ngân sách nhằm Cảnh báo EAC/BAC theo gói thầu. Mỗi output phải có nguồn/citation phù hợp, confidence, model/rule version, timestamp và trạng thái human review. Output là draft/recommendation; không tự phê duyệt, ký, thanh toán, thay requirement hoặc thay đổi bản ghi chính thức.
- **Truy vết:** Source: `AIX-010`; Business Requirement: [BR-038](./02-BRD.md#br-038--quản-trị-và-triển-khai-ai-hỗ-trợ-có-kiểm-soát).
- **Phạm vi sản phẩm:** Actor/persona — người dùng nghiệp vụ được cấp quyền, reviewer nghiệp vụ và AI/Product Owner; phạm vi/boundary — Dùng chung/Solar/BESS theo dữ liệu được cấp quyền; input — Budget, commitment, actual, change/claim, tiến độ, FX snapshot; output — draft/recommendation cùng provenance/confidence/review decision.
- **Kiểm soát sản phẩm:** Permission — pre-filter ACL/tenant scope và không mở rộng quyền từ dữ liệu nguồn; guardrail nguồn — Nhầm currency/thiếu commitment; dự báo riêng từng currency, giải thích biến số, Finance review; Notification — chỉ gửi sau policy/reviewer hoặc khi quality gate thất bại; Audit — prompt/context references/model/output/reviewer/decision bắt buộc; Report/Search/Export — output kế thừa ACL và sensitivity; Bulk — cấm tự ghi hàng loạt, chỉ proposal queue có human confirmation.
- **Ưu tiên và phát hành:** Độ khó nguồn — Cao; source priority — P2; baseline MVP note — Không; GĐ5; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner — Product Owner + functional/data/model owner (`TBD` cá nhân); verification intent — bộ dữ liệu đánh giá versioned đo quality/safety/leakage, reviewer chấp nhận/từ chối được, kill switch hoạt động và output không vượt quyền; chi tiết SEC/DB/API/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-188"></a>
### FR-188 — AI: Đối chiếu BOM–PO–hàng nhận

- **Yêu cầu chuẩn tắc:** Khi use case được bật và người dùng có quyền, hệ thống phải dùng BOM revision, PO line, GRN, serial, packing list, ảnh/scan để tạo Đối chiếu BOM–PO–hàng nhận nhằm Phát hiện thiếu/thừa/sai model trước lắp đặt. Mỗi output phải có nguồn/citation phù hợp, confidence, model/rule version, timestamp và trạng thái human review. Output là draft/recommendation; không tự phê duyệt, ký, thanh toán, thay requirement hoặc thay đổi bản ghi chính thức.
- **Truy vết:** Source: `AIX-011`; Business Requirement: [BR-038](./02-BRD.md#br-038--quản-trị-và-triển-khai-ai-hỗ-trợ-có-kiểm-soát).
- **Phạm vi sản phẩm:** Actor/persona — người dùng nghiệp vụ được cấp quyền, reviewer nghiệp vụ và AI/Product Owner; phạm vi/boundary — Dùng chung; PM Web; input — BOM revision, PO line, GRN, serial, packing list, ảnh/scan; output — draft/recommendation cùng provenance/confidence/review decision.
- **Kiểm soát sản phẩm:** Permission — pre-filter ACL/tenant scope và không mở rộng quyền từ dữ liệu nguồn; guardrail nguồn — Mapping vật tư sai; master alias do kỹ thuật duyệt, tolerance và exception queue; Notification — chỉ gửi sau policy/reviewer hoặc khi quality gate thất bại; Audit — prompt/context references/model/output/reviewer/decision bắt buộc; Report/Search/Export — output kế thừa ACL và sensitivity; Bulk — cấm tự ghi hàng loạt, chỉ proposal queue có human confirmation.
- **Ưu tiên và phát hành:** Độ khó nguồn — Trung bình–Cao; source priority — P2; baseline MVP note — Should GĐ2–3; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner — Product Owner + functional/data/model owner (`TBD` cá nhân); verification intent — bộ dữ liệu đánh giá versioned đo quality/safety/leakage, reviewer chấp nhận/từ chối được, kill switch hoạt động và output không vượt quyền; chi tiết SEC/DB/API/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-189"></a>
### FR-189 — AI: Kiểm tra thiếu hồ sơ/COD readiness

- **Yêu cầu chuẩn tắc:** Khi use case được bật và người dùng có quyền, hệ thống phải dùng Deliverable matrix, DMS status, contract obligation, checklist COD, test result để tạo Kiểm tra thiếu hồ sơ/COD readiness nhằm Tự động chỉ ra deliverable/approval/test còn thiếu. Mỗi output phải có nguồn/citation phù hợp, confidence, model/rule version, timestamp và trạng thái human review. Output là draft/recommendation; không tự phê duyệt, ký, thanh toán, thay requirement hoặc thay đổi bản ghi chính thức.
- **Truy vết:** Source: `AIX-012`; Business Requirement: [BR-038](./02-BRD.md#br-038--quản-trị-và-triển-khai-ai-hỗ-trợ-có-kiểm-soát).
- **Phạm vi sản phẩm:** Actor/persona — người dùng nghiệp vụ được cấp quyền, reviewer nghiệp vụ và AI/Product Owner; phạm vi/boundary — Dùng chung/Solar/BESS theo dữ liệu được cấp quyền; input — Deliverable matrix, DMS status, contract obligation, checklist COD, test result; output — draft/recommendation cùng provenance/confidence/review decision.
- **Kiểm soát sản phẩm:** Permission — pre-filter ACL/tenant scope và không mở rộng quyền từ dữ liệu nguồn; guardrail nguồn — False complete nguy hiểm; rule deterministic làm nền, AI chỉ map/giải thích, không tự đánh dấu đạt; Notification — chỉ gửi sau policy/reviewer hoặc khi quality gate thất bại; Audit — prompt/context references/model/output/reviewer/decision bắt buộc; Report/Search/Export — output kế thừa ACL và sensitivity; Bulk — cấm tự ghi hàng loạt, chỉ proposal queue có human confirmation.
- **Ưu tiên và phát hành:** Độ khó nguồn — Trung bình; source priority — P1; baseline MVP note — Có, pilot không chặn go-live; release chuẩn hóa — **Pilot**.
- **Owner và kiểm chứng:** Owner — Product Owner + functional/data/model owner (`TBD` cá nhân); verification intent — bộ dữ liệu đánh giá versioned đo quality/safety/leakage, reviewer chấp nhận/từ chối được, kill switch hoạt động và output không vượt quyền; chi tiết SEC/DB/API/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-190"></a>
### FR-190 — AI: So sánh revision bản vẽ

- **Yêu cầu chuẩn tắc:** Khi use case được bật và người dùng có quyền, hệ thống phải dùng Hai revision PDF/DWG export, layer/text, comment trước để tạo So sánh revision bản vẽ nhằm Giúp reviewer tập trung vào vùng thay đổi và ảnh hưởng. Mỗi output phải có nguồn/citation phù hợp, confidence, model/rule version, timestamp và trạng thái human review. Output là draft/recommendation; không tự phê duyệt, ký, thanh toán, thay requirement hoặc thay đổi bản ghi chính thức.
- **Truy vết:** Source: `AIX-013`; Business Requirement: [BR-038](./02-BRD.md#br-038--quản-trị-và-triển-khai-ai-hỗ-trợ-có-kiểm-soát).
- **Phạm vi sản phẩm:** Actor/persona — người dùng nghiệp vụ được cấp quyền, reviewer nghiệp vụ và AI/Product Owner; phạm vi/boundary — Dùng chung/Solar/BESS theo dữ liệu được cấp quyền; input — Hai revision PDF/DWG export, layer/text, comment trước; output — draft/recommendation cùng provenance/confidence/review decision.
- **Kiểm soát sản phẩm:** Permission — pre-filter ACL/tenant scope và không mở rộng quyền từ dữ liệu nguồn; guardrail nguồn — Bỏ sót thay đổi hình học; overlay trực quan, đánh dấu “hỗ trợ review”, kỹ sư vẫn phê duyệt; Notification — chỉ gửi sau policy/reviewer hoặc khi quality gate thất bại; Audit — prompt/context references/model/output/reviewer/decision bắt buộc; Report/Search/Export — output kế thừa ACL và sensitivity; Bulk — cấm tự ghi hàng loạt, chỉ proposal queue có human confirmation.
- **Ưu tiên và phát hành:** Độ khó nguồn — Cao; source priority — P2; baseline MVP note — Không; GĐ3–5; release chuẩn hóa — **Pilot**.
- **Owner và kiểm chứng:** Owner — Product Owner + functional/data/model owner (`TBD` cá nhân); verification intent — bộ dữ liệu đánh giá versioned đo quality/safety/leakage, reviewer chấp nhận/từ chối được, kill switch hoạt động và output không vượt quyền; chi tiết SEC/DB/API/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-191"></a>
### FR-191 — AI: Phân tích ảnh công trường

- **Yêu cầu chuẩn tắc:** Khi use case được bật và người dùng có quyền, hệ thống phải dùng Ảnh có thời gian/vị trí/khu vực/WBS, plan, ảnh mẫu để tạo Phân tích ảnh công trường nhằm Ước lượng hiện trạng, phân loại ảnh và bằng chứng tiến độ. Mỗi output phải có nguồn/citation phù hợp, confidence, model/rule version, timestamp và trạng thái human review. Output là draft/recommendation; không tự phê duyệt, ký, thanh toán, thay requirement hoặc thay đổi bản ghi chính thức.
- **Truy vết:** Source: `AIX-014`; Business Requirement: [BR-038](./02-BRD.md#br-038--quản-trị-và-triển-khai-ai-hỗ-trợ-có-kiểm-soát).
- **Phạm vi sản phẩm:** Actor/persona — người dùng nghiệp vụ được cấp quyền, reviewer nghiệp vụ và AI/Product Owner; phạm vi/boundary — Dùng chung/Solar/BESS theo dữ liệu được cấp quyền; input — Ảnh có thời gian/vị trí/khu vực/WBS, plan, ảnh mẫu; output — draft/recommendation cùng provenance/confidence/review decision.
- **Kiểm soát sản phẩm:** Permission — pre-filter ACL/tenant scope và không mở rộng quyền từ dữ liệu nguồn; guardrail nguồn — Ảnh cũ/góc khuất; kiểm tra metadata, chống duplicate, không tự chốt % hoàn thành; Notification — chỉ gửi sau policy/reviewer hoặc khi quality gate thất bại; Audit — prompt/context references/model/output/reviewer/decision bắt buộc; Report/Search/Export — output kế thừa ACL và sensitivity; Bulk — cấm tự ghi hàng loạt, chỉ proposal queue có human confirmation.
- **Ưu tiên và phát hành:** Độ khó nguồn — Cao; source priority — P3; baseline MVP note — Không; GĐ5; release chuẩn hóa — **Pilot**.
- **Owner và kiểm chứng:** Owner — Product Owner + functional/data/model owner (`TBD` cá nhân); verification intent — bộ dữ liệu đánh giá versioned đo quality/safety/leakage, reviewer chấp nhận/từ chối được, kill switch hoạt động và output không vượt quyền; chi tiết SEC/DB/API/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-192"></a>
### FR-192 — AI: Nhận diện PPE/rủi ro HSE từ ảnh

- **Yêu cầu chuẩn tắc:** Khi use case được bật và người dùng có quyền, hệ thống phải dùng Ảnh/video được phép, PPE policy, zone/risk taxonomy để tạo Nhận diện PPE/rủi ro HSE từ ảnh nhằm Tăng khả năng phát hiện sớm hành vi không an toàn. Mỗi output phải có nguồn/citation phù hợp, confidence, model/rule version, timestamp và trạng thái human review. Output là draft/recommendation; không tự phê duyệt, ký, thanh toán, thay requirement hoặc thay đổi bản ghi chính thức.
- **Truy vết:** Source: `AIX-015`; Business Requirement: [BR-038](./02-BRD.md#br-038--quản-trị-và-triển-khai-ai-hỗ-trợ-có-kiểm-soát).
- **Phạm vi sản phẩm:** Actor/persona — người dùng nghiệp vụ được cấp quyền, reviewer nghiệp vụ và AI/Product Owner; phạm vi/boundary — Dùng chung/Solar/BESS theo dữ liệu được cấp quyền; input — Ảnh/video được phép, PPE policy, zone/risk taxonomy; output — draft/recommendation cùng provenance/confidence/review decision.
- **Kiểm soát sản phẩm:** Permission — pre-filter ACL/tenant scope và không mở rộng quyền từ dữ liệu nguồn; guardrail nguồn — False negative, quyền riêng tư, giám sát lao động; DPIA, biển báo/consent, HSE xác minh, không dùng kỷ luật tự động; Notification — chỉ gửi sau policy/reviewer hoặc khi quality gate thất bại; Audit — prompt/context references/model/output/reviewer/decision bắt buộc; Report/Search/Export — output kế thừa ACL và sensitivity; Bulk — cấm tự ghi hàng loạt, chỉ proposal queue có human confirmation.
- **Ưu tiên và phát hành:** Độ khó nguồn — Cao; source priority — P3; baseline MVP note — Không; GĐ5; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner — Product Owner + functional/data/model owner (`TBD` cá nhân); verification intent — bộ dữ liệu đánh giá versioned đo quality/safety/leakage, reviewer chấp nhận/từ chối được, kill switch hoạt động và output không vượt quyền; chi tiết SEC/DB/API/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-193"></a>
### FR-193 — AI: Phân tích và phân nhóm alarm BESS

- **Yêu cầu chuẩn tắc:** Khi use case được bật và người dùng có quyền, hệ thống phải dùng Alarm/event, topology, OEM manual, maintenance history để tạo Phân tích và phân nhóm alarm BESS nhằm Giảm alarm flood, gợi ý runbook và mức ưu tiên. Mỗi output phải có nguồn/citation phù hợp, confidence, model/rule version, timestamp và trạng thái human review. Mọi output chỉ là phân tích/đề xuất; không suppress alarm safety, không ghi setpoint và không phát lệnh charge/discharge/start-stop/reset.
- **Truy vết:** Source: `AIX-016`; Business Requirement: [BR-038](./02-BRD.md#br-038--quản-trị-và-triển-khai-ai-hỗ-trợ-có-kiểm-soát).
- **Phạm vi sản phẩm:** Actor/persona — người dùng nghiệp vụ được cấp quyền, reviewer nghiệp vụ và AI/Product Owner; phạm vi/boundary — BESS/O&M monitoring; không điều khiển OT; input — Alarm/event, topology, OEM manual, maintenance history; output — draft/recommendation cùng provenance/confidence/review decision.
- **Kiểm soát sản phẩm:** Permission — pre-filter ACL/tenant scope và không mở rộng quyền từ dữ liệu nguồn; guardrail nguồn — Gộp nhầm alarm an toàn; không suppress alarm safety, dẫn manual, operator xác nhận; Notification — chỉ gửi sau policy/reviewer hoặc khi quality gate thất bại; Audit — prompt/context references/model/output/reviewer/decision bắt buộc; Report/Search/Export — output kế thừa ACL và sensitivity; Bulk — cấm tự ghi hàng loạt, chỉ proposal queue có human confirmation.
- **Ưu tiên và phát hành:** Độ khó nguồn — Cao; source priority — P2; baseline MVP note — Không; GĐ5; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner — Product Owner + functional/data/model owner (`TBD` cá nhân); verification intent — bộ dữ liệu đánh giá versioned đo quality/safety/leakage, reviewer chấp nhận/từ chối được, kill switch hoạt động và output không vượt quyền; chi tiết SEC/DB/API/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-194"></a>
### FR-194 — AI: Phát hiện bất thường SOC/SOH/nhiệt độ/cell voltage

- **Yêu cầu chuẩn tắc:** Khi use case được bật và người dùng có quyền, hệ thống phải dùng Time-series BMS, quality flag, operating mode, ambient, maintenance để tạo Phát hiện bất thường SOC/SOH/nhiệt độ/cell voltage nhằm Phát hiện suy giảm, mất cân bằng hoặc thermal risk sớm. Mỗi output phải có nguồn/citation phù hợp, confidence, model/rule version, timestamp và trạng thái human review. Mọi output chỉ là phân tích/đề xuất; không suppress alarm safety, không ghi setpoint và không phát lệnh charge/discharge/start-stop/reset.
- **Truy vết:** Source: `AIX-017`; Business Requirement: [BR-038](./02-BRD.md#br-038--quản-trị-và-triển-khai-ai-hỗ-trợ-có-kiểm-soát).
- **Phạm vi sản phẩm:** Actor/persona — người dùng nghiệp vụ được cấp quyền, reviewer nghiệp vụ và AI/Product Owner; phạm vi/boundary — BESS/O&M monitoring; không điều khiển OT; input — Time-series BMS, quality flag, operating mode, ambient, maintenance; output — draft/recommendation cùng provenance/confidence/review decision.
- **Kiểm soát sản phẩm:** Permission — pre-filter ACL/tenant scope và không mở rộng quyền từ dữ liệu nguồn; guardrail nguồn — Drift/sensor lỗi/false negative; rule an toàn độc lập, edge alarm ưu tiên, model monitoring; Notification — chỉ gửi sau policy/reviewer hoặc khi quality gate thất bại; Audit — prompt/context references/model/output/reviewer/decision bắt buộc; Report/Search/Export — output kế thừa ACL và sensitivity; Bulk — cấm tự ghi hàng loạt, chỉ proposal queue có human confirmation.
- **Ưu tiên và phát hành:** Độ khó nguồn — Rất cao; source priority — P2; baseline MVP note — Không; GĐ5; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner — Product Owner + functional/data/model owner (`TBD` cá nhân); verification intent — bộ dữ liệu đánh giá versioned đo quality/safety/leakage, reviewer chấp nhận/từ chối được, kill switch hoạt động và output không vượt quyền; chi tiết SEC/DB/API/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-195"></a>
### FR-195 — AI: Đề xuất lịch sạc/xả BESS

- **Yêu cầu chuẩn tắc:** Khi use case được bật và người dùng có quyền, hệ thống phải dùng Load/price forecast, SOC/SOH, warranty, power/energy limit, reserve, outage plan để tạo Đề xuất lịch sạc/xả BESS nhằm Tăng giá trị peak shaving/load shifting trong giới hạn thiết bị. Mỗi output phải có nguồn/citation phù hợp, confidence, model/rule version, timestamp và trạng thái human review. Mọi output chỉ là phân tích/đề xuất; không suppress alarm safety, không ghi setpoint và không phát lệnh charge/discharge/start-stop/reset.
- **Truy vết:** Source: `AIX-018`; Business Requirement: [BR-038](./02-BRD.md#br-038--quản-trị-và-triển-khai-ai-hỗ-trợ-có-kiểm-soát).
- **Phạm vi sản phẩm:** Actor/persona — người dùng nghiệp vụ được cấp quyền, reviewer nghiệp vụ và AI/Product Owner; phạm vi/boundary — BESS/O&M monitoring; không điều khiển OT; input — Load/price forecast, SOC/SOH, warranty, power/energy limit, reserve, outage plan; output — draft/recommendation cùng provenance/confidence/review decision.
- **Kiểm soát sản phẩm:** Permission — pre-filter ACL/tenant scope và không mở rộng quyền từ dữ liệu nguồn; guardrail nguồn — Vi phạm warranty/an toàn/điều độ; constraint cứng, mô phỏng sandbox, operator/EMS phê duyệt ngoài nền tảng; Notification — chỉ gửi sau policy/reviewer hoặc khi quality gate thất bại; Audit — prompt/context references/model/output/reviewer/decision bắt buộc; Report/Search/Export — output kế thừa ACL và sensitivity; Bulk — cấm tự ghi hàng loạt, chỉ proposal queue có human confirmation.
- **Ưu tiên và phát hành:** Độ khó nguồn — Rất cao; source priority — P3; baseline MVP note — Không; Future; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner — Product Owner + functional/data/model owner (`TBD` cá nhân); verification intent — bộ dữ liệu đánh giá versioned đo quality/safety/leakage, reviewer chấp nhận/từ chối được, kill switch hoạt động và output không vượt quyền; chi tiết SEC/DB/API/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-196"></a>
### FR-196 — AI: Đề xuất tối ưu giá điện

- **Yêu cầu chuẩn tắc:** Khi use case được bật và người dùng có quyền, hệ thống phải dùng Biểu giá versioned, demand/load, contract/PPA, dispatch history, forecast để tạo Đề xuất tối ưu giá điện nhằm So sánh kịch bản tiết kiệm/doanh thu minh bạch. Mỗi output phải có nguồn/citation phù hợp, confidence, model/rule version, timestamp và trạng thái human review. Mọi output chỉ là phân tích/đề xuất; không suppress alarm safety, không ghi setpoint và không phát lệnh charge/discharge/start-stop/reset.
- **Truy vết:** Source: `AIX-019`; Business Requirement: [BR-038](./02-BRD.md#br-038--quản-trị-và-triển-khai-ai-hỗ-trợ-có-kiểm-soát).
- **Phạm vi sản phẩm:** Actor/persona — người dùng nghiệp vụ được cấp quyền, reviewer nghiệp vụ và AI/Product Owner; phạm vi/boundary — BESS/O&M monitoring; không điều khiển OT; input — Biểu giá versioned, demand/load, contract/PPA, dispatch history, forecast; output — draft/recommendation cùng provenance/confidence/review decision.
- **Kiểm soát sản phẩm:** Permission — pre-filter ACL/tenant scope và không mở rộng quyền từ dữ liệu nguồn; guardrail nguồn — Quy tắc giá thay đổi; version/effective date, sensitivity, không tuyên bố lợi ích bảo đảm; Notification — chỉ gửi sau policy/reviewer hoặc khi quality gate thất bại; Audit — prompt/context references/model/output/reviewer/decision bắt buộc; Report/Search/Export — output kế thừa ACL và sensitivity; Bulk — cấm tự ghi hàng loạt, chỉ proposal queue có human confirmation.
- **Ưu tiên và phát hành:** Độ khó nguồn — Cao; source priority — P3; baseline MVP note — Không; GĐ5; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner — Product Owner + functional/data/model owner (`TBD` cá nhân); verification intent — bộ dữ liệu đánh giá versioned đo quality/safety/leakage, reviewer chấp nhận/từ chối được, kill switch hoạt động và output không vượt quyền; chi tiết SEC/DB/API/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-197"></a>
### FR-197 — AI: Trợ lý AI cho PM

- **Yêu cầu chuẩn tắc:** Khi use case được bật và người dùng có quyền, hệ thống phải dùng Dữ liệu dự án đã được cấp quyền, feature store, nguồn tài liệu để tạo Trợ lý AI cho PM nhằm Tóm tắt “hôm nay cần làm gì”, soạn báo cáo và truy vấn chéo. Mỗi output phải có nguồn/citation phù hợp, confidence, model/rule version, timestamp và trạng thái human review. Output là draft/recommendation; không tự phê duyệt, ký, thanh toán, thay requirement hoặc thay đổi bản ghi chính thức.
- **Truy vết:** Source: `AIX-020`; Business Requirement: [BR-038](./02-BRD.md#br-038--quản-trị-và-triển-khai-ai-hỗ-trợ-có-kiểm-soát).
- **Phạm vi sản phẩm:** Actor/persona — người dùng nghiệp vụ được cấp quyền, reviewer nghiệp vụ và AI/Product Owner; phạm vi/boundary — Dùng chung/Solar/BESS theo dữ liệu được cấp quyền; input — Dữ liệu dự án đã được cấp quyền, feature store, nguồn tài liệu; output — draft/recommendation cùng provenance/confidence/review decision.
- **Kiểm soát sản phẩm:** Permission — pre-filter ACL/tenant scope và không mở rộng quyền từ dữ liệu nguồn; guardrail nguồn — Hallucination/overreach; tool allowlist chỉ đọc mặc định, citation, confirmation trước mọi ghi dữ liệu; Notification — chỉ gửi sau policy/reviewer hoặc khi quality gate thất bại; Audit — prompt/context references/model/output/reviewer/decision bắt buộc; Report/Search/Export — output kế thừa ACL và sensitivity; Bulk — cấm tự ghi hàng loạt, chỉ proposal queue có human confirmation.
- **Ưu tiên và phát hành:** Độ khó nguồn — Cao; source priority — P2; baseline MVP note — Không; GĐ5; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner — Product Owner + functional/data/model owner (`TBD` cá nhân); verification intent — bộ dữ liệu đánh giá versioned đo quality/safety/leakage, reviewer chấp nhận/từ chối được, kill switch hoạt động và output không vượt quyền; chi tiết SEC/DB/API/AC/TEST là forward reference. **Status:** Draft.

<a id="fr-198"></a>
### FR-198 — AI: Chat với dữ liệu dự án theo quyền

- **Yêu cầu chuẩn tắc:** Khi use case được bật và người dùng có quyền, hệ thống phải dùng Search index/RAG, ACL, metadata, structured data, audit context để tạo Chat với dữ liệu dự án theo quyền nhằm Tìm câu trả lời nhanh xuyên DMS, schedule, cost, contract. Mỗi output phải có nguồn/citation phù hợp, confidence, model/rule version, timestamp và trạng thái human review. Output là draft/recommendation; không tự phê duyệt, ký, thanh toán, thay requirement hoặc thay đổi bản ghi chính thức.
- **Truy vết:** Source: `AIX-021`; Business Requirement: [BR-038](./02-BRD.md#br-038--quản-trị-và-triển-khai-ai-hỗ-trợ-có-kiểm-soát).
- **Phạm vi sản phẩm:** Actor/persona — người dùng nghiệp vụ được cấp quyền, reviewer nghiệp vụ và AI/Product Owner; phạm vi/boundary — Dùng chung/Solar/BESS theo dữ liệu được cấp quyền; input — Search index/RAG, ACL, metadata, structured data, audit context; output — draft/recommendation cùng provenance/confidence/review decision.
- **Kiểm soát sản phẩm:** Permission — pre-filter ACL/tenant scope và không mở rộng quyền từ dữ liệu nguồn; guardrail nguồn — Rò rỉ cross-tenant/prompt injection; pre-filter ACL, content sanitization, red-team, deny-by-default; Notification — chỉ gửi sau policy/reviewer hoặc khi quality gate thất bại; Audit — prompt/context references/model/output/reviewer/decision bắt buộc; Report/Search/Export — output kế thừa ACL và sensitivity; Bulk — cấm tự ghi hàng loạt, chỉ proposal queue có human confirmation.
- **Ưu tiên và phát hành:** Độ khó nguồn — Cao; source priority — P2; baseline MVP note — Không; GĐ5; release chuẩn hóa — **Future**.
- **Owner và kiểm chứng:** Owner — Product Owner + functional/data/model owner (`TBD` cá nhân); verification intent — bộ dữ liệu đánh giá versioned đo quality/safety/leakage, reviewer chấp nhận/từ chối được, kill switch hoạt động và output không vượt quyền; chi tiết SEC/DB/API/AC/TEST là forward reference. **Status:** Draft.

## 11. Non-functional Requirements

Các NFR dưới đây là yêu cầu chất lượng sản phẩm. Kiểm soát bảo mật chi tiết thuộc tài liệu Security; topology/technology thuộc Architecture; test case thuộc Test Strategy. Giá trị chưa được phê duyệt giữ `TBD`, không được thay bằng “mặc định ngành”.

<a id="nfr-001"></a>
### NFR-001 — Năng lực tải theo tenant

- **Yêu cầu chuẩn tắc:** Nền tảng phải hỗ trợ baseline khoảng 500 dự án hoạt động trên mỗi tenant, giữ tenant isolation trong API, search, export, job và aggregate.
- **Phép đo:** Chạy workload đại diện đạt đủ 500 dự án/tenant và zero cross-tenant result; số concurrent user, record/project và telemetry volume là `TBD`.
- **Truy vết:** [BR-001](./02-BRD.md#br-001--quản-trị-portfolio-và-nhiều-tổ-chức-trên-một-nguồn-dữ-liệu), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot); Source: `ARC-002`, `ARC-008`.
- **Owner/verification/status:** Architecture + Platform + QA (`TBD` cá nhân); load/isolation test profile phải được Product Owner phê duyệt; release **MVP**; **Draft**.

<a id="nfr-002"></a>
### NFR-002 — Hiệu năng API tương tác

- **Yêu cầu chuẩn tắc:** API tương tác của PM Web phải có p95 không quá 2 giây trong benchmark đã phê duyệt, không tính job/export bất đồng bộ.
- **Phép đo:** Server-side p95 ≤ 2 giây; concurrency, dataset, network boundary và operation mix là `TBD` — Owner: Architecture/QA.
- **Truy vết:** [BR-032](./02-BRD.md#br-032--điều-hành-dự-án-bằng-pm-command-center-và-health-score), [BR-036](./02-BRD.md#br-036--cung-cấp-dashboard-theo-vai-trò-và-báo-cáo-snapshot-có-kiểm-soát), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot); Source: `ARC-008`.
- **Verification/status:** Performance test kèm p50/p95/p99/error rate và tenant mix; release **MVP**; **Draft**.

<a id="nfr-003"></a>
### NFR-003 — Hiệu năng tìm kiếm

- **Yêu cầu chuẩn tắc:** Search phải trả kết quả đã áp ACL với p95 không quá 3 giây trong benchmark đã phê duyệt.
- **Phép đo:** p95 ≤ 3 giây; corpus size, OCR volume, filter/query mix và indexing lag target là `TBD` — Owner: Search/Data/QA.
- **Truy vết:** [BR-035](./02-BRD.md#br-035--quản-lý-vòng-đời-tài-liệu-doanh-nghiệp), [BR-039](./02-BRD.md#br-039--cung-cấp-trải-nghiệm-doanh-nghiệp-đa-vai-trò-và-responsive), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot); Source: `ARC-005`, `ARC-008`.
- **Verification/status:** Load + negative ACL search/snippet test; release **MVP**; **Draft**.

<a id="nfr-004"></a>
### NFR-004 — Hiệu năng dashboard

- **Yêu cầu chuẩn tắc:** Dashboard/PM Command Center phải hiển thị snapshot nhất quán với p95 không quá 5 giây trong benchmark đã phê duyệt.
- **Phép đo:** p95 ≤ 5 giây; widget count, date range, cache freshness và portfolio size trong profile là `TBD` — Owner: Product Analytics/Architecture/QA.
- **Truy vết:** [BR-032](./02-BRD.md#br-032--điều-hành-dự-án-bằng-pm-command-center-và-health-score), [BR-036](./02-BRD.md#br-036--cung-cấp-dashboard-theo-vai-trò-và-báo-cáo-snapshot-có-kiểm-soát), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot); Source: `ARC-008`.
- **Verification/status:** Performance test phải chứng minh widget dùng cùng filter/data-date và drill-down; release **MVP**; **Draft**.

<a id="nfr-005"></a>
### NFR-005 — Export và report lớn bất đồng bộ

- **Yêu cầu chuẩn tắc:** Export/report lớn phải chạy nền, không giữ request tương tác, có idempotency, progress, completion/failure notification và file expiry theo policy.
- **Phép đo:** Interactive pool không suy giảm quá target `TBD`; maximum rows/file size, queue wait và completion SLA là `TBD` — Owner: Reporting/Platform.
- **Truy vết:** [BR-036](./02-BRD.md#br-036--cung-cấp-dashboard-theo-vai-trò-và-báo-cáo-snapshot-có-kiểm-soát), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot); Source: `ARC-008`, `ARC-009`.
- **Verification/status:** Load, duplicate-submit, cancellation, permission-change và expired-download paths; release **MVP**; **Draft**.

<a id="nfr-006"></a>
### NFR-006 — Availability và SLO

- **Yêu cầu chuẩn tắc:** Mỗi service tier phải có SLI/SLO availability, maintenance-window rule, error budget và communication path được phê duyệt.
- **Phép đo:** Công thức availability phải loại/trừ downtime đúng policy; target %, measurement window và service tier là `TBD` — Owner: Product Owner + IT/SRE; phải đóng trước production approval.
- **Truy vết:** [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot); Source: `ARC-009`, `SEC-008` (Source Feature ID).
- **Verification/status:** Synthetic/SLI evidence và incident calculation review; release **MVP foundation**; **Draft/TBD target**.

<a id="nfr-007"></a>
### NFR-007 — Resilience và event delivery

- **Yêu cầu chuẩn tắc:** Transaction đã commit không được mất event nghiệp vụ liên quan; retry/replay phải idempotent, quan sát được và không tạo side effect trùng.
- **Phép đo:** Failure-injection tại DB/event/job/connector chứng minh zero lost committed event và duplicate side effect; retry/dead-letter limits là `TBD`.
- **Truy vết:** [BR-034](./02-BRD.md#br-034--tự-động-hóa-workflow-phê-duyệt-có-version-và-audit), [BR-037](./02-BRD.md#br-037--tích-hợp-hệ-thống-theo-system-of-record-và-đối-soát), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot); Source: `ARC-006`.
- **Owner/verification/status:** Platform/Integration/QA (`TBD` cá nhân); chaos/failure test; release **MVP**; **Draft**.

<a id="nfr-008"></a>
### NFR-008 — Backup được bảo vệ

- **Yêu cầu chuẩn tắc:** DB, object, cấu hình và metadata cần thiết phải được backup mã hóa, versioned/immutable theo policy và phát cảnh báo khi job thất bại.
- **Phép đo:** 100% resource trong backup inventory có job/owner/latest-success; cadence, retention, copy region/account là `TBD` — Owner: IT/SRE/Security.
- **Truy vết:** [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot); Source: `SEC-006` (Source Feature ID).
- **Verification/status:** Backup inventory/audit/failed-job drill; release **MVP**; **Draft/TBD policy**.

<a id="nfr-009"></a>
### NFR-009 — Khôi phục nhất quán

- **Yêu cầu chuẩn tắc:** Hệ thống phải khôi phục DB, object revision, workflow/config và search/index mapping về một recovery point nhất quán, rồi kiểm tra quyền và checksum.
- **Phép đo:** Restore drill tối thiểu theo chu kỳ quý trong baseline; RPO/RTO và dataset drill là `TBD` — Owner: IT/SRE + Business Owners.
- **Truy vết:** [BR-035](./02-BRD.md#br-035--quản-lý-vòng-đời-tài-liệu-doanh-nghiệp), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot); Source: `ARC-005`, `SEC-006` (Source Feature ID).
- **Verification/status:** Timed restore + reconciliation + permission regression; release **MVP**; **Draft/TBD RPO/RTO**.

<a id="nfr-010"></a>
### NFR-010 — Disaster Recovery

- **Yêu cầu chuẩn tắc:** Mỗi service tier phải có DR topology, dependency order, communication, failover/failback và evidence không mất tenant boundary.
- **Phép đo:** Diễn tập DR tối thiểu hằng năm theo baseline; RPO, RTO, region/site và failback window là `TBD` — Owner: IT/SRE/Product Owner.
- **Truy vết:** [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot); Source: `SEC-006`, `SEC-008` (Source Feature ID).
- **Verification/status:** Annual exercise report, issue owner/due date và recovery validation; release **MVP foundation**; **Draft/TBD targets**.

<a id="nfr-011"></a>
### NFR-011 — Retention và legal hold

- **Yêu cầu chuẩn tắc:** Retention/disposal phải theo data classification, record type, contract/legal policy và tenant; legal hold phải chặn xóa/purge cho đến khi được gỡ có thẩm quyền.
- **Phép đo:** 100% record class có policy/effective date/owner hoặc được gắn `TBD`; retention periods là `TBD` — Owner: Legal/Data Governance.
- **Truy vết:** [BR-010](./02-BRD.md#br-010--quản-lý-nghĩa-vụ-bảo-lãnh-điều-kiện-tiên-quyết-và-permit), [BR-011](./02-BRD.md#br-011--bảo-toàn-pháp-nhân-người-ký-và-lịch-sử-phê-duyệt-văn-bản), [BR-035](./02-BRD.md#br-035--quản-lý-vòng-đời-tài-liệu-doanh-nghiệp), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot).
- **Verification/status:** Retention/hold/release/purge negative paths; release **MVP**; **Draft/TBD periods**.

<a id="nfr-012"></a>
### NFR-012 — Transaction integrity và concurrency

- **Yêu cầu chuẩn tắc:** Approval, payment và immutable issuance phải atomic; mutable master phải phát hiện concurrent update và không ghi đè im lặng.
- **Phép đo:** Concurrent update trả conflict/version evidence; transaction rollback không để partial decision/payment/document state.
- **Truy vết:** [BR-011](./02-BRD.md#br-011--bảo-toàn-pháp-nhân-người-ký-và-lịch-sử-phê-duyệt-văn-bản), [BR-015](./02-BRD.md#br-015--kiểm-soát-sourcing-từ-nhu-cầu-đến-pohợp-đồng-mua), [BR-018](./02-BRD.md#br-018--quản-lý-wbs-baseline-look-ahead-và-khối-lượng), [BR-034](./02-BRD.md#br-034--tự-động-hóa-workflow-phê-duyệt-có-version-và-audit), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot); Source: `ARC-004`.
- **Owner/verification/status:** Architecture/Backend/QA (`TBD`); concurrency/rollback tests; release **MVP**; **Draft**.

<a id="nfr-013"></a>
### NFR-013 — Độ chính xác tiền tệ

- **Yêu cầu chuẩn tắc:** Số tiền phải dùng decimal/fixed precision, có currency; phép quy đổi phải dùng FX rate có effective date và snapshot; không tổng trực tiếp khác currency.
- **Phép đo:** Round-trip/rounding/FX/revaluation examples tái tính đúng; precision/rounding rule theo currency là `TBD` — Owner: Finance.
- **Truy vết:** [BR-007](./02-BRD.md#br-007--so-sánh-business-case-capexopex-và-hiệu-quả-đầu-tư), [BR-009](./02-BRD.md#br-009--quản-lý-hợp-đồng-và-chuỗi-phụ-lục-theo-dự-án), [BR-015](./02-BRD.md#br-015--kiểm-soát-sourcing-từ-nhu-cầu-đến-pohợp-đồng-mua), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot).
- **Verification/status:** Unit/integration examples cho VAT/retention/advance/multi-currency; release **MVP**; **Draft/TBD rounding policy**.

<a id="nfr-014"></a>
### NFR-014 — Thời gian và timezone

- **Yêu cầu chuẩn tắc:** Record phải giữ instant chuẩn, timezone site/user và khi tích hợp phải phân biệt source timestamp với receive/process timestamp.
- **Phép đo:** DST/timezone boundary, late/out-of-order telemetry và export locale round-trip không đổi nghĩa thời điểm; canonical storage format là `TBD` — Owner: Architecture/Data.
- **Truy vết:** [BR-039](./02-BRD.md#br-039--cung-cấp-trải-nghiệm-doanh-nghiệp-đa-vai-trò-và-responsive), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot); Source: `ARC-010`.
- **Verification/status:** Timezone/locale/integration tests; release **MVP**; **Draft/TBD storage format**.

<a id="nfr-015"></a>
### NFR-015 — Localization và đơn vị

- **Yêu cầu chuẩn tắc:** UI/report hỗ trợ tiếng Việt mặc định và tiếng Anh thứ hai; ngày, số, currency và đơn vị hiển thị theo locale mà không đổi dữ liệu nguồn.
- **Phép đo:** Critical screen/report có resource translation, fallback rõ, round-trip input/output; glossary owner và translation completeness target là `TBD`.
- **Truy vết:** [BR-039](./02-BRD.md#br-039--cung-cấp-trải-nghiệm-doanh-nghiệp-đa-vai-trò-và-responsive), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot); Source: `ARC-010`.
- **Owner/verification/status:** Product/UX/Localization (`TBD`); bilingual UI/report tests; release **MVP core**; **Draft**.

<a id="nfr-016"></a>
### NFR-016 — Accessibility

- **Yêu cầu chuẩn tắc:** Critical journey phải dùng được bằng keyboard, focus có thể nhận biết, control có accessible name và trạng thái không truyền đạt chỉ bằng màu.
- **Phép đo:** Automated + manual accessibility checks trên critical screens; chuẩn/level conformance chính thức là `TBD` — Owner: Product Owner/UX.
- **Truy vết:** [BR-039](./02-BRD.md#br-039--cung-cấp-trải-nghiệm-doanh-nghiệp-đa-vai-trò-và-responsive), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot).
- **Verification/status:** Keyboard/screen-reader/contrast/error-state review; release **MVP**; **Draft/TBD level**.

<a id="nfr-017"></a>
### NFR-017 — Responsive và browser/device support

- **Yêu cầu chuẩn tắc:** PM Web phải responsive trên desktop/tablet/mobile; critical field journey không mất action/evidence khi viewport thay đổi.
- **Phép đo:** Approved browser/device/viewport matrix pass; danh sách version/OS/device là `TBD` — Owner: Product Owner/UX/Engineering.
- **Truy vết:** [BR-019](./02-BRD.md#br-019--ghi-nhận-nhật-ký-nguồn-lực-vật-tư-và-bằng-chứng-hiện-trường), [BR-039](./02-BRD.md#br-039--cung-cấp-trải-nghiệm-doanh-nghiệp-đa-vai-trò-và-responsive), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot).
- **Verification/status:** Cross-browser/viewport/E2E test; release **MVP**; **Draft/TBD matrix**.

<a id="nfr-018"></a>
### NFR-018 — PWA offline an toàn

- **Yêu cầu chuẩn tắc:** Offline chỉ cache app shell, draft, checklist/ảnh queue được policy cho phép; queue phải mã hóa, sync idempotent, conflict hiển thị và remote revoke áp dụng lần kết nối sau.
- **Phép đo:** Offline/reconnect/duplicate/conflict/revoke/lost-device paths; max offline duration/storage/sensitive classes là `TBD` — Owner: Site/Product/Security.
- **Truy vết:** [BR-019](./02-BRD.md#br-019--ghi-nhận-nhật-ký-nguồn-lực-vật-tư-và-bằng-chứng-hiện-trường), [BR-039](./02-BRD.md#br-039--cung-cấp-trải-nghiệm-doanh-nghiệp-đa-vai-trò-và-responsive), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot); Source: `ARC-003`.
- **Verification/status:** Mobile/offline/security test; release **MVP basic**; **Draft/TBD policy**.

<a id="nfr-019"></a>
### NFR-019 — File integrity và malware gate

- **Yêu cầu chuẩn tắc:** File phải có content hash, revision/version, upload status và malware scan trước khi được release/preview/download cho bên khác.
- **Phép đo:** Clean/infected/timeout/duplicate/partial/multipart paths; allowed formats, size, scan SLA và quarantine retention là `TBD` — Owner: DMS/Security.
- **Truy vết:** [BR-035](./02-BRD.md#br-035--quản-lý-vòng-đời-tài-liệu-doanh-nghiệp), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot); Source: `ARC-005`, `SEC-002` (Source Feature ID).
- **Verification/status:** File pipeline/security tests; release **MVP**; **Draft/TBD limits**.

<a id="nfr-020"></a>
### NFR-020 — Quyền nhất quán trên UI, search, export và job

- **Yêu cầu chuẩn tắc:** Cùng một identity/context/filter phải cho cùng phạm vi record hợp lệ trên UI, API, search/snippet, aggregate, export và background job; permission change phải có hiệu lực theo policy.
- **Phép đo:** Zero cross-tenant/legal entity/project/package/document leakage trong positive/negative matrix; permission propagation SLA là `TBD` — Owner: Security/IAM.
- **Truy vết:** [BR-001](./02-BRD.md#br-001--quản-trị-portfolio-và-nhiều-tổ-chức-trên-một-nguồn-dữ-liệu), [BR-033](./02-BRD.md#br-033--kiểm-soát-quyền-đa-tenant-đa-pháp-nhân-và-xung-đột-lợi-ích), [BR-035](./02-BRD.md#br-035--quản-lý-vòng-đời-tài-liệu-doanh-nghiệp), [BR-036](./02-BRD.md#br-036--cung-cấp-dashboard-theo-vai-trò-và-báo-cáo-snapshot-có-kiểm-soát), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot).
- **Verification/status:** Automated cross-channel authorization tests; release **MVP**; **Draft/TBD propagation SLA**.

<a id="nfr-021"></a>
### NFR-021 — Observability và supportability

- **Yêu cầu chuẩn tắc:** Request, job, connector và telemetry ingestion phải có structured log, metric, trace/correlation; alert có severity, owner và runbook; secret/token/nội dung nhạy cảm không được log.
- **Phép đo:** Truy từ UI request đến downstream job/connector bằng correlation ID; coverage/SLO/alert thresholds là `TBD` — Owner: SRE/Integration.
- **Truy vết:** [BR-037](./02-BRD.md#br-037--tích-hợp-hệ-thống-theo-system-of-record-và-đối-soát), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot); Source: `ARC-009`.
- **Verification/status:** Synthetic failure/tracing/log-redaction review; release **MVP**; **Draft/TBD thresholds**.

<a id="nfr-022"></a>
### NFR-022 — Auditability và tamper evidence

- **Yêu cầu chuẩn tắc:** Audit phải append-only/tamper-evident và ghi actor/delegation, action, object, before/after reference, time, IP/device phù hợp và correlation cho phê duyệt, ký, share, download, export, payment và admin.
- **Phép đo:** Critical-action catalog có 100% audit event; gap/tamper/pipeline interruption được phát hiện; retention/access policy là `TBD` — Owner: Security/Internal Control.
- **Truy vết:** [BR-011](./02-BRD.md#br-011--bảo-toàn-pháp-nhân-người-ký-và-lịch-sử-phê-duyệt-văn-bản), [BR-033](./02-BRD.md#br-033--kiểm-soát-quyền-đa-tenant-đa-pháp-nhân-và-xung-đột-lợi-ích)–[BR-035](./02-BRD.md#br-035--quản-lý-vòng-đời-tài-liệu-doanh-nghiệp), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot); Source: `SEC-003` (Source Feature ID).
- **Verification/status:** Audit completeness/tamper/access tests; release **MVP**; **Draft/TBD retention**.

<a id="nfr-023"></a>
### NFR-023 — Maintainability và deployability theo module

- **Yêu cầu chuẩn tắc:** Module phải giao tiếp qua interface/event contract versioned; không truy cập private table của module khác; schema/config change có migration, rollback và compatibility plan.
- **Phép đo:** Architecture/dependency checks không có cross-boundary private access; migration/rollback dry run đạt; exact tooling là `TBD` — Owner: Architecture/Engineering.
- **Truy vết:** [BR-031](./02-BRD.md#br-031--cung-cấp-bộ-module-dùng-chung-tối-thiểu-xuyên-vòng-đời), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot); Source: `ARC-001`.
- **Verification/status:** Static architecture test + migration/rollback evidence; release **MVP foundation**; **Draft/TBD toolchain**.

<a id="nfr-024"></a>
### NFR-024 — Interoperability và data quality

- **Yêu cầu chuẩn tắc:** Business API dùng OpenAPI 3.1; connector xác định SoR, direction, owner trường, idempotency, retry, reconciliation và audit; telemetry ghi unit/timezone/source/quality và phát hiện gap/duplicate/out-of-order.
- **Phép đo:** 100% enabled connector có interface contract/reconciliation run; 100% enabled telemetry tag có unit/source/frequency/quality policy; thresholds là `TBD` — Owner: Integration + Data + OT.
- **Truy vết:** [BR-027](./02-BRD.md#br-027--giám-sát-kpi-vận-hành-solar-có-provenance)–[BR-030](./02-BRD.md#br-030--quản-lý-billing-vận-hành-đối-soát-meter-và-report-bên-ngoài), [BR-037](./02-BRD.md#br-037--tích-hợp-hệ-thống-theo-system-of-record-và-đối-soát), [BR-040](./02-BRD.md#br-040--bảo-đảm-nền-tảng-đa-tenant-an-toàn-phục-hồi-được-và-không-điều-khiển-ot); Source: `ARC-006`, `ARC-007`, `SEC-007` (Source Feature ID).
- **Verification/status:** Contract/retry/reconciliation/data-quality/no-OT-write tests; business integration **MVP/Post-MVP**, OT telemetry **Future/R4 guardrail**; **Draft/TBD thresholds**.

## 12. Use Cases

Mỗi `UC-*` dưới đây là định nghĩa use case chuẩn ở cấp sản phẩm và ánh xạ một-một với source story `US-E*` trong baseline. `US-*` và `AC-*` triển khai sẽ do [Product Backlog](./12-product-backlog.md) sở hữu; liên kết này là forward reference cho đến khi tài liệu 12 được tạo.

<a id="uc-001"></a>
### UC-001 — Quản lý portfolio và project master

- **Source/trace:** `US-E01`; Business Requirement: `BR-001, BR-031`; Product Requirement: `FR-010…FR-025`.
- **Actors:** PMO, Project Admin, Project Manager.
- **Preconditions:** Tenant, pháp nhân và data scope đã được cấu hình.
- **Trigger:** Người có quyền tạo/cập nhật portfolio hoặc project.
- **Luồng thường:** Chọn portfolio; nhập project master, site, package, bên tham gia và RACI; hệ thống kiểm mã/phạm vi; lưu bản ghi; ghi audit; hiển thị project trong portfolio theo quyền.
- **Ngoại lệ/alternative:** Mã trùng, pháp nhân ngoài scope, thiếu owner hoặc người dùng ngoài project bị từ chối; import lỗi tạo exception thay vì ghi một phần.
- **Postcondition/giá trị:** Project master có ID ổn định, owner, phase, data scope và lịch sử. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-002"></a>
### UC-002 — Điều hành PM Command Center và Project Health Score

- **Source/trace:** `US-E02`; Business Requirement: `BR-032`; Product Requirement: `FR-010…FR-015, FR-019…FR-025, FR-098…FR-114`.
- **Actors:** Ban điều hành, PMO, Project Manager.
- **Preconditions:** Project có baseline và các nguồn schedule/cost/quality/safety/procurement/document/contract/commissioning.
- **Trigger:** Người dùng mở portfolio hoặc project command center.
- **Luồng thường:** Hệ thống tính điểm từng trụ cột; loại N/A và tái phân bổ trọng số; áp hard-cap; hiển thị confidence, forecast, ngoại lệ; người dùng drill-down và giao action.
- **Ngoại lệ/alternative:** Dữ liệu stale/missing làm giảm confidence; hard-cap phải hiển thị lý do; không cho override thủ công nếu thiếu quyền/phê duyệt.
- **Postcondition/giá trị:** Quyết định điều hành truy được tới record nguồn, owner và thời điểm dữ liệu. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-003"></a>
### UC-003 — Quản lý WBS, milestone, activity và baseline

- **Source/trace:** `US-E03`; Business Requirement: `BR-018, BR-032`; Product Requirement: `FR-016…FR-021`.
- **Actors:** PM, Project Controls, Package Owner.
- **Preconditions:** Project và calendar tồn tại.
- **Trigger:** Lập hoặc cập nhật kế hoạch dự án.
- **Luồng thường:** Tạo WBS/activity/dependency; kiểm cycle và calendar; submit baseline; phê duyệt snapshot; ghi progress/forecast mà không sửa actual; lập rebaseline khi được duyệt.
- **Ngoại lệ/alternative:** Dependency cycle, progress vượt basis hoặc sửa baseline đã duyệt bị chặn; import xung đột tạo reconciliation case.
- **Postcondition/giá trị:** Baseline bất biến và forecast/actual/progress có provenance. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-004"></a>
### UC-004 — Kiểm soát risk, issue và change

- **Source/trace:** `US-E04`; Business Requirement: `BR-022, BR-031, BR-032`; Product Requirement: `FR-098…FR-105`.
- **Actors:** PM, Risk Owner, Change Control Board, Contract/Cost.
- **Preconditions:** Project và baseline liên quan tồn tại.
- **Trigger:** Phát hiện rủi ro, sự cố hoặc đề nghị thay đổi.
- **Luồng thường:** Phân loại risk/issue/change; đánh giá xác suất/tác động/schedule/cost/contract; giao owner; xin phê duyệt; cập nhật baseline chỉ sau approved decision; theo dõi action/claim.
- **Ngoại lệ/alternative:** Risk đã xảy ra phải chuyển/link Issue; change thiếu impact hoặc authority bị trả lại; claim deadline quá hạn phát cảnh báo nhưng không tự sửa ngày.
- **Postcondition/giá trị:** Ngoại lệ có owner, quyết định, bằng chứng và ảnh hưởng baseline truy vết được. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-005"></a>
### UC-005 — Quản lý document register, revision và transmittal

- **Source/trace:** `US-E05`; Business Requirement: `BR-003, BR-009, BR-011, BR-012, BR-019, BR-026, BR-035`; Product Requirement: `FR-026…FR-035`.
- **Actors:** Document Controller, Author, Reviewer, Approver, External Recipient.
- **Preconditions:** Project/document coding rule và quyền folder đã có.
- **Trigger:** Tạo, sửa, review hoặc phát hành tài liệu.
- **Luồng thường:** Tạo Document; upload revision vào quarantine; scan/hash; review/comment; approve/issue; tạo transmittal snapshot đúng revision; thông báo người nhận; index theo ACL.
- **Ngoại lệ/alternative:** File độc hại/không xác định bị cách ly; revision/code trùng bị chặn; issued/signed revision không ghi đè; quyền bị thu hồi làm download/share bị từ chối.
- **Postcondition/giá trị:** Current-for-use và lịch sử revision/transmittal xác định được. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-006"></a>
### UC-006 — Quản lý hợp đồng, phụ lục, nghĩa vụ và bảo lãnh

- **Source/trace:** `US-E06`; Business Requirement: `BR-009…BR-011, BR-022, BR-026, BR-030`; Product Requirement: `FR-036…FR-044`.
- **Actors:** Contract Manager, Legal, PM, Finance, Signer.
- **Preconditions:** Project, LegalEntity, signer authority và document artifact hợp lệ.
- **Trigger:** Soạn, phê duyệt, ký hoặc theo dõi hợp đồng.
- **Luồng thường:** Tạo Contract với số duy nhất trong project; gắn parties bằng stable ID và legal snapshot; tạo appendix; theo dõi obligation/permit/guarantee; phê duyệt/ký; lập consolidated view theo hiệu lực.
- **Ngoại lệ/alternative:** Party/signer thiếu thẩm quyền, appendix thiếu parent hoặc số trùng bị chặn; legal hold/status lock thắng sửa/xóa; fulfillment thiếu evidence không được đóng.
- **Postcondition/giá trị:** Chuỗi contract–appendix và nghĩa vụ có snapshot, hiệu lực và audit đầy đủ. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-007"></a>
### UC-007 — Quản lý ngân sách, commitment, invoice và payment

- **Source/trace:** `US-E07`; Business Requirement: `BR-007, BR-015, BR-030, BR-033`; Product Requirement: `FR-053…FR-060, FR-138…FR-155`.
- **Actors:** PM, Cost Controller, Finance, Approver, Treasury.
- **Preconditions:** Project, cost code, Contract và payer/payee LegalEntity tồn tại.
- **Trigger:** Lập ngân sách hoặc yêu cầu thanh toán.
- **Luồng thường:** Chọn budget version/cost code/contract; nhập transaction currency, component VAT/retention/withholding và FX snapshot; kiểm budget/SoD; phê duyệt; gửi ERP; đối soát paid status; lập adjustment nếu cần.
- **Ngoại lệ/alternative:** Payment thiếu contractId, payer bằng payee, currency/component sai hoặc requester tự duyệt bị chặn; ERP timeout dùng retry/idempotency; paid record không sửa.
- **Postcondition/giá trị:** Số tiền chính xác, không cộng chéo currency và payer → payee truy được. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-008"></a>
### UC-008 — Theo dõi procurement và logistics

- **Source/trace:** `US-E08`; Business Requirement: `BR-015…BR-017`; Product Requirement: `FR-045…FR-052, FR-061…FR-074`.
- **Actors:** Procurement, Engineering, Cost, Supplier, Logistics, Warehouse.
- **Preconditions:** Approved demand/BOM, supplier scope và budget có sẵn.
- **Trigger:** Phát hành requisition/RFQ hoặc theo dõi giao hàng.
- **Luồng thường:** Tạo requisition; mời bidder đúng scope; nhận bid kín; đánh giá technical/commercial; approve award/PO; theo dõi manufacturing/FAT/shipment/ETA; receipt, exception, serial và warranty seed.
- **Ngoại lệ/alternative:** Bidder thấy dữ liệu đối thủ, substitution chưa duyệt, PO thiếu authority hoặc receipt thiếu/hỏng/trùng serial bị chặn/escalate.
- **Postcondition/giá trị:** Demand → PO → shipment → receipt → equipment có lineage và exception. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-009"></a>
### UC-009 — Ghi nhật ký hiện trường và khối lượng bằng PWA

- **Source/trace:** `US-E09`; Business Requirement: `BR-018…BR-020, BR-033`; Product Requirement: `FR-075…FR-084, FR-151…FR-155`.
- **Actors:** Site Manager, Contractor Supervisor, QS, PM.
- **Preconditions:** Thiết bị đã đăng nhập; project/site/package scope và offline policy còn hiệu lực.
- **Trigger:** Ca làm việc hoặc mất kết nối.
- **Luồng thường:** Người dùng cache dữ liệu được phép; tạo daily log, ảnh, manpower/equipment và quantity; queue có mã idempotency; sync khi online; xử lý conflict; submit/sign; QS kiểm tra/certify.
- **Ngoại lệ/alternative:** Token bị thu hồi, cache quá hạn, file scan fail hoặc conflict không thể merge thì record ở Draft/Conflict; không tự ký/chốt offline.
- **Postcondition/giá trị:** Nhật ký/khối lượng có client time, server time, evidence, signer và conflict history. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-010"></a>
### UC-010 — Thực hiện ITP, inspection, NCR và punch

- **Source/trace:** `US-E10`; Business Requirement: `BR-021, BR-023…BR-026`; Product Requirement: `FR-091…FR-097`.
- **Actors:** QA/QC, Contractor, Witness, Approver.
- **Preconditions:** ITP/revision hiện hành, workfront/equipment và hold point xác định.
- **Trigger:** Inspection request hoặc phát hiện không phù hợp.
- **Luồng thường:** Kiểm prerequisite; thực hiện checklist/measurement; ghi result/evidence/witness; nếu fail tạo/link NCR; contractor đề xuất disposition/CAPA; verifier đóng; tạo/đóng punch theo category.
- **Ngoại lệ/alternative:** Hold point thiếu witness/authority không qua; failed result không sửa thành pass; contractor không tự Close; use-as-is cần authority.
- **Postcondition/giá trị:** Chất lượng và gate COD có evidence, separation và lịch sử. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-011"></a>
### UC-011 — Quản lý PTW, HSE inspection và incident

- **Source/trace:** `US-E11`; Business Requirement: `BR-020, BR-025, BR-026, BR-032`; Product Requirement: `FR-081, FR-085…FR-090`.
- **Actors:** HSE Officer, Permit Issuer, Site Supervisor, Worker, Incident Investigator.
- **Preconditions:** Site/workfront, hazard/isolation và authority hợp lệ.
- **Trigger:** Yêu cầu PTW, inspection hoặc xảy ra incident.
- **Luồng thường:** Đánh giá hazard; requester gửi permit; issuer kiểm tra và cấp; toolbox/inspection; suspend/expire; báo incident khẩn cấp không chờ approval; điều tra/CAPA; designated authority lift stop-work.
- **Ngoại lệ/alternative:** Thiếu isolation/competency/validity bị từ chối; incident nghiêm trọng áp hard-cap; dữ liệu người bị nạn hạn chế need-to-know; không conditional bypass safety.
- **Postcondition/giá trị:** Công việc chỉ diễn ra khi an toàn và mọi incident/stop-work truy vết được. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-012"></a>
### UC-012 — Quản lý commissioning package và test run

- **Source/trace:** `US-E12`; Business Requirement: `BR-023…BR-025`; Product Requirement: `FR-106…FR-112`.
- **Actors:** Commissioning Manager, Engineer, QA/QC, OEM, Witness.
- **Preconditions:** Systemization, procedure revision, prerequisite, instrument calibration và safe-state plan đã có.
- **Trigger:** System sẵn sàng test.
- **Luồng thường:** Tạo test pack; kiểm prerequisite; approve readiness; start run; thu measurement/evidence/witness; evaluate pass/fail/abort; failed tạo defect/NCR; retest record mới liên kết previousRun.
- **Ngoại lệ/alternative:** Không đủ prerequisite/authority/calibration thì không start; mất dữ liệu giữ run Incomplete/Aborted; failed không đổi trực tiếp passed.
- **Postcondition/giá trị:** Mỗi test có boundary, criteria, raw evidence, result và retest lineage. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-013"></a>
### UC-013 — Đánh giá COD readiness và bàn giao O&M

- **Source/trace:** `US-E13`; Business Requirement: `BR-023…BR-026`; Product Requirement: `FR-109…FR-114, FR-026…FR-044`.
- **Actors:** PM, Commissioning, Legal/Contract, Document Control, O&M Recipient, Client.
- **Preconditions:** Danh mục gate COD, mandatory/waivable rule và handover manifest đã cấu hình.
- **Trigger:** PM yêu cầu đánh giá COD.
- **Luồng thường:** Hệ thống tổng hợp gate/evidence/expiry/punch/NCR/permit/test/obligation; hiển thị missing/stale; xin waiver có authority nếu cho phép; tạo/ký COD package; bên nhận xác nhận handover; kích hoạt asset/O&M seed.
- **Ngoại lệ/alternative:** Mandatory non-waivable gate thiếu/fail chặn; waiver hết hiệu lực; signature mismatch; recipient từ chối tạo open items, không giả COD complete.
- **Postcondition/giá trị:** COD có signed snapshot, readiness evidence và receipt bàn giao. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-014"></a>
### UC-014 — Xử lý alarm case, work order, warranty và SLA O&M

- **Source/trace:** `US-E14`; Business Requirement: `BR-027…BR-030, BR-040`; Product Requirement: `FR-115…FR-124, FR-165…FR-170`.
- **Actors:** O&M Dispatcher, Technician, Supervisor, Warranty Coordinator.
- **Preconditions:** Asset/handover đã active; OT event chỉ read-only; PTW policy có sẵn.
- **Trigger:** AlarmEvent, preventive due hoặc user report phát sinh.
- **Luồng thường:** Correlate event thành AlarmCase; triage/local acknowledge; tạo incident/WO; schedule/dispatch; technician thực hiện/log/evidence; Complete; verifier Close/return-to-service; theo dõi warranty/SLA.
- **Ngoại lệ/alternative:** Acknowledge không clear/reset nguồn; critical WO thiếu PTW/isolation bị chặn; technician không tự Close; stale OT không được coi safe.
- **Postcondition/giá trị:** Case/WO/SLA có lineage tới asset, source event, evidence và verifier. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-015"></a>
### UC-015 — Cấu hình và chạy workflow phê duyệt

- **Source/trace:** `US-E15`; Business Requirement: `BR-008, BR-011, BR-015, BR-026, BR-034`; Product Requirement: `FR-138…FR-145`.
- **Actors:** Process Owner, Requester, Approver, Admin.
- **Preconditions:** Workflow version đã publish; policy/authority/SoD hợp lệ.
- **Trigger:** Domain record được submit.
- **Luồng thường:** Snapshot workflow version; resolve route; assign step/quorum/SLA; approve/reject/return/conditional; escalate/remind; domain tự kiểm invariant trước transition cuối.
- **Ngoại lệ/alternative:** Không tìm được approver tạo Configuration Error; escalation không auto-approve; definition thay đổi không sửa instance đang chạy.
- **Postcondition/giá trị:** Mỗi decision bất biến, truy được actor/effective actor/version/reason. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-016"></a>
### UC-016 — Áp dụng RBAC, ABAC và tenant isolation

- **Source/trace:** `US-E16`; Business Requirement: `BR-001, BR-033, BR-040`; Product Requirement: `FR-146…FR-155, NFR-007…NFR-013`.
- **Actors:** User, Tenant Admin, Security Admin, Auditor.
- **Preconditions:** Identity được xác thực; role và attribute policy effective.
- **Trigger:** Mọi request/query/export/job được thực hiện.
- **Luồng thường:** Resolve tenant và user; áp explicit deny/SoD/status lock/data scope/role/owner-share theo thứ tự; lọc row/field/file/search; ghi decision/audit phù hợp.
- **Ngoại lệ/alternative:** Thiếu tenant, scope mơ hồ, stale token, cross-tenant ID hoặc policy error đều deny; admin không mặc nhiên đọc business data.
- **Postcondition/giá trị:** Không có dữ liệu/hành động vượt tenant, legal entity, project, package, record/field. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-017"></a>
### UC-017 — Kiểm soát SoD và conflict of interest

- **Source/trace:** `US-E17`; Business Requirement: `BR-015, BR-033, BR-034`; Product Requirement: `FR-139…FR-155`.
- **Actors:** Requester, Approver, Process Owner, Internal Control.
- **Preconditions:** SoD matrix và ownership/relationship đã cấu hình.
- **Trigger:** Người dùng submit hoặc quyết định giao dịch nhạy cảm.
- **Luồng thường:** Kiểm actor gốc/effective actor, creator, beneficiary, company relationship và approval history; chặn tự duyệt; route người thay thế có authority; audit conflict/override được phê duyệt.
- **Ngoại lệ/alternative:** Không có approver độc lập tạo exception; delegation không xóa conflict; break-glass chỉ theo policy riêng và hậu kiểm.
- **Postcondition/giá trị:** Khoản/decision nhạy cảm có bằng chứng độc lập và không tự duyệt. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-018"></a>
### UC-018 — Ủy quyền phê duyệt có thời hạn

- **Source/trace:** `US-E18`; Business Requirement: `BR-033, BR-034`; Product Requirement: `FR-141, FR-146…FR-153`.
- **Actors:** Delegator, Delegate, Admin, Approver.
- **Preconditions:** Delegator có quyền gốc; period/scope/value limit hợp lệ.
- **Trigger:** Người dùng tạo hoặc dùng delegation.
- **Luồng thường:** Chọn delegate, phạm vi và thời gian; hệ thống kiểm không vượt quyền/không chain; kích hoạt; khi quyết định ghi cả actor gốc và effective actor; tự hết hạn/revoke.
- **Ngoại lệ/alternative:** Delegation overlap/conflict/expired hoặc delegator mất quyền làm deny; không fallback sang quyền rộng hơn.
- **Postcondition/giá trị:** Ủy quyền bị giới hạn, thu hồi được và audit end-to-end. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-019"></a>
### UC-019 — Chia sẻ ngoài, khóa trạng thái và ký điện tử

- **Source/trace:** `US-E19`; Business Requirement: `BR-011, BR-035, BR-040`; Product Requirement: `FR-029…FR-035, FR-145, FR-151…FR-155, FR-164`.
- **Actors:** Document Controller, External Recipient, Signer, Security.
- **Preconditions:** Revision safe/approved và recipient scope được phê duyệt.
- **Trigger:** Phát hành link/chữ ký hoặc thay trạng thái tài liệu.
- **Luồng thường:** Tạo share có expiry/watermark/download rule; gửi e-sign; verify callback/hash/signer authority; lock signed artifact; revoke share; legal hold áp retention.
- **Ngoại lệ/alternative:** Recipient forward link/expired/revoked bị deny; callback trùng idempotent; hash mismatch quarantine; signed/issued không ghi đè.
- **Postcondition/giá trị:** Bản phát hành/ký có hash, scope, expiry và audit. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-020"></a>
### UC-020 — SSO, MFA, session và privileged access

- **Source/trace:** `US-E20`; Business Requirement: `BR-033, BR-040`; Product Requirement: `FR-146…FR-155, NFR-008…NFR-013`.
- **Actors:** End User, IAM Admin, Security Operations.
- **Preconditions:** Tenant identity policy và IdP trust được cấu hình.
- **Trigger:** Đăng nhập, step-up hoặc dùng quyền đặc quyền.
- **Luồng thường:** Federated login; map identity; MFA/step-up theo risk/action; tạo session bounded; revoke/logout; privileged role qua request/time limit; monitor anomaly.
- **Ngoại lệ/alternative:** Unknown tenant/subject, disabled user, failed MFA, stale/replayed token hoặc revoked role bị deny; emergency access audit/hậu kiểm.
- **Postcondition/giá trị:** Identity/session/privilege có policy, expiry và trace. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-021"></a>
### UC-021 — Tra cứu audit log bất biến

- **Source/trace:** `US-E21`; Business Requirement: `BR-011, BR-033…BR-035, BR-040`; Product Requirement: `FR-143, FR-154, FR-161, NFR-022`.
- **Actors:** Auditor, Security, Process Owner.
- **Preconditions:** Audit mandate/data scope hợp lệ.
- **Trigger:** Điều tra quyết định hoặc giao dịch.
- **Luồng thường:** Tìm theo actor/effective actor/object/time/correlation; xem event chain và hash/reference; export có approval/watermark; đối chiếu domain record.
- **Ngoại lệ/alternative:** Không cho sửa/xóa; field nhạy cảm redacted theo role; pipeline gap/tamper tạo alert và incident.
- **Postcondition/giá trị:** Bằng chứng hành động đầy đủ, chống sửa và chỉ đúng người xem. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-022"></a>
### UC-022 — Nhận thông báo, nhắc việc và escalation

- **Source/trace:** `US-E22`; Business Requirement: `BR-032, BR-034, BR-038`; Product Requirement: `FR-019…FR-025, FR-142…FR-145, FR-175, FR-177`.
- **Actors:** Mọi user có task, PM, Approver.
- **Preconditions:** Subscription/channel/quiet-hour và source object tồn tại.
- **Trigger:** Domain/workflow event hoặc SLA gần/quá hạn.
- **Luồng thường:** Tạo notification từ event; deduplicate; áp scope/template/language; gửi in-app/email/outbound channel; user acknowledge/read; overdue escalate theo rule.
- **Ngoại lệ/alternative:** Delivery failure retry/DLQ; mark read không đóng source task; recipient mất quyền không được mở payload; channel nhạy cảm dùng link an toàn.
- **Postcondition/giá trị:** Thông báo đúng người, đúng deadline và không thay trạng thái nghiệp vụ. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-023"></a>
### UC-023 — Sử dụng Report Center, saved view và export

- **Source/trace:** `US-E23`; Business Requirement: `BR-001, BR-032, BR-036, BR-038`; Product Requirement: `FR-010…FR-015, FR-020…FR-025, FR-130…FR-137, FR-171…FR-177`.
- **Actors:** Executive, PMO, PM, Functional Lead, Auditor.
- **Preconditions:** Người dùng có data scope; report/view definition effective.
- **Trigger:** Mở dashboard, lưu view hoặc export.
- **Luồng thường:** Chọn filter/as-of/currency; hệ thống áp row/field ACL; tính/read snapshot; hiển thị freshness/formula; lưu view; export async có watermark/expiry/audit.
- **Ngoại lệ/alternative:** Query quá lớn chuyển job; data stale/missing hiển thị; permission thay đổi làm download bị kiểm lại; không cộng currency trực tiếp.
- **Postcondition/giá trị:** Báo cáo có provenance, snapshot và quyền nhất quán. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-024"></a>
### UC-024 — Khôi phục dịch vụ và dữ liệu an toàn

- **Source/trace:** `US-E24`; Business Requirement: `BR-040`; Product Requirement: `NFR-004…NFR-006, NFR-021…NFR-024`.
- **Actors:** SRE, Security, System Owner, Business Owner.
- **Preconditions:** Backup policy, recovery manifest và isolated credentials tồn tại.
- **Trigger:** Backup verification, restore drill hoặc sự cố.
- **Luồng thường:** Chọn recovery point; phê duyệt break-glass; restore transactional/object/audit/derived stores theo dependency; kiểm checksum, ACL, referential/business invariants; reconcile event/retry; owner sign-off.
- **Ngoại lệ/alternative:** Backup corrupt/missing key/ACL mismatch hoặc duplicate workflow/payment làm fail drill; search/cache rebuild không được rò ACL; OT tiếp tục độc lập.
- **Postcondition/giá trị:** RPO/RTO được đo bằng bằng chứng restore, không tuyên bố từ cấu hình. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-025"></a>
### UC-025 — Đánh giá tiền khả thi và so sánh Solar/BESS

- **Source/trace:** `US-E25`; Business Requirement: `BR-002…BR-008`; Product Requirement: `FR-001…FR-009, FR-053…FR-060, FR-125…FR-137`.
- **Actors:** Business Development, Solar/BESS Engineer, Finance, Investment Committee.
- **Preconditions:** Survey/load/bill/tariff data có provenance và data-quality flag.
- **Trigger:** Tạo hoặc so sánh investment scenario.
- **Luồng thường:** Nhập measured/derived/assumed data; cấu hình Solar/BESS scenario; chạy sizing/cashflow/IRR/NPV/peak-shaving constraint; compare; submit gate; freeze approved input/output snapshot.
- **Ngoại lệ/alternative:** Thiếu interval/tariff không được bịa; unit/currency/FX sai bị chặn; simulation infeasible báo constraint; formula/regulation chưa xác nhận để TBD.
- **Postcondition/giá trị:** Quyết định đầu tư tái lập được từ assumption/version/source. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-026"></a>
### UC-026 — Truy vết Solar engineering, asset và performance

- **Source/trace:** `US-E26`; Business Requirement: `BR-003…BR-006, BR-012…BR-014, BR-017, BR-024, BR-027`; Product Requirement: `FR-045…FR-052, FR-069…FR-074, FR-106…FR-129`.
- **Actors:** Solar Engineer, Commissioning, Asset/O&M Manager.
- **Preconditions:** Approved design/BOM, meter/tag mapping và handover tồn tại.
- **Trigger:** Thiết kế, lắp đặt, thay thế hoặc đánh giá performance Solar.
- **Luồng thường:** Quản lý module/string/inverter/transformer/meter model và serial; link BOM→PO→receipt→installation→test→asset; cấu hình baseline/PR; đánh giá KPI với weather/curtailment/availability provenance.
- **Ngoại lệ/alternative:** Substitution chưa duyệt/serial trùng/baseline thiếu data window bị chặn; stale/missing telemetry không coi zero; replacement giữ lineage.
- **Postcondition/giá trị:** Solar plant và KPI truy tới thiết kế, thiết bị, test và nguồn đo. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-027"></a>
### UC-027 — Quản lý BESS hierarchy, safety và degradation

- **Source/trace:** `US-E27`; Business Requirement: `BR-005, BR-006, BR-014, BR-024…BR-029, BR-040`; Product Requirement: `FR-045…FR-052, FR-106…FR-124, FR-130…FR-137, FR-165…FR-170`.
- **Actors:** BESS Engineer, Commissioning, HSE, O&M.
- **Preconditions:** Approved hierarchy/envelope, safety dossier và read-only tag mapping tồn tại.
- **Trigger:** Cấu hình BESS, commissioning hoặc đánh giá degradation.
- **Luồng thường:** Quản lý container/rack/module/cell selected hierarchy, PCS/BMS/EMS/HVAC/fire system; link model/serial/firmware; test capacity/RTE; nhận SoH/SOC/event read-only; tính degradation có boundary/version.
- **Ngoại lệ/alternative:** Không lưu control credential; không gửi setpoint/start/stop/reset/bypass; hierarchy/serial mismatch hoặc safety test fail chặn gate; stale SOC không được coi safe.
- **Postcondition/giá trị:** BESS asset/safety/performance traceable mà không tạo control path. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-028"></a>
### UC-028 — Vận hành connector có System of Record và reconciliation

- **Source/trace:** `US-E28`; Business Requirement: `BR-037, BR-040`; Product Requirement: `FR-156…FR-177, NFR-015, NFR-021, NFR-024`.
- **Actors:** Integration Admin, Data Owner, System Owner, Support.
- **Preconditions:** Interface contract, credential, SoR/field ownership và sandbox đã duyệt.
- **Trigger:** Connector sync theo lịch/event/manual authorized.
- **Luồng thường:** Resolve tenant; pull/push theo direction; validate/schema-map; idempotent apply; checkpoint; retry; DLQ; reconciliation; data owner xử lý mismatch; audit/replay.
- **Ngoại lệ/alternative:** Unknown mapping, schema drift, rate limit, timeout hoặc partial batch không last-write-wins; connector disable/kill switch; secret không log.
- **Postcondition/giá trị:** Mỗi sync có checkpoint, counts, ownership và reconciliation outcome. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-029"></a>
### UC-029 — Nhận OT telemetry read-only qua IT/OT boundary

- **Source/trace:** `US-E29`; Business Requirement: `BR-027, BR-028, BR-037, BR-040`; Product Requirement: `FR-134, FR-165…FR-170, NFR-016, NFR-024`.
- **Actors:** OT Owner, O&M Engineer, Integration/Security, PM/O&M Viewer.
- **Preconditions:** Site survey, allowlist/tag registry, gateway certificate và DMZ flow được phê duyệt.
- **Trigger:** Gateway gửi tag/event outbound.
- **Luồng thường:** Gateway buffer/sequence; DMZ/broker xác thực; cloud validate tag/unit/time/quality/duplicate; append time-series/event; tạo read model; người dùng query theo quyền.
- **Ngoại lệ/alternative:** Unknown tag/cert, replay, gap/out-of-order/stale bị flag/quarantine; mất cloud không ảnh hưởng control; không tồn tại reverse route/API/credential.
- **Postcondition/giá trị:** Telemetry/alarm có provenance/quality và tuyệt đối không có OT command. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-030"></a>
### UC-030 — Truy vết xuyên vòng đời cơ hội đến O&M

- **Source/trace:** `US-E30`; Business Requirement: `BR-001…BR-040`; Product Requirement: `FR-001…FR-177`.
- **Actors:** Executive, PM, Auditor, Asset/O&M Manager.
- **Preconditions:** Stable IDs và mapping/event links tồn tại.
- **Trigger:** Người dùng mở lineage hoặc điều tra sai lệch.
- **Luồng thường:** Đi từ Opportunity/approved scenario → Project → design/document/contract → procurement/serial → construction/QA/HSE → test/COD/handover → asset/WO/performance; hiển thị source/version/time/owner.
- **Ngoại lệ/alternative:** Mapping thiếu hiển thị gap owner, không suy đoán; cross-tenant/project link bị deny; source system mismatch tạo reconciliation case.
- **Postcondition/giá trị:** Lineage có thể điều hướng và audit qua mọi gate mà không copy mất nguồn. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-031"></a>
### UC-031 — Quản trị nền tảng AI có nguồn và human review

- **Source/trace:** `US-E31`; Business Requirement: `BR-039, BR-040`; Product Requirement: `FR-178…FR-198, NFR-017`.
- **Actors:** AI Governance, Security, Data Owner, End User, Reviewer.
- **Preconditions:** Use case/model/prompt/corpus/policy đã được phê duyệt và enabled theo tenant.
- **Trigger:** Người dùng yêu cầu AI hỗ trợ.
- **Luồng thường:** Authorize user/corpus; sanitize; chạy model gateway; trả draft với citation/confidence/version; reviewer accept/edit/reject; chỉ tạo domain Draft; audit original/correction/decision; kill switch.
- **Ngoại lệ/alternative:** Thiếu quyền/source/confidence hoặc prompt injection/data leakage risk thì từ chối/quarantine; AI không approve/sign/pay/close safety item/control BESS.
- **Postcondition/giá trị:** Mọi kết quả AI là đề xuất có nguồn, reviewer và audit. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-032"></a>
### UC-032 — AI phân loại, đặt tên và mã tài liệu

- **Source/trace:** `US-E32`; Business Requirement: `BR-035, BR-039`; Product Requirement: `FR-178…FR-184`.
- **Actors:** Document Controller, Author, AI Reviewer.
- **Preconditions:** File safe và user có quyền; coding taxonomy versioned.
- **Trigger:** Upload tài liệu chưa phân loại.
- **Luồng thường:** AI đọc nội dung được phép; đề xuất type/discipline/title/code/metadata với citation/confidence; Document Controller review/edit; kiểm unique/coding; lưu Draft.
- **Ngoại lệ/alternative:** File độc hại/không OCR được/confidence thấp hoặc code conflict thì không auto-apply; không phát hành tự động.
- **Postcondition/giá trị:** Metadata được con người duyệt và truy vết tới model/source. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-033"></a>
### UC-033 — AI trích xuất nghĩa vụ hợp đồng

- **Source/trace:** `US-E33`; Business Requirement: `BR-009…BR-011, BR-039`; Product Requirement: `FR-185…FR-188`.
- **Actors:** Contract Manager, Legal, AI Reviewer.
- **Preconditions:** Signed/approved contract revision có quyền truy cập.
- **Trigger:** Yêu cầu lập obligation draft.
- **Luồng thường:** AI trích clause, obligor, beneficiary, trigger, due rule, evidence và citation; Legal/Contract review; tạo Obligation Draft; workflow phê duyệt.
- **Ngoại lệ/alternative:** Citation thiếu/mơ hồ, phụ lục xung đột hoặc confidence thấp phải flag; không tự xác định kết luận pháp lý/fulfillment.
- **Postcondition/giá trị:** Obligation draft có clause citation, reviewer và source revision. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-034"></a>
### UC-034 — AI/OCR hóa đơn điện và dữ liệu phụ tải

- **Source/trace:** `US-E34`; Business Requirement: `BR-003…BR-007, BR-039`; Product Requirement: `FR-189…FR-191`.
- **Actors:** Energy Analyst, Finance, Solar/BESS Engineer.
- **Preconditions:** Bill file safe; customer/site/meter context được chọn.
- **Trigger:** Upload hóa đơn điện hoặc bảng phụ tải.
- **Luồng thường:** OCR kỳ, meter, tariff fields, energy/demand/charges; kiểm tổng/unit/date; hiển thị bounding source/confidence; người dùng sửa; lưu dataset Draft; dùng scenario sau approval.
- **Ngoại lệ/alternative:** Không tự điền interval bị thiếu; tổng không khớp/meter-period overlap/unit lạ phải exception; dữ liệu nhạy cảm theo scope.
- **Postcondition/giá trị:** Dataset có source field, correction và data-quality status. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-035"></a>
### UC-035 — AI tạo biên bản họp và action item

- **Source/trace:** `US-E35`; Business Requirement: `BR-032, BR-034, BR-039`; Product Requirement: `FR-192…FR-194`.
- **Actors:** Meeting Owner, PM, Participants, AI Reviewer.
- **Preconditions:** Recording/transcript consent và access policy đã đáp ứng.
- **Trigger:** Người dùng yêu cầu draft minutes.
- **Luồng thường:** AI tóm tắt decision/action/owner/due date và citation timestamp; owner review/edit; participants review theo workflow; publish revision; action tạo Draft rồi xác nhận.
- **Ngoại lệ/alternative:** Không consent/không xác định speaker/owner/due date thì flag TBD; không gửi hoặc giao việc ra ngoài scope tự động.
- **Postcondition/giá trị:** Biên bản/action có source, người duyệt và version. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-036"></a>
### UC-036 — AI kiểm tra thiếu hồ sơ và COD readiness

- **Source/trace:** `US-E36`; Business Requirement: `BR-023…BR-026, BR-039`; Product Requirement: `FR-195…FR-197`.
- **Actors:** Document Controller, Commissioning, PM, O&M Recipient.
- **Preconditions:** COD checklist/version và authorized corpus tồn tại.
- **Trigger:** Yêu cầu kiểm tra readiness.
- **Luồng thường:** AI đối chiếu manifest/gate với document metadata/revision/signature/test/expiry; liệt kê missing/stale/ambiguous và citation; owner xác minh; tạo action Draft.
- **Ngoại lệ/alternative:** Không kết luận COD Ready khi thiếu mandatory evidence; false positive được sửa/audit; quyền tài liệu không được mở rộng cho AI/user.
- **Postcondition/giá trị:** Danh sách thiếu có citation/confidence/owner, không thay quyết định gate. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

<a id="uc-037"></a>
### UC-037 — AI dự báo dự án, bất thường BESS và tối ưu vận hành

- **Source/trace:** `US-E37`; Business Requirement: `BR-028, BR-032, BR-039, BR-040`; Product Requirement: `FR-198, NFR-016, NFR-017`.
- **Actors:** Data Scientist, PMO, BESS/O&M Engineer, AI Governance.
- **Preconditions:** Future-only; đủ lịch sử, data-quality, benchmark, safety/legal/OT approval riêng.
- **Trigger:** Khởi tạo pilot đã phê duyệt.
- **Luồng thường:** Chọn dataset/version; backtest; chạy forecast/anomaly/recommendation; hiển thị uncertainty/explanation; expert review; chỉ export advisory result; monitor drift/kill switch.
- **Ngoại lệ/alternative:** Không đủ data/shift/drift/confidence thì không dùng quyết định; recommendation không tự dispatch/control/setpoint; tối ưu dispatch chỉ mô phỏng trong constraint.
- **Postcondition/giá trị:** Future advisory pilot có backtest và human governance; không thuộc MVP. **Permission:** luôn áp RBAC + ABAC + SoD/status lock theo scope; **Audit:** bắt buộc cho decision/state/export/AI/financial/safety action; **Status:** Draft.

## 13. Yêu cầu sản phẩm xuyên suốt

### 13.1 Permission

- Deny-by-default; thứ tự quyết định là explicit deny/SoD → legal hold/status lock → tenant/legal entity/project/package/record/field scope → role permission → owner/external share.
- PM không tự duyệt khoản mình đề xuất; delegation có thời hạn, không chain và không mở rộng quyền gốc.
- Search, report, cache, export, notification, background job, file preview/download và AI retrieval phải áp cùng policy với record nguồn.
- PM Web, O&M monitoring và OT giữ trust boundary riêng; không role nào trong PM Web được cấp start/stop/setpoint/reset/bypass hoặc credential điều khiển BESS.

### 13.2 Notification và escalation

- Notification chỉ là projection từ domain/workflow event; mark-read/acknowledge không đóng source task, alarm nguồn, NCR, punch hoặc work order.
- Template có version, tenant/language/timezone, deep link an toàn và không chứa dữ liệu nhạy cảm vượt channel policy.
- Retry, deduplication, DLQ và delivery audit bắt buộc cho kênh quan trọng; SLA/escalation threshold là `TBD` theo process owner.

### 13.3 Audit

- Create/update/state/approval/reject/return/delegation/share/download/export/sign/payment/test/safety/admin/AI review đều ghi actor và effective actor, object/version, time, result, reason/correlation và before/after reference phù hợp.
- Audit append-only/tamper-evident; retention, privileged access và export approval do Security/Legal xác nhận.

### 13.4 Reporting, search, filter, export và bulk action

- Kết quả luôn hiển thị data-as-of/freshness, source/formula/version, currency/unit/timezone và confidence/completeness nếu áp dụng.
- Saved view không lưu quyền; mở lại phải tái đánh giá policy. Export là snapshot bất biến có watermark/expiry/audit và re-check quyền khi download.
- Bulk action chỉ mở cho action có preview, per-record validation, partial-result report, idempotency và audit; không bulk approve/sign/pay/close safety item/clear OT alarm.
- Full-text index và dashboard là derived store; rebuild/reindex phải tái áp ACL, không được trở thành System of Record.

## 14. Release scope chuẩn hóa

### 14.1 MVP — PM-first

MVP gồm 110 FR đã gắn **MVP** trong mục 10: portfolio/project master, PM Command Center, WBS–milestone–activity–baseline, DMS/revision/transmittal, contract/obligation/appendix, budget–commitment–payment, procurement/logistics tracker, risk–issue–change, field log/PWA cơ bản, NCR/punch/HSE, commissioning/COD readiness, workflow, RBAC/ABAC/SoD/delegation, audit, notification, report/export và nền tảng bảo mật/khôi phục. Điều kiện release là các NFR foundation/safety liên quan được kiểm chứng hoặc có waiver được owner xác nhận; waiver không áp dụng cho tenant isolation, SoD bắt buộc, malware blocking hoặc no-OT-command.

### 14.2 Post-MVP / Release 1

31 FR Post-MVP mở rộng pre-feasibility, scheduling/integration sâu, O&M work management, connector hai chiều có kiểm soát và một số khả năng chuyên ngành. Chỉ đưa vào khi MVP data governance ổn định và interface discovery xác nhận SoR/field ownership.

### 14.3 Pilot / Release 2

10 FR Pilot dành cho use case cần học từ dữ liệu/AI hoặc site integration có phạm vi hẹp. Pilot không được dùng để phê duyệt, ký, thanh toán, đóng safety gate hoặc điều khiển OT; phải có kill switch, human review và success/exit criteria riêng.

### 14.4 Future

47 FR Future gồm telemetry/analytics/AI nâng cao và năng lực phụ thuộc lịch sử/site/OT. Live SCADA/BMS, tối ưu sạc-xả và AI dự báo không chặn MVP. Bất kỳ control capability nào là thay đổi phạm vi cần threat/safety design, authority và ADR riêng; không được suy ra từ tài liệu này.

### 14.5 Điều kiện chuyển phase

| Chuyển phase | Điều kiện tối thiểu | Owner phê duyệt |
|---|---|---|
| Draft → MVP build-ready | BR/FR/NFR/UC, SRS, domain, architecture, data, API, security, UX, workflow, backlog và test trace đủ; open blocker được quyết định | Product Owner + Architecture + Security + QA |
| MVP → Release 1 | UAT và production-readiness đạt; dữ liệu master/ACL/audit ổn định; không Sev-1/Sev-2 mở | Product Owner + Business Owners + Operations |
| Release 1 → Pilot | Dataset/site/consent/interface và rollback/kill switch được duyệt | Product Owner + Data/AI/OT/Security owner |
| Pilot → Scale | KPI pilot đạt, model/data drift và support cost chấp nhận; compliance review hoàn tất | Steering Committee |

## 15. Success metrics và product analytics

Các target chưa được PO cung cấp ghi `TBD`; baseline score/threshold chỉ là proposal, không biến thành cam kết sản phẩm.

| Nhóm | Metric/định nghĩa | Event/dimension cần thu thập | Target/Owner |
|---|---|---|---|
| Adoption PM | Weekly active PM; % project active có owner/baseline/action | login, project_opened, command_center_viewed; tenant/project/role | `TBD` — Product/PMO |
| Data completeness | % trụ cột Health có dữ liệu current; confidence distribution | source_refresh, completeness_changed, hard_cap_applied | `TBD` — PMO/Data Owner |
| Schedule | Milestone forecast accuracy; overdue action lead time | forecast_changed, milestone_slipped, action_closed | `TBD` — Project Controls |
| Cost | Budget/commitment/payment reconciliation accuracy; payment cycle time | budget_baselined, payment_submitted/approved/paid/reconciled | `TBD` — Finance |
| Procurement | On-time critical delivery; ETA recovery lead time | po_issued, eta_changed, goods_received, exception_closed | `TBD` — Procurement/Logistics |
| Documentation | Review cycle, overdue response, first-time-right, missing COD evidence | revision_submitted/issued, transmittal_response, cod_gap_detected | `TBD` — Document Control |
| Quality/HSE | NCR age/reopen; punch burn-down; stop-work/incident response | ncr_raised/closed/reopened, punch_closed, stop_work_issued/lifted | Safety targets không suy diễn — QA/HSE |
| Commissioning/COD | First-pass test rate; COD forecast error; gate aging | test_started/passed/failed/retest, gate_status_changed, cod_signed | `TBD` — Commissioning/PM |
| O&M | WO response/restore/close; warranty recovery; KPI completeness | alarm_case_opened, wo_dispatched/completed/closed, warranty_claimed | `TBD` — O&M |
| Security | Cross-tenant denial, privileged review, audit gap, malware block | authz_denied, role_changed, audit_gap, file_quarantined | Zero leakage; other targets `TBD` — Security |
| Reliability | Availability, error rate, job lag, connector reconcile backlog, restore evidence | request/job/connector/backup metrics | Theo NFR và owner sign-off — SRE |
| AI | Acceptance/edit/reject, citation coverage, confidence calibration, harmful/unsafe block | ai_requested/proposed/reviewed/rejected/killed | `TBD`; không đo bằng output volume — AI Governance |

Analytics không được thu thập raw document/contract/telemetry/PII nếu không cần; event schema phải versioned, tenant-scoped, consent/retention-aware và không thay audit log.

## 16. Dependencies

- Product Owner/PMO xác nhận MVP normalization, owner, KPI target và hard-cap governance.
- Process owners xác nhận workflow, state, authority, SLA và exception cho từng domain.
- Architecture/Engineering xác nhận workload, deployment profile, tech stack và operability; không chọn vendor tại PRD.
- Security/Legal xác nhận data classification, privacy, retention, identity, external share, audit và IT/OT boundary.
- System owners xác nhận ERP/DMS/e-sign/IdP/HR/logistics/telemetry SoR, field ownership, direction và sandbox.
- Solar/BESS/Commissioning/O&M xác nhận unit, hierarchy, calculation boundary, test criteria, tag/quality/retention và safe-state assumptions.

## 17. Assumptions

| Assumption | Owner xác nhận | Tác động nếu sai |
|---|---|---|
| PRD là Draft v0.1 và baseline là nguồn phạm vi gốc; PRD không tự thay scope | Product Owner | Cần change control và remap toàn bộ downstream |
| Release normalization 110 MVP / 31 Post-MVP / 10 Pilot / 47 Future là working assumption | Product Owner/PMO | Backlog/roadmap thay đổi |
| Việt Nam là thị trường đầu, tiếng Việt mặc định, tiếng Anh thứ hai, VND reporting mặc định nhưng giao dịch hỗ trợ USD | Product Owner/Finance/Legal | Localization, tax/currency và report thay đổi |
| Cloud-first multi-tenant, khoảng 500 project active/tenant; dedicated profile theo policy | Architecture/Commercial/Security | Capacity/deployment/NFR thay đổi |
| Telemetry tách khỏi OLTP và chỉ ingress read-only; OT tự vận hành khi cloud mất | OT Owner/Architecture | Kiến trúc và safety case thay đổi |
| Import/sync chỉ bật rõ ràng; không tự quét thư mục | Product Owner/Security | Consent, file/connector UX thay đổi |
| Các threshold baseline về performance/RPO/RTO/retention là proposal cho tới khi owner ký | Business Owner/SRE/Legal | Không thể cam kết SLA/go-live |
| AI chỉ advisory draft, có citation/confidence/human review | AI Governance/Security | Use case AI bị defer hoặc cần scope change |

## 18. Open Questions

| Open Question | Owner | Cần trước | Tác động |
|---|---|---|---|
| Baseline được xem là approved scope hay proposal cần sign-off từng module? | Product Owner | Backlog baseline | Quyền thay đổi/acceptance |
| Xác nhận 110/31/10/47 và danh sách non-waivable MVP controls? | Product Owner/Security/HSE | MVP approval | Release scope/gate |
| Tenant đại diện khách hàng, tập đoàn hay deployment; hierarchy Company–LegalEntity chính xác? | Product Owner/Legal/IT | Data/security design | Unique/data scope/migration |
| Project code/contract number/serial uniqueness ở scope nào? | PMO/Legal/Engineering | Data model | Constraint/import |
| Health Score formula, hard-cap, freshness và confidence target cuối? | PMO/Functional Owners | UX/test | Dashboard/analytics |
| Approval threshold, quorum, delegation limit, SLA và escalation theo quy trình? | Process Owners/Finance/Legal | Workflow/backlog | Routing/permission/test |
| Exact NFR workload, availability, RPO/RTO, retention, browser/device/offline matrix? | PO/SRE/Security/Legal/Site | Architecture/test | Capacity/readiness |
| ERP/DMS/e-sign/IdP/HR/CMMS/logistics vendor và field-level SoR? | System Owners | API/integration | Connector scope |
| OT topology/protocol/historian/tag count/frequency/quality/retention mỗi site? | OT Owner/Solar-BESS Engineering | OT integration | Future sizing/security |
| Tax/tariff/metering rules và legal/technical source applicability theo effective date/project? | Legal/Finance/Energy Engineer | Calculation/UAT | Không hard-code |
| Company–LegalEntity/Person/Signer migration và snapshot field bắt buộc? | Legal/Data Owner | Data model | Contract/payment integrity |
| AI provider/hosting/training/retention/corpus/consent và quality threshold? | AI Governance/Legal/Security | AI pilot | Go/no-go |
| UAT ≥95% có áp dụng; scenario nào tuyệt đối không được waiver? | Product Owner/QA/Security/HSE | Test strategy | Exit criteria |

## 19. Changelog

| Version | Date | Author | Change | Scope impact |
|---|---|---|---|---|
| 0.1 | 2026-07-11 | Codex | Tạo PRD với 198 FR, 24 NFR và 37 UC; chuẩn hóa release ở trạng thái Assumption | Không thay baseline; mọi quyết định chưa xác nhận giữ Draft/TBD/Open Question |
