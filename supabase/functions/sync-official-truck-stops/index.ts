import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.google.com/',
};

interface StopRecord {
  brand: string;
  store_number: string;
  name: string;
  address: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  amenities: string[];
}

// ─── Static City Coordinate Lookup (for TA/Petro geocoding) ─────
const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  "Birmingham|AL": { lat: 33.5207, lon: -86.8025 },
  "Mobile|AL": { lat: 30.6954, lon: -88.0399 },
  "Montgomery|AL": { lat: 32.3792, lon: -86.3077 },
  "Huntsville|AL": { lat: 34.7304, lon: -86.5861 },
  "Tuscaloosa|AL": { lat: 33.2098, lon: -87.5692 },
  "Dothan|AL": { lat: 31.2232, lon: -85.3905 },
  "Hope Hull|AL": { lat: 32.2332, lon: -86.3977 },
  "Loxley|AL": { lat: 30.6174, lon: -87.7536 },
  "Flagstaff|AZ": { lat: 35.1983, lon: -111.6513 },
  "Phoenix|AZ": { lat: 33.4484, lon: -112.0740 },
  "Tucson|AZ": { lat: 32.2226, lon: -110.9747 },
  "Eloy|AZ": { lat: 32.7559, lon: -111.5541 },
  "Kingman|AZ": { lat: 35.1894, lon: -114.0530 },
  "Tonopah|AZ": { lat: 33.4548, lon: -112.9618 },
  "Little Rock|AR": { lat: 34.7465, lon: -92.2896 },
  "West Memphis|AR": { lat: 35.1465, lon: -90.1846 },
  "Pine Bluff|AR": { lat: 34.2284, lon: -92.0032 },
  "Barstow|CA": { lat: 34.8958, lon: -117.0173 },
  "Bakersfield|CA": { lat: 35.3733, lon: -119.0187 },
  "Los Angeles|CA": { lat: 34.0522, lon: -118.2437 },
  "Sacramento|CA": { lat: 38.5816, lon: -121.4944 },
  "Ripon|CA": { lat: 37.7413, lon: -121.1244 },
  "Lebec|CA": { lat: 34.8425, lon: -118.8656 },
  "Coachella|CA": { lat: 33.6803, lon: -116.1739 },
  "Ontario|CA": { lat: 34.0633, lon: -117.6509 },
  "Denver|CO": { lat: 39.7392, lon: -104.9903 },
  "Limon|CO": { lat: 39.2639, lon: -103.6922 },
  "Trinidad|CO": { lat: 37.1694, lon: -104.5008 },
  "Wheat Ridge|CO": { lat: 39.7661, lon: -105.0772 },
  "Milford|CT": { lat: 41.2223, lon: -73.0565 },
  "Bridgeport|CT": { lat: 41.1792, lon: -73.1894 },
  "Wilmington|DE": { lat: 39.7391, lon: -75.5398 },
  "Jacksonville|FL": { lat: 30.3322, lon: -81.6557 },
  "Orlando|FL": { lat: 28.5383, lon: -81.3792 },
  "Miami|FL": { lat: 25.7617, lon: -80.1918 },
  "Tampa|FL": { lat: 27.9506, lon: -82.4572 },
  "Ocala|FL": { lat: 29.1872, lon: -82.1401 },
  "Wildwood|FL": { lat: 28.8655, lon: -82.0440 },
  "Baldwin|FL": { lat: 30.3027, lon: -81.9751 },
  "Port St. Lucie|FL": { lat: 27.2730, lon: -80.3582 },
  "Lake City|FL": { lat: 30.1897, lon: -82.6393 },
  "Atlanta|GA": { lat: 33.7490, lon: -84.3880 },
  "Savannah|GA": { lat: 32.0809, lon: -81.0912 },
  "Brunswick|GA": { lat: 31.1499, lon: -81.4915 },
  "Tifton|GA": { lat: 31.4505, lon: -83.5085 },
  "Commerce|GA": { lat: 34.2037, lon: -83.4571 },
  "Boise|ID": { lat: 43.6150, lon: -116.2023 },
  "Twin Falls|ID": { lat: 42.5558, lon: -114.4701 },
  "Hammett|ID": { lat: 43.0135, lon: -115.4777 },
  "Chicago|IL": { lat: 41.8781, lon: -87.6298 },
  "Effingham|IL": { lat: 39.1200, lon: -88.5434 },
  "Pontoon Beach|IL": { lat: 38.7328, lon: -90.0801 },
  "Normal|IL": { lat: 40.5142, lon: -89.0115 },
  "Troy|IL": { lat: 38.7292, lon: -89.8834 },
  "Rochelle|IL": { lat: 41.9239, lon: -89.0687 },
  "Indianapolis|IN": { lat: 39.7684, lon: -86.1581 },
  "Gary|IN": { lat: 41.5934, lon: -87.3465 },
  "Whiteland|IN": { lat: 39.5501, lon: -86.0797 },
  "Remington|IN": { lat: 40.7609, lon: -87.1503 },
  "Greensburg|IN": { lat: 39.3370, lon: -85.4836 },
  "Des Moines|IA": { lat: 41.5868, lon: -93.6250 },
  "Davenport|IA": { lat: 41.5236, lon: -90.5776 },
  "Council Bluffs|IA": { lat: 41.2619, lon: -95.8608 },
  "Walcott|IA": { lat: 41.5847, lon: -90.7722 },
  "Wichita|KS": { lat: 37.6872, lon: -97.3301 },
  "Salina|KS": { lat: 38.8403, lon: -97.6114 },
  "Junction City|KS": { lat: 39.0286, lon: -96.8314 },
  "Topeka|KS": { lat: 39.0473, lon: -95.6752 },
  "Louisville|KY": { lat: 38.2527, lon: -85.7585 },
  "Corbin|KY": { lat: 36.9487, lon: -84.0968 },
  "Florence|KY": { lat: 38.9990, lon: -84.6266 },
  "Georgetown|KY": { lat: 38.2098, lon: -84.5588 },
  "Walton|KY": { lat: 38.8756, lon: -84.6102 },
  "New Orleans|LA": { lat: 29.9511, lon: -90.0715 },
  "Shreveport|LA": { lat: 32.5252, lon: -93.7502 },
  "Baton Rouge|LA": { lat: 30.4515, lon: -91.1871 },
  "Breaux Bridge|LA": { lat: 30.2735, lon: -91.8993 },
  "Slidell|LA": { lat: 30.2752, lon: -89.7812 },
  "Bangor|ME": { lat: 44.8016, lon: -68.7712 },
  "Baltimore|MD": { lat: 39.2904, lon: -76.6122 },
  "Jessup|MD": { lat: 39.1462, lon: -76.7753 },
  "Perryville|MD": { lat: 39.5601, lon: -76.0716 },
  "Shrewsbury|MA": { lat: 42.2960, lon: -71.7126 },
  "Detroit|MI": { lat: 42.3314, lon: -83.0458 },
  "Grand Rapids|MI": { lat: 42.9634, lon: -85.6681 },
  "Holland|MI": { lat: 42.7876, lon: -86.1089 },
  "Marshall|MI": { lat: 42.2728, lon: -84.9633 },
  "Saginaw|MI": { lat: 43.4195, lon: -83.9508 },
  "Minneapolis|MN": { lat: 44.9778, lon: -93.2650 },
  "Albert Lea|MN": { lat: 43.6480, lon: -93.3685 },
  "Rogers|MN": { lat: 45.1886, lon: -93.5530 },
  "Jackson|MS": { lat: 32.2988, lon: -90.1848 },
  "Meridian|MS": { lat: 32.3643, lon: -88.7037 },
  "Richland|MS": { lat: 32.2340, lon: -90.1585 },
  "Kansas City|MO": { lat: 39.0997, lon: -94.5786 },
  "St. Louis|MO": { lat: 38.6270, lon: -90.1994 },
  "Joplin|MO": { lat: 37.0842, lon: -94.5133 },
  "Kingdom City|MO": { lat: 38.9450, lon: -91.9332 },
  "Oak Grove|MO": { lat: 38.9626, lon: -94.1293 },
  "Billings|MT": { lat: 45.7833, lon: -108.5007 },
  "Missoula|MT": { lat: 46.8721, lon: -113.9940 },
  "Grand Island|NE": { lat: 40.9250, lon: -98.3420 },
  "Lincoln|NE": { lat: 40.8136, lon: -96.7026 },
  "Omaha|NE": { lat: 41.2565, lon: -95.9345 },
  "Las Vegas|NV": { lat: 36.1699, lon: -115.1398 },
  "Fernley|NV": { lat: 39.6080, lon: -119.2516 },
  "Bordentown|NJ": { lat: 40.1465, lon: -74.7119 },
  "Bloomsbury|NJ": { lat: 40.6554, lon: -75.0854 },
  "Albuquerque|NM": { lat: 35.0844, lon: -106.6504 },
  "Las Cruces|NM": { lat: 32.3199, lon: -106.7637 },
  "Moriarty|NM": { lat: 34.9900, lon: -106.0492 },
  "New York|NY": { lat: 40.7128, lon: -74.0060 },
  "Syracuse|NY": { lat: 43.0481, lon: -76.1474 },
  "Buffalo|NY": { lat: 42.8864, lon: -78.8784 },
  "Pembroke|NY": { lat: 42.9737, lon: -78.3139 },
  "Canastota|NY": { lat: 43.0786, lon: -75.7510 },
  "Charlotte|NC": { lat: 35.2271, lon: -80.8431 },
  "Raleigh|NC": { lat: 35.7796, lon: -78.6382 },
  "Whitsett|NC": { lat: 36.0682, lon: -79.6050 },
  "Lumberton|NC": { lat: 34.6182, lon: -79.0087 },
  "Bismarck|ND": { lat: 46.8083, lon: -100.7837 },
  "Fargo|ND": { lat: 46.8772, lon: -96.7898 },
  "Columbus|OH": { lat: 39.9612, lon: -82.9988 },
  "Cleveland|OH": { lat: 41.4993, lon: -81.6944 },
  "Cincinnati|OH": { lat: 39.1031, lon: -84.5120 },
  "Lodi|OH": { lat: 41.0334, lon: -82.0121 },
  "Jeffersonville|OH": { lat: 39.6545, lon: -83.5641 },
  "Newton Falls|OH": { lat: 41.1892, lon: -80.9792 },
  "Oklahoma City|OK": { lat: 35.4676, lon: -97.5164 },
  "Tulsa|OK": { lat: 36.1540, lon: -95.9928 },
  "Henryetta|OK": { lat: 35.4409, lon: -95.9820 },
  "Portland|OR": { lat: 45.5152, lon: -122.6784 },
  "Troutdale|OR": { lat: 45.5393, lon: -122.3871 },
  "Biggs Junction|OR": { lat: 45.6251, lon: -120.8371 },
  "Philadelphia|PA": { lat: 39.9526, lon: -75.1652 },
  "Pittsburgh|PA": { lat: 40.4406, lon: -79.9959 },
  "Harrisburg|PA": { lat: 40.2732, lon: -76.8867 },
  "Greencastle|PA": { lat: 39.7901, lon: -77.7278 },
  "New Stanton|PA": { lat: 40.2195, lon: -79.5939 },
  "Bloomsburg|PA": { lat: 41.0034, lon: -76.4549 },
  "Columbia|SC": { lat: 34.0007, lon: -81.0348 },
  "Dillon|SC": { lat: 34.4168, lon: -79.3712 },
  "Hardeeville|SC": { lat: 32.2816, lon: -81.0757 },
  "Sioux Falls|SD": { lat: 43.5460, lon: -96.7313 },
  "Rapid City|SD": { lat: 44.0805, lon: -103.2310 },
  "Nashville|TN": { lat: 36.1627, lon: -86.7816 },
  "Memphis|TN": { lat: 35.1495, lon: -90.0490 },
  "Knoxville|TN": { lat: 35.9606, lon: -83.9207 },
  "Cookeville|TN": { lat: 36.1628, lon: -85.5016 },
  "Crossville|TN": { lat: 35.9489, lon: -85.0269 },
  "Hurricane Mills|TN": { lat: 35.9620, lon: -87.7675 },
  "Dallas|TX": { lat: 32.7767, lon: -96.7970 },
  "Houston|TX": { lat: 29.7604, lon: -95.3698 },
  "San Antonio|TX": { lat: 29.4241, lon: -98.4936 },
  "Austin|TX": { lat: 30.2672, lon: -97.7431 },
  "El Paso|TX": { lat: 31.7619, lon: -106.4850 },
  "Laredo|TX": { lat: 27.5036, lon: -99.5076 },
  "Amarillo|TX": { lat: 35.2220, lon: -101.8313 },
  "Baytown|TX": { lat: 29.7355, lon: -94.9774 },
  "Waco|TX": { lat: 31.5493, lon: -97.1467 },
  "Terrell|TX": { lat: 32.7360, lon: -96.2753 },
  "Sweetwater|TX": { lat: 32.4709, lon: -100.4059 },
  "Weatherford|TX": { lat: 32.7593, lon: -97.7972 },
  "Edinburg|TX": { lat: 26.3017, lon: -98.1633 },
  "Hillsboro|TX": { lat: 32.0110, lon: -97.1300 },
  "Salt Lake City|UT": { lat: 40.7608, lon: -111.8910 },
  "St. George|UT": { lat: 37.0965, lon: -113.5684 },
  "Richmond|VA": { lat: 37.5407, lon: -77.4360 },
  "Wytheville|VA": { lat: 36.9487, lon: -81.0848 },
  "Raphine|VA": { lat: 37.9332, lon: -79.2228 },
  "Ruther Glen|VA": { lat: 38.0251, lon: -77.4655 },
  "Doswell|VA": { lat: 37.8626, lon: -77.4378 },
  "Seattle|WA": { lat: 47.6062, lon: -122.3321 },
  "Tacoma|WA": { lat: 47.2529, lon: -122.4443 },
  "Fife|WA": { lat: 47.2393, lon: -122.3571 },
  "Charleston|WV": { lat: 38.3498, lon: -81.6326 },
  "Beckley|WV": { lat: 37.7782, lon: -81.1882 },
  "Falling Waters|WV": { lat: 39.5879, lon: -77.8953 },
  "Milwaukee|WI": { lat: 43.0389, lon: -87.9065 },
  "Madison|WI": { lat: 43.0731, lon: -89.4012 },
  "Racine|WI": { lat: 42.7261, lon: -87.7829 },
  "Cheyenne|WY": { lat: 41.1400, lon: -104.8202 },
  "Rawlins|WY": { lat: 41.7911, lon: -107.2387 },
  "Evanston|WY": { lat: 41.2683, lon: -110.9632 },
  "Bucksville|SC": { lat: 33.6918, lon: -79.0867 },
  "Carnesville|GA": { lat: 34.3701, lon: -83.2354 },
  "Kenly|NC": { lat: 35.5968, lon: -78.1247 },
  "Stony Creek|VA": { lat: 36.9043, lon: -77.3983 },
  "Snowville|VA": { lat: 37.0568, lon: -80.5553 },
  "Lebanon|TN": { lat: 36.2081, lon: -86.2911 },
  "Mill Hall|PA": { lat: 41.1095, lon: -77.4856 },
  "Carlisle|PA": { lat: 40.2015, lon: -77.1886 },
  "Barkeyville|PA": { lat: 41.2106, lon: -79.9728 },
  "Clearfield|PA": { lat: 41.0270, lon: -78.4392 },
  "Glendale|KY": { lat: 37.6009, lon: -85.8969 },
  "London|KY": { lat: 37.1290, lon: -84.0833 },
  "Ellabell|GA": { lat: 32.1427, lon: -81.4707 },
  "Cordele|GA": { lat: 31.9635, lon: -83.7741 },
  "Lake Park|GA": { lat: 30.6868, lon: -83.1849 },
  "Hammond|LA": { lat: 30.5044, lon: -90.4612 },
  "Scott|LA": { lat: 30.2360, lon: -92.0943 },
  "Gonzales|LA": { lat: 30.2385, lon: -90.9201 },
  "Vicksburg|MS": { lat: 32.3526, lon: -90.8779 },
  "Columbia|MO": { lat: 38.9517, lon: -92.3341 },
  "Sullivan|MO": { lat: 38.2081, lon: -91.1604 },
  "Lebanon|MO": { lat: 37.6803, lon: -92.6638 },
  "Beto Junction|KS": { lat: 38.2853, lon: -95.6697 },
  "Concordia|KS": { lat: 39.5711, lon: -97.6625 },
  "Paxton|IL": { lat: 40.4603, lon: -88.0987 },
  "Peru|IL": { lat: 41.3275, lon: -89.1287 },
  "Mount Vernon|IL": { lat: 38.3172, lon: -88.9031 },
  "Greenfield|IN": { lat: 39.7851, lon: -85.7694 },
  "Lebanon|IN": { lat: 40.0484, lon: -86.4692 },
  "Brookville|OH": { lat: 39.8370, lon: -84.4127 },
  "Berea|OH": { lat: 41.3661, lon: -81.8543 },
  "Austinburg|OH": { lat: 41.7748, lon: -80.8654 },
  "Girard|OH": { lat: 41.1539, lon: -80.7006 },
  "Fort Worth|TX": { lat: 32.7555, lon: -97.3308 },
  "Lubbock|TX": { lat: 33.5779, lon: -101.8552 },
  "Odessa|TX": { lat: 31.9454, lon: -102.3676 },
  "Midland|TX": { lat: 31.9973, lon: -102.0779 },
  "Abilene|TX": { lat: 32.4487, lon: -99.7331 },
  "Tyler|TX": { lat: 32.3513, lon: -95.3011 },
  "Denton|TX": { lat: 33.2148, lon: -97.1331 },
  "Texarkana|TX": { lat: 33.4254, lon: -94.0477 },
  "Corsicana|TX": { lat: 32.0954, lon: -96.4689 },
  "Gainesville|TX": { lat: 33.6259, lon: -97.1336 },
  "San Marcos|TX": { lat: 29.8833, lon: -97.9414 },
  "New Braunfels|TX": { lat: 29.7030, lon: -98.1245 },
  "Seguin|TX": { lat: 29.5688, lon: -97.9647 },
  "Kerrville|TX": { lat: 30.0474, lon: -99.1404 },
  "Junction|TX": { lat: 30.4894, lon: -99.7720 },
  "Sonora|TX": { lat: 30.5669, lon: -100.6437 },
  "Van Horn|TX": { lat: 31.0398, lon: -104.8307 },
  "Pecos|TX": { lat: 31.4229, lon: -103.4932 },
  "Big Spring|TX": { lat: 32.2504, lon: -101.4787 },
  "Snyder|TX": { lat: 32.7179, lon: -100.9177 },
  "Childress|TX": { lat: 34.4265, lon: -100.2040 },
  "Shamrock|TX": { lat: 35.2140, lon: -100.2487 },
  "Dumas|TX": { lat: 35.8628, lon: -101.9735 },
  "Perryton|TX": { lat: 36.4003, lon: -100.8026 },
};

