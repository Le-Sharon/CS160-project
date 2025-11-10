from flask import Flask, request, jsonify, render_template, make_response
import io, os, csv, math
import pandas as pd

app = Flask(__name__)
FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "*")

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

if __name__ == "__main__":
    app.run(debug=True)