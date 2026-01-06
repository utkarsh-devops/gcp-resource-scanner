# GCP Resource Scanner 🔍

A high-performance, premium-styled web tool to discover and list Google Cloud Platform (GCP) resources instantly. Built with **FastAPI** and **Vanilla JS**.

![GCP Scanner](https://img.shields.io/badge/Status-Active-success)
![Python](https://img.shields.io/badge/Python-3.8+-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## ✨ Features

- **Instant Discovery**: Scans your GCP project for all assets using the Cloud Asset Inventory API.
- **✨ Visual Dashboard**: Interactive charts showing resource distribution by type.
- **✨ Smart Filtering**: Instantly search and filter resources by type or name.
- **✨ CSV Export**: Download your resource list for offline analysis.
- **Premium UI**: Beautiful dark mode with glassmorphism effects and smooth animations.
- **Smart Authentication**: Automatically handles Quota Project attribution using the target project ID.
- **Responsive Design**: Works perfectly on different screen sizes.
- **Real-time Feedback**: Loading states and error handling for a smooth user experience.

## 🛠️ Tech Stack

- **Backend**: Python, FastAPI, Google Cloud Asset Library
- **Frontend**: HTML5, CSS3 (Custom Variables, Flexbox/Grid), Vanilla JavaScript
- **Styling**: Custom "Premium Dark" theme

## 🚀 Getting Started

### Prerequisites

- **Python 3.8** or higher
- **Google Cloud SDK** (`gcloud`) installed
- A GCP Project with **Cloud Asset API** (`cloudasset.googleapis.com`) enabled.

### Installation

1. **Clone the repository** (or navigate to the directory):
   ```bash
   cd gcp-resource-scanner
   ```

2. **Create a Virtual Environment**:
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

## 🔑 Authentication

The tool uses your local `gcloud` credentials.

1. **Login with Application Default Credentials (ADC)**:
   ```bash
   gcloud auth application-default login
   ```
   *Follow the browser prompt to login.*

2. **Ensure Permissions**:
   The account you logged in with must have the `cloudasset.assets.searchAllResources` permission (part of `roles/cloudasset.viewer`).

## 🏃‍♂️ Running the App

1. **Start the Server**:
   ```bash
   uvicorn main:app --reload
   ```

2. **Open the App**:
   Visit [http://localhost:8000](http://localhost:8000) in your browser.

3. **Scan a Project**:
   - Enter your **Project ID** (e.g., `my-awesome-project-123`).
   - Click "Scan Resources".

## ❓ Troubleshooting

- **403 Permission Denied**: 
  - Make sure you ran `gcloud auth application-default login`.
  - Check if the **Cloud Asset API** is enabled on the target project.
  
- **Quota Project Errors**:
  - The tool attempts to use the scanned Project ID as the Quota Project. Ensure the API is enabled on that specific project.

## 📝 License

This project is open source and available under the [MIT permissions](LICENSE).
