# Hyperliquid Node Setup Plan

## Übersicht

**Ziel:** Eigener Hyperliquid Non-Validator Node für vollständige Liquidations-Daten
**Kosten:** ~€100/Monat (Hetzner)
**Setup-Zeit:** ~1 Stunde
**Speicher:** Konstant ~200-300 GB mit Cleanup

---

## Phase 1: Hetzner Server bestellen

### Server-Auswahl

**Empfohlen: CCX33 (Dedicated vCPU)**

| Spec | Wert |
|------|------|
| vCPUs | 8 (dedicated) |
| RAM | 32 GB |
| Storage | 240 GB NVMe |
| Preis | ~€65/Monat |

> Hinweis: Offiziell werden 64 GB RAM empfohlen, aber für Non-Validator mit Cleanup reichen 32 GB oft aus. Falls Probleme: Upgrade auf CCX43 (64 GB, ~€130/Monat).

**Alternative: CCX43 (Sicher)**

| Spec | Wert |
|------|------|
| vCPUs | 16 (dedicated) |
| RAM | 64 GB |
| Storage | 360 GB NVMe |
| Preis | ~€130/Monat |

### Bestellschritte

1. **Account erstellen:** https://www.hetzner.com/cloud
2. **Neues Projekt anlegen**
3. **Server erstellen:**
   - Location: **Falkenstein** oder **Helsinki** (EU, gute Latenz)
   - Image: **Ubuntu 24.04**
   - Type: **CCX33** oder **CCX43**
   - Volume: **+500 GB** zusätzlich hinzufügen (für Daten)
   - SSH Key: Deinen Public Key hinzufügen
   - Networking: Public IPv4 aktivieren
4. **Firewall erstellen:**
   - Inbound: Port 22 (SSH), 4001, 4002, 3001 (Info API)
   - Outbound: Alle erlauben

---

## Phase 2: Server einrichten

### 2.1 Verbinden & Updates

```bash
# SSH Verbindung
ssh root@<SERVER_IP>

# System updaten
apt update && apt upgrade -y

# Nützliche Tools installieren
apt install -y htop curl wget jq tmux
```

### 2.2 Volume mounten (für Daten)

```bash
# Volume formatieren (nur beim ersten Mal!)
mkfs.ext4 /dev/sdb

# Mount-Punkt erstellen
mkdir -p /data

# Volume mounten
mount /dev/sdb /data

# Permanent in fstab eintragen
echo '/dev/sdb /data ext4 defaults 0 2' >> /etc/fstab

# Symlink für hl-data
mkdir -p /data/hl
ln -s /data/hl ~/hl
```

### 2.3 Swap einrichten (falls 32 GB RAM)

```bash
# 16 GB Swap erstellen
fallocate -l 16G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile

# Permanent machen
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

---

## Phase 3: Hyperliquid Node installieren

### 3.1 Visor herunterladen

```bash
# Mainnet Binary
curl -L https://binaries.hyperliquid.xyz/Mainnet/hl-visor -o ~/hl-visor
chmod +x ~/hl-visor

# Chain Config
echo '{"chain": "Mainnet"}' > ~/visor.json
```

### 3.2 Systemd Service erstellen

```bash
cat > /etc/systemd/system/hl-node.service << 'EOF'
[Unit]
Description=Hyperliquid Non-Validator Node
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root
ExecStart=/root/hl-visor run-non-validator --write-fills --serve-info
Restart=always
RestartSec=10
LimitNOFILE=65535

# Logging
StandardOutput=append:/var/log/hl-node.log
StandardError=append:/var/log/hl-node-error.log

[Install]
WantedBy=multi-user.target
EOF
```

### 3.3 Service starten

```bash
# Systemd neu laden
systemctl daemon-reload

# Service aktivieren (Autostart)
systemctl enable hl-node

# Service starten
systemctl start hl-node

# Status prüfen
systemctl status hl-node

# Logs verfolgen
tail -f /var/log/hl-node.log
```

### 3.4 Sync abwarten

Der Node muss sich erst synchronisieren. Das kann **mehrere Stunden** dauern.

```bash
# Fortschritt prüfen
curl -s http://localhost:3001/info -X POST \
  -H 'Content-Type: application/json' \
  -d '{"type":"meta"}' | jq .
```

Wenn eine valide Response kommt, ist der Node synchronisiert.

---

## Phase 4: Automatisches Cleanup einrichten

### 4.1 Cleanup-Script erstellen

```bash
cat > /root/cleanup-hl-data.sh << 'EOF'
#!/bin/bash
# Cleanup Hyperliquid Node Data - behält nur letzte 24 Stunden

LOG_FILE="/var/log/hl-cleanup.log"
DATA_DIR="/data/hl/data"

echo "$(date): Starting cleanup..." >> $LOG_FILE

# Fills älter als 1 Tag löschen
find $DATA_DIR/node_fills -type f -mtime +1 -delete 2>/dev/null
find $DATA_DIR/node_fills -type d -empty -delete 2>/dev/null

