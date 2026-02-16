# Ananke

A modern and responsive web application to manage your projects with an intuitive Kanban board.

-----

## Installation and Setup

### Option 1: Simple Local Usage
If you have Node.js installed, you can run the full application (with backend and database) locally:

```bash
git clone https://github.com/NoaSecond/Ananke
cd Ananke
npm install
node reset_db.js
npm start
```

Then open your browser at `http://localhost:3000`

### Option 2: Custom Server Setup (VPS/Dedicated)

To deploy Ananke on your own server (Ubuntu, Debian, etc.), follow these steps:

#### 1. Prerequisites
- **Node.js** (v18+)
- **Git**
- **PM2** (Process Manager)

```bash
# Install PM2 globally
npm install -g pm2
```

#### 2. Installation
```bash
git clone https://github.com/NoaSecond/Ananke
cd Ananke
npm install
node reset_db.js
```

#### 3. Run with PM2
```bash
pm2 start server.js --name ananke
pm2 save
```

The app will be accessible at `http://your-server-ip:3000`.

#### 4. Nginx Reverse Proxy (Recommended)
To use a domain name and SSL, configure Nginx as a reverse proxy:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Default Credentials

For the first connection, use the following credentials to log in as the owner:

- **Email:** `admin@setup.ananke`
- **Password:** `admin123`

Then you can update the account details in the settings.

-----

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

-----

## Author

**Noa Second**
- Website: [noasecond.com](https://noasecond.com)
- GitHub: [@NoaSecond](https://github.com/NoaSecond)

-----

## Support

If you like this project, feel free to give it a star on GitHub!