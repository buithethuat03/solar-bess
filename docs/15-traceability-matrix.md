# Traceability Matrix — Nền tảng Solar & BESS

> **Purpose:** Cung cấp chuỗi truy vết Business Goal → BR → FR/NFR → UC → WF → US → AC → API → DB → SEC → TEST → Release và công khai mọi gap/mâu thuẫn.
> **Scope:** Toàn bộ artefact Draft và implementation profiles; matrix dùng range inclusive. US-001 đã Implemented; operational foundation/core US-003 đã deploy EC2 test; US-004 Approved/Build-ready nhưng chưa Implemented; production vẫn Proposed.
> **Source:** [Vision](./01-product-vision-and-scope.md), [BRD](./02-BRD.md), [PRD](./03-PRD.md), [SRS](./04-SRS.md), [Domain](./05-domain-model.md), [Architecture](./06-solution-architecture.md), [Data](./07-data-model.md), [API](./08-api-specification.md), [Security](./09-security-and-permissions.md), [UX](./10-ux-information-architecture.md), [Workflow](./11-workflows-and-state-machines.md), [Backlog](./12-product-backlog.md), [Test](./13-test-strategy.md), [Operational Foundation ExecPlan](../.agent/execplans/2026-07-11-operational-foundation.md), [US-003 ExecPlan](../.agent/execplans/2026-07-11-project-controls-us003.md), [US-004 ExecPlan](../.agent/execplans/2026-07-12-risk-issue-change-us004.md).
> **Version:** 0.9
> **Status:** Draft toàn platform; US-001 Implemented; operational foundation và US-003 core Implemented/deployed; US-004 Approved/Build-ready; production Proposed
> **Owner:** Product Operations / Business Analysis / QA (cá nhân: TBD)
> **Updated:** 2026-07-12
> **Approval:** Operational foundation EC2 test và US-003/US-004 documentation/implementation profile Approved — Product Owner delegated; full story/production acceptance TBD — Architecture, QA, Security và Process Owners

## 1. ID registry and canonical owner

| ID | Count | Canonical owner | Verification |
|---|---:|---|---|
| BR-001…040 | 40 | 02-BRD | Unique; maps REQ-01…40 |
| FR-001…198 | 198 | 03-PRD | Unique; maps functional Source Features |
| NFR-001…024 | 24 | 03-PRD | TEST-174…197 |
| UC-001…037 | 37 | 03-PRD | One-to-one source US-E |
| ADR-001…010 | 10 | 06 Architecture | One-to-one ARC-001…010 |
| DB-001…112 | 112 | 07 Data Model | DB-101…105 materialized EC2 test; DB-106…111 reserved; DB-112 allocated cho US-004 |
| API-001…159 | 159 | 08 API/OpenAPI | x-api-id exact/unique; API-143…158 concrete planned US-004 surface; API-159 Project Controls reverse trace |
| SEC-101…132 | 32 | 09 Security | TEST-198…229 |
| WF-001…026 | 26 | 11 Workflow | 26 Mermaid state machines |
| US-001…037 | 37 | 12 Backlog | One-to-one US-E01…37 |
| AC-001…177 | 177 | 12 Backlog | Source GWT preserved + 4 approved base-auth AC |
| TEST-001…233 | 233 | 13 Test | 177 AC + 24 NFR + 32 SEC |

## 2. End-to-end story matrix

This is the primary chain. API/DB/SEC ranges are capability surfaces; exact operation-level FR/DB/SEC mapping remains in API/OpenAPI.

