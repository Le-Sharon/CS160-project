from flask import Flask, request, jsonify, render_template, make_response
import io, os, csv, math
from datetime import datetime
import pandas as pd
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv is optional
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

app = Flask(__name__)
FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "*")
AIR_QUALITY_API_KEY = os.environ.get("AIR_QUALITY_API_KEY")

LAYERS: dict[str, pd.DataFrame] = {}

if not LAYERS:
    LAYERS["app.demo"] = pd.DataFrame([
        {"id": 1, "name": "SJSU", "lat": 37.3353, "lon": -121.8813},
    ])

def ok(data, status=200):
    return make_response(jsonify(data), status)

def err(msg, status=400):
    return ok({"error": msg}, status)


def _allowed_origin(origin: str | None) -> str:
    if FRONTEND_ORIGIN == "*":
        return origin or "*"
    if not origin:
        return FRONTEND_ORIGIN
    allowed = {o.strip() for o in FRONTEND_ORIGIN.split(",") if o.strip()}
    if not allowed:
        return FRONTEND_ORIGIN
    return origin if origin in allowed else next(iter(allowed))


@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        resp = app.make_default_options_response()
        return resp


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin")
    allow_origin = _allowed_origin(origin)
    response.headers["Access-Control-Allow-Origin"] = allow_origin
    response.headers["Access-Control-Allow-Credentials"] = "true"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    requested_headers = request.headers.get("Access-Control-Request-Headers")
    response.headers["Access-Control-Allow-Headers"] = requested_headers or "Content-Type"
    # Let proxies know response varies by Origin header.
    vary = response.headers.get("Vary")
    response.headers["Vary"] = "Origin" if not vary else f"{vary}, Origin"
    return response

def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.rename(columns={c: c.strip().lower() for c in df.columns})
    lat_col = next((c for c in df.columns if c in ("lat", "latitude", "y")), None)
    lon_col = next((c for c in df.columns if c in ("lon", "lng", "longitude", "x")), None)
    if not lat_col or not lon_col:
        raise ValueError("CSV must include latitude/lat and longitude/lon columns.")
    df["lat"] = pd.to_numeric(df[lat_col], errors="coerce")
    df["lon"] = pd.to_numeric(df[lon_col], errors="coerce")
    df = df.dropna(subset=["lat", "lon"])
    df = df[(df["lat"].between(-90, 90)) & (df["lon"].between(-180, 180))]
    if "name" not in df.columns: df["name"] = ""
    if "id" not in df.columns:
        df = df.reset_index(drop=True)
        df["id"] = df.index + 1
    front = [c for c in ["id", "name", "lat", "lon"] if c in df.columns]
    rest = [c for c in df.columns if c not in front]
    return df[front + rest]

def df_to_geojson(df: pd.DataFrame, limit: int | None = None) -> dict:
    if limit is not None:
        df = df.head(limit)
    props = [c for c in df.columns if c not in ("lat", "lon")]
    feats = []
    for _, r in df.iterrows():
        feats.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [float(r["lon"]), float(r["lat"])]},
            "properties": {c: (None if pd.isna(r[c]) else r[c]) for c in props}
        })
    return {"type": "FeatureCollection", "features": feats}

def bbox_filter(df: pd.DataFrame, bbox: tuple[float, float, float, float]) -> pd.DataFrame:
    west, south, east, north = bbox
    if east < west:
        left = df[(df["lon"] >= west) & (df["lat"].between(south, north))]
        right = df[(df["lon"] <= east) & (df["lat"].between(south, north))]
        return pd.concat([left, right], ignore_index=True)
    return df[(df["lon"].between(west, east)) & (df["lat"].between(south, north))]

def haversine_m(lon1, lat1, lon2, lat2) -> float:
    R = 6371000.0
    a1, b1 = math.radians(lat1), math.radians(lon1)
    a2, b2 = math.radians(lat2), math.radians(lon2)
    da, db = a2 - a1, b2 - b1
    s = math.sin(da/2)**2 + math.cos(a1)*math.cos(a2)*math.sin(db/2)**2
    return 2 * R * math.asin(math.sqrt(s))

def within_radius(df: pd.DataFrame, lon: float, lat: float, radius_m: float) -> pd.DataFrame:
    d = df.apply(lambda r: haversine_m(lon, lat, r["lon"], r["lat"]), axis=1)
    hits = df.copy()
    hits["distance_m"] = d
    return hits[hits["distance_m"] <= radius_m].sort_values("distance_m")

