# Digital Forensic Investigation Platform (DFIP) — Backend API

Enterprise-grade NestJS backend for managing digital forensic investigations with court-admissible evidence handling.

## 📐 Architecture

```
dfip-platform/
├── backend/                    # NestJS API server
│   ├── src/
│   │   ├── main.ts            # Entry point
│   │   ├── app.module.ts      # Root module
│   │   ├── common/            # Shared infrastructure
│   │   │   ├── prisma/        # Database client (global)
│   │   │   ├── redis/         # Redis client (global)
│   │   │   ├── minio/         # Object storage (global)
│   │   │   ├── health/        # Health check endpoint
│   │   │   ├── guards/        # JWT + Roles guards
│   │   │   └── decorators/    # @Public, @Roles, @GetUser
│   │   ├── modules/
│   │   │   ├── auth/          # Login, register, 2FA, refresh
│   │   │   ├── users/         # User management
│   │   │   ├── cases/         # Case CRUD + assignment
│   │   │   ├── evidence/      # Upload + AES-256-GCM + hashing
│   │   │   ├── custody/       # Hash-chained audit trail
│   │   │   ├── imaging/       # BullMQ disk imaging jobs
│   │   │   ├── artifacts/     # Browser, USB, registry extraction
│   │   │   ├── timeline/      # Merged chronological events
│   │   │   ├── reports/       # PDF/JSON/CSV export
│   │   │   └── audit/         # Central immutable audit log
│   │   ├── utils/
│   │   │   ├── crypto.util.ts     # AES-256-GCM + multi-hash
│   │   │   ├── jwt.util.ts        # Token sign/verify
│   │   │   └── audit-chain.util.ts # Hash chain verification
│   │   └── workers/
│   │       └── imaging.worker.ts  # BullMQ worker process
│   └── prisma/
│       ├── schema.prisma      # 11 models + enums
│       └── seed.ts            # Demo data
├── docker-compose.yml         # Full stack orchestration
└── nginx.conf                 # Reverse proxy
```

## 🚀 Quick Start

### Prerequisites
- Docker Engine 24+
- Docker Compose v2

### 1. Configure environment
```bash
cp backend/.env.example .env
# Edit .env: set JWT secrets, encryption key, passwords
```

### 2. Generate a strong encryption key
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy the output → ENCRYPTION_KEY in .env
```

### 3. Launch the platform
```bash
docker-compose up -d --build
```

### 4. Run database migrations + seed
```bash
docker exec dfip-backend npx prisma migrate deploy
docker exec dfip-backend npm run prisma:seed
```

### 5. Access
| Service | URL |
|---------|-----|
| Frontend | http://localhost:7000 |
| API (via Nginx) | http://localhost:7000/api/v1 |
| Swagger Docs | http://localhost:5000/api/docs |
| MinIO Console | http://localhost:9001 |

---

## 👥 Default Credentials (seed)
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@forensics.io | Admin@123456 |
| Investigator | investigator@forensics.io | Invest@123456 |
| Analyst | analyst@forensics.io | Analyst@123456 |
| Auditor | auditor@forensics.io | Auditor@123456 |

---

## 🔐 Authentication

All protected endpoints require `Authorization: Bearer <access_token>`.

| Endpoint | Method | Access | Description |
|----------|--------|--------|-------------|
| `/api/v1/auth/register` | POST | Public | Register new user |
| `/api/v1/auth/login` | POST | Public | Login (+ optional TOTP) |
| `/api/v1/auth/refresh` | POST | Public | Refresh access token |
| `/api/v1/auth/logout` | POST | Authenticated | Logout + revoke token |
| `/api/v1/auth/me` | GET | Authenticated | Current user |
| `/api/v1/auth/2fa/generate` | POST | Authenticated | Generate 2FA QR code |
| `/api/v1/auth/2fa/enable` | POST | Authenticated | Enable 2FA |
| `/api/v1/auth/change-password` | POST | Authenticated | Change password |

## 📁 Cases

| Endpoint | Method | Roles | Description |
|----------|--------|-------|-------------|
| `/api/v1/cases` | POST | Admin, Investigator | Create case |
| `/api/v1/cases` | GET | All | List cases (paginated) |
| `/api/v1/cases/:id` | GET | All | Case details |
| `/api/v1/cases/:id/summary` | GET | All | Case stats summary |
| `/api/v1/cases/:id` | PATCH | Admin, Investigator | Update case |
| `/api/v1/cases/:id/close` | PATCH | Admin, Investigator | Close case |
| `/api/v1/cases/:id/assign` | POST | Admin | Assign investigator |
| `/api/v1/cases/:id/members` | POST | Admin, Investigator | Add case member |

## 🔍 Evidence

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/cases/:caseId/evidence/upload` | POST | Upload file (multipart) — AES-256-GCM + MD5/SHA1/SHA256/SHA512 |
| `/api/v1/cases/:caseId/evidence` | GET | List evidence |
| `/api/v1/cases/:caseId/evidence/:id` | GET | Evidence details + custody chain |
| `/api/v1/cases/:caseId/evidence/:id/hashes` | GET | Hash values |
| `/api/v1/cases/:caseId/evidence/:id/verify` | PATCH | Mark as verified |