| Goal | BR | FR/NFR | UC | WF | US | AC | API | DB | SEC | TEST | Release |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PM/EPC execution | BR-001, BR-031 | FR-010…FR-025 | UC-001 | WF-001 | US-001 | AC-001…AC-004 | API-003…007/API-015…025 | DB-001…013/098 | SEC-105…111/118 | TEST-001…TEST-004/202…208 | MVP; Implemented/EC2 deployed |
| COD-to-O&M continuity | BR-032 | FR-010…FR-015, FR-019…FR-025, FR-098…FR-114 | UC-002 | WF-001 | US-002 | AC-005…AC-009 | API-015…020/API-130…136; API-017…025/API-034…038/API-130…136; API-038; API-098…105 | DB-009…013/065…068; DB-009…021/065…068; DB-065…068; DB-073…078 | SEC-105…111/118/119; SEC-105…111/118; SEC-108/109/111/114; SEC-102/108/109/111/112/118 | TEST-005…TEST-009 | MVP |
| PM/EPC execution | BR-018, BR-032 | FR-016…FR-021; NFR-007/012/014/016/017/020…023 | UC-003 | WF-003 | US-003 | AC-010…AC-013 | **Direct:** API-023/024/034…037/140…142<br>**Dependency:** API-038 | **Direct:** DB-012/017…021/101/105<br>**Dependency:** DB-067/102…104 | SEC-105…111/118/119 | TEST-010…013/185/187/189/190/193…196 | MVP; core Implemented/deployed; full story Pass pending runtime evidence + US-004 positive rebaseline |
| Enterprise control | BR-022, BR-031, BR-032 | FR-098…FR-105 | UC-004 | WF-015/WF-021 | US-004 | AC-014…AC-017 | **Direct:** API-038/143…158; reverse trace API-159<br>**Dependencies:** API-034…037/140, future Claim/contract API | **Direct:** DB-065…067/112/098/102…105<br>**Dependencies:** DB-020 schedule refs; DB-068/028…033 Claim/Contract | SEC-105…111/114/118/119 | TEST-014…017 plus TEST-012/185/187/189/190/193…196/202…208 | MVP; Approved/Build-ready, not Implemented |
| Enterprise control | BR-003, BR-009, BR-011, BR-012, BR-019, BR-026, BR-035 | FR-026…FR-035 | UC-005 | WF-004…006 | US-005 | AC-018…AC-022 | API-039…052 | DB-022…027 | SEC-109/112/113/118…123/126 | TEST-018…TEST-022 | MVP |
| Enterprise control | BR-009…BR-011, BR-022, BR-026, BR-030 | FR-036…FR-044 | UC-006 | WF-008/009 | US-006 | AC-023…AC-027 | API-053…061; API-039…052 | DB-028…033; DB-022…027 | SEC-108/109/114/118/119/126/130; SEC-109/112/113/118…123/126 | TEST-023…TEST-027 | MVP |
| Enterprise control | BR-007, BR-015, BR-030, BR-033 | FR-053…FR-060, FR-138…FR-155 | UC-007 | WF-014 | US-007 | AC-028…AC-032 | API-062…066; API-053…061 | DB-034…040; DB-028…033 | SEC-108/109/114/118/119; SEC-108/109/114/118/119/126/130 | TEST-028…TEST-032 | MVP |
| PM/EPC execution | BR-015…BR-017 | FR-045…FR-052, FR-061…FR-074 | UC-008 | WF-010…013 | US-008 | AC-033…AC-037 | API-076…082; API-083…085; API-067…071 | DB-044…050; DB-051…054; DB-041…043/079…083 | SEC-108/114/118/125; SEC-111/118/125; SEC-105/107/111/127/128 | TEST-033…TEST-037 | MVP |
| PM/EPC execution | BR-018…BR-020, BR-033 | FR-075…FR-084, FR-151…FR-155 | UC-009 | WF-001/019 | US-009 | AC-038…AC-042 | API-086…090; API-017…025/API-034…038/API-130…136 | DB-055…057; DB-009…021/065…068 | SEC-111/123; SEC-105…111/118 | TEST-038…TEST-042 | MVP |
| PM/EPC execution | BR-021, BR-023…BR-026 | FR-091…FR-097 | UC-010 | WF-017/018 | US-010 | AC-043…AC-047 | API-095…097; API-086…090 | DB-058…061; DB-055…057 | SEC-108/109/111/118; SEC-111/123 | TEST-043…TEST-047 | MVP |
| PM/EPC execution | BR-020, BR-025, BR-026, BR-032 | FR-081, FR-085…FR-090 | UC-011 | WF-019/020 | US-011 | AC-048…AC-052 | API-091…094; API-086…090 | DB-062…064; DB-055…057 | SEC-108/114/118/130/131; SEC-111/123 | TEST-048…TEST-052 | MVP |
| COD-to-O&M continuity | BR-023…BR-025 | FR-106…FR-112 | UC-012 | WF-022 | US-012 | AC-053…AC-057 | API-098…105; API-095…097; API-067…071 | DB-073…078; DB-058…061; DB-041…043/079…083 | SEC-102/108/109/111/112/118; SEC-108/109/111/118; SEC-105/107/111/127/128 | TEST-053…TEST-057 | MVP |
| COD-to-O&M continuity | BR-023…BR-026 | FR-109…FR-114, FR-026…FR-044 | UC-013 | WF-023 | US-013 | AC-058…AC-062 | API-098…105; API-053…061; API-039…052; API-114…121 | DB-073…078; DB-028…033; DB-022…027; DB-079…095 | SEC-102/108/109/111/112/118; SEC-108/109/114/118/119/126/130; SEC-109/112/113/118…123/126; SEC-111/127/128 | TEST-058…TEST-062 | MVP |
| COD-to-O&M continuity | BR-027…BR-030, BR-040 | FR-115…FR-124, FR-165…FR-170 | UC-014 | WF-024/025 | US-014 | AC-063…AC-067 | API-114…121; API-091…094 | DB-079…095; DB-062…064 | SEC-111/127/128; SEC-108/114/118/130/131 | TEST-063…TEST-067 | Release 1 |
| Enterprise control | BR-008, BR-011, BR-015, BR-026, BR-034 | FR-138…FR-145 | UC-015 | WF-001…025 | US-015 | AC-068…AC-072 | API-106…113 | DB-069…072 | SEC-102/106…110/118 | TEST-068…TEST-072 | MVP |
| Enterprise control | BR-001, BR-033, BR-040 | FR-146…FR-155, NFR-007…NFR-013 | UC-016 | WF-001…025 policy | US-016 | AC-073…AC-078 | API-001…014 | DB-001…008/098 | SEC-101…110/118 | TEST-073…TEST-078 | MVP |
| Enterprise control | BR-015, BR-033, BR-034 | FR-139…FR-155 | UC-017 | WF-002…024 approval | US-017 | AC-079…AC-083 | API-001…014; API-106…113; API-062…066; API-076…082 | DB-001…008/098; DB-069…072; DB-034…040; DB-044…050 | SEC-101…110/118; SEC-102/106…110/118; SEC-108/109/114/118/119; SEC-108/114/118/125 | TEST-079…TEST-083 | MVP |
| Enterprise control | BR-033, BR-034 | FR-141, FR-146…FR-153 | UC-018 | WF-001…025 delegation | US-018 | AC-084…AC-087 | API-106…113; API-001…014 | DB-069…072; DB-001…008/098 | SEC-102/106…110/118; SEC-101…110/118 | TEST-084…TEST-087 | MVP |
| Enterprise control | BR-011, BR-035, BR-040 | FR-029…FR-035, FR-145, FR-151…FR-155, FR-164 | UC-019 | WF-007 | US-019 | AC-088…AC-092 | API-039…052; API-001…014; API-106…113 | DB-022…027; DB-001…008/098; DB-069…072 | SEC-109/112/113/118…123/126; SEC-101…110/118; SEC-102/106…110/118 | TEST-088…TEST-092 | MVP |
| Enterprise control | BR-033, BR-040 | FR-146…FR-155, NFR-008…NFR-013 | UC-020 | WF-026 | US-020 | AC-093…AC-097, AC-174…177 | API-001…014, API-137…139 | DB-001…008/098…100 | SEC-101…110/117/118 | TEST-093…TEST-097, TEST-230…233 | MVP; base auth slice Approved |
| Enterprise control | BR-011, BR-033…BR-035, BR-040 | FR-143, FR-154, FR-161, NFR-022 | UC-021 | Audit flow | US-021 | AC-098…AC-102 | API-001…014; API-106…113; API-039…052 | DB-001…008/098; DB-069…072; DB-022…027 | SEC-101…110/118; SEC-102/106…110/118; SEC-109/112/113/118…123/126 | TEST-098…TEST-102 | MVP |
| Enterprise control | BR-032, BR-034, BR-038 | FR-019…FR-025, FR-142…FR-145, FR-175, FR-177 | UC-022 | WF-001…025 notifications | US-022 | AC-103…AC-107 | API-106…113; API-017…025/API-034…038/API-130…136 | DB-069…072; DB-009…021/065…068; DB-105 | SEC-102/106…110/118; SEC-105…111/118 | TEST-103…TEST-107 | MVP; DB-105 reserved, not implemented |
| Enterprise control | BR-001, BR-032, BR-036, BR-038 | FR-010…FR-015, FR-020…FR-025, FR-130…FR-137, FR-171…FR-177 | UC-023 | Report job | US-023 | AC-108…AC-112 | API-015…020/API-130…136; API-017…025/API-034…038/API-130…136; API-062…066; API-039…052 | DB-009…013/065…068; DB-009…021/065…068; DB-034…040; DB-022…027; DB-106/107 | SEC-105…111/118/119; SEC-105…111/118; SEC-108/109/114/118/119; SEC-109/112/113/118…123/126 | TEST-108…TEST-112 | MVP; DB-106/107 reserved, not implemented |
| Safe extensibility | BR-040 | NFR-004…NFR-006, NFR-021…NFR-024 | UC-024 | Recovery runbook | US-024 | AC-113…AC-116 | API-001…014; API-122…126 | DB-001…008/098; DB-089…092/096…098 | SEC-101…110/118; SEC-115…118/122/125…128 | TEST-113…TEST-116 | MVP |
| Opportunity/investment | BR-002…BR-008 | FR-001…FR-009, FR-053…FR-060, FR-125…FR-137 | UC-025 | WF-002 | US-025 | AC-117…AC-121 | API-026…033; API-072/073/API-121; API-074/075/API-121/125; API-062…066 | DB-014…016; DB-079…083/093…095; DB-079…083/089…092; DB-034…040 | SEC-105/107/111/118; SEC-111/127/128; SEC-108/109/114/118/119 | TEST-117…TEST-121 | Release 1 |
| COD-to-O&M continuity | BR-003…BR-006, BR-012…BR-014, BR-017, BR-024, BR-027 | FR-045…FR-052, FR-069…FR-074, FR-106…FR-129 | UC-026 | WF-005/022/023 | US-026 | AC-122…AC-125 | API-072/073/API-121; API-067…071; API-098…105; API-114…121 | DB-079…083/093…095; DB-041…043/079…083; DB-073…078; DB-079…095 | SEC-111/127/128; SEC-105/107/111/127/128; SEC-102/108/109/111/112/118 | TEST-122…TEST-125 | Release 1 |
| COD-to-O&M continuity | BR-005, BR-006, BR-014, BR-024…BR-029, BR-040 | FR-045…FR-052, FR-106…FR-124, FR-130…FR-137, FR-165…FR-170 | UC-027 | WF-022/023/025 | US-027 | AC-126…AC-130 | API-074/075/API-121/125; API-098…105; API-114…121 | DB-079…083/089…092; DB-073…078; DB-079…095 | SEC-111/127/128; SEC-102/108/109/111/112/118 | TEST-126…TEST-130 | Release 1 |
| Safe extensibility | BR-037, BR-040 | FR-156…FR-177, NFR-015, NFR-021, NFR-024 | UC-028 | Integration sync | US-028 | AC-131…AC-135 | API-122…126 | DB-089…092/096…098 | SEC-115…118/122/125…128 | TEST-131…TEST-135 | Release 1 |
| COD-to-O&M continuity | BR-027, BR-028, BR-037, BR-040 | FR-134, FR-165…FR-170, NFR-016, NFR-024 | UC-029 | WF-025 | US-029 | AC-136…AC-140 | API-122…126; API-074/075/API-121/125; API-072/073/API-121 | DB-089…092/096…098; DB-079…083/089…092; DB-079…083/093…095 | SEC-115…118/122/125…128; SEC-111/127/128 | TEST-136…TEST-140 | MVP |
| Opportunity/investment | BR-001…BR-040 | FR-001…FR-177 | UC-030 | WF-001 | US-030 | AC-141…AC-144 | API-026…033; API-017…025/API-034…038/API-130…136; API-039…052; API-053…061; API-076…082; API-098…105; API-114…121 | DB-014…016; DB-009…021/065…068; DB-022…027; DB-028…033; DB-044…050; DB-073…078; DB-079…095 | SEC-105/107/111/118; SEC-105…111/118; SEC-109/112/113/118…123/126; SEC-108/109/114/118/119/126/130; SEC-108/114/118/125; SEC-102/108/109/111/112/118; SEC-111/127/128 | TEST-141…TEST-144 | Release 1 |
| Safe extensibility | BR-039, BR-040 | FR-178…FR-198, NFR-017 | UC-031 | AI review | US-031 | AC-145…AC-149 | API-127…129; API-001…014 | DB-098/108…111 + authorized source records; DB-001…008/098 | SEC-104/107/114/118/130…132; SEC-101…110/118 | TEST-145…TEST-149 | MVP; DB-108…111 reserved, not implemented |
| Safe extensibility | BR-035, BR-039 | FR-178…FR-184 | UC-032 | WF-004 | US-032 | AC-150…AC-153 | API-127…129; API-039…052 | DB-098/108…111 + authorized source records; DB-022…027 | SEC-104/107/114/118/130…132; SEC-109/112/113/118…123/126 | TEST-150…TEST-153 | Release 2; DB-108…111 reserved |
| Safe extensibility | BR-009…BR-011, BR-039 | FR-185…FR-188 | UC-033 | WF-009 | US-033 | AC-154…AC-157 | API-127…129; API-053…061 | DB-098/108…111 + authorized source records; DB-028…033 | SEC-104/107/114/118/130…132; SEC-108/109/114/118/119/126/130 | TEST-154…TEST-157 | Release 2; DB-108…111 reserved |
| Opportunity/investment | BR-003…BR-007, BR-039 | FR-189…FR-191 | UC-034 | WF-002 | US-034 | AC-158…AC-161 | API-127…129; API-026…033; API-062…066 | DB-098/108…111 + authorized source records; DB-014…016; DB-034…040 | SEC-104/107/114/118/130…132; SEC-105/107/111/118; SEC-108/109/114/118/119 | TEST-158…TEST-161 | Release 2; DB-108…111 reserved |
| Safe extensibility | BR-032, BR-034, BR-039 | FR-192…FR-194 | UC-035 | Meeting review | US-035 | AC-162…AC-165 | API-127…129; API-017…025/API-034…038/API-130…136; API-039…052 | DB-098/108…111 + authorized source records; DB-009…021/065…068; DB-022…027 | SEC-104/107/114/118/130…132; SEC-105…111/118; SEC-109/112/113/118…123/126 | TEST-162…TEST-165 | Release 2; DB-108…111 reserved |
| COD-to-O&M continuity | BR-023…BR-026, BR-039 | FR-195…FR-197 | UC-036 | WF-023 | US-036 | AC-166…AC-169 | API-127…129; API-039…052; API-098…105 | DB-098/108…111 + authorized source records; DB-022…027; DB-073…078 | SEC-104/107/114/118/130…132; SEC-109/112/113/118…123/126; SEC-102/108/109/111/112/118 | TEST-166…TEST-169 | Release 2; DB-108…111 reserved |
| COD-to-O&M continuity | BR-028, BR-032, BR-039, BR-040 | FR-198, NFR-016, NFR-017 | UC-037 | Future pilot review | US-037 | AC-170…AC-173 | API-127…129; API-017…025/API-034…038/API-130…136; API-074/075/API-121/125 | DB-098/108…111 + authorized source records; DB-009…021/065…068; DB-079…083/089…092 | SEC-104/107/114/118/130…132; SEC-105…111/118; SEC-111/127/128 | TEST-170…TEST-173 | Future; DB-108…111 reserved |

