const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const weatherCache = new Map();
const regionCache = new Map();

const RAIN_MM_THRESHOLD = 10;
const DEFAULT_GEO = {
  lat: -22.9068,
  lon: -43.1729,
  label: 'Rio de Janeiro, RJ',
  display: 'Rio de Janeiro, RJ · Brasil',
  city: 'Rio de Janeiro',
  state: 'Rio de Janeiro',
  country: 'Brasil',
};

function formatRegionDisplay(city, state, country) {
  const parts = [];
  if (city) parts.push(city);
  if (state && state !== city) parts.push(state);
  const main = parts.join(', ');
  return country ? `${main} · ${country}` : main;
}

async function resolveWeatherRegion(lat, lon) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = regionCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: 'json',
    'accept-language': 'pt-BR',
    zoom: '10',
  });
  const url = `https://nominatim.openstreetmap.org/reverse?${params}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: { 'User-Agent': 'TagmeBI/1.0 (dashboard clima; contato@tagme.com.br)' },
  });
  if (!res.ok) throw new Error(`Região: HTTP ${res.status}`);
  const json = await res.json();
  const addr = json.address || {};
  const city = addr.city || addr.town || addr.municipality || addr.county || addr.state_district || null;
  const state = addr.state || null;
  const country = addr.country || 'Brasil';
  const uf = addr['ISO3166-2-lvl4']?.split('-')[1] || null;
  const data = {
    city,
    state,
    country,
    uf,
    display: formatRegionDisplay(city, state, country),
    shortLabel: city && uf ? `${city}, ${uf}` : formatRegionDisplay(city, state, null),
  };
  regionCache.set(key, { at: Date.now(), data });
  return data;
}

function buildGeoDescription({ hasVenueGeo, venueCountWithGeo, venueCountTotal, region, isFallback }) {
  const place = region?.display || region?.shortLabel || 'região de referência';
  if (isFallback) {
    return `Clima (Open-Meteo) para ${place} — referência padrão, pois nenhuma das ${venueCountTotal} loja(s) selecionada(s) possui coordenada no cadastro.`;
  }
  if (venueCountWithGeo < venueCountTotal) {
    return `Clima (Open-Meteo) na região de ${place}, calculado no centróide de ${venueCountWithGeo} de ${venueCountTotal} lojas com coordenada cadastrada.`;
  }
  return `Clima (Open-Meteo) na região de ${place}, calculado no centróide das ${venueCountWithGeo} lojas selecionadas.`;
}

async function fetchDailyWeather(lat, lon, startYmd, endYmd) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}|${startYmd}|${endYmd}`;
  const cached = weatherCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: startYmd,
    end_date: endYmd,
    daily: 'precipitation_sum,rain_sum,temperature_2m_max,weathercode',
    timezone: 'America/Sao_Paulo',
  });
  const url = `https://archive-api.open-meteo.com/v1/archive?${params}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Clima: HTTP ${res.status}`);
  const json = await res.json();
  const days = json.daily?.time || [];
  const data = {};
  for (let i = 0; i < days.length; i += 1) {
    const precip = json.daily.precipitation_sum?.[i] ?? 0;
    const rain = json.daily.rain_sum?.[i] ?? precip;
    const tempMax = json.daily.temperature_2m_max?.[i] ?? null;
    const code = json.daily.weathercode?.[i] ?? null;
    data[days[i]] = {
      precipMm: Math.round(precip * 10) / 10,
      rainMm: Math.round(rain * 10) / 10,
      tempMaxC: tempMax != null ? Math.round(tempMax * 10) / 10 : null,
      weatherCode: code,
      isRainy: precip >= RAIN_MM_THRESHOLD,
    };
  }
  weatherCache.set(key, { at: Date.now(), data });
  return data;
}

function weatherLabel(code) {
  if (code == null) return null;
  if (code === 0) return 'Céu limpo';
  if (code <= 3) return 'Parcialmente nublado';
  if (code <= 48) return 'Neblina';
  if (code <= 67) return 'Chuva';
  if (code <= 77) return 'Neve/granizo';
  if (code <= 82) return 'Chuva forte';
  if (code <= 86) return 'Neve';
  return 'Tempestade';
}

module.exports = {
  RAIN_MM_THRESHOLD,
  DEFAULT_GEO,
  fetchDailyWeather,
  weatherLabel,
  resolveWeatherRegion,
  buildGeoDescription,
};
