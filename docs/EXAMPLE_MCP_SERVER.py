"""
CCCE Atlas MCP Server

Copy this file to your chat repository and configure it to connect to your
deployed CCCE Atlas API.

Installation:
  pip install mcp httpx

Usage:
  python ccce_atlas_server.py

Configuration:
  Set CCCE_ATLAS_API_URL environment variable to your Railway URL:
  export CCCE_ATLAS_API_URL="https://your-railway-url.up.railway.app/api/v1"
"""

import asyncio
import httpx
import os
from typing import Any
from mcp.server.models import InitializationOptions
from mcp.server import NotificationOptions, Server
from mcp.server.stdio import stdio_server
from mcp import types

# API Configuration
API_BASE_URL = os.getenv(
    "CCCE_ATLAS_API_URL",
    "http://localhost:8000/api/v1"  # Default to local for development
)
API_TIMEOUT = 30.0

# Initialize MCP server
app = Server("ccce-atlas")

# HTTP client for API requests
http_client: httpx.AsyncClient = None


@app.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    """
    List all available tools for querying Corpus Christi civic data.
    """
    return [
        types.Tool(
            name="search_pois_near_point",
            description="Find points of interest (coffee shops, beaches, parks, etc.) near a location in Corpus Christi. Returns name, category, distance, and address for each POI.",
            inputSchema={
                "type": "object",
                "properties": {
                    "lat": {
                        "type": "number",
                        "description": "Latitude (e.g., 27.8006 for downtown Corpus Christi)",
                        "minimum": 27.0,
                        "maximum": 28.0
                    },
                    "lon": {
                        "type": "number",
                        "description": "Longitude (e.g., -97.3964 for downtown Corpus Christi)",
                        "minimum": -98.0,
                        "maximum": -97.0
                    },
                    "radius_meters": {
                        "type": "number",
                        "description": "Search radius in meters (default: 2000, max: 10000)",
                        "default": 2000,
                        "minimum": 100,
                        "maximum": 10000
                    },
                    "category": {
                        "type": "string",
                        "description": "Filter by category (optional)",
                    },
                    "limit": {
                        "type": "number",
                        "description": "Maximum number of results (default: 10, max: 100)",
                        "default": 10,
                        "minimum": 1,
                        "maximum": 100
                    }
                },
                "required": ["lat", "lon"]
            }
        ),
        types.Tool(
            name="search_parcels_near_point",
            description="Find property parcels near a location with owner, value, and land information. Useful for property research and real estate analysis.",
            inputSchema={
                "type": "object",
                "properties": {
                    "lat": {
                        "type": "number",
                        "description": "Latitude",
                        "minimum": 27.0,
                        "maximum": 28.0
                    },
                    "lon": {
                        "type": "number",
                        "description": "Longitude",
                        "minimum": -98.0,
                        "maximum": -97.0
                    },
                    "radius_meters": {
                        "type": "number",
                        "description": "Search radius in meters (default: 500)",
                        "default": 500,
                        "minimum": 50,
                        "maximum": 5000
                    },
                    "limit": {
                        "type": "number",
                        "description": "Maximum results (default: 10)",
                        "default": 10,
                        "minimum": 1,
                        "maximum": 100
                    }
                },
                "required": ["lat", "lon"]
            }
        ),
        types.Tool(
            name="get_top_landowners",
            description="Get top property owners in Corpus Christi ranked by total acreage, parcel count, or total property value. Returns owner name, statistics, and rankings.",
            inputSchema={
                "type": "object",
                "properties": {
                    "metric": {
                        "type": "string",
                        "description": "Ranking metric: 'acreage' (total land), 'count' (number of parcels), or 'value' (total appraised value)",
                        "enum": ["acreage", "count", "value"],
                        "default": "acreage"
                    },
                    "limit": {
                        "type": "number",
                        "description": "Number of top owners to return (default: 10, max: 100)",
                        "default": 10,
                        "minimum": 1,
                        "maximum": 100
                    }
                },
                "required": []
            }
        ),
        types.Tool(
            name="get_transit_routes",
            description="Get all public transit routes in Corpus Christi (CCRTA bus system). Returns route numbers, names, and variant information.",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),
        types.Tool(
            name="query_point",
            description="Get comprehensive information about a specific geographic location including parcel data (if available) and nearby POIs. One-stop query for location intelligence.",
            inputSchema={
                "type": "object",
                "properties": {
                    "lat": {
                        "type": "number",
                        "description": "Latitude",
                        "minimum": 27.0,
                        "maximum": 28.0
                    },
                    "lon": {
                        "type": "number",
                        "description": "Longitude",
                        "minimum": -98.0,
                        "maximum": -97.0
                    }
                },
                "required": ["lat", "lon"]
            }
        ),
        types.Tool(
            name="get_poi_categories",
            description="Get all available POI categories (coffee shops, beaches, parks, museums, etc.) with count of locations in each category. Use this to discover what types of places you can search for.",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        )
    ]


