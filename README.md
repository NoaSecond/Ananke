# Ananke

A modern and responsive web application to manage your projects with an intuitive Kanban board.

-----

## Installation and Setup

### 1. Local Usage / VPS
To install and run Ananke on your machine or server:

```bash
# Clone the repository
git clone https://github.com/NoaSecond/Ananke
cd Ananke

# Install dependencies
npm install

# Setup configuration
cp .env.example .env

# Initialize database
node reset_db.js

# Start the application
npm start
```

The app will be accessible at `http://localhost:3000` (or your server's IP).

-----

## Configuration

Ananke uses environment variables for configuration. Copy the example file and modify it to your needs:

```bash
cp .env.example .env
```

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | The port the application will run on | `3000` |
| `DB_PATH` | Path to the SQLite database file | `./ananke.db` |
| `JWT_SECRET` | Secret key for signing authentication tokens | `ananke-secret-key-prod-rev2` |

-----

## Default Credentials

For the first connection, use the following credentials to log in as the owner:

- **Email:** `admin@setup.ananke`
- **Password:** `admin123`

Then you can update the account details in the settings.