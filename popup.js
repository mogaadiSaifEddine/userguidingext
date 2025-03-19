document.addEventListener('DOMContentLoaded', function () {
    const exportBtn = document.getElementById('exportBtn');
    const statusDiv = document.getElementById('status');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const advancedToggle = document.getElementById('advancedToggle');
    const advancedSection = document.getElementById('advancedSection');

    // Tab navigation
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', function () {
            // Remove active class from all tabs
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Add active class to clicked tab
            this.classList.add('active');

            // Show corresponding content
            const contentId = 'content-' + this.id.split('-')[1];
            document.getElementById(contentId).classList.add('active');
        });
    });

    // Advanced options toggle
    advancedToggle.addEventListener('click', function () {
        if (advancedSection.style.display === 'none' || advancedSection.style.display === '') {
            advancedSection.style.display = 'block';
            advancedToggle.textContent = 'Advanced Options ▲';
        } else {
            advancedSection.style.display = 'none';
            advancedToggle.textContent = 'Advanced Options ▼';
        }
    });

    // User and survey dependencies
    const includeUsers = document.getElementById('includeUsers');
    const includeSurveys = document.getElementById('includeSurveys');
    const includeCompanies = document.getElementById('includeCompanies');
    const mergeUserSurvey = document.getElementById('mergeUserSurvey');
    const mergeUserCompany = document.getElementById('mergeUserCompany');

    // Update dependencies when checkboxes change
    function updateDependencies() {
        mergeUserSurvey.disabled = !includeUsers.checked || !includeSurveys.checked;
        if (mergeUserSurvey.disabled) {
            mergeUserSurvey.checked = false;
        }

        mergeUserCompany.disabled = !includeUsers.checked || !includeCompanies.checked;
        if (mergeUserCompany.disabled) {
            mergeUserCompany.checked = false;
        }
    }

    // Add event listeners for dependency updates
    includeUsers.addEventListener('change', updateDependencies);
    includeSurveys.addEventListener('change', updateDependencies);
    includeCompanies.addEventListener('change', updateDependencies);

    // Initial dependency check
    updateDependencies();

    // Start export process
    exportBtn.addEventListener('click', function () {
        // Get options from UI
        const options = {
            includeUsers: document.getElementById('includeUsers').checked,
            includeSurveys: document.getElementById('includeSurveys').checked,
            includeCompanies: document.getElementById('includeCompanies').checked,
            mergeUserSurvey: document.getElementById('mergeUserSurvey').checked,
            mergeUserCompany: document.getElementById('mergeUserCompany').checked,
            includeGuide: document.getElementById('includeGuide').checked,
            includeJSON: document.getElementById('includeJSON').checked,
            limitRows: document.getElementById('limitRows').checked,
            anonymizeData: document.getElementById('anonymizeData').checked,
            includePreview: document.getElementById('includePreview').checked,
            zipFiles: document.getElementById('zipFiles').checked,
            generatePDFReport: document.getElementById('generatePDFReport').checked
        };

        // Validate selections
        if (!options.includeUsers && (options.mergeUserSurvey || options.mergeUserCompany)) {
            updateStatus("Raw Users data is required for merged files", "error");
            return;
        }

        if (!options.includeSurveys && options.mergeUserSurvey) {
            updateStatus("Survey data is required for User-Survey merged file", "error");
            return;
        }

        if (!options.includeCompanies && options.mergeUserCompany) {
            updateStatus("Companies data is required for User-Company merged file", "error");
            return;
        }

        // PDF report requires at least one data type
        if (options.generatePDFReport &&
            !options.includeUsers && !options.includeSurveys && !options.includeCompanies) {
            updateStatus("PDF report requires at least one data type (Users, Surveys, or Companies)", "error");
            return;
        }

        // Disable button and show progress
        exportBtn.disabled = true;
        progressContainer.style.display = 'block';
        updateProgress(5);
        updateStatus("Initiating export process...");

        // Check if on UserGuiding panel
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (!tabs[0].url.includes('panel.userguiding.com')) {
                updateStatus("Error: Please navigate to UserGuiding panel first", "error");
                resetUI();
                return;
            }

            // Execute content script with options
            chrome.tabs.sendMessage(tabs[0].id, { action: "exportAnalytics", options: options }, function (response) {
                // Handle response from contentScript
                if (chrome.runtime.lastError) {
                    // If content script not ready, inject and retry
                    chrome.scripting.executeScript({
                        target: { tabId: tabs[0].id },
                        files: ['contentScript.js']
                    }).then(() => {
                        // Wait for script to initialize
                        setTimeout(() => {
                            chrome.tabs.sendMessage(tabs[0].id, { action: "exportAnalytics", options: options }, handleResponse);
                        }, 500);
                    }).catch(err => {
                        updateStatus("Error: " + err.message, "error");
                        resetUI();
                    });
                } else {
                    handleResponse(response);
                }
            });
        });
    });

    // Handle response from contentScript
    function handleResponse(response) {
        if (!response) {
            updateStatus("No response from UserGuiding panel. Please refresh the page and try again.", "error");
            resetUI();
            return;
        }

        if (response.status === "progress") {
            updateProgress(response.percentage);
            updateStatus(response.message);
        } else if (response.status === "error") {
            updateStatus("Error: " + response.message, "error");
            resetUI();
        } else if (response.status === "success") {
            updateProgress(100);

            // Check if PDF was generated but had an error
            if (response.pdfError) {
                updateStatus(`${response.message} (PDF report error: ${response.pdfError})`, "warning");
            } else if (response.pdfGenerated) {
                // Success with PDF generated
                updateStatus(response.message, "success");
            } else {
                // Regular success
                updateStatus(response.message, "success");
            }

            setTimeout(resetUI, 3000);
        }
    }

    // Listen for progress updates
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
        if (message.action === "updateProgress") {
            updateProgress(message.percentage);
            updateStatus(message.message);
            sendResponse({ received: true });
        }
        return true;
    });

    // Helper function to update status message
    function updateStatus(message, type = "") {
        const statusEl = document.getElementById('status');
        statusEl.textContent = message;
        statusEl.className = type;
    }

    // Helper function to update progress bar
    function updateProgress(percentage) {
        progressBar.style.width = percentage + '%';
    }

    // Helper function to reset the UI after export
    function resetUI() {
        exportBtn.disabled = false;
        // Keep progress visible if completed successfully
        if (progressBar.style.width !== "100%") {
            progressContainer.style.display = 'none';
            progressBar.style.width = '0%';
        }
    }
});