# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

## Project Overview

Ruinos is a lightweight Remote Monitoring and Management (RMM) system built on Cloudflare Workers. It uses a three-tier architecture:

- **Server**: Cloudflare Workers (TypeScript) providing REST API and WebSocket sessions
- **Agent**: Rust cross-platform client for managed devices
- **Console**: React + TypeScript web management interface

## Common Development Commands

### Root-level Commands

```bash
# Development
npm run dev:server          # Start server (Wrangler dev)
npm run dev:console         # Start console (Vite dev)

# Building
npm run build:server        # Build server
npm run build:console       # Build console
npm run build:agent         # Build agent (Rust)

# Testing
npm test                    # Run all workspace tests
npm run test:e2e:hybrid     # E2E tests (local runtime + remote resources)
npm run test:integration:cloud  # Cloud integration tests

# Deployment
npm run deploy:test         # Deploy to test environment
npm run deploy:prod         # Deploy to production
```

### Server Commands (cd server)

```bash
npm run dev                 # Start local dev server (wrangler dev --local)
npm run dev:remote          # Dev with remote bindings
npm test                    # Run unit tests
npm run test:watch          # Watch mode testing
npm run type-check          # TypeScript type checking

# Database migrations
npm run db:migrate          # Apply migrations (local)
npm run db:migrate:test     # Apply to test environment
npm run db:migrate:prod     # Apply to production
npm run db:apply            # Execute SQL directly (local D1)
```

### Agent Commands (cd agent)

```bash
cargo build                 # Build agent
cargo build --release       # Production build
cargo test                  # Run tests
cargo run                   # Run agent locally
RUST_LOG=debug cargo run    # Run with debug logging
```

### Console Commands (cd console)

```bash
npm run dev                 # Start Vite dev server
npm run build               # Production build
npm run build:strict        # Build with strict TypeScript checks
npm test                    # Run tests
npm run test:watch          # Watch mode testing
npm run type-check          # TypeScript type checking
npm run lint                # ESLint check
```

## Architecture Overview

### Server Architecture (server/src/)

**Entry Point**: [index.ts](server/src/index.ts) - Main Worker handler with secrets validation and CORS

**Core Structure**:
- `api/` - REST API layer
  - `routes.ts` - Route definitions (public, agent, admin APIs)
  - `handlers/` - Request handlers for each endpoint
  - `utils/` - Database helpers, crypto utilities
- `config/` - Environment configuration and secrets management
- `database/` - D1 schema types and query helpers
- `storage/` - Durable Objects for WebSocket sessions
- `middleware/` - Authentication (JWT), CORS
- `monitoring/` - Health checks, metrics, deployment rollback detection

**API Categories**:
- Public API: `/health/*`, `/ping` (no auth)
- Agent API: `/agent/*` (Ed25519 signature verification)
- Admin API: `/admin/*`, `/devices/*`, `/sessions/*`, etc. (JWT token auth)

**Key Technologies**:
- itty-router for routing
- Cloudflare D1 (SQLite) for database
- Cloudflare KV for caching
- Cloudflare R2 for file storage
- Durable Objects for stateful WebSocket sessions
- tweetnacl for Ed25519 crypto

### Agent Architecture (agent/src/)

**Entry Point**: [main.rs](agent/src/main.rs) - Agent initialization and runtime

**Core Modules** (agent/src/core/):
- `mod.rs` - Main Agent struct and initialization
- `enrollment.rs` - Device registration with Ed25519 keypair generation
- `heartbeat.rs` - Periodic heartbeat with MAC address identity
- `protocol.rs` - Task protocol definitions
- `crypto.rs` - Ed25519 signing and verification
- `state.rs` - In-memory state management (MAC-based identity, no persistence)
- `scheduler.rs` - Task scheduling
- `command.rs` - Command execution
- `audit.rs` - Audit log collection
- `files.rs` - File operations