### 2.1 US-003 exact trace and readiness boundary

| Relationship | Upstream/behavior | API/DB | Verification | Status boundary |
|---|---|---|---|---|
| Direct implementation contract | BR-018/032; FR-016…021; UC-003; WF-003; US-003; AC-010…013 | API-023/024/034…037/140…142; DB-012/017…021/101/105 | TEST-010…013 plus TEST-185/187/189/190/193…196 and SEC negative tests | Core Implemented/deployed; unit/static evidence pass; full runtime/story Pass chưa claim |
| Operational dependency | AC-013 committed alert delivery, retry, duplicate suppression and DLQ | DB-102 Outbox; DB-103 ConsumerCheckpoint; DB-104 CommandReceipt | TEST-180/185/194/196 | M1 Approved/Planned; AC-013 end-to-end cannot Pass before execution evidence |
| Change-control dependency | AC-012 positive rebaseline requires approved same-scope/current-baseline schedule change | API-150…156/159; DB-067; US-004 public ApprovedChangeReader | TEST-012 plus TEST-016 | Dependency, not US-003 direct ownership; implementation starts only after US-004 M2 evidence |
| Downstream consumption | Command Center/report reads schedule state and alert projection | Existing downstream APIs/read models, no new direct schedule command | TEST-005…009/013 as applicable | Does not broaden US-003 implementation scope or imply US-002 Implemented |