def circle_polygon(lon: float, lat: float, radius_m: float, steps: int = 64) -> dict:
    R = 6371000.0
    lat0 = math.radians(lat)
    lon0 = math.radians(lon)
    ang_dist = radius_m / R
    coords = []
    for i in range(steps + 1):
        brg = 2 * math.pi * (i / steps)
        latp = math.asin(math.sin(lat0) * math.cos(ang_dist) +
                         math.cos(lat0) * math.sin(ang_dist) * math.cos(brg))
        lonp = lon0 + math.atan2(math.sin(brg) * math.sin(ang_dist) * math.cos(lat0),
                                 math.cos(ang_dist) - math.sin(lat0) * math.sin(latp))
        coords.append([math.degrees(lonp), math.degrees(latp)])
    return {"type": "Polygon", "coordinates": [coords]}

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/layers", methods=["GET"])
def list_layers():
    items = []
    for name, df in LAYERS.items():
        items.append({
            "id": name,
            "name": name,
            "rows": int(len(df)),
            "columns": list(df.columns),
        })
    items.sort(key=lambda item: item["name"].lower())
    return ok({"layers": items})


@app.route("/importCSV", methods=["POST", "OPTIONS"])
def import_csv():
    """
    Multipart form:
      file: CSV file (required)
      layer: name to store (optional; defaults to filename)
    CSV needs lat/lon columns (lat|latitude|y, lon|lng|longitude|x).
    """
    if "file" not in request.files:
        return err("Missing file part 'file'")
    f = request.files["file"]
    if not f.filename:
        return err("Empty filename")
    layer = (request.form.get("layer") or os.path.splitext(f.filename)[0]).strip()
    try:
        raw = f.read()
        sample = raw[:4096].decode("utf-8", errors="ignore")
        try:
            dialect = csv.Sniffer().sniff(sample)
            delim = dialect.delimiter
        except Exception:
            delim = ","
        df = pd.read_csv(io.BytesIO(raw), delimiter=delim)
        df = normalize_columns(df)
        if df.empty:
            return err("No valid rows with lat/lon found after cleaning.")
        LAYERS[layer] = df
        return ok({"layer": layer, "rows": int(len(df)), "columns": list(df.columns)})
    except ValueError as ve:
        return err(str(ve))
    except Exception as e:
        return err(f"Failed to import CSV: {e}")

@app.route("/getLayer", methods=["GET"])
def get_layer():
    """
    Query params:
      layer: name (required)
      bbox: west,south,east,north (optional)
      limit: int (optional)
    Returns GeoJSON FeatureCollection.
    """
    layer = request.args.get("layer")
    if not layer: return err("Missing ?layer=name")
    if layer not in LAYERS: return err(f"Unknown layer '{layer}'. Upload via /importCSV.", 404)

    df = LAYERS[layer]
    bbox = request.args.get("bbox")
    if bbox:
        try:
            west, south, east, north = map(float, bbox.split(","))
        except Exception:
            return err("bbox must be west,south,east,north")
        df = bbox_filter(df, (west, south, east, north))

    limit = request.args.get("limit")
    limit = int(limit) if (limit and limit.isdigit()) else None

    return ok(df_to_geojson(df, limit))

@app.route("/getBuffer", methods=["POST", "OPTIONS"])
def get_buffer():
    try:
        body = request.get_json(force=True)
        layer = body.get("layer")
        lon = float(body.get("lon"))
        lat = float(body.get("lat"))
        radius = float(body.get("radius_m", 500))
        limit = int(body.get("limit", 200))
        if layer not in LAYERS: return err(f"Unknown layer '{layer}'.", 404)

        nearby = within_radius(LAYERS[layer], lon, lat, radius).head(limit)
        fc = df_to_geojson(nearby)
        fc["features"].append({
            "type": "Feature",
            "geometry": circle_polygon(lon, lat, radius),
            "properties": {"_kind": "buffer", "radius_m": radius}
        })
        return ok(fc)
    except Exception as e:
        return err(f"Bad request: {e}")