**Platform Abstraction** (agent/src/platform/):
- Trait-based platform abstraction for Windows/Linux/macOS
- Conditional compilation for platform-specific code

**Transport Layer** (agent/src/transport/):
- HTTP client with DoH, ECH, strict TLS verification
- WebSocket support for real-time sessions

**Important**: The agent uses **memory-only** client identity. Device credentials are not persisted. MAC address is used as the stable identifier.

### Console Architecture (console/src/)

**Entry Point**: [main.tsx](console/src/main.tsx) - React app entry

**Structure**:
- `pages/` - Page components (Dashboard, Devices, Sessions, etc.)
- `components/` - Reusable UI components
- `contexts/` - React contexts (AuthContext, etc.)
- `hooks/` - Custom React hooks
- `lib/` - API client, utilities
- `types/` - TypeScript type definitions

**Key Libraries**:
- React 18 with TypeScript
- Tailwind CSS for styling
- React Router for navigation
- React Query for data fetching
- xterm.js for terminal emulation

## Important Patterns and Conventions

### Security Model

**Ed25519 Digital Signatures**: All agent-to-server communication is signed with Ed25519 keypairs
- Agent generates keypair during enrollment
- Public key stored in devices table
- Every request includes signature verification via `verifyEd25519Signature()` in [server/src/api/utils/crypto.ts](server/src/api/utils/crypto.ts)

**Admin Authentication**: JWT-based authentication for console/admin API
- Login via `/admin/login` with password (stored in ADMIN_PASSWORD secret)
- JWT tokens validated by `withAdminAuth()` middleware in [server/src/middleware/auth.ts](server/src/middleware/auth.ts)

**Nonce-based Replay Protection**: Server validates request timestamps within NONCE_WINDOW (default 300s)

### Testing Strategy

**Hybrid E2E Testing**: Tests run locally with Wrangler but use **remote** Cloudflare resources (D1/KV/R2)
- Config: [server/vitest.e2e.config.ts](server/vitest.e2e.config.ts)
- Run: `npm run test:e2e:hybrid` (from server/)
- This ensures tests match production behavior while keeping fast iteration

**Property-Based Testing**: Agent uses fast-check for property tests in [agent/src/core/property_tests.rs](agent/src/core/property_tests.rs)

**Unit Tests**: Standard Vitest (server/console) and Rust tests (agent)

### Database Schema

Schema defined in [server/migrations/0001_initial_schema.sql](server/migrations/0001_initial_schema.sql)

**Core Tables**:
- `devices` - Enrolled devices with Ed25519 public keys, MAC address, platform, status
- `enrollment_tokens` - Multi-use tokens with expiration and usage limits
- `sessions` - WebSocket session tracking
- `audit_logs` - Activity audit trail
- `device_configs` - Configuration pushed to agents via heartbeat

**Type Definitions**: [server/src/database/schema.ts](server/src/database/schema.ts) provides TypeScript types matching SQL schema

### Protocol: Task-Based Heartbeat

Heartbeat responses now use a **Task Protocol** defined in [agent/src/core/protocol.rs](agent/src/core/protocol.rs):

```rust
pub struct TaskProtocol {
    pub task_type: String,
    pub task_id: String,
    pub priority: TaskPriority,
    pub payload: serde_json::Value,
}
```

Agents process tasks sequentially and acknowledge completion. Server handlers return tasks instead of direct commands.

### Configuration Auto-Push

The server **automatically pushes** configuration updates to agents via heartbeat responses in [server/src/api/handlers/heartbeat.ts](server/src/api/handlers/heartbeat.ts):
- Queries `device_configs` table for device-specific config
- Includes config in heartbeat response
- Agent applies config changes dynamically

### Secrets Management

**Required Secrets** (set via `wrangler secret put`):
- `ADMIN_PASSWORD` - Admin console login password (required)
- `ENROLLMENT_SECRET` - Used to generate enrollment tokens
- `JWT_SECRET` - JWT signing key

