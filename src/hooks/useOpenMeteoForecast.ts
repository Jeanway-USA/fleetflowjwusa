import { useQuery } from '@tanstack/react-query';

export interface DailyForecast {
  date: string; // ISO date
  weatherCode: number;
  tempMaxF: number;
  tempMinF: number;
  precipProb: number;
  windMph: number;
}

interface Coords {
  lat: number;
  lng: number;
}

async function fetchForecast(coords: Coords): Promise<DailyForecast[]> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', coords.lat.toFixed(4));
  url.searchParams.set('longitude', coords.lng.toFixed(4));
  url.searchParams.set(
    'daily',
    'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',
  );
  url.searchParams.set('temperature_unit', 'fahrenheit');
  url.searchParams.set('wind_speed_unit', 'mph');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '7');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const data = await res.json();
  const daily = data?.daily;
  if (!daily?.time?.length) throw new Error('Malformed Open-Meteo response');

  const out: DailyForecast[] = daily.time.map((date: string, i: number) => ({
    date,
    weatherCode: Number(daily.weather_code?.[i] ?? 0),
    tempMaxF: Number(daily.temperature_2m_max?.[i] ?? 0),
    tempMinF: Number(daily.temperature_2m_min?.[i] ?? 0),
    precipProb: Number(daily.precipitation_probability_max?.[i] ?? 0),
    windMph: Number(daily.wind_speed_10m_max?.[i] ?? 0),
  }));
  return out;
}

export function useOpenMeteoForecast(coords: Coords | null | undefined) {
  const key = coords ? `${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}` : null;
  return useQuery({
    queryKey: ['open-meteo-forecast', key],
    queryFn: () => fetchForecast(coords!),
    enabled: !!coords,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });
}