@app.call_tool()
async def handle_call_tool(
    name: str, arguments: dict | None
) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
    """
    Handle tool execution requests.
    """
    if not http_client:
        raise RuntimeError("HTTP client not initialized")

    try:
        if name == "search_pois_near_point":
            lat = arguments["lat"]
            lon = arguments["lon"]
            radius = arguments.get("radius_meters", 2000)
            limit = arguments.get("limit", 10)
            category = arguments.get("category")

            params = {
                "lat": lat,
                "lon": lon,
                "radius_meters": radius,
                "limit": limit
            }
            if category:
                params["category"] = category

            response = await http_client.get(
                f"{API_BASE_URL}/spatial/pois/near",
                params=params,
                timeout=API_TIMEOUT
            )
            response.raise_for_status()
            data = response.json()

            # Format response
            pois = data.get("pois", [])
            if not pois:
                result = f"No POIs found within {radius}m of ({lat}, {lon})"
                if category:
                    result += f" in category '{category}'"
                return [types.TextContent(type="text", text=result)]

            result = f"Found {len(pois)} POI{'s' if len(pois) != 1 else ''} within {radius}m of ({lat}, {lon})"
            if category:
                result += f" in category '{category}'"
            result += ":\n\n"

            for poi in pois:
                result += f"📍 **{poi['name']}**\n"
                result += f"   Category: {poi['category']}\n"
                result += f"   Distance: {poi['distance_meters']:.0f}m ({poi['distance_meters'] * 3.28084:.0f} ft)\n"
                if poi.get('address'):
                    result += f"   Address: {poi['address']}\n"
                if poi.get('subcategory'):
                    result += f"   Type: {poi['subcategory']}\n"
                result += "\n"

            return [types.TextContent(type="text", text=result)]

        elif name == "search_parcels_near_point":
            lat = arguments["lat"]
            lon = arguments["lon"]
            radius = arguments.get("radius_meters", 500)
            limit = arguments.get("limit", 10)

            response = await http_client.get(
                f"{API_BASE_URL}/spatial/parcels/near",
                params={"lat": lat, "lon": lon, "radius_meters": radius, "limit": limit},
                timeout=API_TIMEOUT
            )
            response.raise_for_status()
            data = response.json()

            parcels = data.get("parcels", [])
            if not parcels:
                return [types.TextContent(
                    type="text",
                    text=f"No parcels found within {radius}m of ({lat}, {lon})"
                )]

            result = f"Found {len(parcels)} parcel{'s' if len(parcels) != 1 else ''} within {radius}m:\n\n"
            for i, parcel in enumerate(parcels, 1):
                result += f"**Parcel {i}**\n"
                if parcel.get('owner'):
                    result += f"   Owner: {parcel['owner']}\n"
                if parcel.get('prop_addr'):
                    result += f"   Address: {parcel['prop_addr']}\n"
                if parcel.get('appraised_value'):
                    result += f"   Appraised Value: ${parcel['appraised_value']:,.0f}\n"
                if parcel.get('market_value'):
                    result += f"   Market Value: ${parcel['market_value']:,.0f}\n"
                if parcel.get('land_acres'):
                    result += f"   Land Area: {parcel['land_acres']:.2f} acres\n"
                if parcel.get('zoning'):
                    result += f"   Zoning: {parcel['zoning']}\n"
                if parcel.get('class_cd'):
                    result += f"   Property Class: {parcel['class_cd']}\n"
                result += f"   Distance: {parcel['distance_meters']:.0f}m ({parcel['distance_meters'] * 3.28084:.0f} ft)\n\n"

            return [types.TextContent(type="text", text=result)]

        elif name == "get_top_landowners":
            metric = arguments.get("metric", "acreage")
            limit = arguments.get("limit", 10)

            response = await http_client.get(
                f"{API_BASE_URL}/parcels/owners/top",
                params={"metric": metric, "limit": limit},
                timeout=API_TIMEOUT
            )
            response.raise_for_status()
            data = response.json()

            owners = data.get("owners", [])
            metric_name = {
                "acreage": "total acreage",
                "count": "parcel count",
                "value": "total property value"
            }.get(metric, metric)

            result = f"**Top {len(owners)} Landowners by {metric_name}**\n\n"
            for i, owner in enumerate(owners, 1):
                result += f"{i}. **{owner['owner']}**\n"
                if 'total_acres' in owner:
                    result += f"   Total Land: {owner['total_acres']:,.2f} acres\n"
                if 'parcel_count' in owner:
                    result += f"   Parcels: {owner['parcel_count']:,}\n"
                if 'total_value' in owner:
                    result += f"   Total Value: ${owner['total_value']:,.0f}\n"
                result += "\n"

            return [types.TextContent(type="text", text=result)]

        elif name == "get_transit_routes":
            response = await http_client.get(
                f"{API_BASE_URL}/transit/routes",
                timeout=API_TIMEOUT
            )
            response.raise_for_status()
            data = response.json()

            routes = data.get("routes", [])
            result = f"**CCRTA Transit Routes** ({len(routes)} total routes):\n\n"

            # Group by route number
            route_groups = {}
            for route in routes:
                num = route.get('route_number', 'Unknown')
                if num not in route_groups:
                    route_groups[num] = []
                route_groups[num].append(route)

            for num in sorted(route_groups.keys(), key=lambda x: (x.isdigit() and int(x) or 999, x)):
                routes_in_group = route_groups[num]
                result += f"🚌 **Route {num}**: {routes_in_group[0].get('route_name', 'N/A')}\n"
                if len(routes_in_group) > 1:
                    result += f"   ({len(routes_in_group)} direction variants)\n"

            return [types.TextContent(type="text", text=result)]

        elif name == "query_point":
            lat = arguments["lat"]
            lon = arguments["lon"]

            response = await http_client.get(
                f"{API_BASE_URL}/spatial/point",
                params={"lat": lat, "lon": lon},
                timeout=API_TIMEOUT
            )
            response.raise_for_status()
            data = response.json()

            result = f"**Location Intelligence: ({lat:.4f}, {lon:.4f})**\n\n"

            parcel = data.get("parcel")
            if parcel:
                result += "### 🏠 Parcel Information\n"
                if parcel.get('parcel_id'):
                    result += f"Parcel ID: {parcel['parcel_id']}\n"
                if parcel.get('owner'):
                    result += f"Owner: {parcel['owner']}\n"
                if parcel.get('prop_addr'):
                    result += f"Address: {parcel['prop_addr']}\n"
                if parcel.get('appraised_value'):
                    result += f"Appraised Value: ${parcel['appraised_value']:,.0f}\n"
                if parcel.get('market_value'):
                    result += f"Market Value: ${parcel['market_value']:,.0f}\n"
                if parcel.get('land_acres'):
                    result += f"Land Area: {parcel['land_acres']:.2f} acres\n"
                if parcel.get('zoning'):
                    result += f"Zoning: {parcel['zoning']}\n"
                if parcel.get('class_cd'):
                    result += f"Property Class: {parcel['class_cd']}\n"
                if parcel.get('year_built'):
                    result += f"Year Built: {parcel['year_built']}\n"
                result += "\n"
            else:
                result += "No parcel data at this location\n\n"

            pois = data.get("pois", [])
            if pois:
                result += f"### 📍 Nearby Points of Interest ({len(pois)})\n"
                for poi in pois[:10]:  # Show top 10
                    result += f"• {poi['name']} ({poi['category']})\n"
                if len(pois) > 10:
                    result += f"• ... and {len(pois) - 10} more\n"
            else:
                result += "### 📍 No nearby POIs\n"

            return [types.TextContent(type="text", text=result)]

        elif name == "get_poi_categories":
            response = await http_client.get(
                f"{API_BASE_URL}/pois/categories",
                timeout=API_TIMEOUT
            )
            response.raise_for_status()
            data = response.json()

            categories = data.get("categories", [])
            result = f"**Available POI Categories** ({len(categories)} total):\n\n"
            for cat in sorted(categories, key=lambda x: -x['count']):
                result += f"• **{cat['category']}**: {cat['count']} location{'s' if cat['count'] != 1 else ''}\n"

            result += "\n💡 Use these category names with `search_pois_near_point` to filter results."

            return [types.TextContent(type="text", text=result)]

        else:
            raise ValueError(f"Unknown tool: {name}")

    except httpx.HTTPStatusError as e:
        error_msg = f"❌ API request failed with status {e.response.status_code}\n"
        error_msg += f"Endpoint: {e.request.url}\n"
        try:
            error_detail = e.response.json()
            error_msg += f"Error: {error_detail.get('detail', e.response.text)}"
        except:
            error_msg += f"Error: {e.response.text[:200]}"
        return [types.TextContent(type="text", text=error_msg)]
    except httpx.RequestError as e:
        error_msg = f"❌ Network error: {str(e)}\n"
        error_msg += f"Is the API running at {API_BASE_URL}?"
        return [types.TextContent(type="text", text=error_msg)]
    except Exception as e:
        return [types.TextContent(type="text", text=f"❌ Unexpected error: {str(e)}")]


async def main():
    """Run the MCP server."""
    global http_client

    # Initialize HTTP client
    http_client = httpx.AsyncClient()

    try:
        async with stdio_server() as (read_stream, write_stream):
            await app.run(
                read_stream,
                write_stream,
                InitializationOptions(
                    server_name="ccce-atlas",
                    server_version="1.0.0",
                    capabilities=app.get_capabilities(
                        notification_options=NotificationOptions(),
                        experimental_capabilities={},
                    )
                )
            )
    finally:
        await http_client.aclose()


if __name__ == "__main__":
    print(f"🚀 CCCE Atlas MCP Server starting...", flush=True)
    print(f"📡 API URL: {API_BASE_URL}", flush=True)
    print(f"✅ Ready to serve tools", flush=True)
    asyncio.run(main())
