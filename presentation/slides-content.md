# Waitlist & Parking Manager System
## Owner Presentation

---

## SLIDE 1: Title Slide

**Waitlist & Parking Manager**
*Automated Property Management Portal*

Your Company Name
Presented by: [Your Name]
Date: February 2026

---

## SLIDE 2: What Is This System?

**A web-based portal that helps you manage:**

- **Unit Waitlist** - Track who wants to move into your properties
- **Parking Spots** - See which spots are occupied, vacant, or ending soon
- **Match Alerts** - Automatically match available units to waitlist entries
- **Change Requests** - Process parking assignments and terminations

**Key Benefit:** All data stays in sync with your existing Google Sheets - no double entry!

---

## SLIDE 3: System Overview (Simple Diagram)

```
┌─────────────────┐
│  Google Sheets  │  ← Your existing data lives here
│  (Data Source)  │
└────────┬────────┘
         │
         ▼ Reads data
┌─────────────────┐
│   Web Portal    │  ← Staff access this in their browser
│  (Application)  │
└────────┬────────┘
         │
         ▼ Writes changes
┌─────────────────┐
│  Google Sheets  │  ← Changes go back to your sheets
│ (OUTPUT Tab)    │
└─────────────────┘
```

**Simple concept:** The portal READS from your sheets and WRITES changes back.

---

## SLIDE 4: Where Does The Data Come From?

**Google Sheets You Already Use:**

| Sheet Name | What It Contains |
|------------|------------------|
| **Dash** | Available units, rent prices, availability dates |
| **Waitlist** | People waiting for units (name, contact, preferences) |
| **Directory** | All current tenants and their unit numbers |
| **Import** | Parking spot assignments and status |

**The portal pulls fresh data every time you open it** - always up to date!

---

## SLIDE 5: How Does Login Work?

**Two-Layer Security:**

1. **Email/Password Login**
   - Staff register with their email
   - Admin approves new users
   - Passwords are securely encrypted

2. **Role-Based Access**
   - **Admin** - Full access, can approve users
   - **User** - View and manage waitlist/parking

**All login data is stored in Supabase** (secure cloud database)

---

## SLIDE 6: Waitlist Manager - How It Works

**Step 1: Data Sync**
- Portal reads "Dash" tab for available units
- Portal reads "Waitlist" tab for waiting entries

**Step 2: Display**
- Shows all waitlist entries with contact info
- Shows all available/upcoming units

**Step 3: Match Alerts**
- System automatically finds matches:
  - Waitlist entry wants a 2BR at Broadway
  - Unit 305 (2BR) at Broadway becomes available
  - **ALERT!** These match!

---

## SLIDE 7: Waitlist Matching Logic

**How does the system know if someone matches a unit?**

```
For each waitlist entry:
  ├─ What unit type do they want? (Studio, 1BR, 2BR, etc.)
  ├─ What property do they want? (Broadway, Elston, etc.)
  └─ When do they want to move?

For each available unit:
  ├─ What type is it?
  ├─ What property is it at?
  └─ When is it available?

IF all three match → SHOW ALERT
```

**Staff can then contact the person and offer the unit!**

---

## SLIDE 8: Parking Manager - How It Works

**Data Source:** "Import" tab in Parking Google Sheet

**Spot Statuses:**

| Status | Meaning | Color |
|--------|---------|-------|
| **Occupied** | Tenant is currently using the spot | Blue |
| **Vacant** | Spot is empty and available | Green |
| **Notice** | Tenant is leaving soon (has termination date) | Yellow |
| **Reserved** | Spot is held for someone | Purple |

---

## SLIDE 9: Parking Spot Information

**What the portal shows for each spot:**

- **Property** - Which building (Warren, Elston, Broadway, etc.)
- **Spot Number** - The parking space ID
- **Type** - Indoor or Outdoor
- **Monthly Rent** - What tenant pays
- **Current Tenant** - Name and unit number
- **Lease Start** - When they started
- **Termination Date** - When they're leaving (if applicable)

