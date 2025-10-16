# Portfolio Backend

Backend API service for Portfolio project. Processes newsletter queue and provides extensible API infrastructure for future features.

## 🌟 Features

- ✅ **Newsletter Queue Processing**: On-demand email sending via Resend
- ✅ **RESTful API**: Clean, documented API endpoints
- ✅ **TypeScript**: Full type safety and modern JS features
- ✅ **Prisma ORM**: Type-safe database access
- ✅ **Authentication**: API key-based authentication
- ✅ **Rate Limiting**: Protection against abuse
- ✅ **Logging**: Centralized logging with Winston
- ✅ **Health Checks**: Monitor service and database status
- ✅ **Production Ready**: PM2 + Supervisor configs included

## 📋 Requirements

- Node.js ≥ 18.0.0
- npm ≥ 9.0.0
- PostgreSQL database
- Resend API key
- PM2 (for production deployment)

## 🚀 Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/MollytheCatLoca/portfolio-backend.git
cd portfolio-backend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

**Required Variables:**

```env
# Server
PORT=3001
NODE_ENV=development

# Database
DATABASE_URL="postgresql://user:password@host:5432/database"

# Resend
RESEND_API_KEY="re_..."

# Security
API_KEY="your-secure-api-key-here"
ALLOWED_ORIGINS="https://your-frontend.vercel.app,http://localhost:3000"

# Optional
LOG_LEVEL=info
MAX_BATCH_SIZE=100
MAX_RETRIES=3
```

### 4. Generate Prisma Client

```bash
npm run prisma:generate
```

### 5. Run Development Server

```bash
npm run dev
```

Server will start on `http://localhost:3001`

## 📡 API Endpoints

### Health Check

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/` | Root status | No |
| GET | `/api/health` | General health | No |
| GET | `/api/health/db` | Database health | No |
| GET | `/api/health/resend` | Resend API health | No |

### Newsletter

All newsletter endpoints require authentication via `Authorization: Bearer YOUR_API_KEY` header.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/newsletter/process-queue` | Process next pending job |
| GET | `/api/newsletter/job/:id` | Get job status |
| GET | `/api/newsletter/jobs` | List all jobs |
| POST | `/api/newsletter/cancel/:id` | Cancel pending job |
| GET | `/api/newsletter/stats` | Get queue statistics |

## 📝 API Examples

### Process Newsletter Queue

```bash
curl -X POST http://localhost:3001/api/newsletter/process-queue \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "message": "Job processed successfully",
    "processed": true,
    "jobId": "uuid-here",
    "sent": 150,
    "failed": 2,
    "total": 152
  },
  "timestamp": "2025-01-21T10:30:00.000Z"
}
```

### Get Job Status

```bash
curl http://localhost:3001/api/newsletter/job/YOUR_JOB_ID \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Get Queue Statistics

```bash
curl http://localhost:3001/api/newsletter/stats \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## 🏗️ Project Structure

```
portfolio-backend/
├── src/
│   ├── index.ts                 # Express server
│   ├── config/
│   │   ├── database.ts          # Prisma client
│   │   ├── env.ts               # Environment validation
│   │   └── resend.ts            # Resend client
│   ├── middleware/
│   │   ├── auth.ts              # API key auth
│   │   ├── cors.ts              # CORS config
│   │   ├── logger.ts            # Request logging
│   │   ├── rate-limit.ts        # Rate limiting
│   │   └── error-handler.ts    # Global error handling
│   ├── routes/
│   │   ├── index.ts             # Router
│   │   ├── health.routes.ts    # Health endpoints
│   │   └── newsletter.routes.ts # Newsletter endpoints
│   ├── services/
│   │   └── newsletter/
│   │       ├── types.ts         # TypeScript types
│   │       ├── queue-processor.ts # Queue logic
│   │       ├── batch-sender.ts  # Email sending
│   │       └── contact-resolver.ts # Contact fetching
│   └── utils/
│       ├── logger.ts            # Winston logger
│       ├── response.ts          # Response helpers
│       └── validators.ts        # Input validation
├── prisma/
│   └── schema.prisma            # Database schema
├── logs/                        # Application logs
├── scripts/
│   ├── deploy.sh                # Deploy to VPS
│   ├── start.sh                 # Start service
│   └── stop.sh                  # Stop service
├── ecosystem.config.js          # PM2 config
├── supervisor.conf              # Supervisor config
├── package.json
├── tsconfig.json
└── README.md
```

