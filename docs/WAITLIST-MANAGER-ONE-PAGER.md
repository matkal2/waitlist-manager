# Waitlist & Parking Manager
## One-Pager Overview

---

### What Is It?
A centralized web-based tool that manages **apartment waitlists** and **parking assignments** across all HPVG properties. It replaces scattered spreadsheets with a single, real-time dashboard accessible to all leasing agents.

---

### Key Features

#### 🏠 Waitlist Manager
| Feature | Description |
|---------|-------------|
| **Centralized Waitlist** | All prospects and internal transfers in one place |
| **Smart Matching** | Automatically matches available units to waitlist entries based on property, unit type, budget, and move-in dates |
| **Automated Email Alerts** | Agents receive instant notifications when a unit matches their assigned prospects |
| **Transfer-First Priority** | Internal transfers are always prioritized over new prospects |
| **Flexible Date Matching** | Matches within ±1 month of requested move-in range (flagged in alerts) |
| **Multi-Property Support** | Filter and manage across Highpoint, Eastgate, Northgate, and more |
| **Real-Time Google Sheets Sync** | Unit availability syncs directly from the master vacancy sheet |

#### 🚗 Parking Manager
| Feature | Description |
|---------|-------------|
| **Inventory Dashboard** | View all parking spots by property with occupancy rates |
| **Parking Waitlists** | Separate queues for 1st Spot, 2nd Spot, and Indoor Upgrade requests |
| **Change Requests** | Submit terminations, additions, and transfers — syncs to Google Sheets |
| **Tenant Autocomplete** | Quickly find tenants from the resident directory |
| **Status Tracking** | Spots marked as Occupied, Vacant, Notice, Reserved, or Future |

---

### Who Uses It?

| Role | Use Case |
|------|----------|
| **Leasing Agents** | Manage their assigned prospects, receive match alerts |
| **Property Managers** | Oversee waitlists and parking across properties |
| **Admins** | Full access to all data, bulk actions, and exports |

---

### Benefits

✅ **No more spreadsheet chaos** — one source of truth  
✅ **Faster lease-ups** — instant match notifications  
✅ **Fair & consistent** — transfer-first policy enforced automatically  
✅ **Saves time** — autocomplete, bulk actions, and quick filters  
✅ **Accessible anywhere** — web-based, works on any device  

---

### Technical Details

| Component | Technology |
|-----------|------------|
| Hosting | Vercel (serverless, auto-scaling) |
| Database | Supabase (PostgreSQL) |
| Email | Resend API |
| Data Sync | Google Sheets API |
| Frontend | Next.js + React + Tailwind CSS |

---

### Access

🔗 **URL**: [waitlist-hpvg.vercel.app](https://waitlist-hpvg.vercel.app)

---

*Built for HPVG Properties — January 2026*
