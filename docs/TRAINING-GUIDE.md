---
marp: true
theme: default
paginate: true
---

# Waitlist & Parking Manager
## Training Guide & Demo Script

---

# SLIDE 1: Welcome

## Waitlist & Parking Manager Training

**Your new centralized tool for managing:**
- Apartment waitlists
- Parking assignments
- Match alerts

🔗 Access at: **waitlist-hpvg.vercel.app**

---

# SLIDE 2: The Problem We Solved

### Before
- Multiple spreadsheets across properties
- Manual tracking of who's waiting for what
- Easy to miss a prospect when a unit opens
- No visibility into other agents' waitlists
- Parking changes scattered in emails

### After
- **One dashboard** for all properties
- **Automatic match alerts** when units open
- **Shared visibility** across the team
- **Parking changes** tracked and synced

---

# SLIDE 3: Accessing the System

1. Open your browser
2. Go to: **waitlist-hpvg.vercel.app**
3. You'll see the **Module Launcher**:
   - **Waitlist Manager** — for apartment waitlists
   - **Parking Manager** — for parking spots

*No login required — accessible on any device*

---

# SLIDE 4: Waitlist Manager Overview

## Main Dashboard

| Section | Purpose |
|---------|---------|
| **Stats Bar** | Total entries, active count, internal transfers |
| **Filters** | Filter by property, unit type, status, agent |
| **Search** | Find any prospect by name, email, or phone |
| **Table** | View all waitlist entries with sortable columns |
| **Match Alerts** | See available units matched to waiting prospects |

---

# SLIDE 5: Adding a New Waitlist Entry

1. Click **"+ Add Entry"** button
2. Fill out the form:
   - **Full Name** (required)
   - **Email** and **Phone**
   - **Entry Type**: Prospect or Internal Transfer
   - **Property** (required)
   - **Unit Type Preference** (can select multiple)
   - **Max Budget** (optional)
   - **Move-In Date** and optional **End Date** for a range
   - **Assigned Agent**
   - **Notes**
3. Click **Save**

💡 *Tip: Internal Transfers get priority in match alerts*

---

# SLIDE 6: Understanding Move-In Date Ranges

### Single Date
- Prospect wants to move on a specific date
- Matches units available within 30 days before that date

### Date Range
- Prospect is flexible between two dates (e.g., Feb 1 - May 1)
- Matches units available anytime within that range
- **±1 month flexibility** — will still match slightly outside range but flagged with ⚠️

---

# SLIDE 7: Match Alerts — How They Work

## Automatic Matching

When a unit becomes available, the system checks:

| Criteria | Must Match? |
|----------|-------------|
| Property | ✅ Yes |
| Unit Type | ✅ Yes |
| Move-In Date | ✅ Yes (with flexibility) |
| Max Budget | Only if set |
| Preferred Units | Only if specified |

## What Happens
- Agent receives an **email notification**
- Email lists all matching prospects in priority order
- Internal Transfers listed first

---

# SLIDE 8: Match Alert Email Example

```
🔔 NEW Match: Highpoint Unit 204 - 3 people waiting

Unit Details:
- Property: Highpoint
- Unit: 204
- Type: 1BR
- Rent: $1,450/month
- Available: Feb 15, 2026

People to Contact (Priority Order):
1. John Smith (🏠 Transfer) — john@email.com
2. Jane Doe (👤 Prospect) — jane@email.com
   ⚠️ Unit available after requested range
3. Bob Wilson (👤 Prospect) — bob@email.com
```

---

# SLIDE 9: Managing Entries

## Status Options
| Status | Meaning |
|--------|---------|
| **Active** | Currently on the waitlist |
| **Contacted** | You've reached out |
| **Leased** | They signed a lease |
| **Archived** | No longer interested |

## Bulk Actions
- Select multiple entries with checkboxes
- **Bulk Archive** — archive selected entries
- **Bulk Delete** — permanently remove
- **Export CSV** — download for reporting

---

# SLIDE 10: Filtering & Searching

## Quick Filters
- **Property**: View one property at a time
- **Unit Type**: 1BR, 2BR, 3BR, Studio
- **Status**: Active, Contacted, Leased, Archived
- **Entry Type**: Prospect or Internal Transfer
- **Agent**: Filter by assigned agent

## Search
- Type any name, email, or phone number
- Results update instantly

---

# SLIDE 11: Parking Manager Overview

## Main Dashboard

| Tab | Purpose |
|-----|---------|
| **Inventory** | View all parking spots by property |
| **1st Spot Waitlist** | Tenants waiting for their first spot |
| **2nd Spot Waitlist** | Tenants wanting a second spot |
| **Indoor Upgrade** | Tenants wanting to upgrade to indoor |
| **Change Requests** | Track terminations, additions, transfers |

---

# SLIDE 12: Parking Spot Statuses

| Status | Color | Meaning |
|--------|-------|---------|
| **Occupied** | Blue | Tenant assigned |
| **Vacant** | Green | Available for assignment |
| **Notice** | Yellow | Tenant gave notice, will be vacant soon |
| **Reserved** | Purple | Reserved for specific purpose |
| **Future** | Gray | Not yet available |

---

# SLIDE 13: Submitting a Parking Change

1. Go to **Change Requests** tab
2. Click **"+ Add Change Request"**
3. Start typing tenant name — autocomplete will appear
4. Select tenant — property and unit auto-fill
5. Choose **Change Type**:
   - **Termination** — remove from spot
   - **Add** — assign to a vacant spot
   - **Transfer** — move to a different spot
6. Fill in details and submit

*Changes sync to the master Google Sheet*

---

# SLIDE 14: Parking Waitlist

## Adding to Waitlist
1. Go to the appropriate waitlist tab (1st Spot, 2nd Spot, Indoor)
2. Click **"+ Add to Waitlist"**
3. Type tenant name — autocomplete shows matches
4. Select tenant — property and unit auto-fill
5. Add any notes
6. Save

## Priority
- Entries are ordered by date added (FIFO)
- When a spot opens, contact the first person on the list

---

# SLIDE 15: Tips & Best Practices

### Do's ✅
- Keep entries updated — mark as Contacted/Leased promptly
- Use date ranges for flexible prospects
- Archive old entries instead of deleting (keeps history)
- Check the Match Alerts section regularly

### Don'ts ❌
- Don't create duplicate entries for the same person
- Don't ignore the ⚠️ flexible match warnings
- Don't forget to update status after contacting

---

# SLIDE 16: Troubleshooting

| Issue | Solution |
|-------|----------|
| Can't find a prospect | Check filters — make sure "All" is selected |
| Match alert not received | Verify your email is correct in agent settings |
| Unit not showing in matches | Confirm it's marked as available in the Google Sheet |
| Parking spot not updating | Changes may take a few minutes to sync |

**Need help?** Contact Matthew Kaleb or Michael Dillon

---

# SLIDE 17: Summary

## What You Learned
1. How to access the Waitlist & Parking Manager
2. Adding and managing waitlist entries
3. How match alerts work
4. Managing parking inventory and change requests

## Next Steps
- Bookmark the URL
- Add your current prospects to the system
- Watch for match alert emails

---

# SLIDE 18: Questions?

🔗 **Access**: waitlist-hpvg.vercel.app

📧 **Support**: mkaleb@hpvgproperties.com

---

*Thank you for attending!*
