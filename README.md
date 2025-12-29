# Property Management Waitlist & Transfer System

A Next.js web application for managing property waitlists with priority-based matching for internal transfers and prospects.

## Features

- **Transfer First Rule**: Internal residents requesting transfers always rank higher than outside prospects
- **Agent Ownership**: Track assigned agents and identify open leads
- **Smart Matching**: Match leads based on unit type, floor preference, price range, and move-in date
- **Dashboard**: Master table with sorting, filtering, and status management
- **Unit Matcher**: Find matching waitlist entries for available units

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS
- **UI Components**: Shadcn UI
- **Database**: Supabase
- **Form Handling**: React Hook Form
- **Validation**: Zod

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Supabase

Create a `.env.local` file in the project root with your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Create Database Table

Run the SQL migration in your Supabase SQL Editor. The migration file is located at `supabase-migration.sql`.

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Database Schema

The `waitlist_entries` table includes:

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| created_at | timestamp | Entry creation time |
| entry_type | text | 'Internal Transfer' or 'Prospect' |
| status | text | 'Active', 'Contacted', 'Leased', or 'Closed' |
| full_name | text | Lead's full name |
| email | text | Contact email |
| phone | text | Contact phone |
| assigned_agent | text | Agent name (nullable for open leads) |
| unit_type_pref | text | Preferred unit type (Studio, 1BR, 2BR, etc.) |
| floor_pref | text | Floor preference |
| max_budget | numeric | Maximum monthly budget |
| move_in_date | date | Desired move-in date |
| current_unit_number | text | Current unit (for transfers only) |
| internal_notes | text | Private notes |

## Business Rules

1. **Transfer Priority**: Internal transfers always appear before prospects in all lists and search results
2. **Open Leads**: Entries without an assigned agent are marked as "Open Lead"
3. **Matching Logic**: The Unit Matcher filters by unit type, floor preference (respects "No Preference"), budget (lead's max >= unit price), and move-in date compatibility
