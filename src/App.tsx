import { useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";

const GEO_BASE = "https://geocoding-api.open-meteo.com/v1/search";
const WX_BASE = "https://api.open-meteo.com/v1/forecast";

const WEATHER_CODE: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow fall",
  73: "Moderate snow fall",
  75: "Heavy snow fall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

function degToCompass(deg: number): string {
  const dirs = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  return dirs[Math.round(deg / 22.5) % 16];
}

function cToF(c: number): number {
  return (c * 9) / 5 + 32;
}

function formatHour(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Types for API data
interface Place {
  id: number;
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

interface CurrentWeather {
  temperature_2m: number;
  apparent_temperature: number;
  is_day: number;
  weather_code: number;
  wind_speed_10m: number;
  wind_direction_10m: number;
  relative_humidity_2m: number;
}

interface HourlyWeather {
  time: string[];
  temperature_2m: number[];
  precipitation_probability?: number[];
}

interface WeatherData {
  current: CurrentWeather;
  hourly: HourlyWeather;
}

export default function App() {
  const [query, setQuery] = useState<string>("");
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [unit, setUnit] = useState<"C" | "F">("C");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!query) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();
        const url = `${GEO_BASE}?name=${encodeURIComponent(
          query
        )}&count=5&language=en&format=json`;
        const res = await fetch(url, { signal: abortRef.current.signal });
        if (!res.ok) throw new Error("Failed to fetch suggestions");
        const data = await res.json();
        setSuggestions(data?.results || []);
      } catch (e: unknown) {
        if (e instanceof Error && e.name !== "AbortError") {
          console.error(e);
        }
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const handlePick = async (place: Place) => {
    setSelectedPlace(place);
    setSuggestions([]);
    setError("");
    if (!place) return;
    setLoading(true);
    setWeather(null);
    try {
      const params = new URLSearchParams({
        latitude: place.latitude.toString(),
        longitude: place.longitude.toString(),
        current: [
          "temperature_2m",
          "apparent_temperature",
          "is_day",
          "weather_code",
          "wind_speed_10m",
          "wind_direction_10m",
          "relative_humidity_2m",
        ].join(","),
        hourly: [
          "temperature_2m",
          "precipitation_probability",
          "relative_humidity_2m",
        ].join(","),
        timezone: "auto",
      });
      const wxRes = await fetch(`${WX_BASE}?${params.toString()}`);
      if (!wxRes.ok) throw new Error("Failed to fetch weather");
      const wx = await wxRes.json();
      setWeather(wx);
    } catch (e: unknown) {
      if (e instanceof Error) {
        setError(e.message || "Something went wrong");
      } else {
        setError("Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  };

  const current = useMemo(() => {
    if (!weather?.current) return null;
    const c = weather.current;
    const tempC = c.temperature_2m;
    const feelsC = c.apparent_temperature;
    return {
      temp: unit === "C" ? tempC : cToF(tempC),
      feels: unit === "C" ? feelsC : cToF(feelsC),
      isDay: !!c.is_day,
      wcode: c.weather_code,
      wind: c.wind_speed_10m,
      windDir: c.wind_direction_10m,
      humidity: c.relative_humidity_2m,
      label: WEATHER_CODE[c.weather_code] || "—",
      unitSymbol: unit === "C" ? "°C" : "°F",
    };
  }, [weather, unit]);

  const next12Hours = useMemo(() => {
    if (!weather?.hourly) return [];
    const { time, temperature_2m, precipitation_probability } = weather.hourly;
    const now = Date.now();
    const items: { time: string; temp: number; pop: number }[] = [];
    for (let i = 0; i < time.length && items.length < 12; i++) {
      const t = new Date(time[i]).getTime();
      if (t >= now) {
        const tempC = temperature_2m[i];
        items.push({
          time: time[i],
          temp: unit === "C" ? tempC : cToF(tempC),
          pop: precipitation_probability?.[i] ?? 0,
        });
      }
    }
    return items;
  }, [weather, unit]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>
          Weather <span className="accent">Now</span>
        </h1>
        <div className="unit-toggle" role="group" aria-label="Units">
          <button
            className={unit === "C" ? "active" : ""}
            onClick={() => setUnit("C")}
            aria-pressed={unit === "C"}
          >
            °C
          </button>
          <button
            className={unit === "F" ? "active" : ""}
            onClick={() => setUnit("F")}
            aria-pressed={unit === "F"}
          >
            °F
          </button>
        </div>
      </header>

      <main>
        <section className="search">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (suggestions.length > 0) handlePick(suggestions[0]);
            }}
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search city or place (e.g., Hyderabad)"
              aria-label="Search city"
            />
            <button type="submit">Search</button>
          </form>

          {suggestions.length > 0 && (
            <ul className="suggestions" role="listbox">
              {suggestions.map((s) => (
                <li key={`${s.id}-${s.latitude}-${s.longitude}`}>
                  <button
                    onClick={() => handlePick(s)}
                    role="option"
                    aria-label={`Select ${s.name}`}
                  >
                    <span className="s-name">{s.name}</span>
                    <span className="s-sub">
                      {[s.admin1, s.country].filter(Boolean).join(", ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {error && <div className="error">{error}</div>}
        {loading && <div className="loading">Fetching the sky…</div>}

        {selectedPlace && (
          <div className="place-meta">
            <h2>
              {selectedPlace.name}
              {selectedPlace.admin1 ? `, ${selectedPlace.admin1}` : ""}
              {selectedPlace.country ? `, ${selectedPlace.country}` : ""}
            </h2>
            <div className="coords">
              {selectedPlace.latitude.toFixed(2)}°,{" "}
              {selectedPlace.longitude.toFixed(2)}°
            </div>
          </div>
        )}

        {current && (
          <section className="current">
            <div className="current-card">
              <div className="temp">
                <span className="value">{Math.round(current.temp)}</span>
                <span className="unit">{current.unitSymbol}</span>
              </div>
              <div className="label">{current.label}</div>
              <div className="meta">
                <div>
                  <span className="k">Feels like</span>
                  <span className="v">
                    {Math.round(current.feels)}
                    {current.unitSymbol}
                  </span>
                </div>
                <div>
                  <span className="k">Humidity</span>
                  <span className="v">{current.humidity}%</span>
                </div>
                <div>
                  <span className="k">Wind</span>
                  <span className="v">
                    {current.wind} km/h {degToCompass(current.windDir)}
                  </span>
                </div>
              </div>
            </div>
          </section>
        )}

        {next12Hours.length > 0 && (
          <section className="hourly">
            <h3>Next 12 hours</h3>
            <div className="hourly-list">
              {next12Hours.map((h) => (
                <div key={h.time} className="hour">
                  <div className="h-time">{formatHour(h.time)}</div>
                  <div className="h-temp">
                    {Math.round(h.temp)}
                    {unit === "C" ? "°C" : "°F"}
                  </div>
                  <div className="h-pop">💧 {h.pop ?? 0}%</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {!current && !loading && !error && (
          <div className="empty">Search a city to see the weather.</div>
        )}
      </main>

      <footer className="app-footer">
        <span>Powered by Open-Meteo</span>
        <a
          href="https://open-meteo.com/"
          target="_blank"
          rel="noreferrer"
          aria-label="Open Meteo website"
        >
          API Docs
        </a>
      </footer>
    </div>
  );
}