### 2.2 US-004 exact trace and readiness boundary

| Relationship | Upstream/behavior | API/DB | Verification | Status boundary |
|---|---|---|---|---|
| Direct implementation contract | BR-022/031/032; FR-098…102 plus subset FR-104; UC-004; WF-015/021; US-004; AC-014…017 | API-038/143…158 plus API-159 reverse trace; DB-065…067/112/098/102…105 | TEST-014…017 plus NFR/security ranges | Approved/Build-ready; no execution claim |
| Schedule dependency/consumer | Change assessment references DB-020; approved DB-067 is read through public contract; reverse trace remains Project Controls-owned | API-034…037/140/159; DB-020 | TEST-012/016 | Positive path owned jointly by US-004 M2 and US-003 M4 |
| Claim dependency | FR-103 Claim/Variation needs Contract/Legal physical aggregate/authority/privilege | DB-068/028…033 and future concrete API | Future Claim/Contract tests | Documented dependency; not US-004 AC implementation claim |
| External early-warning dependency | FR-105 source adapters need delivery/obligation/NCR/punch modules | Future committed source events; DB-102/103 | Source-story integration tests | US-004 emits/consumes stable events additively; source modules not claimed |

### 2.3 Operational foundation cross-cutting trace

| Requirement/ADR | Story/capability impact | Data/API | Security/Test | EC2 test status | Production status |
|---|---|---|---|---|---|
| ADR-004/006; NFR-007; BR-001/031/034/040 | Foundation cho US-001/003/016/021/022/023/028 | DB-098 + DB-102/103; API-001…139 mutation contract | TEST-180; SEC-118/122/125 | Approved/Planned | Proposed |
| NFR-012; SEC-122 | Generic command idempotency | DB-104; operation-level `Idempotency-Key`, request hash và stable result | TEST-180/185 | Approved/Planned | Retention/capacity TBD |
| SEC-103/118; US-020 | Shared login quota/session dependency | Redis rate-limit state; không tạo API mới | TEST-200/231 | Approved/Planned, fail closed | Redis HA/persistence TBD |
| ADR-002/004; SEC-105…111 | Database tenant reference invariant | Composite `(tenant_id, referenced_id)` FK; không đổi public API | TEST-202…208 | Approved/Planned | Topology/RLS TBD |
| NFR-021/023; ADR-001 | API/worker runtime + main CI/CD contract | PostgreSQL + Redis + BullMQ; worker process/container riêng; self-hosted workflow + SHA image rollout | TEST-194/196 và operational smoke | Runtime deployed; CI/CD repository implementation, first GitHub run Pending | Registry/HA/SLO Proposed |
| BR-040; NFR-007/023; SEC-124; US-024 | Controlled EC2 test delivery | `.github/workflows/main-cicd.yml`; `scripts/deploy-ec2.sh`; không đổi DB/API | TEST-196; TEST-221 subset | Implemented; runner online, first GitHub CI/CD run Pass; branch protection follow-up | Full supply-chain/production Proposed |
| US-003 | Schedule contract | DB-101 + schedule-alert subset DB-105; API-023/024/034…037/140…142 | TEST-010…013 written; final runtime execution pending | Core Implemented/deployed, story not fully Pass | Proposed |
| US-022/023/031…037 | ID stability only | DB-106…111 reserved; phần Notification ngoài schedule của DB-105 thuộc US-022 | ID/link audit; feature TEST giữ Draft | Documented/Not implemented | Proposed |

