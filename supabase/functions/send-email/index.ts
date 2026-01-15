import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const payload = await req.json()
    
    // Supabase Webhooks wrap data in a "record" object
    // We map your database columns (first_name, last_name, email) to the email variables
    const record = payload.record 
    const applicant_name = `${record.first_name} ${record.last_name}`
    const applicant_email = record.email
    const position = record.desired_position || 'Security Guard'

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Aloha Security <onboarding@resend.dev>',
        to: ['krystelbooc25@gmail.com'], 
        subject: `New Application: ${applicant_name}`,
        html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #D2042D; padding: 20px; text-align: center; color: white;">
                <h1 style="margin: 0; font-size: 24px;">ALOHA SECURITY AGENCY</h1>
            </div>
            <div style="padding: 30px;">
                <h2 style="color: #D2042D;">New Application Received</h2>
                <p>A new candidate has applied. Details below:</p>
                <table style="width: 100%; border-collapse: collapse; background: #f9f9f9; padding: 15px;">
                    <tr><td style="padding: 10px;"><b>Name:</b></td><td>${applicant_name}</td></tr>
                    <tr><td style="padding: 10px;"><b>Email:</b></td><td>${applicant_email}</td></tr>
                    <tr><td style="padding: 10px;"><b>Position:</b></td><td>${position}</td></tr>
                </table>
                <div style="text-align: center; margin-top: 20px;">
                    <a href="https://your-dashboard.com" style="background: #1a1a1a; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px;">Review in Admin Panel</a>
                </div>
            </div>
        </div>`
      }),
    })

    return new Response(JSON.stringify({ message: "Sent" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})