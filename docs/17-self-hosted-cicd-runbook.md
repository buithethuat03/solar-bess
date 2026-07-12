# Runbook — GitHub Actions self-hosted CI/CD cho EC2 test

> **Purpose:** Kết nối repository GitHub với EC2 test để push `main` chạy CI và deploy Docker Compose tự động.
> **Scope:** EC2 test duy nhất; không phải production, registry/IaC/SBOM/signing vẫn TBD.
> **Source:** `BR-040`, `NFR-007`, `NFR-021`, `NFR-023`, `SEC-124`, `ADR-001`, `TEST-196`, `TEST-221`, [DevOps](./14-devops-and-deployment.md) và [ExecPlan](../.agent/execplans/2026-07-12-main-self-hosted-cicd.md).
> **Version:** 0.1
> **Status:** Implemented in repository; runner registration/first GitHub run Pending
> **Owner:** Platform Engineering / repository owner
> **Updated:** 2026-07-12
> **Approval:** Người dùng yêu cầu trực tiếp cho EC2 test; production TBD

> **Current status (2026-07-12):** Local CI và deploy script pass; release `cicd-setup-20260712` healthy. OpenAPI còn 15 non-blocking warning; runner registration/first GitHub run Pending.

## 1. Runtime contract

- Workflow: `.github/workflows/main-cicd.yml`.
- Trigger: push `main` hoặc manual `workflow_dispatch`; không chạy code pull request/fork trên máy deploy.
- Runner labels bắt buộc: `self-hosted`, `linux`, `x64`, `solar-bess-deploy`.
- CI: `npm ci` → lint → typecheck → unit → integration với PostgreSQL/Redis disposable → OpenAPI lint → build.
- CD chỉ chạy sau CI: build `solar-bess-{api,worker,web}:<commit-sha>`, Compose project hiện hữu `solar_bess_web`, migration trong API startup, health và HTTP smoke.
- Config deploy đọc từ `/home/ec2-user/SOLAR_BESS_WEB/.env`; runtime secret files ở `RUNTIME_SECRETS_DIR`. Workflow không copy hoặc in secret.
- Rollback tag lại ba image đang chạy trước rollout. Nếu Compose/HTTP fail, script khôi phục image; migration không tự down và phải backward-compatible.

## 2. Đăng ký runner một lần

Trong GitHub, mở repository `buithethuat03/solar-bess` → **Settings → Actions → Runners → New self-hosted runner**, chọn Linux x64 và dùng đúng command GitHub sinh ra. Trên EC2, cài runner ngoài checkout ứng dụng, ví dụ `/home/ec2-user/actions-runner`; tại bước configure thêm label:

```bash
./config.sh --url https://github.com/buithethuat03/solar-bess --token '<one-time-token>' --labels solar-bess-deploy --name solar-bess-ec2-test --unattended
sudo ./svc.sh install ec2-user
sudo ./svc.sh start
sudo ./svc.sh status
```

Không commit/tokenize registration token. Token là one-time và do GitHub repository admin cấp. Runner user cần Node >=24, npm >=11, Git, curl, Docker Compose và quyền passwordless cho đúng Docker commands mà workflow/script dùng. Hiện user `ec2-user` thuộc group Docker nhưng daemon trên máy yêu cầu `sudo`; workflow fail closed nếu `sudo -n docker info` không được phép.

## 3. Preflight trên máy

```bash
test -r /home/ec2-user/SOLAR_BESS_WEB/.env
sudo test -s /tmp/solar-bess-secrets/postgres_user
sudo test -s /tmp/solar-bess-secrets/postgres_password
sudo test -s /tmp/solar-bess-secrets/database_url
sudo test -s /tmp/solar-bess-secrets/redis_password
sudo -n docker info
curl --fail http://127.0.0.1/web-health
curl --fail http://127.0.0.1/health
```

Nếu `.env` đặt `RUNTIME_SECRETS_DIR` khác `/tmp/solar-bess-secrets`, kiểm tra đúng path đó. Không hiển thị nội dung file.

## 4. GitHub governance

1. Tạo environment `ec2-test`; production environment riêng nếu sau này được phê duyệt.
2. Chạy workflow manual lần đầu và xác nhận cả `CI` lẫn `Deploy EC2 test` xanh.
3. Bật branch protection/ruleset cho `main`: yêu cầu pull request và required status check `CI`; cấm force push/deletion; review/SoD cụ thể còn TBD repository owner.
4. Không bật trigger `pull_request` cho self-hosted deploy runner. Nếu cần PR CI, dùng runner tách biệt không có Docker socket/deploy config.

## 5. Vận hành và recovery

Kiểm tra release/container:

```bash
sudo docker compose --project-name solar_bess_web --env-file /home/ec2-user/SOLAR_BESS_WEB/.env ps
cat /home/ec2-user/SOLAR_BESS_WEB/.deploy/current-release
curl --fail http://127.0.0.1/health
```

Workflow dùng concurrency và `/tmp/solar-bess-deploy.lock`, nên không có hai rollout đồng thời. Khi automatic rollback cũng lỗi, dừng push, giữ volumes, xem `sudo docker compose ... logs --tail=200 api worker web` và thực hiện forward-fix/recovery. Không chạy `down --volumes` với project `solar_bess_web`.

## 6. Assumption, TBD và Open Question

- **Assumption:** runner service chạy dưới `ec2-user`, dedicated cho repository tin cậy và có label đúng.
- **Assumption:** `.env` cùng runtime secrets hiện tại là config EC2 test canonical.
- **TBD:** branch protection/reviewer/SoD do repository admin bật sau first run.
- **Open Question:** registry, immutable digest promotion, SBOM/signing/provenance, SAST/DAST, production TLS/HA/IaC và approval profile.