@app.route("/compareLayers", methods=["POST", "OPTIONS"])
def compare_layers():
    try:
        body = request.get_json(force=True)
        la, lb = body.get("layerA"), body.get("layerB")
        dist_m = float(body.get("distance_m", 200))
        if la not in LAYERS or lb not in LAYERS:
            return err("One or both layers not found.", 404)
        A, B = LAYERS[la], LAYERS[lb]
        pairs = []
        for i, ar in A.iterrows():
            for j, br in B.iterrows():
                d = haversine_m(ar["lon"], ar["lat"], br["lon"], br["lat"])
                if d <= dist_m:
                    pairs.append({"idA": int(ar.get("id", i+1)), "idB": int(br.get("id", j+1)), "distance_m": float(d)})
        return ok({"pairs": pairs})
    except Exception as e:
        return err(f"Bad request: {e}")

@app.route("/exportCSV", methods=["GET"])
def export_csv():
    layer = request.args.get("layer")
    if not layer: return err("Missing ?layer=name")
    if layer not in LAYERS: return err(f"Unknown layer '{layer}'.", 404)
    buf = io.StringIO()
    LAYERS[layer].to_csv(buf, index=False)
    resp = make_response(buf.getvalue())
    resp.headers["Content-Type"] = "text/csv; charset=utf-8"
    resp.headers["Content-Disposition"] = f'attachment; filename="{layer}.csv"'
    return resp


@app.route("/deleteLayer", methods=["POST", "OPTIONS"])
def delete_layer():
    try:
        body = request.get_json(force=True) or {}
        layer = body.get("layer")
        if not layer:
            return err("Missing 'layer' value.")
        if layer not in LAYERS:
            return err(f"Unknown layer '{layer}'.", 404)
        del LAYERS[layer]
        return ok({"layer": layer, "deleted": True})
    except Exception as e:
        return err(f"Bad request: {e}")