**All pulled automatically from the Google Sheet!**

---

## SLIDE 10: Parking Change Requests

**Three Types of Changes:**

1. **Add Tenant to Spot**
   - Pick an empty (Vacant) spot
   - Assign a tenant to it
   - Set their start date and rent

2. **Terminate Tenant**
   - Select an occupied spot
   - Set termination date
   - Spot becomes Vacant after that date

3. **Transfer Tenant**
   - Move tenant from one spot to another
   - Old spot becomes Vacant
   - New spot becomes Occupied

---

## SLIDE 11: How Changes Get Saved

**When staff submits a change request:**

```
1. User fills out the form in the portal
2. Portal writes a new row to "OUTPUT" tab in Google Sheet
3. Your main parking sheet has a formula that reads OUTPUT
4. Main sheet updates automatically!
```

**Benefits:**
- All changes are logged in OUTPUT tab
- You can see who made what change and when
- Easy to audit and track history

---

## SLIDE 12: The Technology Stack

**Frontend (What Users See):**
- Built with **Next.js** (React framework)
- Modern, responsive design
- Works on desktop and mobile

**Backend (Behind the Scenes):**
- **Vercel** - Hosts the website (fast, reliable)
- **Supabase** - Stores user accounts and settings
- **Google Sheets API** - Reads/writes your data

**Cost:** Minimal - uses free tiers of all services

---

## SLIDE 13: Data Flow Diagram

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    Staff     │────▶│  Web Portal  │────▶│   Vercel     │
│  (Browser)   │     │   (Next.js)  │     │  (Hosting)   │
└──────────────┘     └──────────────┘     └──────────────┘
                                                 │
                     ┌───────────────────────────┼───────────────────────────┐
                     │                           │                           │
                     ▼                           ▼                           ▼
              ┌──────────────┐           ┌──────────────┐           ┌──────────────┐
              │   Supabase   │           │ Google Sheets│           │ Google Sheets│
              │  (Logins)    │           │  (Waitlist)  │           │  (Parking)   │
              └──────────────┘           └──────────────┘           └──────────────┘
```

---

## SLIDE 14: Key Features Summary

**Waitlist Manager:**
- View all waitlist entries
- See available units with dates and rent
- Automatic match alerts
- Contact tracking (notifications sent)

**Parking Manager:**
- View all spots by property
- Filter by status (Occupied/Vacant/Notice)
- Submit change requests
- Track future tenant assignments

---

## SLIDE 15: Security Features

**How is your data protected?**

1. **Login Required** - No public access
2. **Admin Approval** - New users must be approved
3. **HTTPS Encryption** - All data transmitted securely
4. **No Data Stored in Portal** - Data stays in Google Sheets
5. **Audit Trail** - All changes logged in OUTPUT tab

---

## SLIDE 16: Benefits for Your Team

| Before | After |
|--------|-------|
| Check multiple sheets manually | One dashboard shows everything |
| Manually match waitlist to units | Automatic match alerts |
| Email/call without tracking | Track who was notified |
| Paper parking change forms | Digital forms with history |
| No visibility into parking status | Real-time status dashboard |

---

## SLIDE 17: Future Enhancements (Planned)

**Coming Soon:**
- Automated email notifications to waitlist matches
- Parking permit tracking
- Lease-end reminders
- Mobile app version
- More detailed reporting

**Your feedback drives new features!**

---

## SLIDE 18: Questions?

**Contact:**
- Portal URL: https://waitlist-hpvg.vercel.app
- Support: [Your contact info]

**Thank you!**

---

## APPENDIX: Technical Details (Optional Slide)

**For IT/Technical Audience:**

- **Framework:** Next.js 16 (React 19)
- **Hosting:** Vercel (Edge Functions)
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth with JWT
- **Data Source:** Google Sheets API (gviz/tq JSON endpoint)
- **Styling:** Tailwind CSS + shadcn/ui components
- **State:** React hooks + TanStack Query

---