See [docs/secrets-management.md](docs/secrets-management.md) for details.

**Validation**: Secrets validated on startup in [server/src/config/secrets.ts](server/src/config/secrets.ts)

## Development Workflow

### Starting Local Development

**Automated (Recommended)**:
```bash
# Windows
scripts\dev-setup.bat

# Linux/macOS
./scripts/dev-setup.sh
```

**Manual**:
1. Start server: `cd server && npm run dev`
2. Start console: `cd console && npm run dev`
3. Build and run agent: `cd agent && cargo run`

**Access Points**:
- Worker API: http://localhost:8787
- Console: http://localhost:3000
- Health check: http://localhost:8787/health

### Database Migrations

**Important**: Ruinos uses D1 (cloud-hosted SQLite). Migrations must be applied to remote D1 instances.

```bash
# Development environment
npm run db:migrate

# Dry run (check SQL)
cd server && npm run db:migrate:dry-run

# Test/prod environments
npm run db:migrate:test
npm run db:migrate:prod
```

**Never use local D1** - it's outdated and unsupported. Always use remote bindings.

### Agent Connection Configuration

Set `AGENT_SERVER_URL` environment variable to point agent at different environments:

```bash
# Local development
export AGENT_SERVER_URL=http://localhost:8787

# Test environment
export AGENT_SERVER_URL=https://ruinos-server-test.your-subdomain.workers.dev

# Production
export AGENT_SERVER_URL=https://ruinos-server-prod.your-subdomain.workers.dev
```

### Wrangler Environments

Wrangler configuration in [server/wrangler.toml](server/wrangler.toml) defines three environments:
- `development` (default, local dev)
- `test` (env.test)
- `production` (env.production)

Each environment has separate D1/KV/R2 bindings.

## Code Patterns

### Error Handling

**Server**: Use JSON error responses with appropriate HTTP status codes
```typescript
return new Response(JSON.stringify({ error: 'Message' }), {
  status: 400,
  headers: { 'Content-Type': 'application/json' }
});
```

**Agent**: Use `anyhow::Result<T>` for error propagation, `tracing::error!()` for logging

### Adding New API Endpoints

1. Create handler in `server/src/api/handlers/`
2. Add route in `server/src/api/routes.ts`
3. Apply appropriate middleware (`withAdminAuth` for admin, signature verification for agent)
4. Update TypeScript types in `server/src/types/`
5. Add corresponding Console API calls in `console/src/lib/api.ts`

### Adding Agent Features

1. Define protocol types in `agent/src/core/protocol.rs`
2. Implement handler in relevant `agent/src/core/*.rs` module
3. Add server-side handler in `server/src/api/handlers/`
4. Update database schema if needed (new migration)
5. Add tests in both agent and server

## Important Notes

- **No local file persistence in Agent**: Agent uses memory-only state management. Configuration and credentials are ephemeral.
- **MAC Address is device identity**: Devices are identified by MAC address, not persisted device IDs
- **CORS is critical**: Server adds CORS headers for Console access. See [server/src/middleware/cors.ts](server/src/middleware/cors.ts)
- **WebSocket sessions use Durable Objects**: Each session is isolated in its own DO instance for state consistency
- **Heartbeat interval is configurable**: Default 60s, set via `HEARTBEAT_INTERVAL` env var
- **Ed25519 signatures are mandatory for agent APIs**: Never skip signature verification

## Documentation

Comprehensive docs in [docs/](docs/):
- [project-overview.md](docs/project-overview.md) - Project goals and roadmap
- [architecture.md](docs/architecture.md) - Detailed architecture diagrams
- [api-reference.md](docs/api-reference.md) - Complete API documentation
- [deployment-guide.md](docs/deployment-guide.md) - Production deployment steps
- [security-guide.md](docs/security-guide.md) - Threat model and security best practices
- [test.md](docs/test.md) - Hybrid testing environment details
- [secrets-management.md](docs/secrets-management.md) - Secrets and credentials guide
