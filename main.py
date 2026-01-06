from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google.cloud import asset_v1
from google.api_core.client_options import ClientOptions
from google.api_core.client_options import ClientOptions
import os
import sqlite3
import json
from datetime import datetime

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database Setup
DB_PATH = "scans.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS scans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            resource_count INTEGER,
            resources_json TEXT
        )
    ''')
    conn.commit()
    conn.close()

# Initialize DB on import (or use lifespan events in real app)
init_db()

class ScanRequest(BaseModel):
    project_id: str


# Helper for Protobuf serialization
def json_serial(obj):
    """JSON serializer for objects not serializable by default json code"""
    if hasattr(obj, 'isoformat'):
        return obj.isoformat()
    if hasattr(obj, '__class__') and ('RepeatedComposite' in obj.__class__.__name__ or 'RepeatedScalar' in obj.__class__.__name__):
        return list(obj)
    if hasattr(obj, '__class__') and 'MapComposite' in obj.__class__.__name__:
        return dict(obj)
    return str(obj)

@app.post("/api/scan")
async def scan_project(request: ScanRequest):
    try:
        # Create a client with dynamic quota project
        client_options = ClientOptions(quota_project_id=request.project_id)
        client = asset_v1.AssetServiceClient(client_options=client_options)
        
        parent = f"projects/{request.project_id}"
        
        response = client.search_all_resources(
            request={
                "scope": parent,
                "query": "", 
                "page_size": 1000 # Increased limit
            }
        )

        resources = []
        for resource in response:
            # Safely get additional attributes
            attrs = {}
            if hasattr(resource, 'additional_attributes') and resource.additional_attributes:
                # We let json.dumps handle the inner types via default=json_serial
                # But we need to ensure the top level is a dict
                for key, value in resource.additional_attributes.items():
                    attrs[key] = value

            resources.append({
                "name": resource.name,
                "asset_type": resource.asset_type,
                "display_name": resource.display_name,
                "project": resource.project,
                "location": resource.location,
                "state": resource.state,
                "additional_attributes": attrs
            })
            
        # Save to DB
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute(
            "INSERT INTO scans (project_id, timestamp, resource_count, resources_json) VALUES (?, ?, ?, ?)",
            (request.project_id, datetime.now().isoformat(), len(resources), json.dumps(resources, default=json_serial))
        )
        scan_id = c.lastrowid
        conn.commit()
        conn.close()

        return {"resources": json.loads(json.dumps(resources, default=json_serial)), "scan_id": scan_id}

    except Exception as e:
        print(f"Error scanning project: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/history")
async def get_history():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT id, project_id, timestamp, resource_count FROM scans ORDER BY timestamp DESC LIMIT 50")
    rows = c.fetchall()
    conn.close()
    return {"history": [dict(row) for row in rows]}

@app.get("/api/history/{scan_id}")
async def get_scan_details(scan_id: int):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT resources_json FROM scans WHERE id = ?", (scan_id,))
    row = c.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Scan not found")
        
    return {"resources": json.loads(row["resources_json"])}

@app.post("/api/scan")
async def scan_resources(request: ScanRequest):
    try:
        # Check cache first
        # (Simplified: we overwrite validation for now as we want fresh costs or we can rely on client cache)
        # But we previously implemented DB. We should save cost to DB too.
        
        client_options = ClientOptions(quota_project_id=request.project_id)
        client = asset_v1.AssetServiceClient(client_options=client_options)
        parent = f"projects/{request.project_id}"
        
        # Search all resources
        response = client.search_all_resources(
            request={"scope": parent, "read_mask": "*"} 
        )

        resources = []
        resource_count = 0
        
        for r in response:
            resource_count += 1
            # Convert to dict-like structure we can modify
            # We use json_serial to handle protobuf serialization then load it back
            # This is a bit inefficient but robust for protobuf
            res_dict = json.loads(json.dumps(r, default=json_serial))
            
            # Calculate Cost
            cost = calculate_estimated_cost(res_dict)
            res_dict['estimated_cost'] = cost
            
            resources.append(res_dict)

        # Save to DB
        scan_id = save_scan_to_db(request.project_id, resources, resource_count)

        return {"resources": resources, "scan_id": scan_id}

    except Exception as e:
        print(f"Error scanning resources: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def calculate_estimated_cost(resource):
    """
    Returns an estimated monthly cost (USD) as a float, or 0 if unknown/free.
    This is a VERY ROUGH estimation for demo purposes.
    """
    asset_type = resource.get('asset_type', '')
    display_name = resource.get('display_name', '')
    additional = resource.get('additional_attributes', {})
    
    cost = 0.0

    if 'compute.googleapis.com/Instance' in asset_type:
        # Try to find machine type
        # Display name usually doesn't have it, but sometimes it does? 
        # Actually additional_attributes usually has 'machineType'
        machine_type = additional.get('machineType', '')
        if not machine_type:
            # Fallback: assume medium if unknown
            cost = 25.0 
        elif 'micro' in machine_type:
            cost = 7.0
        elif 'small' in machine_type:
            cost = 14.0
        elif 'medium' in machine_type:
            cost = 25.0
        elif 'standard-1' in machine_type:
            cost = 35.0
        elif 'standard-2' in machine_type:
            cost = 70.0
        else:
            cost = 30.0 # Generic avg

    elif 'sqladmin.googleapis.com/Instance' in asset_type:
        # SQL is expensive
        if 'db-f1-micro' in str(additional):
            cost = 10.0
        else:
            cost = 50.0

    elif 'storage.googleapis.com/Bucket' in asset_type:
        # Flat fee for existence for demo (storage usage is unknown usually in asset inventory lists without monitoring)
        cost = 5.0
    
    elif 'container.googleapis.com/Cluster' in asset_type:
        # Management fee (autopilot or zonal)
        cost = 70.0 

    elif 'compute.googleapis.com/Disk' in asset_type:
        # Estimate based on size (approx $0.04/GB for standard, $0.17/GB for SSD)
        try:
            size_gb = float(additional.get('sizeGb', '10')) # Default 10GB
            disk_type = additional.get('type', '')
            rate = 0.17 if 'ssd' in disk_type.lower() else 0.04
            cost = size_gb * rate
        except:
            cost = 5.0

    return cost

@app.post("/api/scan-iam")
async def scan_iam(request: ScanRequest):
    try:
        client_options = ClientOptions(quota_project_id=request.project_id)
        client = asset_v1.AssetServiceClient(client_options=client_options)
        parent = f"projects/{request.project_id}"

        response = client.search_all_iam_policies(
            request={
                "scope": parent,
                "query": "policy:allUsers OR policy:allAuthenticatedUsers", 
                "page_size": 1000
            }
        )

        findings = []
        for policy in response:
            resource = policy.resource
            for binding in policy.policy.bindings:
                if "allUsers" in binding.members or "allAuthenticatedUsers" in binding.members:
                    findings.append({
                        "resource": resource,
                        "role": binding.role,
                        "members": [m for m in binding.members if m in ["allUsers", "allAuthenticatedUsers"]],
                        "severity": "CRITICAL" if "allUsers" in binding.members else "HIGH"
                    })
        
        return {"findings": json.loads(json.dumps(findings, default=json_serial))}

    except Exception as e:
        print(f"Error scanning IAM: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/advisor")
async def advisor(request: ScanRequest):
    try:
        client_options = ClientOptions(quota_project_id=request.project_id)
        client = asset_v1.AssetServiceClient(client_options=client_options)
        parent = f"projects/{request.project_id}"
        
        # Search all resources for analysis
        response = client.search_all_resources(
            request={"scope": parent, "read_mask": "*"} 
        )

        advisories = []
        
        for r in response:
            asset_type = r.asset_type
            additional = r.additional_attributes
            
            # 1. Unattached Disks
            if "compute.googleapis.com/Disk" in asset_type:
                users = additional.get("users")
                if not users:
                    advisories.append({
                        "category": "COST",
                        "severity": "MEDIUM",
                        "title": "Unattached Persistent Disk",
                        "description": f"Disk '{r.display_name}' is not attached to any instance but is charging you.",
                        "resource": r.display_name
                    })

            # 2. Stopped Instances
            if "compute.googleapis.com/Instance" in asset_type:
                state = r.state
                if state == "TERMINATED" or state == "STOPPED":
                     advisories.append({
                        "category": "COST",
                        "severity": "LOW",
                        "title": "Stopped Instance",
                        "description": f"Instance '{r.display_name}' is stopped. You still pay for attached storage.",
                        "resource": r.display_name
                    })
                
                # 3. Legacy N1 checks
                machine_type = additional.get("machineType", "")
                if "n1-" in machine_type:
                     advisories.append({
                        "category": "PERFORMANCE",
                        "severity": "LOW",
                        "title": "Legacy Machine Type",
                        "description": f"Instance '{r.display_name}' uses older N1 type. Consider E2 or N2 for better price-performance.",
                        "resource": r.display_name
                    })

        return {"advisories": advisories}

    except Exception as e:
        print(f"Error in advisor: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Serve static files - AFTER API routes to avoid capturing them
app.mount("/", StaticFiles(directory="static", html=True), name="static")