# Trades löschen (falls aktiviert)
find $DATA_DIR/node_trades -type f -mtime +1 -delete 2>/dev/null
find $DATA_DIR/node_trades -type d -empty -delete 2>/dev/null

# Order Statuses löschen (falls aktiviert)
find $DATA_DIR/node_order_statuses -type f -mtime +1 -delete 2>/dev/null
find $DATA_DIR/node_order_statuses -type d -empty -delete 2>/dev/null

# Alte State Snapshots löschen (behalte nur letzte 5)
cd $DATA_DIR/periodic_abci_states 2>/dev/null && \
  ls -t | tail -n +6 | xargs rm -rf 2>/dev/null

# Speicherplatz loggen
USED=$(df -h /data | awk 'NR==2 {print $3}')
AVAIL=$(df -h /data | awk 'NR==2 {print $4}')
echo "$(date): Cleanup done. Used: $USED, Available: $AVAIL" >> $LOG_FILE
EOF

chmod +x /root/cleanup-hl-data.sh
```

### 4.2 Cronjob einrichten

```bash
# Cleanup alle 6 Stunden ausführen
(crontab -l 2>/dev/null; echo "0 */6 * * * /root/cleanup-hl-data.sh") | crontab -

# Crontab prüfen
crontab -l
```

---

## Phase 5: Liquidations-Parser einrichten

### 5.1 Python Environment

```bash
apt install -y python3 python3-pip python3-venv

# Virtual Environment
python3 -m venv /root/liq-parser
source /root/liq-parser/bin/activate

# Dependencies
pip install flask requests
```

### 5.2 Liquidation Parser Script

```bash
cat > /root/liq-parser/parser.py << 'EOF'
#!/usr/bin/env python3
"""
Hyperliquid Liquidation Parser
Liest Node Fills und extrahiert Liquidationen
"""

import json
import os
import time
from pathlib import Path
from datetime import datetime, timedelta
from flask import Flask, jsonify
from threading import Thread
from collections import deque

app = Flask(__name__)

# Config
FILLS_DIR = Path("/data/hl/data/node_fills/hourly")
MAX_LIQUIDATIONS = 1000

# In-Memory Storage
liquidations = deque(maxlen=MAX_LIQUIDATIONS)
stats = {
    "count_1h": 0,
    "count_24h": 0,
    "volume_1h": 0,
    "volume_24h": 0,
    "long_volume_24h": 0,
    "short_volume_24h": 0,
    "last_update": None
}

def parse_fill(fill_data):
    """Parse a fill and extract liquidation info if present"""
    if "liquidation" not in fill_data:
        return None

    liq = fill_data["liquidation"]
    size = abs(float(fill_data["sz"]))
    price = float(fill_data["px"])
    value = size * price

    return {
        "coin": fill_data["coin"],
        "size": size,
        "price": price,
        "value": value,
        "side": "short" if fill_data["side"] == "B" else "long",
        "method": liq.get("method", "unknown"),
        "liquidated_user": liq.get("liquidatedUser", "unknown"),
        "mark_price": float(liq.get("markPx", price)),
        "time": fill_data["time"],
        "hash": fill_data.get("hash", "")
    }

def scan_fills_directory():
    """Scan fills directory for new liquidations"""
    global stats

    seen_hashes = set()

    while True:
        try:
            now = datetime.utcnow()

            # Scan last 2 hours of data
            for hours_ago in range(2):
                check_time = now - timedelta(hours=hours_ago)
                hour_dir = FILLS_DIR / check_time.strftime("%Y-%m-%d") / check_time.strftime("%H")

                if not hour_dir.exists():
                    continue

                for fill_file in sorted(hour_dir.iterdir()):
                    try:
                        with open(fill_file) as f:
                            for line in f:
                                fill = json.loads(line.strip())

                                # Skip if already seen
                                fill_hash = fill.get("hash", "")
                                if fill_hash in seen_hashes:
                                    continue
                                seen_hashes.add(fill_hash)

                                # Parse liquidation
                                liq = parse_fill(fill)
                                if liq:
                                    liquidations.appendleft(liq)
                    except Exception as e:
                        pass  # Skip corrupted files

            # Update stats
            now_ts = int(time.time() * 1000)
            hour_ago = now_ts - 3600000
            day_ago = now_ts - 86400000

            stats["count_1h"] = sum(1 for l in liquidations if l["time"] > hour_ago)
            stats["count_24h"] = sum(1 for l in liquidations if l["time"] > day_ago)
            stats["volume_1h"] = sum(l["value"] for l in liquidations if l["time"] > hour_ago)
            stats["volume_24h"] = sum(l["value"] for l in liquidations if l["time"] > day_ago)
            stats["long_volume_24h"] = sum(l["value"] for l in liquidations if l["time"] > day_ago and l["side"] == "long")
            stats["short_volume_24h"] = sum(l["value"] for l in liquidations if l["time"] > day_ago and l["side"] == "short")
            stats["last_update"] = datetime.utcnow().isoformat()

            # Cleanup old hashes
            if len(seen_hashes) > 100000:
                seen_hashes.clear()

        except Exception as e:
            print(f"Scanner error: {e}")

        time.sleep(5)  # Scan every 5 seconds

