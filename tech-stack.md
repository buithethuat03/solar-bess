Tech stack chính thức của dự án Solar BESS:

## Kiến trúc

* Monorepo dùng npm workspaces.
* Modular monolith.
* REST API.
* Chưa dùng microservices, Kubernetes, Kafka hoặc event sourcing.
* Docker Compose cho local development và deployment giai đoạn đầu.

## Frontend

* Vue 3.
* TypeScript.
* Vite.
* Vue Router.
* Pinia cho auth, user, tenant và UI state.
* TanStack Query for Vue cho server state và API cache.
* Element Plus làm UI component library.
* ECharts cho dashboard và biểu đồ Solar/BESS.
* Vue I18n cho đa ngôn ngữ.
* Vitest cho unit test.
* Playwright cho end-to-end test.

Không dùng Nuxt vì đây là ứng dụng quản trị sau đăng nhập, không yêu cầu SEO.

## Backend

* NestJS.
* TypeScript.
* REST API.
* OpenAPI/Swagger.
* TypeORM theo Data Mapper.
* Jest và Supertest.
* API và worker chạy thành hai process/container riêng nhưng dùng chung codebase.

Các module chính:

* auth
* tenant
* user
* portfolio
* project
* task
* milestone
* risk
* issue
* document
* workflow
* approval
* asset
* maintenance
* telemetry
* reporting
* search
* audit

## Database

* PostgreSQL là nguồn dữ liệu chính.
* UUID cho public identifier.
* Tất cả bảng nghiệp vụ multi-tenant phải có tenant_id.
* Dữ liệu nghiệp vụ chính phải được thiết kế relational.
* jsonb chỉ dùng cho metadata, cấu hình và payload linh hoạt.
* Không lưu file binary trong PostgreSQL.
* Không lưu raw telemetry tần suất cao trong PostgreSQL OLTP.
* Có thể thêm Row-Level Security sau khi authorization cơ bản ổn định.

## Cache và background job

* Redis.
* BullMQ.
* Transactional outbox.

Dùng worker cho:

* xử lý file;
* lập chỉ mục Elasticsearch;
* gửi notification;
* tạo report;
* xử lý các job bất đồng bộ.

## File storage

* MinIO trong local/self-hosted.
* Có thể thay bằng S3-compatible object storage khi deploy production.
* PostgreSQL chỉ lưu metadata và object key.

## Search

* Elasticsearch là search engine chính.
* Kibana dùng để quản trị, debug mapping và kiểm tra query.
* PostgreSQL vẫn là source of truth.
* Elasticsearch chỉ là search read model.
* Vue không được gọi trực tiếp Elasticsearch; mọi search request phải qua NestJS.
* Search request bắt buộc filter theo tenant_id và quyền project.
* Dữ liệu đồng bộ sang Elasticsearch qua transactional outbox và BullMQ worker.
* Phải có command reindex toàn bộ dữ liệu.
* Dùng alias để version index.
* Không tạo một index riêng cho mỗi tenant trong giai đoạn đầu.

Các index ban đầu:

* solar-bess-entities-v1
* solar-bess-documents-v1

Alias:

* solar-bess-entities
* solar-bess-documents

## Document processing

Pipeline:

Upload file
→ lưu MinIO
→ tạo BullMQ job
→ trích xuất text bằng Apache Tika
→ OCR nếu cần
→ lập chỉ mục Elasticsearch

Không lưu file binary hoặc Base64 trong Elasticsearch.

## Telemetry

MVP chỉ lưu dữ liệu aggregate như:

* hourly energy;
* daily energy;
* monthly energy;
* state of charge;
* availability;
* performance KPI;
* alarm summary.

Chưa dùng TimescaleDB hoặc ClickHouse trong MVP.

Chỉ thêm TimescaleDB hoặc ClickHouse khi đã có số liệu thật về:

* số site;
* số tag;
* tần suất lấy mẫu;
* retention;
* khối lượng query.

## Authentication và authorization

* JWT access token.
* Refresh token.
* Argon2 hoặc bcrypt.
* RBAC.
* Tenant-scoped authorization.
* Project-scoped authorization.
* Luôn kiểm tra quyền lại bằng PostgreSQL khi user mở hoặc tải tài liệu từ kết quả search.

## Monorepo

Cấu trúc dự kiến:

solar-bess/
├── apps/
│   ├── web/
│   ├── api/
│   └── worker/
├── packages/
│   ├── contracts/
│   ├── shared/
│   └── config/
├── package.json
├── package-lock.json
├── docker-compose.yml
└── docs/

Package manager bắt buộc:

* npm;
* npm workspaces;
* package-lock.json;
* npm ci trong CI.

Không dùng pnpm, Nx hoặc Turborepo ở giai đoạn đầu.

## DevOps

* Docker.
* Docker Compose.
* Nginx hoặc Caddy.
* GitHub Actions.

Các container:

* web;
* api;
* worker;
* postgres;
* redis;
* minio;
* elasticsearch;
* kibana;
* nginx.

Pipeline CI:

* npm ci
* npm run lint
* npm run typecheck
* npm run test
* npm run build

## Nguyên tắc triển khai

* Xây theo từng vertical slice từ frontend đến API, database và test.
* Không cố xây toàn bộ hệ thống trong một prompt.
* Không bắt đầu Elasticsearch trước khi core project, document và worker ổn định.
* Elasticsearch được tích hợp sau Document Management và transactional outbox.
* Không tự ý thay đổi tech stack nếu chưa có lý do kỹ thuật rõ ràng.
* Không thêm công nghệ ngoài danh sách trên nếu chưa được yêu cầu.
* Ưu tiên code đơn giản, có test và dễ review hơn abstraction phức tạp.

Stack cuối cùng:

Vue 3 + TypeScript + Vite
NestJS + TypeORM
PostgreSQL
Redis + BullMQ
MinIO
Elasticsearch + Kibana
npm workspaces
Docker Compose
GitHub Actions
Vitest + Jest + Supertest + Playwright
