import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const resend = new Resend(process.env.RESEND_API_KEY);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Production agent emails
const AGENT_EMAILS: Record<string, string> = {
  'Matthew Kaleb': 'mkaleb@hpvgproperties.com',
  'Michael Dillon': 'mdillon@hpvgproperties.com',
  'Unassigned': 'leasing@hpvgproperties.com',
};

// Helper to get agent email with fallback to leasing for unassigned
const getAgentEmail = (agent: string | null | undefined): string => {
  if (!agent || agent === '' || agent === 'Unassigned') {
    return AGENT_EMAILS['Unassigned'];
  }
  return AGENT_EMAILS[agent] || AGENT_EMAILS['Unassigned'];
};

interface WaitlistContact {
  name: string;
  email: string;
  phone: string;
  entry_type: string;
  budget: number;
  move_in_date: string;
}

interface NotifyRequest {
  unit: {
    property: string;
    unit_number: string;
    unit_type: string;
    rent_price: number;
    available_date: string;
  };
  agent: string;
  contacts: WaitlistContact[];
}

export async function POST(request: NextRequest) {
  try {
    const body: NotifyRequest = await request.json();
    const { unit, agent, contacts } = body;

    const agentEmail = getAgentEmail(agent);
    const displayAgent = agent || 'Unassigned';

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ error: 'No contacts provided' }, { status: 400 });
    }

    // Build contact list HTML
    const contactListHtml = contacts.map((c, idx) => `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 12px 8px;">${idx + 1}</td>
        <td style="padding: 12px 8px;">
          <strong>${c.name}</strong>
          <span style="background: ${c.entry_type === 'Internal Transfer' ? '#2563eb' : '#6b7280'}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-left: 8px;">
            ${c.entry_type === 'Internal Transfer' ? '🏠 Transfer' : '👤 Prospect'}
          </span>
        </td>
        <td style="padding: 12px 8px;">${c.email || 'N/A'}</td>
        <td style="padding: 12px 8px;">${c.phone || 'N/A'}</td>
        <td style="padding: 12px 8px;">$${c.budget > 0 ? c.budget.toLocaleString() : 'Any'}</td>
        <td style="padding: 12px 8px;">${new Date(c.move_in_date).toLocaleDateString()}</td>
      </tr>
    `).join('');

    try {
      const { data, error } = await resend.emails.send({
        from: 'Waitlist Manager <noreply@hpvgproperties.com>',
        to: agentEmail,
        subject: `🔔 Match Alert: ${unit.property} Unit ${unit.unit_number} - ${contacts.length} people waiting`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
            <h2 style="color: #333;">Waitlist Match Alert</h2>
            <p>A unit has become available with <strong>${contacts.length}</strong> matching waitlist ${contacts.length === 1 ? 'entry' : 'entries'}:</p>
            
            <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
              <h3 style="margin-top: 0; color: #2563eb;">${unit.property} - Unit ${unit.unit_number}</h3>
              <p style="margin: 5px 0;"><strong>Type:</strong> ${unit.unit_type}</p>
              <p style="margin: 5px 0;"><strong>Rent:</strong> $${unit.rent_price.toLocaleString()}/month</p>
              <p style="margin: 5px 0;"><strong>Available:</strong> ${unit.available_date ? new Date(unit.available_date).toLocaleDateString() : 'Now'}</p>
            </div>
            
            <h3 style="color: #333; margin-top: 30px;">People to Contact (Priority Order):</h3>
            <p style="color: #666; font-size: 14px;">Internal Transfers are listed first per the "Transfer First" policy.</p>
            
            <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
              <thead>
                <tr style="background: #f5f5f5;">
                  <th style="padding: 12px 8px; text-align: left;">#</th>
                  <th style="padding: 12px 8px; text-align: left;">Name</th>
                  <th style="padding: 12px 8px; text-align: left;">Email</th>
                  <th style="padding: 12px 8px; text-align: left;">Phone</th>
                  <th style="padding: 12px 8px; text-align: left;">Budget</th>
                  <th style="padding: 12px 8px; text-align: left;">Move-in</th>
                </tr>
              </thead>
              <tbody>
                ${contactListHtml}
              </tbody>
            </table>
            
            <p style="color: #666; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              This is an automated notification from the Waitlist Manager system.
            </p>
          </div>
        `,
      });

      if (error) {
        console.error(`Failed to send to ${agentEmail}:`, error);
        return NextResponse.json({ 
          success: false, 
          error: error.message,
          agentEmail 
        }, { status: 500 });
      }

      // Track matches in database - update waitlist entries with matched_at timestamp
      const contactEmails = contacts.map(c => c.email?.toLowerCase()).filter(Boolean);
      if (contactEmails.length > 0) {
        const { error: updateError } = await supabase
          .from('waitlist_entries')
          .update({ 
            matched_at: new Date().toISOString(),
            outcome_status: 'matched'
          })
          .in('email', contactEmails)
          .is('matched_at', null); // Only update if not already matched
        
        if (updateError) {
          console.error('Failed to update matched_at:', updateError);
        } else {
          console.log(`[Notify] Updated ${contactEmails.length} entries with matched_at`);
        }
      }

      return NextResponse.json({
        success: true,
        message: `Email sent to ${displayAgent} (${agentEmail})`,
        emailId: data?.id,
        agentEmail,
        contactCount: contacts.length,
      });
    } catch (err) {
      console.error(`Error sending to ${agentEmail}:`, err);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to send email',
        agentEmail 
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Notification API error:', error);
    return NextResponse.json(
      { error: 'Failed to process notification request' },
      { status: 500 }
    );
  }
}
