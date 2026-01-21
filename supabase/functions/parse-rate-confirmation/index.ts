import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { decode as base64Decode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface IntermediateStop {
  stop_number: number;
  stop_type: string; // "Pickup" or "Drop"
  address: string;
  date: string | null;
  facility_name: string | null;
}

interface ExtractedLoadData {
  landstar_load_id: string | null;
  agency_code: string | null;
  origin: string | null;
  destination: string | null;
  pickup_date: string | null;
  pickup_time: string | null;
  delivery_date: string | null;
  delivery_time: string | null;
  booked_miles: number | null;
  rate: number | null;
  fuel_surcharge: number | null;
  driver_name: string | null;
  truck_unit: string | null;
  trailer_number: string | null;
  accessorials: Array<{
    type: string;
    amount: number;
    notes?: string;
  }>;
  intermediate_stops: IntermediateStop[];
  notes: string | null;
  confidence: Record<string, number>;
}

serve(async (req) => {
  // Handle CORS preflight requests
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

    console.log("Parsing rate confirmation PDF, base64 length:", pdfBase64.length);

    // Use Gemini's multimodal capabilities to read the PDF directly
    const systemPrompt = `You are an expert at extracting structured data from Landstar BCO Load Detail documents (Rate Confirmations). 
You will be given a PDF document image. Extract the load information accurately and return it in a structured JSON format.

CRITICAL INSTRUCTIONS:
1. For the landstar_load_id, you MUST use the "Freight Bill #" value (a numeric value like 6725288), NOT the "Load #" (which starts with letters like EL8964000). The Freight Bill # is typically a 7-digit number.

2. For ADDRESSES: Extract the FULL address including street address, city, state, and ZIP code when available.
   - Look in the "Stop Information" section for complete addresses
   - Include facility/company name if shown
   - Format: "123 Main St, City, ST 12345" or "Company Name, 123 Main St, City, ST 12345"

3. For MULTI-STOP LOADS:
   - The "origin" should be the FIRST stop (Stop 1) with its full address
   - The "destination" should be the LAST stop with its full address
   - ALL stops between the first and last should be captured in the "intermediate_stops" array
   - Each intermediate stop should include: stop number, type (Pickup/Drop), full address, date, and facility name if available

4. Dates should be in YYYY-MM-DD format.
5. Look for "Agency Name" for the agency code (last 3 letters like LTL or BLR).
6. For accessorials, extract any charges that aren't the base Line Haul or Fuel Surcharge (like Stop Of, Detention, etc.).
7. For TIMES: Extract pickup and delivery appointment times in 12-hour format (e.g., "8:00 AM", "2:30 PM"). Look for times next to or below dates in the stop information section.`;

    const userPrompt = `Analyze this Landstar BCO Load Detail PDF document and extract the load information.

Return ONLY a valid JSON object with this exact structure (no markdown, no code blocks):
{
  "landstar_load_id": "Freight Bill # value - a NUMERIC value like 6725288, NOT the Load # which starts with EL",
  "agency_code": "3-letter agency code from Agency Name (e.g., LTL from 'B-Line Logistics LLC - LTL')",
  "origin": "FULL address of first pickup stop including street, city, state, ZIP (e.g., '1234 Industrial Blvd, Lewisville, TX 75057')",
  "destination": "FULL address of final delivery stop including street, city, state, ZIP (e.g., '5678 Commerce Dr, Evans, CO 80620')",
  "pickup_date": "First pickup date in YYYY-MM-DD format",
  "pickup_time": "Pickup appointment time in 12-hour format (e.g., '8:00 AM', '2:30 PM') or null if not specified",
  "delivery_date": "Final delivery date in YYYY-MM-DD format",
  "delivery_time": "Delivery appointment time in 12-hour format (e.g., '10:00 AM', '4:00 PM') or null if not specified",
  "booked_miles": Total Distance in miles as a number,
  "rate": Line Haul amount as a number (no $ or commas),
  "fuel_surcharge": Fuel Surcharge total amount as a number,
  "driver_name": "Driver name from Driver(s) field",
  "truck_unit": "Tractor # value",
  "trailer_number": "Trailer # value if present",
  "accessorials": [
    {"type": "accessorial type like Stop Of", "amount": number value, "notes": "optional"}
  ],
  "intermediate_stops": [
    {
      "stop_number": 2,
      "stop_type": "Pickup or Drop",
      "address": "Full address of the stop",
      "date": "YYYY-MM-DD",
      "facility_name": "Name of facility if shown"
    }
  ],
  "notes": "Any important notes from the document",
  "confidence": {
    "landstar_load_id": 0-100,
    "origin": 0-100,
    "destination": 0-100,
    "rate": 0-100,
    "pickup_date": 0-100
  }
}

IMPORTANT: 
- Extract the ACTUAL data from this specific PDF document. Do not use example data.
- For origin and destination, always try to extract the FULL address with street, city, state, and ZIP.
- If there are stops between the first and last stop, include them in intermediate_stops array.
- If this is a simple 2-stop load (origin to destination), leave intermediate_stops as an empty array [].
- Extract pickup_time and delivery_time from the stop information - they may appear next to or below the dates.`;

    // Call Gemini with the PDF as a document
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
        temperature: 0.1, // Low temperature for more consistent extraction
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
      
      throw new Error(`AI Gateway error: ${response.status} - ${errorText}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response from AI");
    }

    console.log("AI response:", content);

    // Parse the JSON response
    let extractedData: ExtractedLoadData;
    try {
      // Clean the response in case there's markdown formatting
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

    console.log("Extracted data:", extractedData);

    return new Response(JSON.stringify(extractedData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Parse rate confirmation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
