document.addEventListener('DOMContentLoaded', () => {
    const scanBtn = document.getElementById('scan-btn');
    const projectIdInput = document.getElementById('project-id');
    const resultsArea = document.getElementById('results-area');
    const graphArea = document.getElementById('graph-area');
    const loadingSpinner = document.getElementById('loading');
    const errorDiv = document.getElementById('error');

    // Dashboard Elements
    const dashboardArea = document.getElementById('dashboard-area');
    const resourceChartCanvas = document.getElementById('resourceChart');
    const filterSearch = document.getElementById('filter-search');
    const filterType = document.getElementById('filter-type');
    const exportBtn = document.getElementById('export-btn');
    const groupBySelect = document.getElementById('group-by');

    // View Toggles
    const viewListBtn = document.getElementById('view-list');
    const viewGraphBtn = document.getElementById('view-graph');
    const viewSecurityBtn = document.getElementById('view-security');
    const viewAdvisorBtn = document.getElementById('view-advisor');

    // History Elements
    const historyList = document.getElementById('history-list');
    const refreshHistoryBtn = document.getElementById('refresh-history');
    const securityArea = document.getElementById('security-area');
    const advisorArea = document.getElementById('advisor-area');

    let allResources = [];
    let securityFindings = null;
    let advisories = null; // Cache
    let chartInstance = null;
    let selectedScanId = null;
    let cy = null; // Cytoscape instance
    let currentView = 'list'; // 'list', 'graph', 'security', 'advisor'

    // Init
    loadHistory();

    scanBtn.addEventListener('click', handleScan);
    projectIdInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleScan();
    });

    refreshHistoryBtn.addEventListener('click', loadHistory);

    // Event Listeners for improvements
    filterSearch.addEventListener('input', updateView);
    filterType.addEventListener('change', updateView);
    groupBySelect.addEventListener('change', updateView);
    exportBtn.addEventListener('click', exportToCSV);

    if (viewListBtn) viewListBtn.addEventListener('click', () => switchView('list'));
    if (viewGraphBtn) viewGraphBtn.addEventListener('click', () => switchView('graph'));
    if (viewSecurityBtn) viewSecurityBtn.addEventListener('click', () => switchView('security'));
    if (viewAdvisorBtn) viewAdvisorBtn.addEventListener('click', () => switchView('advisor'));

    async function switchView(view) {
        currentView = view;
        if (viewListBtn) viewListBtn.classList.toggle('active', view === 'list');
        if (viewGraphBtn) viewGraphBtn.classList.toggle('active', view === 'graph');
        if (viewSecurityBtn) viewSecurityBtn.classList.toggle('active', view === 'security');
        if (viewAdvisorBtn) viewAdvisorBtn.classList.toggle('active', view === 'advisor');

        // Hide all first
        if (resultsArea) resultsArea.style.display = 'none';
        if (graphArea) graphArea.style.display = 'none';
        if (securityArea) securityArea.style.display = 'none';
        if (advisorArea) advisorArea.style.display = 'none';

        if (view === 'list') {
            if (resultsArea) resultsArea.style.display = 'block';
            updateView(); // Ensure filters apply
        } else if (view === 'graph') {
            if (graphArea) {
                graphArea.style.display = 'block';
                renderGraph(filterResources(allResources));
            }
        } else if (view === 'security') {
            if (securityArea) {
                securityArea.style.display = 'flex';
                if (!securityFindings) {
                    await runSecurityScan();
                } else {
                    renderFindings(securityFindings);
                }
            }
        } else if (view === 'advisor') {
            if (advisorArea) {
                advisorArea.style.display = 'flex';
                if (!advisories) {
                    await runAdvisorScan();
                } else {
                    renderAdvisories(advisories);
                }
            }
        }
    }

    async function handleScan() {
        const projectId = projectIdInput.value.trim();
        if (!projectId) return;

        // Reset state
        resultsArea.innerHTML = '';
        errorDiv.textContent = '';
        dashboardArea.style.display = 'none';
        loadingSpinner.style.display = 'block';
        scanBtn.disabled = true;

        // Reset security/advisor findings on new scan
        securityFindings = null;
        advisories = null;

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
            allResources = data.resources || [];

            updateDashboard(allResources);
            updateFilterOptions(allResources);
            // Default to list view on scan
            switchView('list');
            loadHistory();

            dashboardArea.style.display = 'block';

        } catch (err) {
            errorDiv.textContent = err.message;
            errorDiv.style.display = 'block';
        } finally {
            loadingSpinner.style.display = 'none';
            scanBtn.disabled = false;
        }
    }

    async function loadHistory() {
        try {
            const response = await fetch('/api/history');
            if (response.ok) {
                const data = await response.json();
                renderHistoryList(data.history);
            }
        } catch (e) {
            console.error("Failed to load history", e);
        }
    }

    function renderHistoryList(historyItems) {
        historyList.innerHTML = '';
        if (!historyItems || historyItems.length === 0) {
            historyList.innerHTML = '<p class="empty-state">No past scans found.</p>';
            return;
        }

        historyItems.forEach(item => {
            const div = document.createElement('div');
            div.className = `history-item ${item.id === selectedScanId ? 'active' : ''}`;
            div.onclick = () => loadScanDetails(item.id, div);

            const date = new Date(item.timestamp).toLocaleDateString();
            const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            div.innerHTML = `
                <div class="history-project">${item.project_id}</div>
                <div class="history-meta">
                    <span>${date} ${time}</span>
                    <span>${item.resource_count} res</span>
                </div>
            `;
            historyList.appendChild(div);
        });
    }

    async function loadScanDetails(scanId, element) {
        document.querySelectorAll('.history-item').forEach(el => el.classList.remove('active'));
        if (element) element.classList.add('active');
        selectedScanId = scanId;

        loadingSpinner.style.display = 'block';
        resultsArea.innerHTML = '';
        errorDiv.style.display = 'none';
        securityFindings = null; // Reset security on load

        try {
            const response = await fetch(`/api/history/${scanId}`);
            if (!response.ok) throw new Error("Failed to load scan details");

            const data = await response.json();
            allResources = data.resources || [];

            projectIdInput.value = allResources[0]?.project || '';
            updateDashboard(allResources);
            updateFilterOptions(allResources);
            switchView('list');
            dashboardArea.style.display = 'block';

        } catch (err) {
            errorDiv.textContent = err.message;
            errorDiv.style.display = 'block';
        } finally {
            loadingSpinner.style.display = 'none';
        }
    }

    async function runSecurityScan() {
        const projectId = projectIdInput.value.trim();
        if (!projectId) return;

        if (securityArea) securityArea.innerHTML = '<div class="loading-spinner" style="display:block"></div><p style="text-align:center">Scanning IAM Policies...</p>';

        try {
            const response = await fetch('/api/scan-iam', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project_id: projectId }),
            });
            if (!response.ok) throw new Error("Failed to scan IAM");
            const data = await response.json();
            securityFindings = data.findings || [];
            renderFindings(securityFindings);
        } catch (e) {
            if (securityArea) securityArea.innerHTML = `<p class="error-message">Scan failed: ${e.message}</p>`;
        }
    }

    function renderFindings(findings) {
        if (!securityArea) return;
        securityArea.innerHTML = '';

        if (findings.length === 0) {
            securityArea.innerHTML = '<div class="empty-state">✅ No high-risk public access found.</div>';
            return;
        }

        const header = document.createElement('h3');
        header.textContent = `⚠️ Found ${findings.length} High-Risk Configurations`;
        securityArea.appendChild(header);

        findings.forEach(f => {
            const card = document.createElement('div');
            card.className = 'security-finding';
            card.innerHTML = `
                <div class="finding-details">
                    <span class="finding-resource">${f.resource}</span>
                    <span class="finding-role">Role: ${f.role}</span>
                    <span class="finding-role">Members: ${f.members.join(', ')}</span>
                </div>
                <span class="risk-badge risk-${f.severity.toLowerCase()}">${f.severity}</span>
            `;
            securityArea.appendChild(card);
        });
    }

    function filterResources(resources) {
        const searchTerm = filterSearch.value.toLowerCase();
        const selectedType = filterType.value;

        return resources.filter(r => {
            const shortType = r.asset_type.split('/').pop();
            const matchesSearch = r.name.toLowerCase().includes(searchTerm) ||
                (r.display_name && r.display_name.toLowerCase().includes(searchTerm));
            const matchesType = selectedType === 'all' || shortType === selectedType;
            return matchesSearch && matchesType;
        });
    }

    function updateView() {
        if (currentView === 'security') return; // Don't filter security view with resource filters for now

        const filtered = filterResources(allResources);

        if (currentView === 'list') {
            if (resultsArea) resultsArea.style.display = 'block';
            if (graphArea) graphArea.style.display = 'none';

            const groupKey = groupBySelect.value;
            if (groupKey === 'none') {
                displayResourcesGrid(filtered);
            } else {
                displayResourcesGrouped(filtered, groupKey);
            }
        } else {
            if (resultsArea) resultsArea.style.display = 'none';
            if (graphArea) {
                graphArea.style.display = 'block';
                renderGraph(filtered);
            }
        }
    }

    function displayResourcesGrid(resources) {
        resultsArea.innerHTML = '';

        if (!resources || resources.length === 0) {
            resultsArea.innerHTML = '<p style="text-align: center; color: var(--secondary-text);">No resources match your filters.</p>';
            return;
        }

        const grid = document.createElement('div');
        grid.className = 'results-grid';

        resources.forEach(r => grid.appendChild(createResourceCard(r)));
        resultsArea.appendChild(grid);
    }

    function displayResourcesGrouped(resources, key) {
        resultsArea.innerHTML = '';

        if (!resources || resources.length === 0) {
            resultsArea.innerHTML = '<p style="text-align: center; color: var(--secondary-text);">No resources match your filters.</p>';
            return;
        }

        const groups = {};
        resources.forEach(r => {
            let groupValue = 'Unknown';
            if (key === 'type') {
                groupValue = r.asset_type.split('/').pop();
            } else if (key === 'location') {
                groupValue = r.location || 'Global/Unspecified';
            }
            if (!groups[groupValue]) groups[groupValue] = [];
            groups[groupValue].push(r);
        });

        const sortedKeys = Object.keys(groups).sort();

        sortedKeys.forEach(groupName => {
            const groupRes = groups[groupName];

            const groupContainer = document.createElement('div');
            groupContainer.className = 'group-container';

            const header = document.createElement('div');
            header.className = 'group-header';
            header.innerHTML = `
                <span class="group-title">${groupName}</span>
                <span class="group-count">${groupRes.length}</span>
            `;

            const content = document.createElement('div');
            content.className = 'group-content';

            groupRes.forEach(r => content.appendChild(createResourceCard(r)));

            header.onclick = () => {
                content.classList.toggle('collapsed');
            };

            groupContainer.appendChild(header);
            groupContainer.appendChild(content);
            resultsArea.appendChild(groupContainer);
        });
    }

    function createResourceCard(resource) {
        const card = document.createElement('div');
        card.className = 'resource-card';

        const shortType = resource.asset_type.split('/').pop();
        const displayName = resource.display_name || resource.name.split('/').pop();

        card.onclick = () => {
            const url = getConsoleUrl(resource);
            if (url) window.open(url, '_blank');
        };

        card.innerHTML = `
            <div class="resource-type">${shortType}</div>
            <div class="resource-name">${displayName}</div>
            <div class="resource-location">${resource.location}</div>
        `;
        return card;
    }

    function renderGraph(resources) {
        if (!resources || resources.length === 0) {
            if (cy) cy.destroy();
            graphArea.innerHTML = '<p style="text-align:center; padding: 2rem; color: var(--secondary-text)">No data to display</p>';
            return;
        }

        const elements = [];
        const seenNodes = new Set();

        const addNode = (id, label, type) => {
            if (seenNodes.has(id)) return;
            seenNodes.add(id);
            elements.push({
                data: { id, label, type }
            });
        };

        resources.forEach(r => {
            const shortType = r.asset_type.split('/').pop();
            const displayName = r.display_name || r.name.split('/').pop();
            const nodeId = r.name;

            addNode(nodeId, displayName, shortType);

            if (shortType === 'Instance' && r.additional_attributes && r.additional_attributes.networkInterfaces) {
                // Future: Edge logic
            }
        });

        if (cy) cy.destroy();

        cy = cytoscape({
            container: graphArea,
            elements: elements,
            style: [
                {
                    selector: 'node',
                    style: {
                        'background-color': '#58a6ff',
                        'label': 'data(label)',
                        'color': '#c9d1d9',
                        'font-size': '10px',
                        'text-valign': 'bottom',
                        'text-margin-y': 5
                    }
                },
                {
                    selector: 'node[type="Instance"]',
                    style: { 'background-color': '#238636', 'shape': 'rectangle' }
                },
                {
                    selector: 'node[type="Bucket"]',
                    style: { 'background-color': '#f1e05a', 'shape': 'barrel' }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': 1,
                        'line-color': '#30363d'
                    }
                }
            ],
            layout: {
                name: 'cose',
                animate: false
            }
        });
    }

    function updateDashboard(resources) {
        const typeCounts = {};
        let totalCost = 0;

        resources.forEach(r => {
            const type = r.asset_type.split('/').pop();
            typeCounts[type] = (typeCounts[type] || 0) + 1;
            totalCost += (r.estimated_cost || 0);
        });

        // Update Total Cost
        const costEl = document.getElementById('total-cost-value');
        if (costEl) costEl.textContent = `$${totalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

        const labels = Object.keys(typeCounts);
        const data = Object.values(typeCounts);

        if (chartInstance) {
            chartInstance.destroy();
        }

        chartInstance = new Chart(resourceChartCanvas, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Resource Distribution',
                    data: data,
                    backgroundColor: [
                        '#58a6ff', '#238636', '#da3633', '#f1e05a', '#a371f7', '#db61a2'
                    ],
                    borderColor: 'rgba(0,0,0,0)',
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: '#c9d1d9' }
                    },
                    title: {
                        display: false
                    }
                }
            }
        });
    }

    function updateFilterOptions(resources) {
        const uniqueTypes = new Set(resources.map(r => r.asset_type.split('/').pop()));
        const currentSel = filterType.value;
        filterType.innerHTML = '<option value="all">All Types</option>';
        Array.from(uniqueTypes).sort().forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            filterType.appendChild(option);
        });
        if (Array.from(uniqueTypes).includes(currentSel)) {
            filterType.value = currentSel;
        }
    }

    function getConsoleUrl(resource) {
        const type = resource.asset_type;
        if (type.includes('compute.googleapis.com/Instance')) {
            return `https://console.cloud.google.com/compute/instances`;
        } else if (type.includes('storage.googleapis.com/Bucket')) {
            return `https://console.cloud.google.com/storage/browser/${resource.name.split('/').pop()}`;
        }
        return `https://console.cloud.google.com/home/dashboard`;
    }

    function exportToCSV() {
        if (!allResources.length) return;
        const headers = ['Name', 'Type', 'Location', 'Project', 'State'];
        const csvContent = [headers.join(',')];
        allResources.forEach(r => {
            const row = [
                r.display_name || r.name.split('/').pop(),
                r.asset_type,
                r.location || '',
                r.project || '',
                r.state || ''
            ].map(v => `"${v}"`);
            csvContent.push(row.join(','));
        });
        const blob = new Blob([csvContent.join('\n')], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gcp-resources-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
});
