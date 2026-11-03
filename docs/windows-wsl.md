# Windows (WSL)

PoC Scout supports macOS and Linux. On Windows, use WSL 2:

1. Install WSL with Ubuntu: `wsl --install` in PowerShell (as administrator), then reboot.
2. Inside Ubuntu: install Node.js 20+ and Claude Code, and log in to Claude Code.
3. Clone and run inside your WSL home folder (not under `/mnt/c/…` — file watching and permissions are slower and less reliable there):

```bash
git clone https://github.com/dmytroborbotko-pets/poc-scout.git ~/poc-scout
cd ~/poc-scout && ./setup.sh
```

The browser UI at `http://127.0.0.1:4317/` opens from Windows as usual (WSL forwards localhost).

Scheduling: recent WSL versions support systemd (`/etc/wsl.conf` → `[boot] systemd=true`). Without it `schedule.sh` falls back to cron, which runs only while the WSL instance is running.
