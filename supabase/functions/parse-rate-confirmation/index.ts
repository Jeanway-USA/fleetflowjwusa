import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExtractedLoadData {
  landstar_load_id: string | null;
  agency_code: string | null;
  origin: string | null;
  destination: string | null;
  pickup_date: string | null;
  delivery_date: string | null;
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
  notes: string | null;
  confidence: Record<string, number>;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { pdfText } = await req.json();

    if (!pdfText || typeof pdfText !== "string") {
      return new Response(
        JSON.stringify({ error: "PDF text content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Parsing rate confirmation, text length:", pdfText.length);

    const systemPrompt = `You are an expert at extracting structured data from Landstar BCO Load Detail documents (Rate Confirmations). 
Extract the load information accurately and return it in a structured format.
Be careful with dates - they should be in YYYY-MM-DD format.
For locations, combine the city and state (e.g., "Baldwyn, MS").
For accessorials, extract any charges that aren't the base Linehaul or Fuel Surcharge.`;

    const userPrompt = `Extract the following information from this Landstar BCO Load Detail document and return ONLY a JSON object (no markdown, no code blocks):

Document text:
${pdfText}

Required JSON structure:
{
  "landstar_load_id": "Load # (e.g., EL8984471)",
  "agency_code": "3-letter agency code from Agency Name (e.g., BLR from 'Veazey Logistics LLC - BLR')",
  "origin": "First pickup city, state (e.g., 'Baldwyn, MS')",
  "destination": "Final delivery city, state (e.g., 'The Colony, TX')",
  "pickup_date": "First pickup date in YYYY-MM-DD format",
  "delivery_date": "Final delivery date in YYYY-MM-DD format", 
  "booked_miles": "Total Distance in miles as a number",
  "rate": "Linehaul amount as a number (no $ or commas)",
  "fuel_surcharge": "Fuel Surcharge amount as a number",
  "driver_name": "Driver name if available",
  "truck_unit": "Tractor # if available",
  "trailer_number": "Trailer # if available",
  "accessorials": [
    {"type": "accessorial type", "amount": number, "notes": "optional notes"}
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

Return ONLY valid JSON, no additional text.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
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
      
      throw new Error(`AI Gateway error: ${response.status}`);
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
