# Ananke

A modern and responsive web application to manage your projects with an intuitive Kanban board.

-----

## Installation and Setup

### 1. Local Usage
To install and run Ananke on your machine:

```bash
# Clone the repository
git clone https://github.com/NoaSecond/Ananke
cd Ananke

# Install dependencies
npm install

# Initialize database
node reset_db.js

# Start the application on a specific port
PORT=8975 npm start
```

### 2. VPS / Dedicated Server (with PM2)
To deploy Ananke on your own server for production:

```bash
# Install PM2 globally if not already done
npm install -g pm2

# Clone the repository
git clone https://github.com/NoaSecond/Ananke
cd Ananke

# Install dependencies
npm install

# Initialize database
node reset_db.js

# Start the application with PM2 on a specific port
PORT=8975 pm2 start npm --name "Ananke" -- start
```

The app will be accessible at `http://localhost:8975` (or your server's IP).

-----

## Default Credentials

For the first connection, use the following credentials to log in as the owner:

- **Email:** `admin@setup.ananke`
- **Password:** `admin123`

Then you can update the account details in the settings.