## 3. Business Requirement coverage

| Business Goal | BR | Source | Requirement title | UC/US coverage | Test/release evidence |
|---|---|---|---|---|---|
| Single source and PM control | BR-001 | REQ-01 | Quản trị portfolio và nhiều tổ chức trên một nguồn dữ liệu | UC-001/US-001, UC-016/US-016, UC-023/US-023, UC-030/US-030 | TEST-001…TEST-004, TEST-073…TEST-078, TEST-108…TEST-112, TEST-141…TEST-144; MVP/Release 1 |
| Opportunity/investment decision | BR-002 | REQ-02 | Quản lý pipeline cơ hội có owner và hành động tiếp theo | UC-025/US-025, UC-030/US-030 | TEST-117…TEST-121, TEST-141…TEST-144; Release 1 |
| Opportunity/investment decision | BR-003 | REQ-03 | Chuẩn hóa khảo sát site và điểm đấu nối | UC-005/US-005, UC-025/US-025, UC-026/US-026, UC-030/US-030, UC-034/US-034 | TEST-018…TEST-022, TEST-117…TEST-121, TEST-122…TEST-125, TEST-141…TEST-144 +1 ranges; MVP/Release 1/Release 2 |
| Opportunity/investment decision | BR-004 | REQ-04 | Quản lý hóa đơn điện và hồ sơ phụ tải có chất lượng dữ liệu | UC-025/US-025, UC-026/US-026, UC-030/US-030, UC-034/US-034 | TEST-117…TEST-121, TEST-122…TEST-125, TEST-141…TEST-144, TEST-158…TEST-161; Release 1/Release 2 |
| Opportunity/investment decision | BR-005 | REQ-05 | Quản lý phương án yield và sizing Solar có version | UC-025/US-025, UC-026/US-026, UC-027/US-027, UC-030/US-030, UC-034/US-034 | TEST-117…TEST-121, TEST-122…TEST-125, TEST-126…TEST-130, TEST-141…TEST-144 +1 ranges; Release 1/Release 2 |
| Opportunity/investment decision | BR-006 | REQ-06 | Quản lý sizing BESS theo use case và constraint | UC-025/US-025, UC-026/US-026, UC-027/US-027, UC-030/US-030, UC-034/US-034 | TEST-117…TEST-121, TEST-122…TEST-125, TEST-126…TEST-130, TEST-141…TEST-144 +1 ranges; Release 1/Release 2 |
| Opportunity/investment decision | BR-007 | REQ-07 | So sánh business case CAPEX/OPEX và hiệu quả đầu tư | UC-007/US-007, UC-025/US-025, UC-030/US-030, UC-034/US-034 | TEST-028…TEST-032, TEST-117…TEST-121, TEST-141…TEST-144, TEST-158…TEST-161; MVP/Release 1/Release 2 |
| Opportunity/investment decision | BR-008 | REQ-08 | Kiểm soát phiên bản proposal và investment gate | UC-015/US-015, UC-025/US-025, UC-030/US-030 | TEST-068…TEST-072, TEST-117…TEST-121, TEST-141…TEST-144; MVP/Release 1 |
| EPC execution and governance | BR-009 | REQ-09 | Quản lý hợp đồng và chuỗi phụ lục theo dự án | UC-005/US-005, UC-006/US-006, UC-030/US-030, UC-033/US-033 | TEST-018…TEST-022, TEST-023…TEST-027, TEST-141…TEST-144, TEST-154…TEST-157; MVP/Release 1/Release 2 |
| EPC execution and governance | BR-010 | REQ-10 | Quản lý nghĩa vụ, bảo lãnh, điều kiện tiên quyết và permit | UC-006/US-006, UC-030/US-030, UC-033/US-033 | TEST-023…TEST-027, TEST-141…TEST-144, TEST-154…TEST-157; MVP/Release 1/Release 2 |
| EPC execution and governance | BR-011 | REQ-11 | Bảo toàn pháp nhân, người ký và lịch sử phê duyệt văn bản | UC-005/US-005, UC-006/US-006, UC-015/US-015, UC-019/US-019, UC-021/US-021, UC-030/US-030 +1 chains | TEST-018…TEST-022, TEST-023…TEST-027, TEST-068…TEST-072, TEST-088…TEST-092 +3 ranges; MVP/Release 1/Release 2 |
| EPC execution and governance | BR-012 | REQ-12 | Quản lý deliverable thiết kế, BOM, review, revision và RFI/TQ | UC-005/US-005, UC-026/US-026, UC-030/US-030 | TEST-018…TEST-022, TEST-122…TEST-125, TEST-141…TEST-144; MVP/Release 1 |
| EPC execution and governance | BR-013 | REQ-13 | Truy vết danh mục thiết bị Solar | UC-026/US-026, UC-030/US-030 | TEST-122…TEST-125, TEST-141…TEST-144; Release 1 |
| EPC execution and governance | BR-014 | REQ-14 | Quản lý cấu trúc, auxiliary, safety và point list BESS | UC-026/US-026, UC-027/US-027, UC-030/US-030 | TEST-122…TEST-125, TEST-126…TEST-130, TEST-141…TEST-144; Release 1 |
| EPC execution and governance | BR-015 | REQ-15 | Kiểm soát sourcing từ nhu cầu đến PO/hợp đồng mua | UC-007/US-007, UC-008/US-008, UC-015/US-015, UC-017/US-017, UC-030/US-030 | TEST-028…TEST-032, TEST-033…TEST-037, TEST-068…TEST-072, TEST-079…TEST-083 +1 ranges; MVP/Release 1 |
| EPC execution and governance | BR-016 | REQ-16 | Theo dõi sản xuất, FAT và bộ chứng từ logistics | UC-008/US-008, UC-030/US-030 | TEST-033…TEST-037, TEST-141…TEST-144; MVP/Release 1 |
| EPC execution and governance | BR-017 | REQ-17 | Quản lý vận chuyển, giao nhận, serial, warranty và rủi ro chậm | UC-008/US-008, UC-026/US-026, UC-030/US-030 | TEST-033…TEST-037, TEST-122…TEST-125, TEST-141…TEST-144; MVP/Release 1 |
| EPC execution and governance | BR-018 | REQ-18 | Quản lý WBS, baseline, look-ahead và khối lượng | UC-003/US-003, UC-009/US-009, UC-030/US-030 | TEST-010…TEST-013, TEST-038…TEST-042, TEST-141…TEST-144; MVP/Release 1 |
| EPC execution and governance | BR-019 | REQ-19 | Ghi nhận nhật ký, nguồn lực, vật tư và bằng chứng hiện trường | UC-005/US-005, UC-009/US-009, UC-030/US-030 | TEST-018…TEST-022, TEST-038…TEST-042, TEST-141…TEST-144; MVP/Release 1 |
| EPC execution and governance | BR-020 | REQ-20 | Kiểm soát PTW, HSE inspection, toolbox và incident | UC-009/US-009, UC-011/US-011, UC-030/US-030 | TEST-038…TEST-042, TEST-048…TEST-052, TEST-141…TEST-144; MVP/Release 1 |
| EPC execution and governance | BR-021 | REQ-21 | Kiểm soát ITP, inspection, NCR và punch | UC-010/US-010, UC-030/US-030 | TEST-043…TEST-047, TEST-141…TEST-144; MVP/Release 1 |
| EPC execution and governance | BR-022 | REQ-22 | Quản lý RFI, site instruction, variation và claim có thời hạn | UC-004/US-004, UC-006/US-006, UC-030/US-030 | TEST-014…TEST-017, TEST-023…TEST-027, TEST-141…TEST-144; MVP/Release 1 |
| EPC execution and governance | BR-023 | REQ-23 | Quản lý pre-commissioning, commissioning và test package | UC-010/US-010, UC-012/US-012, UC-013/US-013, UC-030/US-030, UC-036/US-036 | TEST-043…TEST-047, TEST-053…TEST-057, TEST-058…TEST-062, TEST-141…TEST-144 +1 ranges; MVP/Release 1/Release 2 |
| EPC execution and governance | BR-024 | REQ-24 | Quản lý test và performance acceptance Solar | UC-010/US-010, UC-012/US-012, UC-013/US-013, UC-026/US-026, UC-027/US-027, UC-030/US-030 +1 chains | TEST-043…TEST-047, TEST-053…TEST-057, TEST-058…TEST-062, TEST-122…TEST-125 +3 ranges; MVP/Release 1/Release 2 |
| EPC execution and governance | BR-025 | REQ-25 | Quản lý test an toàn, chức năng và hiệu suất BESS | UC-010/US-010, UC-011/US-011, UC-012/US-012, UC-013/US-013, UC-027/US-027, UC-030/US-030 +1 chains | TEST-043…TEST-047, TEST-048…TEST-052, TEST-053…TEST-057, TEST-058…TEST-062 +3 ranges; MVP/Release 1/Release 2 |
| COD-to-O&M continuity | BR-026 | REQ-26 | Quản lý COD gate và bàn giao số sang O&M | UC-005/US-005, UC-006/US-006, UC-010/US-010, UC-011/US-011, UC-013/US-013, UC-015/US-015 +3 chains | TEST-018…TEST-022, TEST-023…TEST-027, TEST-043…TEST-047, TEST-048…TEST-052 +5 ranges; MVP/Release 1/Release 2 |
| COD-to-O&M continuity | BR-027 | REQ-27 | Giám sát KPI vận hành Solar có provenance | UC-014/US-014, UC-026/US-026, UC-027/US-027, UC-029/US-029, UC-030/US-030 | TEST-063…TEST-067, TEST-122…TEST-125, TEST-126…TEST-130, TEST-136…TEST-140 +1 ranges; Release 1/MVP |
| COD-to-O&M continuity | BR-028 | REQ-28 | Giám sát BESS KPI, degradation và operating history | UC-014/US-014, UC-027/US-027, UC-029/US-029, UC-030/US-030, UC-037/US-037 | TEST-063…TEST-067, TEST-126…TEST-130, TEST-136…TEST-140, TEST-141…TEST-144 +1 ranges; Release 1/MVP/Future |
| COD-to-O&M continuity | BR-029 | REQ-29 | Quản lý alarm, work order, maintenance, spare, warranty và SLA | UC-014/US-014, UC-027/US-027, UC-030/US-030 | TEST-063…TEST-067, TEST-126…TEST-130, TEST-141…TEST-144; Release 1 |
| COD-to-O&M continuity | BR-030 | REQ-30 | Quản lý billing vận hành, đối soát meter và report bên ngoài | UC-006/US-006, UC-007/US-007, UC-014/US-014, UC-030/US-030 | TEST-023…TEST-027, TEST-028…TEST-032, TEST-063…TEST-067, TEST-141…TEST-144; MVP/Release 1 |
| Single source and PM control | BR-031 | REQ-31 | Cung cấp bộ module dùng chung tối thiểu xuyên vòng đời | UC-001/US-001, UC-004/US-004, UC-030/US-030 | TEST-001…TEST-004, TEST-014…TEST-017, TEST-141…TEST-144; MVP/Release 1 |
| Single source and PM control | BR-032 | REQ-32 | Điều hành dự án bằng PM Command Center và Health Score | UC-002/US-002, UC-003/US-003, UC-004/US-004, UC-011/US-011, UC-022/US-022, UC-023/US-023 +3 chains | TEST-005…TEST-009, TEST-010…TEST-013, TEST-014…TEST-017, TEST-048…TEST-052 +5 ranges; MVP/Release 1/Release 2/Future |
| Enterprise control | BR-033 | REQ-33 | Kiểm soát quyền đa tenant, đa pháp nhân và xung đột lợi ích | UC-007/US-007, UC-009/US-009, UC-016/US-016, UC-017/US-017, UC-018/US-018, UC-020/US-020 +2 chains | TEST-028…TEST-032, TEST-038…TEST-042, TEST-073…TEST-078, TEST-079…TEST-083 +4 ranges; MVP/Release 1 |
| Enterprise control | BR-034 | REQ-34 | Tự động hóa workflow phê duyệt có version và audit | UC-015/US-015, UC-017/US-017, UC-018/US-018, UC-021/US-021, UC-022/US-022, UC-030/US-030 +1 chains | TEST-068…TEST-072, TEST-079…TEST-083, TEST-084…TEST-087, TEST-098…TEST-102 +3 ranges; MVP/Release 1/Release 2 |
| Enterprise control | BR-035 | REQ-35 | Quản lý vòng đời tài liệu doanh nghiệp | UC-005/US-005, UC-019/US-019, UC-021/US-021, UC-030/US-030, UC-032/US-032 | TEST-018…TEST-022, TEST-088…TEST-092, TEST-098…TEST-102, TEST-141…TEST-144 +1 ranges; MVP/Release 1/Release 2 |
| Single source and PM control | BR-036 | REQ-36 | Cung cấp dashboard theo vai trò và báo cáo snapshot có kiểm soát | UC-023/US-023, UC-030/US-030 | TEST-108…TEST-112, TEST-141…TEST-144; MVP/Release 1 |
| Safe extensibility and experience | BR-037 | REQ-37 | Tích hợp hệ thống theo System of Record và đối soát | UC-028/US-028, UC-029/US-029, UC-030/US-030 | TEST-131…TEST-135, TEST-136…TEST-140, TEST-141…TEST-144; Release 1/MVP |
| Safe extensibility and experience | BR-038 | REQ-38 | Quản trị và triển khai AI hỗ trợ có kiểm soát | UC-022/US-022, UC-023/US-023, UC-030/US-030 | TEST-103…TEST-107, TEST-108…TEST-112, TEST-141…TEST-144; MVP/Release 1 |
| Safe extensibility and experience | BR-039 | REQ-39 | Cung cấp trải nghiệm doanh nghiệp đa vai trò và responsive | UC-030/US-030, UC-031/US-031, UC-032/US-032, UC-033/US-033, UC-034/US-034, UC-035/US-035 +2 chains | TEST-141…TEST-144, TEST-145…TEST-149, TEST-150…TEST-153, TEST-154…TEST-157 +4 ranges; Release 1/MVP/Release 2/Future |
| Safe extensibility and experience | BR-040 | REQ-40 | Bảo đảm nền tảng đa tenant an toàn, phục hồi được và không điều khiển OT | UC-014/US-014, UC-016/US-016, UC-019/US-019, UC-020/US-020, UC-021/US-021, UC-024/US-024 +6 chains | TEST-063…TEST-067, TEST-073…TEST-078, TEST-088…TEST-092, TEST-093…TEST-097 +8 ranges; Release 1/MVP/Future |

