import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Allowed origins for CORS - restrict to known domains
const ALLOWED_ORIGINS = [
  'https://id-preview--a815e5bc-e7f9-4eda-be65-87a78fb56f21.lovable.app',
  'http://localhost:5173',
  'http://localhost:8080',
];

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const isAllowed = ALLOWED_ORIGINS.some(allowed => 
    origin === allowed || origin.endsWith('.lovable.app') || origin.endsWith('.lovableproject.com')
  );
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
}

interface ExtractedExpense {
  date: string;
  expense_type: string;
  amount: number;
  trip_number: string | null;
  description: string;
  vendor: string | null;
  gallons: number | null;
  is_discount: boolean;
  is_reimbursement: boolean;
}

interface ParsedStatement {
  statement_type: 'card_activity' | 'contractor';
  period_start: string | null;
  period_end: string | null;
  unit_number: string | null;
  expenses: ExtractedExpense[];
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate user authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase configuration missing');
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log("Authenticated user:", user.id);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { pdfBase64 } = await req.json();

    if (!pdfBase64 || typeof pdfBase64 !== "string") {
      return new Response(
        JSON.stringify({ error: "PDF base64 content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Parsing Landstar statement, base64 length:", pdfBase64.length);

    const systemPrompt = `You are an expert at extracting expense data from Landstar Card Activity Statements and Contractor Statements.
You will be given a PDF document. Identify the statement type and extract ALL expense line items accurately.

STATEMENT TYPES:
1. Card Activity Statement - Contains fuel purchases, DEF purchases, cash advances, direct deposit fees, and other card-related transactions
2. Contractor Statement - Contains trip-related deductions, scheduled deductions (permits, registration, insurance, escrow), and adjustments

EXPENSE TYPE MAPPING - Use these exact expense_type values:
- Fuel purchases (DIESEL, fuel) → "Fuel"
- DEF Pumped → "DEF"
- NATS Discount, Fuel Discount → "Fuel Discount" (amount should be NEGATIVE)
- Card Fee, Transaction Fee → "Card Fee"
- TRKSTP SCN, Trip Scanning → "Trip Scanning"
- Card Pre-Trip, Card Load → "Card Load"
- Cash Advance → "Cash Advance"
- Direct-Deposit Fee, DD Fee → "Direct Deposit Fee"
- TRIP% ESCROW PAYMENT, Escrow → "Escrow Payment"
- PERMITS, Permit → "Licensing/Permits"
- PLATE, Registration, Plates → "Registration/Plates"
- LCN FEES, LCN → "LCN/Satellite"
- UNLADEN LIABILITY, Insurance → "Insurance"
- CPP, Benefits → "CPP/Benefits"
- NTP TRUCK WARRANTY, Warranty → "Truck Warranty"
- PREPASS, Scale → "PrePass/Scale"
- BP OTA, NTTA, E470, Tolls → "Tolls"
- Parking → "Parking"
- IFTA → "IFTA"
- Maintenance, Repair → "Maintenance"
- Truck Payment → "Truck Payment"
- Trailer Payment → "Trailer Payment"
- Cell Phone → "Cell Phone"
- Any other expenses → "Misc"

REIMBURSEMENTS & CREDITS - These are REVENUE (money coming back):
- Look for keywords: "REIMB", "REIMBURSEMENT", "REFUND", "CREDIT", "ADJUSTMENT CR", "REBATE"
- Mark these with is_reimbursement: true
- Use expense_type: "Reimbursement" for these items
- The amount should be POSITIVE (it's money returned to the driver/company)

TRIP NUMBER EXTRACTION:
- Look for Trip Numbers in formats like "DLE 6065079", "EL8 1234567", etc.
- Extract ONLY the numeric portion (e.g., "6065079" from "DLE 6065079")
- Trip numbers are typically 7 digits
- If no trip number is associated with an expense, set trip_number to null

AMOUNT HANDLING:
- Extract amounts as positive numbers EXCEPT for discounts/credits
- For NATS Discounts and similar credits, make the amount NEGATIVE
- For reimbursements, keep amount POSITIVE (they reduce total expenses)
- Parse amounts correctly even if they have parentheses (negative) or CR suffix

GALLONS:
- For Fuel and DEF purchases, extract the gallons if shown
- Look for patterns like "50.000 GAL" or "45.5 gallons"`;

    const userPrompt = `Analyze this Landstar statement PDF and extract ALL expense line items.

Return ONLY a valid JSON object with this exact structure (no markdown, no code blocks):
{
  "statement_type": "card_activity" or "contractor",
  "period_start": "YYYY-MM-DD or null",
  "period_end": "YYYY-MM-DD or null",
  "unit_number": "Truck unit number if shown, or null",
  "expenses": [
    {
      "date": "YYYY-MM-DD",
      "expense_type": "Use exact type from mapping above",
      "amount": number (positive for expenses, negative for discounts/credits, positive for reimbursements),
      "trip_number": "7-digit number only (no letters) or null",
      "description": "Original description from statement",
      "vendor": "Vendor/location name if available, or null",
      "gallons": number or null (for fuel/DEF only),
      "is_discount": true/false (true if this is a fuel discount or similar credit),
      "is_reimbursement": true/false (true if this is a reimbursement, refund, or money returned)
    }
  ]
}

IMPORTANT:
- Extract EVERY expense line from ALL pages of the document
- Use the exact expense_type values from the mapping
- For Trip Numbers, extract only the numeric portion (remove 3-letter prefix)
- Fuel discounts (like NATS) should have negative amounts and is_discount: true
- Reimbursements (REIMB, REFUND, CREDIT, REBATE) should have positive amounts and is_reimbursement: true
- Include the original description for reference
- If the document has multiple pages, process all of them
- Group related items (like fuel purchase + NATS discount) as separate line items`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { 
            role: "user", 
            content: [
              { type: "text", text: userPrompt },
              { 
                type: "image_url", 
                image_url: { 
                  url: `data:application/pdf;base64,${pdfBase64}` 
                } 
              }
            ]
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error('Document processing service is temporarily unavailable.');
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response from AI");
    }

    console.log("AI response:", content);

    let extractedData: ParsedStatement;
    try {
      let cleanContent = content.trim();
      if (cleanContent.startsWith("```json")) {
        cleanContent = cleanContent.slice(7);
      }
      if (cleanContent.startsWith("```")) {
        cleanContent = cleanContent.slice(3);
      }
      if (cleanContent.endsWith("```")) {
        cleanContent = cleanContent.slice(0, -3);
      }
      extractedData = JSON.parse(cleanContent.trim());
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      console.error("Raw content:", content);
      throw new Error("Failed to parse extracted data");
    }

    console.log("Extracted statement data:", extractedData);
    console.log("Total expenses extracted:", extractedData.expenses?.length || 0);

    return new Response(JSON.stringify(extractedData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Parse Landstar statement error:", error);
    const safeMessage = (error instanceof Error && (
      error.message === 'Failed to parse extracted data' ||
      error.message === 'Document processing service is temporarily unavailable.'
    )) ? error.message : 'An internal error occurred while parsing the statement.';
    return new Response(
      JSON.stringify({ error: safeMessage }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