@app.route("/getEnvironmentalLayers", methods=["GET"])
def get_environmental_layers():
    """
    Query params:
      type: "air_quality" | "weather" (required)
      lat: float (required)
      lon: float (required)
      radius_m: float (optional, default 5000)
    Returns GeoJSON FeatureCollection with environmental data points.
    """
    try:
        layer_type = request.args.get("type")
        if layer_type not in ("air_quality", "weather"):
            return err("type must be 'air_quality' or 'weather'")
        
        lat = float(request.args.get("lat"))
        lon = float(request.args.get("lon"))
        radius_m = float(request.args.get("radius_m", 5000))
        
        features = []
        
        if layer_type == "air_quality":
            # Use OpenWeatherMap Air Pollution API for real air quality data
            if HAS_REQUESTS and AIR_QUALITY_API_KEY:
                try:
                    # Fetch air quality data by lat/lon using OpenWeatherMap API
                    url = "http://api.openweathermap.org/data/2.5/air_pollution"
                    params = {
                        "lat": lat,
                        "lon": lon,
                        "appid": AIR_QUALITY_API_KEY
                    }
                    response = requests.get(url, params=params, timeout=10)
                    
                    if response.status_code == 200:
                        data = response.json()
                        # OpenWeatherMap returns: {"coord": {...}, "list": [{"main": {"aqi": ...}, "components": {...}, "dt": ...}]}
                        if "list" in data and len(data.get("list", [])) > 0:
                            air_data = data["list"][0]
                            main = air_data.get("main", {})
                            components = air_data.get("components", {})
                            
                            # OpenWeatherMap AQI is 1-5 scale
                            aqi_owm = main.get("aqi", 1)
                            
                            # Convert OWM AQI (1-5) to approximate US AQI (0-300) for consistency
                            # 1=Good(0-50), 2=Fair(51-100), 3=Moderate(101-150), 4=Poor(151-200), 5=Very Poor(201-300)
                            aqi_map = {1: 25, 2: 75, 3: 125, 4: 175, 5: 250}
                            primary_aqi = aqi_map.get(aqi_owm, 50)
                            
                            # Get pollutant concentrations (in µg/m³)
                            pm25_conc = components.get("pm2_5", 0)
                            pm10_conc = components.get("pm10", 0)
                            o3_conc = components.get("o3", 0)
                            
                            # Convert concentrations to approximate AQI values
                            # Simple conversion: PM2.5 AQI ≈ (pm2_5 / 12) * 50, capped at 300
                            pm25_aqi = min(300, int((pm25_conc / 12.0) * 50)) if pm25_conc > 0 else 0
                            pm10_aqi = min(300, int((pm10_conc / 54.0) * 50)) if pm10_conc > 0 else 0
                            o3_aqi = min(300, int((o3_conc / 0.12) * 50)) if o3_conc > 0 else 0
                            
                            # Map OWM AQI to status
                            aqi_status_map = {
                                1: ("good", "Good"),
                                2: ("moderate", "Fair"),
                                3: ("moderate", "Moderate"),
                                4: ("unhealthy", "Poor"),
                                5: ("very_unhealthy", "Very Poor")
                            }
                            status, category = aqi_status_map.get(aqi_owm, ("moderate", "Moderate"))
                            
                            # Get location name from coordinates (or use a reverse geocoding API if needed)
                            coord = data.get("coord", {})
                            location_name = f"Location ({coord.get('lat', lat):.4f}, {coord.get('lon', lon):.4f})"
                            
                            # Get timestamp
                            dt = air_data.get("dt", 0)
                            date_observed = datetime.fromtimestamp(dt).strftime("%Y-%m-%d %H:%M") if dt > 0 else ""
                            
                            features.append({
                                "type": "Feature",
                                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                                "properties": {
                                    "id": 1,
                                    "name": location_name,
                                    "aqi": primary_aqi,
                                    "aqi_owm": aqi_owm,  # Original OWM AQI (1-5)
                                    "pm25": pm25_aqi,
                                    "pm25_conc": round(pm25_conc, 2),  # Concentration in µg/m³
                                    "pm10": pm10_aqi,
                                    "pm10_conc": round(pm10_conc, 2),  # Concentration in µg/m³
                                    "o3": o3_aqi,
                                    "o3_conc": round(o3_conc, 2),  # Concentration in µg/m³
                                    "status": status,
                                    "category": category,
                                    "date_observed": date_observed,
                                    "co": round(components.get("co", 0), 2),
                                    "no2": round(components.get("no2", 0), 2),
                                    "so2": round(components.get("so2", 0), 2),
                                }
                            })
                            
                            # Add nearby sample points for visualization
                            import random
                            for i in range(min(5, int(radius_m / 1000))):
                                angle = random.uniform(0, 2 * math.pi)
                                distance = random.uniform(1000, radius_m)
                                offset_lat = distance * math.cos(angle) / 111000
                                offset_lon = distance * math.sin(angle) / (111000 * math.cos(math.radians(lat)))
                                
                                # Use slightly varied AQI values around the main reading
                                variation = random.uniform(-10, 10)
                                nearby_aqi = max(0, min(300, int(primary_aqi + variation)))
                                
                                features.append({
                                    "type": "Feature",
                                    "geometry": {"type": "Point", "coordinates": [lon + offset_lon, lat + offset_lat]},
                                    "properties": {
                                        "id": i + 2,
                                        "name": f"Nearby Station {i + 1}",
                                        "aqi": nearby_aqi,
                                        "pm25": max(0, pm25_aqi + int(random.uniform(-5, 5))),
                                        "pm10": max(0, pm10_aqi + int(random.uniform(-5, 5))),
                                        "status": "good" if nearby_aqi < 50 else "moderate" if nearby_aqi < 100 else "unhealthy",
                                    }
                                })
                        else:
                            # API returned empty data, fall back to demo data
                            raise Exception("API returned no air quality data")
                    else:
                        # API call failed, fall back to demo data
                        raise Exception(f"API returned status {response.status_code}: {response.text[:200]}")
                        
                except Exception as api_error:
                    # Log the error for debugging
                    print(f"OpenWeatherMap API error: {api_error}", flush=True)
                    # Fall back to demo data if API call fails
                    import random
                    num_points = min(10, int(radius_m / 500))
                    for i in range(num_points):
                        angle = random.uniform(0, 2 * math.pi)
                        distance = random.uniform(0, radius_m)
                        offset_lat = distance * math.cos(angle) / 111000
                        offset_lon = distance * math.sin(angle) / (111000 * math.cos(math.radians(lat)))
                        
                        aqi = random.randint(0, 300)
                        features.append({
                            "type": "Feature",
                            "geometry": {"type": "Point", "coordinates": [lon + offset_lon, lat + offset_lat]},
                            "properties": {
                                "id": i + 1,
                                "name": f"Air Quality Station {i + 1} (Demo)",
                                "aqi": aqi,
                                "pm25": round(random.uniform(0, 100), 2),
                                "pm10": round(random.uniform(0, 150), 2),
                                "status": "good" if aqi < 50 else "moderate" if aqi < 100 else "unhealthy",
                            }
                        })
            else:
                # No requests library or API key, use demo data
                import random
                num_points = min(10, int(radius_m / 500))
                for i in range(num_points):
                    angle = random.uniform(0, 2 * math.pi)
                    distance = random.uniform(0, radius_m)
                    offset_lat = distance * math.cos(angle) / 111000
                    offset_lon = distance * math.sin(angle) / (111000 * math.cos(math.radians(lat)))
                    
                    aqi = random.randint(0, 300)
                    features.append({
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [lon + offset_lon, lat + offset_lat]},
                        "properties": {
                            "id": i + 1,
                            "name": f"Air Quality Station {i + 1}",
                            "aqi": aqi,
                            "pm25": round(random.uniform(0, 100), 2),
                            "pm10": round(random.uniform(0, 150), 2),
                            "status": "good" if aqi < 50 else "moderate" if aqi < 100 else "unhealthy",
                        }
                    })
        else:  # weather
            import random
            num_points = min(20, int(radius_m / 500))
            for i in range(num_points):
                # Generate points within radius
                angle = random.uniform(0, 2 * math.pi)
                distance = random.uniform(0, radius_m)
                offset_lat = distance * math.cos(angle) / 111000  # rough conversion
                offset_lon = distance * math.sin(angle) / (111000 * math.cos(math.radians(lat)))
                
                point_lat = lat + offset_lat
                point_lon = lon + offset_lon
                
                temp = random.uniform(10, 30)
                features.append({
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [point_lon, point_lat]},
                    "properties": {
                        "id": i + 1,
                        "name": f"Weather Station {i + 1}",
                        "temperature": round(temp, 1),
                        "humidity": random.randint(30, 90),
                        "pressure": random.randint(980, 1020),
                        "condition": random.choice(["clear", "cloudy", "rainy", "sunny"]),
                    }
                })
        
        return ok({"type": "FeatureCollection", "features": features})
    except Exception as e:
        return err(f"Bad request: {e}")