## 4. NFR, SEC and ADR direct trace

| Range | Upstream | Downstream verification | Coverage |
|---|---|---|---|
| NFR-001…024 | BR/ARC/SEC Source mappings in PRD | TEST-174…197 one-to-one | 24/24 |
| SEC-101…132 | BR/FR/NFR/API and Source SEC-001…008 | TEST-198…229 one-to-one | 32/32 |
| ADR-001…010 | ARC-001…010 | NFR/SEC/architecture evidence; TEST ranges where applicable | 10/10 Proposed; acceptance TBD |
| API-001…159 | Each x-related-requirements/data/security | OpenAPI x-api-id + API/contract/security tests | 159/159 have requirement; API-023/024/034…037/140…142 Implemented; API-038/143…159 concrete planned |
| DB-001…112 | Domain/BR/FR/NFR trace in dictionary/operational plan | API/OpenAPI, aggregate/internal relationship or explicit reservation | 112/112 referenced outside owner; DB-101 và schedule-alert subset DB-105 Implemented; DB-106…111 reserved; DB-112 planned |
| AC-001…177 | US-001…037/source GWT + approved auth delta | TEST-001…173 + TEST-230…233 | 177/177 mapped |

## 5. Automated gap audit result

| Check | Result | Evidence/interpretation |
|---|---:|---|
| Business Requirement without feature/story chain | 0 | Expanded UC/US BR mapping covers BR-001…040 |
| FR without User Story | 0 | Expanded US/UC mapping covers FR-001…198; US-030 covers lifecycle 001…177, AI stories cover 178…198 |
| User Story without AC | 0 | 37/37 stories have 173 total AC |
| AC without TEST | 0 | TEST-001…173 one-to-one |
| NFR without TEST | 0 | TEST-174…197 |
| SEC without TEST | 0 | TEST-198…229 |
| API without requirement | 0 | 140/140 x-related-requirements |
| DB entity/store unused outside Data Model | 0 | API reconciliation added Invoice, Warranty, MaintenancePlan, WarrantyClaim and BillingStatement associations |
| Duplicate canonical IDs | 0 | Exact range checks; Source SEC/WF/US IDs are explicitly distinct |
| Broken scope invariant | 0 known | PM/O&M/OT boundary and no-control consistent across SRS/API/Security/UX/Test |
| Deferred design gaps | 1 | RFI physical representation remains explicit TBD; DB-101/105 US-003 contract is build-ready but not implemented; DB-106…111 remain reserved |