const US_STATE_CODES = [
  'al','ak','az','ar','ca','co','ct','de','fl','ga',
  'hi','id','il','in','ia','ks','ky','la','me','md',
  'ma','mi','mn','ms','mo','mt','ne','nv','nh','nj',
  'nm','ny','nc','nd','oh','ok','or','pa','ri','sc',
  'sd','tn','tx','ut','vt','va','wa','wv','wi','wy',
];

const US_STATES_NAME_TO_CODE: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
  'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
  'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
  'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH',
  'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC',
  'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA',
  'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', 'Tennessee': 'TN',
  'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA',
  'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
};

// ─── Love's Corporate Locator ────────────────────────────────────────
async function fetchLoves(): Promise<StopRecord[]> {
  console.log("[Love's] Fetching from Sitecore locator API...");
  const stops: StopRecord[] = [];

  try {
    const res = await fetch('https://www.loves.com/api/sitecore/StoreLocator/GetNearbyStores', {
      method: 'POST',
      headers: {
        ...BROWSER_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://www.loves.com/en/location-and-fuel-price-search',
        'Origin': 'https://www.loves.com',
      },
      body: 'latitude=39.8283&longitude=-98.5795&radius=5000&brandId=1',
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '[unreadable]');
      console.error(`[Love's] HTTP ${res.status} from StoreLocator`);
      console.error(`[Love's] Body (500 chars): ${body.substring(0, 500)}`);
      return stops;
    }

    const data = await res.json();
    const locations = Array.isArray(data) ? data : (data?.Stores || data?.stores || data?.locations || data?.results || []);

    for (const loc of locations) {
      const lat = loc.Latitude ?? loc.latitude ?? loc.lat ?? 0;
      const lng = loc.Longitude ?? loc.longitude ?? loc.lng ?? loc.lon ?? 0;
      const storeNum = String(loc.StoreNumber ?? loc.storeNumber ?? loc.store_number ?? loc.id ?? '');
      const name = loc.Name ?? loc.name ?? loc.StoreName ?? `Love's #${storeNum}`;
      const city = loc.City ?? loc.city ?? '';
      const state = loc.State ?? loc.state ?? '';
      const address = loc.Address1 ?? loc.address ?? loc.Address ?? '';

      if (!storeNum || lat === 0 || lng === 0) continue;

      stops.push({
        brand: "Love's",
        store_number: storeNum,
        name: String(name),
        address: String(address),
        city: String(city),
        state: String(state).toUpperCase().slice(0, 2),
        latitude: Number(lat),
        longitude: Number(lng),
        amenities: ['Diesel', 'Parking'],
      });
    }

    console.log(`[Love's] Parsed ${stops.length} locations from API`);
  } catch (err) {
    console.error("[Love's] Error:", err instanceof Error ? err.message : err);
  }

  return stops;
}