@app.route("/getTransportationLayers", methods=["GET"])
def get_transportation_layers():
    """
    Query params:
      type: "transit" | "stations" (required)
      lat: float (required)
      lon: float (required)
      radius_m: float (optional, default 5000)
    Returns GeoJSON FeatureCollection with transportation data points.
    """
    try:
        layer_type = request.args.get("type")
        if layer_type not in ("transit", "stations"):
            return err("type must be 'transit' or 'stations'")
        
        lat = float(request.args.get("lat"))
        lon = float(request.args.get("lon"))
        radius_m = float(request.args.get("radius_m", 5000))
        
        # Use OpenStreetMap Overpass API for real transit data
        if HAS_REQUESTS:
            try:
                # Overpass API endpoint
                overpass_url = "https://overpass-api.de/api/interpreter"
                
                # Convert radius from meters to approximate degrees (rough conversion)
                # Use around syntax which is better for radius-based searches
                radius_deg = radius_m / 111000  # rough conversion
                
                if layer_type == "transit":
                    # Query for transit stops using around syntax (more flexible)
                    # This searches within radius and includes more transit stop types
                    overpass_query = f"""
                    [out:json][timeout:25];
                    (
                      node["public_transport"~"^(stop_position|platform)$"](around:{radius_m},{lat},{lon});
                      node["highway"="bus_stop"](around:{radius_m},{lat},{lon});
                      node["railway"~"^(tram_stop|subway_entrance|halt)$"](around:{radius_m},{lat},{lon});
                      node["amenity"="bus_station"](around:{radius_m},{lat},{lon});
                    );
                    out body;
                    """
                else:  # stations
                    # Query for transit stations using around syntax
                    overpass_query = f"""
                    [out:json][timeout:25];
                    (
                      node["public_transport"="station"](around:{radius_m},{lat},{lon});
                      node["railway"="station"](around:{radius_m},{lat},{lon});
                      node["railway"="subway_entrance"](around:{radius_m},{lat},{lon});
                      node["amenity"~"^(bus_station|ferry_terminal)$"](around:{radius_m},{lat},{lon});
                      way["public_transport"="station"](around:{radius_m},{lat},{lon});
                      way["railway"="station"](around:{radius_m},{lat},{lon});
                    );
                    out center;
                    """
                
                response = requests.post(overpass_url, data=overpass_query, timeout=30, headers={"Content-Type": "text/plain"})
                
                if response.status_code == 200:
                    data = response.json()
                    elements = data.get("elements", [])
                    
                    # Log for debugging
                    print(f"Overpass API returned {len(elements)} elements for {layer_type} at ({lat}, {lon})", flush=True)
                    
                    if len(elements) > 0:
                        features = []
                        for idx, element in enumerate(elements, 1):
                            # Get coordinates
                            if element.get("type") == "node":
                                elem_lat = element.get("lat")
                                elem_lon = element.get("lon")
                            elif element.get("type") == "way":
                                # For ways, use center if available, otherwise use first node
                                center = element.get("center", {})
                                elem_lat = center.get("lat")
                                elem_lon = center.get("lon")
                            else:
                                continue
                            
                            if not elem_lat or not elem_lon:
                                continue
                            
                            # Get tags
                            tags = element.get("tags", {})
                            
                            # Determine name
                            name = (
                                tags.get("name") or
                                tags.get("ref") or
                                tags.get("public_transport") or
                                f"{layer_type.title()} {idx}"
                            )
                            
                            # Determine type
                            transit_type = (
                                tags.get("public_transport") or
                                tags.get("railway") or
                                tags.get("highway") or
                                "transit"
                            )
                            
                            # Clean up transit type
                            if transit_type in ["stop_position", "station"]:
                                transit_type = tags.get("railway") or tags.get("highway") or transit_type
                            
                            # Build properties
                            properties = {
                                "id": element.get("id", idx),
                                "name": name,
                                "type": transit_type,
                            }
                            
                            # Add additional useful tags
                            if tags.get("network"):
                                properties["network"] = tags.get("network")
                            if tags.get("operator"):
                                properties["operator"] = tags.get("operator")
                            if tags.get("ref"):
                                properties["ref"] = tags.get("ref")
                            if tags.get("route_ref"):
                                properties["routes"] = tags.get("route_ref")
                            
                            features.append({
                                "type": "Feature",
                                "geometry": {"type": "Point", "coordinates": [elem_lon, elem_lat]},
                                "properties": properties
                            })
                        
                        return ok({"type": "FeatureCollection", "features": features})
                    else:
                        # No data found - this is normal for rural areas
                        # Fall back to demo data but don't treat as error
                        print(f"No transit data found in area - using demo data", flush=True)
                        raise Exception("No transit data found in area")
                else:
                    # API call failed, log the error
                    error_text = response.text[:500] if hasattr(response, 'text') else "Unknown error"
                    print(f"Overpass API error: status {response.status_code}, response: {error_text}", flush=True)
                    raise Exception(f"Overpass API returned status {response.status_code}")
                    
            except Exception as api_error:
                # Log the error for debugging
                print(f"Overpass API error: {api_error}", flush=True)
                # Fall back to demo data if API call fails
                pass
        
        # Fallback to demo data if requests not available or API failed
        import random
        num_points = min(30, int(radius_m / 300))
        features = []
        
        transit_types = ["bus", "train", "subway", "tram"]
        station_names = ["Central", "North", "South", "East", "West", "Main", "Park", "Union"]
        
        for i in range(num_points):
            angle = random.uniform(0, 2 * math.pi)
            distance = random.uniform(0, radius_m)
            offset_lat = distance * math.cos(angle) / 111000
            offset_lon = distance * math.sin(angle) / (111000 * math.cos(math.radians(lat)))
            
            point_lat = lat + offset_lat
            point_lon = lon + offset_lon
            
            if layer_type == "transit":
                transit_type = random.choice(transit_types)
                features.append({
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [point_lon, point_lat]},
                    "properties": {
                        "id": i + 1,
                        "name": f"{transit_type.title()} Stop {i + 1} (Demo)",
                        "type": transit_type,
                        "line": random.choice(["A", "B", "C", "1", "2", "3"]),
                        "routes": random.randint(1, 5),
                    }
                })
            else:  # stations
                station_name = random.choice(station_names) + " Station"
                features.append({
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [point_lon, point_lat]},
                    "properties": {
                        "id": i + 1,
                        "name": station_name + " (Demo)",
                        "type": random.choice(["train", "subway", "bus"]),
                        "lines": random.randint(1, 4),
                    }
                })
        
        return ok({"type": "FeatureCollection", "features": features})
    except Exception as e:
        return err(f"Bad request: {e}")

if __name__ == "__main__":
    host = os.environ.get("FLASK_HOST", "0.0.0.0")
    port = int(os.environ.get("FLASK_PORT", "5000"))
    debug = os.environ.get("FLASK_DEBUG", "1") not in ("0", "false", "False")
    app.run(host=host, port=port, debug=debug)