Deferred does not mean silently complete:

- AI API currently references authorized source records + DB-098 audit; DB-108…111 reserve policy/run/proposal/review ownership, nhưng không tạo table hoặc tuyên bố feature implemented.
- DB-105 schedule-alert subset đã materialize cho US-003; notification types khác thuộc US-022. Saved view/report job DB-106/107 vẫn reserved cho slice sau.
- RFI is modeled as Document type + Workflow + optional Issue/Change link; Product/Engineering must confirm before schema/API detail.

## 6. Contradiction and reconciliation register

| Finding | Sources | Current treatment | Owner/decision needed |
|---|---|---|---|
| Baseline calls itself proposal while governance treats it as approved input | Baseline metadata vs AGENTS | Immutable source input; all derived docs Draft | Product Owner confirms approval status |
| Catalog MoSCoW/roadmap conflicts with broad F.2 ranges and omissions | Baseline C/F | PRD normalization 110 MVP/31 Post/10 Pilot/47 Future as Assumption | PO approves per feature |
| PRJ/CON/INT/AIX entries omitted or differently referenced in F.2 | Baseline catalog vs MVP table | Added according to feature-level source; preserved source labels | PO review |
| R1 versus GĐ1–5 terminology | Baseline roadmap | Derived docs use MVP/Release1/Release2/Future; source roadmap retained | PO/Delivery |
| Project lifecycle phase enum varies across sections | Baseline/Data/Workflow | Domain distinguishes phase and record status; exact enum TBD | PMO |
| Company vs LegalEntity | Baseline conceptual model | Company 0..n LegalEntity working assumption; signed ContractParty snapshot | Legal/Product/Data |
| Alarm versus AlarmEvent | Baseline terminology | AlarmEvent OT immutable; AlarmCase O&M local | O&M/OT confirms ack behavior |
| Incident naming collision | HSE/O&M | HSEIncident and ServiceIncident separate/link | HSE/O&M closure RACI |
| UAT ≥95% but no non-waivable set | Baseline/Test | Proposed ≥95% + 100% non-waivable; list TBD | PO/QA/Security/HSE |
| Health formula/threshold/hard-cap is proposal | Baseline/PRD/UX/Test | Consistent implementation spec, not approved target | PMO/PO |
| Legal/technical source applicability varies by project/effective date | Baseline sources | Versioned configuration and Legal/Engineer review; no hard-code | Legal/Technical Owners |
| API payload and physical technology incomplete | API/ADR | Generic command/TBD and Proposed ADR, not fabricated | Domain/Architecture |
| AI/supporting persistence từng chưa có dedicated DB ID | Domain/API/Data | Resolved về ID ownership: DB-105…111 reserved; physical implementation/retention vẫn theo future slice | AI/Data/Architecture/Product |

