# CloudForge Backend

## Project Overview
CloudForge is a mini cloud deployment platform (like Heroku/Render/Vercel) for the final year engineering Data Science project. It allows users to upload code (zip/tar archives) or connect a GitHub repo, auto-detects the framework, builds a Docker image, runs it as a container, and provides a live URL with real-time build logs and container CPU/Memory monitoring via Socket.IO.

## Prerequisites

### Required Software
- **Node.js v18+**
- **MongoDB** (local or Atlas)
- **Docker Desktop** (required for container operations)

### Installation Steps

1. Clone this repository
2. Navigate to the backend directory:
   ```bash
   cd Backend
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Copy and configure environment variables:
   ```bash
   cp .env.example .env
   ```
   Update the `.env` file with your values:

   - `MONGO_URI`: Your MongoDB connection string (use Atlas if you don't have local)
   - `JWT_SECRET`: A secret key for JWT tokens
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`: Email service credentials (used for notifications)
   - `EMAIL_FROM`: Sender email address

### Environment Variables Required

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/cloudforge  # or mongodb+srv://username:password@cluster.mongodb.net/database
JWT_SECRET=your-secret-key-here
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_pass
EMAIL_FROM=noreply@cloudforge.local
```

### Running the Backend

**Option 1: Normal startup**
```bash
npm start
```

**Option 2: Development with auto-restart on file changes**
```bash
npm run dev
```

### Local MongoDB Setup (Optional)

If you don't have a MongoDB connection string:

**Mac (using Homebrew):**
```bash
homebrew install mongodb-community
brew services start mongodb-community
```

**Windows (MSI installer):**
- Download and install MongoDB Community Server
- Start the MongoDB service

**Linux:**
```bash
sudo apt-get install mongodb-org
sudo systemctl start mongod
```

After starting MongoDB, update your `.env` file:
```
MONGO_URI=mongodb://localhost:27017/cloudforge
```

### Connection to Frontend

The already-built frontend (using React + TanStack Router) should point its API client at the backend's base URL:

```
http://localhost:5000/api
```

## API Endpoints

The backend provides the following API endpoints:

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login and get JWT token
- `GET /api/auth/me` - Get current user info

### Projects
- `GET /api/projects` - List user's projects
- `POST /api/projects` - Create a new project
- `GET /api/projects/:id` - Get project by ID
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project
- `GET /api/projects/:id/files` - Get project's file tree
- `GET /api/projects/:id/files/content` - Get file content
- `PUT /api/projects/:id/files/content` - Save file content

### Deployments
- `POST /api/projects/:id/deploy` - Deploy a project
- `GET /api/deployments` - List deployments (with optional `?status=` filter)
- `GET /api/deployments/:id` - Get deployment by ID
- `GET /api/deployments/:id/logs` - Get deployment logs

### Containers
- `GET /api/containers` - List containers
- `GET /api/containers/:id/stats` - Get container stats (single call, existing functionality)
- `POST /api/containers/:id/stop` - Stop a container

### Notifications
- `GET /api/notifications` - List user's notifications
- `PUT /api/notifications/mark-all-read` - Mark all notifications as read

### Admin (admin role only)
- `GET /api/admin/users` - List all users
- `PUT /api/admin/users/:id/role` - Change user's role

## Real-Time Features

- **Socket.IO**: Clients can join rooms:
  - `join-deployment` to listen to deployment-specific updates
  - `join-containers` to receive all container stats updates

- **Container stats broadcast**: Every 5 seconds, the backend fetches live CPU/Memory stats from running containers via dockerode and emits updates via Socket.IO.

## Project Structure

```
CloudForge/Backend/
├── config/                    # Configuration files
├── controllers/              # API controllers
├── middleware/               # Express middleware
├── models/                   # Mongoose schemas
├── routes/                   # Express route definitions
├── utils/                    # Utility modules
├── uploads/                  # Uploaded project files
├── .env                      # Environment variables
├── .env.example              # Environment variable template
├── package.json             # Dependencies
└── server.js                 # Express + Socket.IO server
```

## Development Notes

1. The container stats broadcast is running continuously in the background (every 5 seconds).
2. Socket.IO rooms are managed automatically: each deployment has its own room (`deployment-{id}`) for deployment logs, and all containers share a common `containers` room.
3. The application uses JWT-based authentication. All routes require authentication except `/api/auth/register` and `/api/auth/login`.
4. Project ownership is enforced: users can only access/modify their own projects.
5. Path traversal protection is implemented in the file operations to prevent unauthorized file access.

## Troubleshooting

### Server Won't Start

Check these common issues:

1. **MongoDB Connection**
   - Verify your `MONGO_URI` in `.env` is correct
   - If using local MongoDB: ensure MongoDB is running on port 27017
   - If using Atlas: verify network access and connection string

2. **Docker**
   - CloudForge requires Docker Desktop to be running
   - The backend uses `dockerode` to manage containers
   - On Linux, you might need to add your user to the `docker` group

3. **Node Modules**
   - Ensure all dependencies are installed (`npm install`)
   - Check that `dockerode` is installed (required for container operations)

### First Run

If starting fresh:
1. Ensure Docker Desktop is running
2. Start MongoDB (or use Atlas)
3. Install dependencies with `npm install`
4. Configure `.env` with your values
5. Run `npm run dev` and watch for startup errors

## Security Notes

- Passwords are hashed using `bcrypt`
- JWT tokens are signed with a secret key
- All routes require authentication
- File operations include path traversal protection
- Docker containers run with resource limits
- Admin endpoints are restricted to users with the `admin` role

## License

This project is part of a final year engineering project.

---
Generated with Claude Code