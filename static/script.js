document.addEventListener('DOMContentLoaded', () => {
    const scanBtn = document.getElementById('scan-btn');
    const projectIdInput = document.getElementById('project-id');
    const resultsArea = document.getElementById('results-area');
    const loadingSpinner = document.getElementById('loading');
    const errorDiv = document.getElementById('error');

    scanBtn.addEventListener('click', handleScan);
    projectIdInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleScan();
    });

    async function handleScan() {
        const projectId = projectIdInput.value.trim();
        if (!projectId) return;

        // Reset state
        resultsArea.innerHTML = '';
        errorDiv.style.display = 'none';
        errorDiv.textContent = '';
        loadingSpinner.style.display = 'block';
        scanBtn.disabled = true;

        try {
            const response = await fetch('/api/scan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ project_id: projectId }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to fetch resources');
            }

            const data = await response.json();
            displayResources(data.resources);
        } catch (err) {
            errorDiv.textContent = err.message;
            errorDiv.style.display = 'block';
        } finally {
            loadingSpinner.style.display = 'none';
            scanBtn.disabled = false;
        }
    }

    function displayResources(resources) {
        if (!resources || resources.length === 0) {
            resultsArea.innerHTML = '<p style="text-align: center; grid-column: 1/-1; color: var(--secondary-text);">No resources found.</p>';
            return;
        }

        const fragment = document.createDocumentFragment();

        resources.forEach(resource => {
            const card = document.createElement('div');
            card.className = 'resource-card';
            
            // Clean up asset type for display
            const shortType = resource.asset_type.split('/').pop();

            card.innerHTML = `
                <div class="resource-type">${shortType}</div>
                <div class="resource-name">${resource.display_name || resource.name.split('/').pop()}</div>
                <div class="resource-location">${resource.location}</div>
            `;
            fragment.appendChild(card);
        });

        resultsArea.appendChild(fragment);
    }
});