## 7. Cross-document consistency rules

- Canonical definitions remain in owner document; matrix does not redefine.
- Range notation is inclusive and must be expanded by tooling before import.
- If requirement meaning/phase changes, update owner document, CHANGELOG, backlog/test/matrix and decision register.
- A new API/DB/SEC/WF/US/AC/TEST ID must have upstream/downstream link and owner.
- Source two-digit WF-01…14 and US-E01…37, Source SEC-001…008 are not canonical formal IDs.
- Report/read model/search/cache do not create new business SoR.
- No matrix row can be used to authorize OT control.

## 8. Assumptions

| Assumption | Owner | Impact |
|---|---|---|
| Range expansion used here is valid inclusive mapping | Product/BA/QA | Coverage calculation |
| Broad lifecycle US-030 legitimately traces FR-001…177 | Product Owner | Feature-to-story coverage |
| AI stories collectively trace FR-178…198 | AI/Product | AI coverage |
| Aggregate APIs may use child DB entities without dedicated endpoint | Architecture/Domain | Entity usage |
| DB-101 và schedule-alert subset DB-105 build-ready không đồng nghĩa table/feature đã triển khai; DB-106…111 chỉ là reservation | Data/Architecture/Product | Schema/readiness reporting |
| All artefacts remain Draft v0.1 | Product Owner | Approval/readiness |

## 9. Open Questions

| Open Question | Owner | Blocks |
|---|---|---|
| Approve baseline status and release normalization? | Product Owner | Trace baseline |
| Confirm exact feature-to-story split beyond broad module ranges? | Product/Delivery | Backlog refinement |
| Decide RFI physical representation và production retention/capacity cho DB-102…111 ngoài các default/range US-003 đã duyệt? | Data/Architecture/Domain/SRE | RFI final Data/API và production acceptance; không chặn US-003 build start |
| Project lifecycle/state enums approved for US-001; other aggregate enums remain Open | Process Owners | Later Workflow/API/test |
| Company–LegalEntity approved for US-001; Alarm/Incident taxonomy remains Open | Legal/O&M/HSE | Later data migration |
| Confirm non-waivable tests and UAT rule? | PO/QA/Security/HSE | Release |
| Confirm legal/technical applicability and effective dates? | Legal/Engineers | Config/UAT |
| Backlog/trace import tool and range syntax? | Delivery/QA | Operationalization |

## 10. Changelog

| Version | Date | Author | Change | Scope impact |
|---|---|---|---|---|
| 0.1 | 2026-07-11 | Codex | Tạo end-to-end matrix, 40-BR coverage and gap/contradiction audit | No scope change; deferred items explicit |
| 0.2 | 2026-07-11 | Codex | Mở rộng trace cho WF-026, DB-099…100, API-137…139, AC-174…177 và TEST-230…233 | Base auth slice approved; platform còn lại Draft |
| 0.3 | 2026-07-11 | Codex | Thu hẹp exact implementation trace và ghi Approved/In Progress cho US-001 | Không đánh dấu TEST-001…004 pass trước execution |
| 0.4 | 2026-07-11 | Codex | Ghi end-to-end implementation/test/deploy evidence cho US-001 | TEST-001…004 pass; ranges ngoài US-001 giữ Draft |
| 0.5 | 2026-07-11 | Codex | Cấp trace DB-101…111 và operational foundation DB-102…104/composite-FK/Redis-worker cho EC2 test | Foundation Approved/Planned; reserved IDs không được đánh dấu implemented; production Proposed |
| 0.6 | 2026-07-11 | Codex | Khóa exact direct/dependency trace cho US-003, cấp API-140 và cụ thể hóa DB-101/schedule-alert DB-105 | Approved/Build-ready; chưa Implemented/Pass, dependency AC-012/013 giữ explicit |
| 0.7 | 2026-07-12 | Codex | Thêm API-141 và ghi evidence core US-003/operational deployment đúng mức | Core Implemented/deployed; không claim full TEST-010…013 hoặc positive AC-012 trước runtime/US-004 |
| 0.8 | 2026-07-12 | Codex | Thêm API-142 audited look-ahead export và Dashboard schedule alert lane vào direct US-003 trace | Core M3 surface complete hơn; full runtime/story Pass vẫn pending |
| 0.9 | 2026-07-12 | Codex | Khóa exact direct/dependency trace US-004, cấp DB-112/API-143…159 và nối public approved-change/reverse baseline trace | Approved/Build-ready; không claim US-004/Claim/test execution |
| 1.0 | 2026-07-12 | Codex | Thêm trace self-hosted main CI/CD EC2 test tới BR-040/NFR-007/023/SEC-124/US-024/TEST-196/221 | Repository implementation; first GitHub run và production supply chain chưa claim Pass |