// ─── Pilot / Flying J (State Directory Pages with JSON-LD) ───────────
async function fetchPilot(): Promise<StopRecord[]> {
  console.log("[Pilot/FJ] Fetching from state directory pages...");
  const stops: StopRecord[] = [];
  const seen = new Set<string>();
  let statesProcessed = 0;

  for (const stateCode of US_STATE_CODES) {
    try {
      const url = `https://locations.pilotflyingj.com/us/${stateCode}`;
      const res = await fetch(url, {
        headers: {
          ...BROWSER_HEADERS,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Referer': 'https://locations.pilotflyingj.com/',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '[unreadable]');
        console.error(`[Pilot/FJ] HTTP ${res.status} from ${url}`);
        console.error(`[Pilot/FJ] Body (500 chars): ${body.substring(0, 500)}`);
        continue;
      }

      const html = await res.text();

      // Extract JSON-LD blocks
      const jsonLdRegex = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
      let match;
      while ((match = jsonLdRegex.exec(html)) !== null) {
        try {
          const jsonData = JSON.parse(match[1]);
          const items = Array.isArray(jsonData) ? jsonData : [jsonData];

          for (const item of items) {
            // Handle @graph arrays
            const locations = item['@graph'] ? item['@graph'] : [item];
            for (const loc of locations) {
              if (!loc.geo && !loc.latitude) continue;

              const lat = Number(loc.geo?.latitude ?? loc.latitude ?? 0);
              const lng = Number(loc.geo?.longitude ?? loc.longitude ?? 0);
              if (lat === 0 || lng === 0) continue;

              const name = loc.name || '';
              // Classify brand from name
              let brand = 'Pilot';
              const nameLower = name.toLowerCase();
              if (nameLower.includes('flying j')) brand = 'Flying J';
              else if (nameLower.includes('one9')) brand = 'One9';

              // Extract store number from name pattern like "Pilot Travel Center #180"
              const numMatch = name.match(/#(\d+)/);
              const storeNum = numMatch ? numMatch[1] : `${brand}-${stateCode.toUpperCase()}-${lat.toFixed(3)}`;

              const key = `${brand}-${storeNum}`;
              if (seen.has(key)) continue;
              seen.add(key);

              const addr = loc.address || {};
              stops.push({
                brand,
                store_number: storeNum,
                name: String(name),
                address: String(addr.streetAddress || ''),
                city: String(addr.addressLocality || ''),
                state: String(addr.addressRegion || stateCode).toUpperCase().slice(0, 2),
                latitude: lat,
                longitude: lng,
                amenities: ['Diesel', 'Parking'],
              });
            }
          }
        } catch {
          // JSON parse error for this block, skip
        }
      }

      statesProcessed++;
      // Be respectful - 500ms delay between state fetches
      if (statesProcessed < US_STATE_CODES.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (err) {
      console.error(`[Pilot/FJ] Error for state ${stateCode}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`[Pilot/FJ] Processed ${statesProcessed}/${US_STATE_CODES.length} states, found ${stops.length} locations`);
  return stops;
}

// ─── TA / Petro (Corporate HTML Directory + Static Geocoding) ────────
async function fetchTA(): Promise<StopRecord[]> {
  console.log("[TA/Petro] Fetching from corporate directory...");
  const stops: StopRecord[] = [];

  try {
    const res = await fetch('https://www.ta-petro.com/location/all-locations/', {
      headers: {
        ...BROWSER_HEADERS,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://www.ta-petro.com/',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '[unreadable]');
      console.error(`[TA/Petro] HTTP ${res.status}`);
      console.error(`[TA/Petro] Body (500 chars): ${body.substring(0, 500)}`);
      return stops;
    }

    const html = await res.text();
    console.log(`[TA/Petro] Received HTML: ${html.length} bytes`);
    let currentState = '';

    const lines = html.split('\n');
    for (const line of lines) {
      for (const [stateName, stateCode] of Object.entries(US_STATES_NAME_TO_CODE)) {
        if (line.includes(`>${stateName}<`) || line.includes(`##### ${stateName}`)) {
          currentState = stateCode;
          break;
        }
      }

      const locRegex = /(TA Express|TA Truck Service|Petro|TA)\s+(.+?)\s+#(\d{3,4})/g;
      let locMatch;
      while ((locMatch = locRegex.exec(line)) !== null) {
        const rawBrand = locMatch[1];
        const cityName = locMatch[2].trim();
        const storeNum = locMatch[3];

        const urlMatch = line.match(/\/location\/([a-z]{2})\//);
        const urlState = urlMatch ? urlMatch[1].toUpperCase() : '';
        const finalState = urlState || currentState;

        const cleanCity = cityName
          .replace(/^N\.\s*/, 'North ')
          .replace(/^S\.\s*/, 'South ')
          .replace(/^E\.\s*/, 'East ')
          .replace(/^W\.\s*/, 'West ')
          .replace(/^Ft\.\s*/, 'Fort ')
          .replace(/^Mt\.\s*/, 'Mount ')
          .replace(/^St\.\s*/, 'Saint ')
          .replace(/\s*\(\d+\)$/, '');

        const coordKey = `${cleanCity}|${finalState}`;
        const coords = CITY_COORDS[coordKey];

        stops.push({
          brand: rawBrand === 'TA Truck Service' ? 'TA' : rawBrand,
          store_number: storeNum,
          name: `${rawBrand} ${cityName} #${storeNum}`,
          address: '',
          city: cityName,
          state: finalState,
          latitude: coords?.lat ?? 0,
          longitude: coords?.lon ?? 0,
          amenities: ['Diesel', 'Parking'],
        });
      }
    }

    const withCoords = stops.filter(s => s.latitude !== 0);
    const withoutCoords = stops.filter(s => s.latitude === 0);
    console.log(`[TA/Petro] Parsed ${stops.length} locations: ${withCoords.length} geocoded, ${withoutCoords.length} missing coords`);
    if (withoutCoords.length > 0) {
      const missingCities = [...new Set(withoutCoords.map(s => `${s.city}|${s.state}`))];
      console.log(`[TA/Petro] Missing cities (first 20): ${missingCities.slice(0, 20).join(', ')}`);
    }
  } catch (err) {
    console.error('[TA/Petro] Error:', err instanceof Error ? err.message : err);
  }

  return stops;
}

// ─── Main Handler ─────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: isAdmin } = await supabaseUserClient.rpc('is_super_admin' as any);

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Super admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('Starting corporate-only truck stop sync...');

    // Delete all existing data first (fresh start)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { error: deleteError } = await supabase
      .from('official_truck_stops')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all rows
    if (deleteError) {
      console.warn('Delete existing rows warning:', deleteError.message);
    } else {
      console.log('Cleared existing truck stop data');
    }

    // Execute all three corporate fetchers concurrently
    const results = await Promise.allSettled([
      fetchLoves(),
      fetchPilot(),
      fetchTA(),
    ]);

    const brandLabels = ["Love's", "Pilot/Flying J", "TA/Petro"];
    const brandCounts: Record<string, number> = {};
    let allStops: StopRecord[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        brandCounts[brandLabels[i]] = result.value.length;
        allStops = allStops.concat(result.value);
        console.log(`${brandLabels[i]}: ${result.value.length} locations fetched`);
      } else {
        brandCounts[brandLabels[i]] = 0;
        console.error(`${brandLabels[i]} FAILED:`, result.reason);
      }
    }

    // Filter stops missing coordinates
    const validStops = allStops.filter(s => s.latitude !== 0 && s.longitude !== 0);
    console.log(`Total: ${allStops.length} fetched, ${validStops.length} with valid coordinates`);

    // Batch upsert
    let upserted = 0;
    for (let i = 0; i < validStops.length; i += 200) {
      const batch = validStops.slice(i, i + 200).map(s => ({
        ...s,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from('official_truck_stops')
        .upsert(batch, { onConflict: 'brand,store_number', ignoreDuplicates: false });

      if (error) {
        console.warn(`Upsert batch ${Math.floor(i / 200) + 1} error:`, error.message);
      } else {
        upserted += batch.length;
      }
    }

    const { count: totalCount } = await supabase
      .from('official_truck_stops')
      .select('*', { count: 'exact', head: true });

    const summary = {
      upserted,
      brand_counts: brandCounts,
      total_fetched: allStops.length,
      total_with_coords: validStops.length,
      total_in_database: totalCount || 0,
    };

    console.log('Sync complete:', JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Sync error:', error instanceof Error ? error.message : error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'An internal error occurred.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
