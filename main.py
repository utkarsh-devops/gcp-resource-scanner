from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google.cloud import asset_v1
from google.api_core.client_options import ClientOptions
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ScanRequest(BaseModel):
    project_id: str

@app.post("/api/scan")
async def scan_project(request: ScanRequest):
    try:
        # Create a client with dynamic quota project
        # This tells GCP to bill/quota against the target project for this request
        client_options = ClientOptions(quota_project_id=request.project_id)
        client = asset_v1.AssetServiceClient(client_options=client_options)
        
        # Parent resource name
        parent = f"projects/{request.project_id}"
        
        # Call search_all_resources
        # We search for everything using an empty query
        response = client.search_all_resources(
            request={
                "scope": parent,
                "query": "", 
                "page_size": 100
            }
        )

        resources = []
        for resource in response:
            resources.append({
                "name": resource.name,
                "asset_type": resource.asset_type,
                "display_name": resource.display_name,
                "project": resource.project,
                "location": resource.location,
                "state": resource.state
            })
            
        return {"resources": resources}

    except Exception as e:
        # In a real app we might want to log this properly
        print(f"Error scanning project: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Serve static files - AFTER API routes to avoid capturing them
app.mount("/", StaticFiles(directory="static", html=True), name="static")