# API Endpoints
@app.route("/api/liquidations")
def get_liquidations():
    """Get recent liquidations"""
    limit = min(int(request.args.get("limit", 100)), MAX_LIQUIDATIONS)
    return jsonify(list(liquidations)[:limit])

@app.route("/api/liquidations/stats")
def get_stats():
    """Get liquidation statistics"""
    return jsonify(stats)

@app.route("/api/health")
def health():
    """Health check"""
    return jsonify({"status": "ok", "liquidations_count": len(liquidations)})

from flask import request

if __name__ == "__main__":
    # Start scanner in background
    scanner = Thread(target=scan_fills_directory, daemon=True)
    scanner.start()

    # Start API server
    print("Starting Liquidation Parser API on port 5000...")
    app.run(host="0.0.0.0", port=5000)
EOF
```

### 5.3 Parser als Service

```bash
cat > /etc/systemd/system/liq-parser.service << 'EOF'
[Unit]
Description=Hyperliquid Liquidation Parser API
After=hl-node.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/liq-parser
ExecStart=/root/liq-parser/bin/python /root/liq-parser/parser.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable liq-parser
systemctl start liq-parser
```

---

## Phase 6: Mit deiner App verbinden

### 6.1 API Endpoints auf dem Server

| Endpoint | Beschreibung |
|----------|--------------|
| `http://<SERVER_IP>:3001/info` | Hyperliquid Info API (kein Rate Limit) |
| `http://<SERVER_IP>:5000/api/liquidations` | Alle Liquidationen |
| `http://<SERVER_IP>:5000/api/liquidations/stats` | Statistiken |

### 6.2 In deiner Next.js App

Erstelle eine neue Datenquelle für den eigenen Node:

```typescript
// src/lib/node-api.ts
const NODE_URL = process.env.NEXT_PUBLIC_NODE_URL || "http://localhost:5000";

export async function getNodeLiquidations(limit = 100) {
  const res = await fetch(`${NODE_URL}/api/liquidations?limit=${limit}`);
  return res.json();
}

export async function getNodeStats() {
  const res = await fetch(`${NODE_URL}/api/liquidations/stats`);
  return res.json();
}
```

### 6.3 Environment Variable

```bash
# .env.local
NEXT_PUBLIC_NODE_URL=http://<SERVER_IP>:5000
```

---

## Monitoring & Wartung

### Nützliche Befehle

```bash
# Node Status
systemctl status hl-node

# Node Logs (live)
tail -f /var/log/hl-node.log

# Parser Logs
journalctl -u liq-parser -f

# Speicherplatz
df -h /data

# RAM/CPU
htop

# Manuelles Cleanup
/root/cleanup-hl-data.sh
```

### Alerts einrichten (optional)

```bash
# Simple Disk Space Alert
cat > /root/disk-alert.sh << 'EOF'
#!/bin/bash
USAGE=$(df /data | awk 'NR==2 {print $5}' | tr -d '%')
if [ $USAGE -gt 80 ]; then
  echo "Disk usage critical: ${USAGE}%" | mail -s "HL Node Alert" your@email.com
fi
EOF

chmod +x /root/disk-alert.sh
(crontab -l; echo "0 * * * * /root/disk-alert.sh") | crontab -
```

---

## Kosten-Übersicht

| Position | Monatlich |
|----------|-----------|
| Hetzner CCX33 | €65 |
| 500 GB Volume | €25 |
| **Total** | **~€90/Monat** |

Mit CCX43 (64 GB RAM): **~€155/Monat**

---

## Troubleshooting

### Node startet nicht
```bash
# Logs prüfen
journalctl -u hl-node -n 100

# Binary neu herunterladen
curl -L https://binaries.hyperliquid.xyz/Mainnet/hl-visor -o ~/hl-visor
chmod +x ~/hl-visor
```

### Kein Speicherplatz mehr
```bash
# Manuelles Cleanup
/root/cleanup-hl-data.sh

# Aggressive Cleanup (alles älter als 6h)
find /data/hl/data/node_fills -type f -mmin +360 -delete
```

### API antwortet nicht
```bash
# Info Server läuft?
curl http://localhost:3001/info -X POST -d '{"type":"meta"}'

# Node noch am syncen?
# Warte bis Sync abgeschlossen
```

---

## Nächste Schritte

1. [ ] Hetzner Account erstellen
2. [ ] Server bestellen (CCX33 + 500 GB Volume)
3. [ ] SSH Key einrichten
4. [ ] Diesen Guide Schritt für Schritt durchgehen
5. [ ] Node synchronisieren lassen (2-4 Stunden)
6. [ ] Parser testen
7. [ ] Mit Next.js App verbinden