## 🔗 Chain of Custody

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/evidence/:evidenceId/custody` | GET | Full custody chain |
| `/api/v1/evidence/:evidenceId/custody/verify` | GET | Tamper detection |

## 💿 Imaging

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/imaging` | POST | Create disk imaging job |
| `/api/v1/imaging` | GET | List jobs |
| `/api/v1/imaging/:id` | GET | Job details |
| `/api/v1/imaging/:id/progress` | GET | Real-time progress |
| `/api/v1/imaging/:id/pause` | PATCH | Pause job |
| `/api/v1/imaging/:id/resume` | PATCH | Resume job |

## 🧩 Artifacts

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/cases/:caseId/artifacts/extract` | POST | Extract artifacts (type: `BROWSER_HISTORY`, `USB_LOG`, `REGISTRY_HIVE`, `EVENT_LOG`, `PREFETCH`, `NETWORK_CAPTURE`) |
| `/api/v1/cases/:caseId/artifacts` | GET | List artifacts (filter by `?type=`) |
| `/api/v1/cases/:caseId/artifacts/:id` | GET | Artifact detail |

## ⏱ Timeline

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/cases/:caseId/timeline` | GET | Merged timeline (filter: `?type=FILE\|USB\|NETWORK\|REGISTRY\|PROCESS`, `?from=`, `?to=`, `?minCorrelation=`) |
| `/api/v1/cases/:caseId/timeline/event` | POST | Add manual event |
| `/api/v1/cases/:caseId/timeline/synthesize` | POST | Auto-generate from artifacts |

## 📄 Reports

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/cases/:id/export` | GET | PDF report (case + hashes + custody + timeline + key findings) |
| `/api/v1/cases/:id/export/json` | GET | Full JSON report |
| `/api/v1/cases/:id/export/csv` | GET | Timeline CSV |

## 📋 Audit

| Endpoint | Method | Roles | Description |
|----------|--------|-------|-------------|
| `/api/v1/audit/logs` | GET | Admin, Auditor | Paginated audit log |
| `/api/v1/audit/verify-chain` | GET | Admin, Auditor | Verify audit hash chain integrity |

## 🏥 Health

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/health` | DB + Redis connectivity + uptime |

---

## 🔒 Security Features

| Feature | Implementation |
|---------|---------------|
| Password hashing | bcrypt (12 rounds) |
| Access token | JWT, 15 min expiry |
| Refresh token | JWT (7d), stored as bcrypt hash in DB |
| Token revocation | `tokenVersion` counter — increment → all tokens invalid |
| 2FA | TOTP (RFC 6238) via `otplib`, QR code endpoint |
| Account lockout | Max 5 failed logins → 15 min lockout |
| IP restriction | Per-user IP whitelist |
| Evidence encryption | AES-256-GCM with random IV per file |
| Chain of custody | SHA-256 hash chain — tamper-evident |
| Audit log | SHA-256 hash chain across all log entries |
| Rate limiting | Nginx (5 req/min auth) + NestJS ThrottlerGuard |
| Security headers | Helmet (X-Frame-Options, CSP, HSTS, etc.) |

## 🧪 Development

```bash
# Start dev server
cd backend && npm run start:dev

# Run migrations
npx prisma migrate dev --name init

# Open Prisma Studio
npx prisma studio

# Start imaging worker
npm run start:worker
```
