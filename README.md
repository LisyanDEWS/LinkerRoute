# Telegram Web Launcher

Run Telegram Web (Server A) directly in full screen on your local PC.

## Quick Start on Localhost (No Docker Needed)

You only need **Node.js** (version 18 or 20+) installed on your PC.

### 1. Install dependencies
```bash
npm install
```

### 2. Start the server
```bash
npm start
```

### 3. Open in your browser
Navigate to:
```
http://localhost:3000
```
*(Or `http://127.0.0.1:3000`)*

---

### Custom Port (Optional)
If port 3000 is occupied, run with any port:
```bash
PORT=8080 npm start
```
Windows (PowerShell):
```powershell
$env:PORT="8080"; npm start
```