## 🚢 Deployment

### Deploy to VPS

#### Option 1: PM2 (Recommended)

1. **First time setup** (on VPS):

```bash
# SSH to VPS
ssh root@82.29.58.172

# Clone repository
cd /root
git clone https://github.com/MollytheCatLoca/portfolio-backend.git
cd portfolio-backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
nano .env  # Edit with your values

# Build
npm run build

# Generate Prisma client
npm run prisma:generate

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

2. **Subsequent deploys** (from local):

```bash
./scripts/deploy.sh
```

#### Option 2: Supervisor

1. Copy supervisor config:

```bash
sudo cp supervisor.conf /etc/supervisor/conf.d/portfolio-backend.conf
```

2. Update Supervisor:

```bash
sudo supervisorctl reread
sudo supervisorctl update
```

3. Start service:

```bash
sudo supervisorctl start portfolio-backend
```

### Useful Commands

```bash
# PM2 Commands
pm2 status                      # Check status
pm2 logs portfolio-backend      # View logs
pm2 monit                       # Monitor resources
pm2 restart portfolio-backend   # Restart
pm2 stop portfolio-backend      # Stop
pm2 delete portfolio-backend    # Remove

# Supervisor Commands
sudo supervisorctl status portfolio-backend
sudo supervisorctl start portfolio-backend
sudo supervisorctl stop portfolio-backend
sudo supervisorctl restart portfolio-backend
sudo supervisorctl tail -f portfolio-backend

# Test Endpoints
curl http://localhost:3001/health
curl http://localhost:3001/api/health/db
```

## 🔒 Security

- **API Key Authentication**: All newsletter endpoints require valid API key
- **CORS Protection**: Only allowed origins can access the API
- **Rate Limiting**: Prevents abuse with configurable limits
- **Input Validation**: Zod schemas validate all inputs
- **Helmet.js**: Security headers enabled
- **Error Handling**: Safe error messages in production

## 📊 Logging

Logs are stored in `logs/` directory with daily rotation:

- `logs/app-YYYY-MM-DD.log` - General application logs
- `logs/error-YYYY-MM-DD.log` - Error logs only
- `logs/newsletter-YYYY-MM-DD.log` - Newsletter specific logs

Log levels: `error`, `warn`, `info`, `debug`

Configure via `LOG_LEVEL` environment variable.

## 🧪 Testing

```bash
# Run tests (when implemented)
npm test

# Lint code
npm run lint

# Type check
npm run build
```

## 🔧 Development

### Build for Production

```bash
npm run build
```

Output in `dist/` directory.

### Development Mode

```bash
npm run dev
```

Uses `nodemon` for auto-reload on file changes.

### Database Operations

```bash
# Generate Prisma client
npm run prisma:generate

# Push schema changes (development only)
npm run prisma:push
```

## 🐛 Troubleshooting

### Database Connection Issues

```bash
# Test connection
curl http://localhost:3001/api/health/db

# Check DATABASE_URL
echo $DATABASE_URL
```

### Resend API Issues

```bash
# Test Resend connection
curl http://localhost:3001/api/health/resend

# Check API key
echo $RESEND_API_KEY
```

### Port Already in Use

```bash
# Find process using port 3001
lsof -i :3001

# Kill process
kill -9 <PID>
```

### PM2 Issues

```bash
# View logs
pm2 logs portfolio-backend --lines 100

# Flush logs
pm2 flush

# Restart
pm2 restart portfolio-backend
```

## 📈 Future Enhancements

- [ ] Email bounce tracking via Resend webhooks
- [ ] Email quarantine system for invalid addresses
- [ ] Analytics dashboard API
- [ ] Rate limit per API key
- [ ] WebSocket support for real-time updates
- [ ] Metrics endpoint for Prometheus
- [ ] Unit and integration tests
- [ ] CI/CD pipeline with GitHub Actions

## 📄 License

ISC

## 👤 Author

Max Keczeli

## 🔗 Links

- [GitHub Repository](https://github.com/MollytheCatLoca/portfolio-backend)
- [Portfolio Frontend](https://github.com/MollytheCatLoca/portfolio)
- [Resend Documentation](https://resend.com/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
